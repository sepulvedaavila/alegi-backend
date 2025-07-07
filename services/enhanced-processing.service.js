const supabaseService = require('./supabase.service');
const aiService = require('./ai.service');
const pdfcoService = require('./pdfco.service');
const courtListenerService = require('./courtlistener.service');
const errorTrackingService = require('./error-tracking.service');
const Sentry = require('@sentry/node');

class EnhancedProcessingService {
  constructor() {
    this.processingJobs = new Map();
  }

  /**
   * Main entry point for enhanced case processing
   * Implements the new document-first, staged processing flow
   */
  async processCaseEnhanced(jobData) {
    const { caseId, userId, caseData, webhookType, table, source } = jobData;
    const jobKey = `enhanced-case-${caseId}-${webhookType}`;
    
    // Prevent duplicate processing
    if (this.processingJobs.has(jobKey)) {
      console.log(`Enhanced job ${jobKey} already in progress, skipping duplicate`);
      return { success: false, reason: 'Already processing' };
    }
    
    this.processingJobs.set(jobKey, Date.now());
    
    try {
      console.log(`Starting enhanced case processing for ${caseId} (${webhookType})`);
      
      // Step 1: Document Extraction and Processing
      const documentExtractions = await this.extractAllDocuments(caseId);
      console.log(`Extracted ${documentExtractions.length} documents for case ${caseId}`);
      
      // Step 2: Information Fusion
      const fusedCaseData = await this.fuseInformation(caseId, caseData, documentExtractions);
      console.log(`Information fusion completed for case ${caseId}`);
      
      // Step 3: External Data Enrichment
      const externalData = await this.enrichWithExternalData(fusedCaseData);
      console.log(`External enrichment completed for case ${caseId}`);
      
      // Step 4: Staged AI Analysis
      const aiResults = await this.runStagedAIAnalysis(fusedCaseData, externalData);
      console.log(`Staged AI analysis completed for case ${caseId}`);
      
      // Step 5: Save Results
      await this.saveEnhancedResults(caseId, fusedCaseData, externalData, aiResults);
      console.log(`Enhanced results saved for case ${caseId}`);
      
      // Step 6: Update Case Status
      await this.updateCaseStatus(caseId, 'enhanced_complete');
      
      console.log(`Successfully processed case ${caseId} with enhanced flow`);
      return { 
        success: true, 
        caseId, 
        documentExtractions: documentExtractions.length,
        aiResults: Object.keys(aiResults).length
      };
      
    } catch (error) {
      console.error(`Enhanced case processing error for ${caseId}:`, error);
      
      // Log error to database
      await errorTrackingService.logProcessingError(caseId, error, {
        webhookType,
        source,
        step: 'enhancedProcessing',
        processingType: 'enhanced'
      });
      
      // Report to Sentry
      Sentry.captureException(error, {
        tags: { caseId, source, webhookType, processingType: 'enhanced' },
        contexts: { jobData }
      });
      
      throw error;
    } finally {
      this.processingJobs.delete(jobKey);
    }
  }

  /**
   * Step 1: Extract all information from uploaded documents using PDFco
   */
  async extractAllDocuments(caseId) {
    try {
      console.log(`Extracting documents for case ${caseId}`);
      
      // Get all documents for this case
      const { data: documents, error } = await supabaseService.client
        .from('case_documents')
        .select('*')
        .eq('case_id', caseId)
        .eq('processed', false);
      
      if (error) throw error;
      
      const extractions = [];
      
      for (const document of documents || []) {
        try {
          console.log(`Processing document: ${document.file_name}`);
          
          // Get public URL for the document
          const { data: urlData } = supabaseService.client
            .storage
            .from('case-files')
            .getPublicUrl(document.file_path);
          
          // Extract text using PDFco
          const extraction = await pdfcoService.extractText(document.file_path, null);
          
          // Parse document structure (if it's a legal document)
          const structuredData = await this.parseDocumentStructure(extraction.text, document.file_name);
          
          // Store extraction results
          const extractionRecord = {
            case_id: caseId,
            document_id: document.id,
            file_name: document.file_name,
            file_type: document.file_type,
            extracted_text: extraction.text,
            structured_data: structuredData,
            extraction_metadata: {
              pages: extraction.pages,
              service: extraction.service,
              extraction_timestamp: new Date().toISOString()
            },
            processing_status: 'completed',
            created_at: new Date().toISOString()
          };
          
          // Save to new extraction table
          await supabaseService.client
            .from('case_document_extractions')
            .insert(extractionRecord);
          
          // Update original document
          await supabaseService.client
            .from('case_documents')
            .update({
              ai_extracted_text: extraction.text,
              processed: true,
              extraction_status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', document.id);
          
          extractions.push(extractionRecord);
          
        } catch (docError) {
          console.error(`Error processing document ${document.id}:`, docError);
          
          // Mark document as failed
          await supabaseService.client
            .from('case_documents')
            .update({
              processed: false,
              extraction_status: 'failed',
              error_message: docError.message,
              updated_at: new Date().toISOString()
            })
            .eq('id', document.id);
        }
      }
      
      return extractions;
      
    } catch (error) {
      console.error(`Error extracting documents for case ${caseId}:`, error);
      throw error;
    }
  }

  /**
   * Parse document structure to extract key legal information
   */
  async parseDocumentStructure(text, fileName) {
    try {
      // Use AI to parse document structure
      const prompt = `
        Analyze this legal document and extract structured information:
        
        Document: ${fileName}
        Content: ${text.substring(0, 4000)}...
        
        Extract and return in JSON format:
        {
          "document_type": "contract|complaint|motion|order|other",
          "parties": {
            "plaintiffs": ["name1", "name2"],
            "defendants": ["name1", "name2"]
          },
          "key_dates": {
            "filing_date": "YYYY-MM-DD",
            "incident_date": "YYYY-MM-DD",
            "contract_date": "YYYY-MM-DD"
          },
          "legal_claims": ["claim1", "claim2"],
          "damages_sought": "description",
          "key_terms": ["term1", "term2"],
          "jurisdiction": "court/jurisdiction",
          "case_number": "if applicable"
        }
      `;
      
      const response = await aiService.makeOpenAICall('gpt-4-0125-preview', [{
        role: 'user',
        content: prompt
      }], { temperature: 0.3 });
      
      const structuredData = JSON.parse(response.choices[0].message.content);
      return structuredData;
      
    } catch (error) {
      console.error('Error parsing document structure:', error);
      return {
        document_type: 'unknown',
        parties: { plaintiffs: [], defendants: [] },
        key_dates: {},
        legal_claims: [],
        damages_sought: '',
        key_terms: [],
        jurisdiction: '',
        case_number: ''
      };
    }
  }

  /**
   * Step 2: Fuse document information with user form data
   */
  async fuseInformation(caseId, caseData, documentExtractions) {
    try {
      console.log(`Fusing information for case ${caseId}`);
      
      // Start with user form data
      const fusedData = {
        case_id: caseId,
        user_provided: {
          case_name: caseData.case_name,
          case_type: caseData.case_type,
          case_stage: caseData.case_stage,
          jurisdiction: caseData.jurisdiction,
          case_narrative: caseData.case_narrative,
          expected_outcome: caseData.expected_outcome,
          additional_notes: caseData.additional_notes
        },
        document_extracted: {
          parties: this.extractPartiesFromDocuments(documentExtractions),
          key_dates: this.extractDatesFromDocuments(documentExtractions),
          legal_claims: this.extractClaimsFromDocuments(documentExtractions),
          damages: this.extractDamagesFromDocuments(documentExtractions),
          jurisdiction: this.extractJurisdictionFromDocuments(documentExtractions),
          case_number: this.extractCaseNumberFromDocuments(documentExtractions)
        },
        fused_result: {},
        fusion_metadata: {
          documents_processed: documentExtractions.length,
          fusion_timestamp: new Date().toISOString()
        }
      };
      
      // Fuse the data with document data taking precedence
      fusedData.fused_result = {
        case_name: this.fuseField('case_name', caseData.case_name, documentExtractions),
        case_type: this.fuseField('case_type', caseData.case_type, documentExtractions),
        parties: this.fuseParties(caseData, documentExtractions),
        key_dates: this.fuseDates(caseData, documentExtractions),
        legal_claims: this.fuseClaims(caseData, documentExtractions),
        jurisdiction: this.fuseJurisdiction(caseData, documentExtractions),
        case_number: this.fuseCaseNumber(caseData, documentExtractions),
        damages_sought: this.fuseDamages(caseData, documentExtractions)
      };
      
      // Save fused data
      await supabaseService.client
        .from('case_data_fusion')
        .upsert({
          case_id: caseId,
          ...fusedData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      return fusedData;
      
    } catch (error) {
      console.error(`Error fusing information for case ${caseId}:`, error);
      throw error;
    }
  }

  /**
   * Step 3: Enrich with external data sources
   */
  async enrichWithExternalData(fusedCaseData) {
    try {
      console.log(`Enriching with external data for case ${fusedCaseData.case_id}`);
      
      const externalData = {
        court_listener_cases: [],
        legal_precedents: [],
        jurisdiction_info: {},
        similar_cases: [],
        enrichment_metadata: {
          enrichment_timestamp: new Date().toISOString()
        }
      };
      
      // Search CourtListener for similar cases
      if (fusedCaseData.fused_result.case_type && fusedCaseData.fused_result.jurisdiction) {
        try {
          const courtListenerResults = await courtListenerService.findSimilarCases({
            case_type: fusedCaseData.fused_result.case_type,
            jurisdiction: fusedCaseData.fused_result.jurisdiction,
            legal_claims: fusedCaseData.fused_result.legal_claims
          });
          
          externalData.court_listener_cases = courtListenerResults || [];
          console.log(`Found ${courtListenerResults?.length || 0} CourtListener cases`);
        } catch (clError) {
          console.error('CourtListener enrichment failed:', clError);
          externalData.court_listener_cases = [];
        }
      }
      
      // Check if this is an existing case in CourtListener
      if (fusedCaseData.fused_result.case_number) {
        try {
          const existingCase = await courtListenerService.findCaseByNumber(
            fusedCaseData.fused_result.case_number,
            fusedCaseData.fused_result.jurisdiction
          );
          
          if (existingCase) {
            externalData.existing_case = existingCase;
            console.log(`Found existing case in CourtListener: ${existingCase.case_name}`);
          }
        } catch (existingError) {
          console.error('Error checking for existing case:', existingError);
        }
      }
      
      return externalData;
      
    } catch (error) {
      console.error(`Error enriching with external data:`, error);
      return {
        court_listener_cases: [],
        legal_precedents: [],
        jurisdiction_info: {},
        similar_cases: [],
        enrichment_metadata: {
          enrichment_timestamp: new Date().toISOString(),
          error: error.message
        }
      };
    }
  }

  /**
   * Step 4: Run staged AI analysis
   */
  async runStagedAIAnalysis(fusedCaseData, externalData) {
    try {
      console.log(`Running staged AI analysis for case ${fusedCaseData.case_id}`);
      
      const stages = [
        { name: 'intake_analysis', method: this.runIntakeAnalysis },
        { name: 'jurisdiction_analysis', method: this.runJurisdictionAnalysis },
        { name: 'case_enhancement', method: this.runCaseEnhancement },
        { name: 'complexity_assessment', method: this.runComplexityAssessment },
        { name: 'prediction_generation', method: this.runPredictionGeneration }
      ];
      
      const results = {};
      let previousStageResult = null;
      
      for (const stage of stages) {
        try {
          console.log(`Running AI stage: ${stage.name}`);
          
          const stageResult = await stage.method(fusedCaseData, externalData, previousStageResult);
          results[stage.name] = stageResult;
          previousStageResult = stageResult;
          
          // Save stage result
          await this.saveStageResult(fusedCaseData.case_id, stage.name, stageResult);
          
        } catch (stageError) {
          console.error(`Error in AI stage ${stage.name}:`, stageError);
          results[stage.name] = { error: stageError.message };
          
          // Continue with next stage even if this one fails
        }
      }
      
      return results;
      
    } catch (error) {
      console.error(`Error in staged AI analysis:`, error);
      throw error;
    }
  }

  /**
   * Save results from enhanced processing
   */
  async saveEnhancedResults(caseId, fusedCaseData, externalData, aiResults) {
    try {
      console.log(`Saving enhanced results for case ${caseId}`);
      
      // Update case_ai_enrichment with enhanced data
      await supabaseService.updateCaseAIEnrichment(caseId, {
        cause_of_action: aiResults.case_enhancement?.cause_of_action || [],
        applicable_statute: aiResults.case_enhancement?.applicable_statute?.join(', '),
        enhanced_case_type: aiResults.case_enhancement?.enhanced_case_type,
        jurisdiction_enriched: aiResults.jurisdiction_analysis?.jurisdiction_enriched,
        raw_gpt_response: {
          fused_data: fusedCaseData,
          external_data: externalData,
          staged_results: aiResults
        },
        processing_type: 'enhanced'
      });
      
      // Save predictions if available
      if (aiResults.prediction_generation && !aiResults.prediction_generation.error) {
        await supabaseService.client
          .from('case_predictions')
          .upsert({
            case_id: caseId,
            ...aiResults.prediction_generation,
            case_complexity_score: aiResults.complexity_assessment?.complexity_score,
            created_at: new Date().toISOString()
          });
      }
      
      // Save similar cases
      if (externalData.court_listener_cases?.length > 0) {
        await supabaseService.client
          .from('similar_cases')
          .delete()
          .eq('case_id', caseId);
        
        const similarCases = externalData.court_listener_cases.map(c => ({
          case_id: caseId,
          similar_case_id: c.id?.toString() || `cl-${Date.now()}-${Math.random()}`,
          case_name: c.caseName || c.case_name || 'Unknown Case',
          court: c.court || 'Unknown Court',
          date_filed: c.dateFiled || c.date_filed || null,
          similarity_score: c.score || 0.5,
          court_listener_url: c.absolute_url || null,
          citation: c.citation?.join(', ') || null,
          created_at: new Date().toISOString()
        }));
        
        if (similarCases.length > 0) {
          await supabaseService.client
            .from('similar_cases')
            .insert(similarCases);
        }
      }
      
    } catch (error) {
      console.error(`Error saving enhanced results for case ${caseId}:`, error);
      throw error;
    }
  }

  // Helper methods for data fusion
  extractPartiesFromDocuments(documentExtractions) {
    const allParties = { plaintiffs: [], defendants: [] };
    
    documentExtractions.forEach(extraction => {
      if (extraction.structured_data?.parties) {
        allParties.plaintiffs.push(...(extraction.structured_data.parties.plaintiffs || []));
        allParties.defendants.push(...(extraction.structured_data.parties.defendants || []));
      }
    });
    
    return {
      plaintiffs: [...new Set(allParties.plaintiffs)],
      defendants: [...new Set(allParties.defendants)]
    };
  }

  extractDatesFromDocuments(documentExtractions) {
    const allDates = {};
    
    documentExtractions.forEach(extraction => {
      if (extraction.structured_data?.key_dates) {
        Object.assign(allDates, extraction.structured_data.key_dates);
      }
    });
    
    return allDates;
  }

  extractClaimsFromDocuments(documentExtractions) {
    const allClaims = [];
    
    documentExtractions.forEach(extraction => {
      if (extraction.structured_data?.legal_claims) {
        allClaims.push(...extraction.structured_data.legal_claims);
      }
    });
    
    return [...new Set(allClaims)];
  }

  extractDamagesFromDocuments(documentExtractions) {
    const damages = documentExtractions
      .map(extraction => extraction.structured_data?.damages_sought)
      .filter(damage => damage && damage.trim())
      .join('; ');
    
    return damages;
  }

  extractJurisdictionFromDocuments(documentExtractions) {
    const jurisdictions = documentExtractions
      .map(extraction => extraction.structured_data?.jurisdiction)
      .filter(jurisdiction => jurisdiction && jurisdiction.trim());
    
    return jurisdictions.length > 0 ? jurisdictions[0] : null;
  }

  extractCaseNumberFromDocuments(documentExtractions) {
    const caseNumbers = documentExtractions
      .map(extraction => extraction.structured_data?.case_number)
      .filter(caseNumber => caseNumber && caseNumber.trim());
    
    return caseNumbers.length > 0 ? caseNumbers[0] : null;
  }

  // Fusion helper methods
  fuseField(fieldName, userValue, documentExtractions) {
    const documentValues = documentExtractions
      .map(extraction => extraction.structured_data?.[fieldName])
      .filter(value => value && value.trim());
    
    return documentValues.length > 0 ? documentValues[0] : userValue;
  }

  fuseParties(caseData, documentExtractions) {
    const documentParties = this.extractPartiesFromDocuments(documentExtractions);
    
    return {
      plaintiffs: documentParties.plaintiffs.length > 0 ? documentParties.plaintiffs : [],
      defendants: documentParties.defendants.length > 0 ? documentParties.defendants : []
    };
  }

  fuseDates(caseData, documentExtractions) {
    const documentDates = this.extractDatesFromDocuments(documentExtractions);
    return documentDates;
  }

  fuseClaims(caseData, documentExtractions) {
    const documentClaims = this.extractClaimsFromDocuments(documentExtractions);
    return documentClaims;
  }

  fuseJurisdiction(caseData, documentExtractions) {
    return this.fuseField('jurisdiction', caseData.jurisdiction, documentExtractions);
  }

  fuseCaseNumber(caseData, documentExtractions) {
    return this.fuseField('case_number', caseData.case_number, documentExtractions);
  }

  fuseDamages(caseData, documentExtractions) {
    const documentDamages = this.extractDamagesFromDocuments(documentExtractions);
    return documentDamages || caseData.expected_outcome;
  }

  // AI Stage methods
  async runIntakeAnalysis(fusedCaseData, externalData, previousResult) {
    const prompt = `
      Analyze this legal case with enhanced data fusion:
      
      Fused Case Data: ${JSON.stringify(fusedCaseData.fused_result, null, 2)}
      Document Extractions: ${fusedCaseData.document_extracted ? 'Available' : 'None'}
      External Data: ${externalData.court_listener_cases.length} similar cases found
      
      Provide comprehensive intake analysis in JSON format.
    `;
    
    const response = await aiService.makeOpenAICall('gpt-4-0125-preview', [{
      role: 'user',
      content: prompt
    }], { temperature: 0.3 });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async runJurisdictionAnalysis(fusedCaseData, externalData, previousResult) {
    const prompt = `
      Analyze jurisdiction and venue for this case:
      
      Case Data: ${JSON.stringify(fusedCaseData.fused_result, null, 2)}
      Previous Analysis: ${JSON.stringify(previousResult, null, 2)}
      
      Provide jurisdiction analysis in JSON format.
    `;
    
    const response = await aiService.makeOpenAICall('gpt-4-0125-preview', [{
      role: 'user',
      content: prompt
    }], { temperature: 0.3 });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async runCaseEnhancement(fusedCaseData, externalData, previousResult) {
    const prompt = `
      Enhance case details with all available data:
      
      Fused Data: ${JSON.stringify(fusedCaseData.fused_result, null, 2)}
      External Cases: ${externalData.court_listener_cases.length} similar cases
      Previous Analysis: ${JSON.stringify(previousResult, null, 2)}
      
      Provide enhanced case analysis in JSON format.
    `;
    
    const response = await aiService.makeOpenAICall('gpt-4-0125-preview', [{
      role: 'user',
      content: prompt
    }], { temperature: 0.3 });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async runComplexityAssessment(fusedCaseData, externalData, previousResult) {
    const prompt = `
      Assess case complexity:
      
      Enhanced Case: ${JSON.stringify(previousResult, null, 2)}
      External Data: ${externalData.court_listener_cases.length} similar cases
      
      Provide complexity assessment in JSON format.
    `;
    
    const response = await aiService.makeOpenAICall('gpt-4-0125-preview', [{
      role: 'user',
      content: prompt
    }], { temperature: 0.3 });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async runPredictionGeneration(fusedCaseData, externalData, previousResult) {
    const prompt = `
      Generate legal predictions:
      
      All Previous Analysis: ${JSON.stringify(previousResult, null, 2)}
      Similar Cases: ${externalData.court_listener_cases.length} cases
      
      Provide prediction analysis in JSON format.
    `;
    
    const response = await aiService.makeOpenAICall('gpt-4-0125-preview', [{
      role: 'user',
      content: prompt
    }], { temperature: 0.3 });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async saveStageResult(caseId, stageName, stageResult) {
    try {
      await supabaseService.client
        .from('case_processing_stages')
        .upsert({
          case_id: caseId,
          stage_name: stageName,
          stage_result: stageResult,
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error(`Error saving stage result for ${stageName}:`, error);
    }
  }

  async updateCaseStatus(caseId, status) {
    try {
      await supabaseService.client
        .from('case_briefs')
        .update({
          processing_status: status,
          processing_type: 'enhanced',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);
    } catch (error) {
      console.error(`Error updating case status for ${caseId}:`, error);
    }
  }
}

module.exports = new EnhancedProcessingService(); 