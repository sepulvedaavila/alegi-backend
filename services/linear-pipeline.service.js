// services/linear-pipeline.service.js
const { createClient } = require('@supabase/supabase-js');
const AIService = require('./ai.service');
const PDFService = require('./pdf.service');
const CourtListenerService = require('./courtlistener.service');
const ErrorTrackingService = require('./error-tracking.service');

class LinearPipelineService {
  constructor() {
    // Initialize Supabase client
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : {
          from: (table) => ({
            select: () => ({
              eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
              single: () => Promise.resolve({ data: null, error: null })
            }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            insert: () => Promise.resolve({ data: null, error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
            delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
          })
        };
    
    // Initialize services
    this.aiService = AIService;
    this.pdfService = PDFService;
    this.courtListenerService = CourtListenerService;
    this.errorTrackingService = ErrorTrackingService;
  }

  async executeLinearPipeline(caseId) {
    console.log(`🚀 Starting linear pipeline execution for case ${caseId}`);
    
    const steps = [
      { name: 'extractPDF', fn: this.extractPDFContent.bind(this) },
      { name: 'intakeAnalysis', fn: this.executeIntakeAnalysis.bind(this) },
      { name: 'dbInsert1', fn: this.insertIntakeData.bind(this) },
      { name: 'jurisdictionAnalysis', fn: this.executeJurisdictionAnalysis.bind(this) },
      { name: 'caseEnhancement', fn: this.executeCaseEnhancement.bind(this) },
      { name: 'dbInsert2', fn: this.insertEnhancementData.bind(this) },
      { name: 'courtListenerSearch', fn: this.searchCourtListener.bind(this) },
      { name: 'courtListenerOpinions', fn: this.fetchOpinions.bind(this) },
      { name: 'courtOpinionAnalysis', fn: this.executeCourtOpinionAnalysis.bind(this) },
      { name: 'dbInsert3', fn: this.insertOpinionData.bind(this) },
      { name: 'complexityScore', fn: this.executeComplexityScore.bind(this) },
      { name: 'predictionAnalysis', fn: this.executePredictionAnalysis.bind(this) },
      { name: 'additionalAnalysis', fn: this.executeAdditionalAnalysis.bind(this) },
      { name: 'finalDbInsert', fn: this.insertFinalData.bind(this) }
    ];

    const context = { caseId, data: {} };
    
    console.log(`📋 Pipeline configured with ${steps.length} steps`);
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNumber = i + 1;
      
      try {
        console.log(`\n🔄 Step ${stepNumber}/${steps.length}: Executing ${step.name} for case ${caseId}`);
        
        // Log context data before step execution
        console.log(`📊 Context data before ${step.name}:`, {
          hasCaseData: !!context.data.caseData,
          hasIntakeAnalysis: !!context.data.intakeAnalysis,
          hasJurisdictionAnalysis: !!context.data.jurisdictionAnalysis,
          hasCaseEnhancement: !!context.data.caseEnhancement,
          hasCourtListenerCases: !!context.data.courtListenerCases?.length,
          hasComplexityScore: !!context.data.complexityScore,
          hasPredictionAnalysis: !!context.data.predictionAnalysis,
          hasAdditionalAnalysis: !!context.data.additionalAnalysis
        });
        
        const stepStartTime = Date.now();
        await step.fn(context);
        const stepDuration = Date.now() - stepStartTime;
        
        console.log(`✅ Step ${stepNumber}/${steps.length}: Completed ${step.name} for case ${caseId} (${stepDuration}ms)`);
        
        // Log context data after step execution
        console.log(`📊 Context data after ${step.name}:`, {
          hasCaseData: !!context.data.caseData,
          hasIntakeAnalysis: !!context.data.intakeAnalysis,
          hasJurisdictionAnalysis: !!context.data.jurisdictionAnalysis,
          hasCaseEnhancement: !!context.data.caseEnhancement,
          hasCourtListenerCases: !!context.data.courtListenerCases?.length,
          hasComplexityScore: !!context.data.complexityScore,
          hasPredictionAnalysis: !!context.data.predictionAnalysis,
          hasAdditionalAnalysis: !!context.data.additionalAnalysis
        });
        
      } catch (error) {
        console.error(`❌ Step ${stepNumber}/${steps.length}: Failed ${step.name} for case ${caseId}:`, error);
        
        // Log detailed error information
        console.error('Error details:', {
          step: step.name,
          stepNumber: stepNumber,
          caseId: caseId,
          errorMessage: error.message,
          errorStack: error.stack,
          contextDataKeys: Object.keys(context.data)
        });
        
        // Log error to tracking service
        await this.errorTrackingService.logProcessingError(caseId, error, {
          step: step.name,
          stepNumber: stepNumber,
          context: {
            hasCaseData: !!context.data.caseData,
            hasIntakeAnalysis: !!context.data.intakeAnalysis,
            hasJurisdictionAnalysis: !!context.data.jurisdictionAnalysis,
            hasCaseEnhancement: !!context.data.caseEnhancement,
            hasCourtListenerCases: !!context.data.courtListenerCases?.length,
            hasComplexityScore: !!context.data.complexityScore,
            hasPredictionAnalysis: !!context.data.predictionAnalysis,
            hasAdditionalAnalysis: !!context.data.additionalAnalysis
          }
        });
        
        throw new Error(`Pipeline failed at step ${stepNumber} (${step.name}): ${error.message}`);
      }
    }
    
    console.log(`\n🎯 All pipeline steps completed successfully for case ${caseId}`);
    
    // Mark as completed
    try {
      console.log(`📝 Marking case ${caseId} as completed`);
      await this.supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'completed',
          ai_processed: true,
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);
      
      console.log(`✅ Case ${caseId} marked as completed successfully`);
    } catch (error) {
      console.error(`❌ Failed to mark case ${caseId} as completed:`, error);
      // Don't throw here as the pipeline completed successfully
    }
    
    console.log(`🎉 Linear pipeline execution completed successfully for case ${caseId}`);
    console.log(`📊 Final context data summary:`, {
      totalDataKeys: Object.keys(context.data).length,
      hasCaseData: !!context.data.caseData,
      hasIntakeAnalysis: !!context.data.intakeAnalysis,
      hasJurisdictionAnalysis: !!context.data.jurisdictionAnalysis,
      hasCaseEnhancement: !!context.data.caseEnhancement,
      hasCourtListenerCases: !!context.data.courtListenerCases?.length,
      hasComplexityScore: !!context.data.complexityScore,
      hasPredictionAnalysis: !!context.data.predictionAnalysis,
      hasAdditionalAnalysis: !!context.data.additionalAnalysis
    });
      
    return context.data;
  }

  // Step 1: Extract PDF content
  async extractPDFContent(context) {
    const { caseId } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'extractPDF', 'started');
    
    // Get case documents
    const { data: documents, error } = await this.supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    
    let extractedContent = '';
    const documentExtractions = [];
    
    for (const document of documents || []) {
      if (document.file_path && !document.ai_extracted_text) {
        try {
          const extractedText = await this.pdfService.extractText(document.file_path);
          
          // Update document with extracted text
          await this.supabase
            .from('case_documents')
            .update({ ai_extracted_text: extractedText })
            .eq('id', document.id);
          
          // Create structured extraction record
          const structuredData = await this.extractStructuredData(extractedText, document.file_name);
          const extractionRecord = {
            id: document.id, // Use document ID as extraction ID
            case_id: caseId,
            document_id: document.id,
            file_name: document.file_name,
            file_type: document.file_type,
            extracted_text: extractedText,
            structured_data: structuredData,
            extraction_metadata: {
              service: 'pdfco',
              extraction_timestamp: new Date().toISOString(),
              pages: document.file_size ? Math.ceil(document.file_size / 5000) : 1, // Estimate pages
              confidence: 0.95
            },
            processing_status: 'completed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // Store in case_document_extractions
          await this.supabase
            .from('case_document_extractions')
            .upsert(extractionRecord);
          
          documentExtractions.push(extractionRecord);
          extractedContent += extractedText + '\n\n';
          
        } catch (error) {
          console.warn(`Failed to extract text from document ${document.id}:`, error);
          
          // Store error in extraction record
          await this.supabase
            .from('case_document_extractions')
            .upsert({
              id: document.id,
              case_id: caseId,
              document_id: document.id,
              file_name: document.file_name,
              file_type: document.file_type,
              processing_status: 'failed',
              error_message: error.message,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      } else if (document.ai_extracted_text) {
        extractedContent += document.ai_extracted_text + '\n\n';
        
        // Get existing extraction record
        const { data: existingExtraction } = await this.supabase
          .from('case_document_extractions')
          .select('*')
          .eq('document_id', document.id)
          .single();
        
        if (existingExtraction) {
          documentExtractions.push(existingExtraction);
        }
      }
    }
    
    context.data.extractedContent = extractedContent;
    context.data.documents = documents || [];
    context.data.documentExtractions = documentExtractions;
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'extractPDF', 'completed', {
      documents_processed: documents?.length || 0,
      extractions_created: documentExtractions.length,
      total_text_length: extractedContent.length
    });
  }

  // Helper method to extract structured data from text
  async extractStructuredData(text, fileName) {
    try {
      // Use AI to extract structured data from document text
      const structuredData = await this.aiService.extractDocumentStructure(text, fileName);
      return structuredData;
    } catch (error) {
      console.warn('Failed to extract structured data:', error);
      return {
        document_type: this.inferDocumentType(fileName),
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

  // Helper method to infer document type from filename
  inferDocumentType(fileName) {
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.includes('complaint')) return 'complaint';
    if (lowerFileName.includes('answer')) return 'answer';
    if (lowerFileName.includes('motion')) return 'motion';
    if (lowerFileName.includes('order')) return 'order';
    if (lowerFileName.includes('judgment')) return 'judgment';
    if (lowerFileName.includes('settlement')) return 'settlement';
    if (lowerFileName.includes('contract')) return 'contract';
    if (lowerFileName.includes('agreement')) return 'agreement';
    if (lowerFileName.includes('notice')) return 'notice';
    if (lowerFileName.includes('letter')) return 'letter';
    return 'document';
  }

  // Helper method to track processing stages
  async trackProcessingStage(caseId, stageName, status, result = null) {
    try {
      await this.supabase
        .from('case_processing_stages')
        .upsert({
          id: `${caseId}-${stageName}`,
          case_id: caseId,
          stage_name: stageName,
          stage_status: status,
          stage_result: result,
          started_at: status === 'started' ? new Date().toISOString() : null,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    } catch (error) {
      console.warn(`Failed to track processing stage ${stageName}:`, error);
    }
  }

  // Step 2: Execute intake analysis
  async executeIntakeAnalysis(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executeIntakeAnalysis', 'started');
    
    // Get case data
    const { data: caseData, error } = await this.supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (error) throw error;
    
    // Get case evidence
    const { data: evidence, error: evidenceError } = await this.supabase
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId);
    
    if (evidenceError) throw evidenceError;
    
    // Execute intake analysis
    const intakeAnalysis = await this.aiService.executeIntakeAnalysis(
      caseData,
      evidence || [],
      data.extractedContent
    );
    
    context.data.intakeAnalysis = intakeAnalysis;
    context.data.caseData = caseData;
    context.data.evidence = evidence || [];
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'executeIntakeAnalysis', 'completed', {
      case_type: intakeAnalysis.case_metadata?.case_type,
      legal_issues_count: intakeAnalysis.case_metadata?.issue?.length || 0
    });
  }

  // Step 3: Insert intake data
  async insertIntakeData(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'insertIntakeData', 'started');
    
    // Update case with intake analysis results
    await this.supabase
      .from('case_briefs')
      .update({
        case_type: data.intakeAnalysis.case_metadata.case_type,
        case_stage: data.intakeAnalysis.case_metadata.case_stage,
        date_filed: data.intakeAnalysis.case_metadata.date_filed,
        applicable_law: data.intakeAnalysis.case_metadata.applicable_law,
        legal_issues: data.intakeAnalysis.case_metadata.issue,
        updated_at: new Date().toISOString()
      })
      .eq('id', caseId);

    // Fuse user-provided data with document-extracted data
    await this.fuseCaseData(caseId, data);
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'insertIntakeData', 'completed');
  }

  // Helper method to fuse case data
  async fuseCaseData(caseId, data) {
    try {
      // Prepare user-provided data
      const userProvided = {
        case_narrative: data.caseData.case_narrative,
        history_narrative: data.caseData.history_narrative,
        applicable_law: data.caseData.applicable_law,
        expected_outcome: data.caseData.expected_outcome,
        additional_notes: data.caseData.additional_notes,
        attorneys_of_record: data.caseData.attorneys_of_record,
        intake_analysis: data.intakeAnalysis
      };

      // Prepare document-extracted data
      const documentExtracted = {
        documents: data.documentExtractions?.map(extraction => ({
          file_name: extraction.file_name,
          document_type: extraction.structured_data?.document_type,
          parties: extraction.structured_data?.parties,
          legal_claims: extraction.structured_data?.legal_claims,
          damages_sought: extraction.structured_data?.damages_sought,
          key_dates: extraction.structured_data?.key_dates,
          jurisdiction: extraction.structured_data?.jurisdiction,
          case_number: extraction.structured_data?.case_number
        })) || [],
        total_documents: data.documentExtractions?.length || 0
      };

      // Fuse the data using AI
      const fusedResult = await this.aiService.fuseCaseInformation(userProvided, documentExtracted);

      // Store in case_data_fusion table
      await this.supabase
        .from('case_data_fusion')
        .upsert({
          id: caseId, // Use case ID as fusion ID
          case_id: caseId,
          user_provided: userProvided,
          document_extracted: documentExtracted,
          fused_result: fusedResult,
          fusion_metadata: {
            fusion_timestamp: new Date().toISOString(),
            documents_processed: data.documentExtractions?.length || 0,
            fusion_method: 'ai_enhanced'
          },
          fusion_status: 'completed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      console.log('Case data fusion completed');
    } catch (error) {
      console.error('Case data fusion failed:', error);
      
      // Store fusion attempt with error
      await this.supabase
        .from('case_data_fusion')
        .upsert({
          id: caseId,
          case_id: caseId,
          user_provided: { case_narrative: data.caseData.case_narrative },
          document_extracted: { documents: [] },
          fusion_status: 'failed',
          error_message: error.message,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }
  }

  // Step 4: Execute jurisdiction analysis
  async executeJurisdictionAnalysis(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executeJurisdictionAnalysis', 'started');
    
    const jurisdictionAnalysis = await this.aiService.executeJurisdictionAnalysis(
      data.caseData,
      data.intakeAnalysis
    );
    
    context.data.jurisdictionAnalysis = jurisdictionAnalysis;
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'executeJurisdictionAnalysis', 'completed', {
      jurisdiction: jurisdictionAnalysis.jurisdiction,
      is_federal: jurisdictionAnalysis.is_federal
    });
  }

  // Step 5: Execute case enhancement
  async executeCaseEnhancement(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executeCaseEnhancement', 'started');
    
    // Get CourtListener cases for enhancement
    const courtListenerCases = await this.courtListenerService.searchSimilarCases(
      data.caseData,
      data.intakeAnalysis
    );
    
    const caseEnhancement = await this.aiService.executeCaseEnhancement(
      data.caseData,
      data.intakeAnalysis,
      data.jurisdictionAnalysis,
      data.extractedContent
    );
    
    context.data.caseEnhancement = caseEnhancement;
    context.data.courtListenerCases = courtListenerCases;
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'executeCaseEnhancement', 'completed', {
      enhanced_case_type: caseEnhancement.enhanced_case_type,
      court_listener_cases: courtListenerCases.count || 0
    });
  }

  // Step 6: Insert enhancement data
  async insertEnhancementData(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'insertEnhancementData', 'started');
    
    // Update case AI enrichment
    await this.supabase
      .from('case_ai_enrichment')
      .upsert({
        case_id: caseId,
        cause_of_action: data.caseEnhancement.cause_of_action,
        applicable_statute: data.caseEnhancement.applicable_statute?.join(', '),
        applicable_case_law: data.caseEnhancement.applicable_case_law?.join(', '),
        enhanced_case_type: data.caseEnhancement.enhanced_case_type,
        jurisdiction_enriched: data.caseEnhancement.jurisdiction_enriched,
        court_abbreviation: data.caseEnhancement.court_abbreviation,
        raw_gpt_response: {
          intake: data.intakeAnalysis,
          jurisdiction: data.jurisdictionAnalysis,
          enhancement: data.caseEnhancement
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'insertEnhancementData', 'completed');
  }

  // Step 7: Search CourtListener
  async searchCourtListener(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'searchCourtListener', 'started');
    
    // This step was already done in case enhancement, but we can enhance it further
    const enhancedSearch = await this.courtListenerService.searchSimilarCases(
      data.caseData,
      data.intakeAnalysis,
      { enhanced: true }
    );
    
    context.data.enhancedCourtListenerCases = enhancedSearch;
    
    // Store precedent cases in structured table
    await this.storePrecedentCases(caseId, enhancedSearch);
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'searchCourtListener', 'completed', {
      cases_found: enhancedSearch.count || 0,
      cases_processed: enhancedSearch.results?.length || 0
    });
  }

  // Helper method to store precedent cases
  async storePrecedentCases(caseId, courtListenerData) {
    try {
      if (!courtListenerData.results || courtListenerData.results.length === 0) {
        console.log('No precedent cases to store');
        return;
      }

      // Delete existing precedent cases for this case
      await this.supabase
        .from('precedent_cases')
        .delete()
        .eq('case_id', caseId);

      // Store each precedent case
      for (const courtCase of courtListenerData.results) {
        const precedentCase = {
          case_name: courtCase.case_name || 'Unknown Case',
          citation: courtCase.citation || '',
          court: courtCase.court || '',
          jurisdiction: courtCase.jurisdiction || '',
          judge_name: courtCase.judge || '',
          legal_issues: courtCase.legal_issues || [],
          applicable_statutes: courtCase.applicable_statutes || [],
          strategy_used: courtCase.strategy || '',
          outcome: courtCase.outcome || '',
          decision_summary: courtCase.decision_summary || '',
          full_text_url: courtCase.full_text_url || '',
          similarity_score: courtCase.similarity_score || 0.5,
          case_id: caseId,
          created_at: new Date().toISOString()
        };

        await this.supabase
          .from('precedent_cases')
          .insert(precedentCase);
      }

      console.log(`Stored ${courtListenerData.results.length} precedent cases`);
    } catch (error) {
      console.error('Failed to store precedent cases:', error);
    }
  }

  // Step 8: Fetch opinions
  async fetchOpinions(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'fetchOpinions', 'started');
    
    const opinions = [];
    
    // Fetch opinions for CourtListener cases
    for (const courtCase of data.courtListenerCases || []) {
      try {
        const caseOpinions = await this.courtListenerService.fetchCaseOpinions(courtCase.id);
        opinions.push(...caseOpinions);
      } catch (error) {
        console.warn(`Failed to fetch opinions for case ${courtCase.id}:`, error);
      }
    }
    
    context.data.opinions = opinions;
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'fetchOpinions', 'completed', {
      opinions_fetched: opinions.length
    });
  }

  // Step 9: Execute court opinion analysis
  async executeCourtOpinionAnalysis(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executeCourtOpinionAnalysis', 'started');
    
    // Analyze opinions for legal insights
    const opinionAnalysis = await this.aiService.executeCourtOpinionAnalysis(
      data.opinions.map(op => op.opinion).join('\n\n')
    );
    
    context.data.opinionAnalysis = opinionAnalysis;
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'executeCourtOpinionAnalysis', 'completed', {
      opinions_analyzed: data.opinions.length
    });
  }

  // Step 10: Insert opinion data
  async insertOpinionData(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'insertOpinionData', 'started');
    
    // Save similar cases
    if (data.courtListenerCases?.length > 0) {
      // Delete existing similar cases
      await this.supabase
        .from('similar_cases')
        .delete()
        .eq('case_id', caseId);

      // Insert new similar cases
      for (const courtCase of data.courtListenerCases) {
        await this.supabase
          .from('similar_cases')
          .insert({
            case_id: caseId,
            similar_case_id: courtCase.id,
            similarity_score: courtCase.similarity_score || 0.5,
            case_name: courtCase.case_name,
            court: courtCase.court,
            jurisdiction: courtCase.jurisdiction,
            outcome: courtCase.outcome,
            created_at: new Date().toISOString()
          });
      }
    }
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'insertOpinionData', 'completed', {
      similar_cases_stored: data.courtListenerCases?.length || 0
    });
  }

  // Step 11: Execute complexity score
  async executeComplexityScore(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executeComplexityScore', 'started');
    
    const complexityScore = await this.aiService.executeComplexityScore(
      data.caseData,
      data.caseEnhancement,
      data.evidence
    );
    
    context.data.complexityScore = complexityScore;
    
    // Track processing stage completion
    await this.trackProcessingStage(caseId, 'executeComplexityScore', 'completed', {
      complexity_score: complexityScore
    });
  }

  // Step 12: Execute prediction analysis
  async executePredictionAnalysis(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executePredictionAnalysis', 'started');
    
    try {
      const predictionAnalysis = await this.aiService.executePredictionAnalysis({
        caseData: data.caseData,
        caseEnhancement: data.caseEnhancement,
        jurisdictionAnalysis: data.jurisdictionAnalysis,
        complexityScore: data.complexityScore,
        courtListenerCases: data.courtListenerCases,
        opinionAnalysis: data.opinionAnalysis
      });
      
      context.data.predictionAnalysis = this.validateAndTransformPrediction(predictionAnalysis);
      
      // Track processing stage completion
      await this.trackProcessingStage(caseId, 'executePredictionAnalysis', 'completed', {
        outcome_score: predictionAnalysis.outcome_prediction_score,
        risk_level: predictionAnalysis.risk_level
      });
      
    } catch (error) {
      console.error(`Prediction analysis failed for case ${caseId}:`, error);
      
      // Set fallback prediction data
      context.data.predictionAnalysis = this.getFallbackPredictionData(data);
      
      // Log error to tracking service
      await this.errorTrackingService.logProcessingError(caseId, error, {
        step: 'predictionAnalysis',
        context: {
          hasCaseEnhancement: !!data.caseEnhancement,
          hasJurisdictionAnalysis: !!data.jurisdictionAnalysis,
          complexityScore: data.complexityScore,
          courtListenerCasesCount: data.courtListenerCases?.length || 0
        }
      });
      
      // Track processing stage failure
      await this.trackProcessingStage(caseId, 'executePredictionAnalysis', 'failed', {
        error: error.message
      });
    }
  }

  // Validate and transform prediction data to match database schema
  validateAndTransformPrediction(predictionAnalysis) {
    // Handle null/undefined AI response
    if (!predictionAnalysis || typeof predictionAnalysis !== 'object') {
      console.warn('Invalid AI response received, using fallback data');
      return this.getFallbackPredictionData({});
    }
    
    const transformed = {
      // Core prediction fields
      outcome_prediction_score: this.validateNumericField(predictionAnalysis.outcome_prediction_score, 50, 0, 100),
      settlement_probability: this.validateNumericField(predictionAnalysis.settlement_probability, 50, 0, 100),
      case_strength_score: this.validateNumericField(predictionAnalysis.case_strength_score, 50, 0, 100),
      risk_level: this.validateRiskLevel(predictionAnalysis.risk_level),
      prediction_confidence: this.validateConfidence(predictionAnalysis.prediction_confidence),
      estimated_timeline: this.validateNumericField(predictionAnalysis.estimated_timeline, 12, 1, 60),
      
      // Financial fields
      estimated_financial_outcome: this.validateNumericField(predictionAnalysis.estimated_financial_outcome, 0, 0, 10000000),
      litigation_cost_estimate: this.validateNumericField(predictionAnalysis.litigation_cost_estimate, 0, 0, 1000000),
      
      // Score fields
      jurisdiction_score: this.validateNumericField(predictionAnalysis.jurisdiction_score, 50, 0, 100),
      case_type_score: this.validateNumericField(predictionAnalysis.case_type_score, 50, 0, 100),
      precedent_score: this.validateNumericField(predictionAnalysis.precedent_score, 50, 0, 100),
      procedural_score: this.validateNumericField(predictionAnalysis.procedural_score, 50, 0, 100),
      
      // Additional fields from AI response
      confidence_prediction_percentage: this.validateNumericField(predictionAnalysis.confidence_prediction_percentage, 50, 0, 100),
      financial_outcome_range: this.validateRange(predictionAnalysis.financial_outcome_range),
      litigation_cost_range: this.validateRange(predictionAnalysis.litigation_cost_range),
      plaintiff_success: this.validateNumericField(predictionAnalysis.plaintiff_success, 50, 0, 100),
      appeal_after_trial: this.validateNumericField(predictionAnalysis.appeal_after_trial, 20, 0, 100),
      risk_score: this.validateNumericField(predictionAnalysis.risk_score, 50, 0, 100),
      witness_score: this.validateNumericField(predictionAnalysis.witness_score, 50, 0, 100),
      primary_fact_strength_analysis: this.validateNumericField(predictionAnalysis.primary_fact_strength_analysis, 50, 0, 100),
      average_time_resolution: this.validateNumericField(predictionAnalysis.average_time_resolution, 12, 1, 60),
      resolution_time_range: this.validateRange(predictionAnalysis.resolution_time_range),
      
      // Array fields
      prior_similar_rulings: Array.isArray(predictionAnalysis.prior_similar_rulings) ? predictionAnalysis.prior_similar_rulings : [],
      precedent_cases: Array.isArray(predictionAnalysis.precedent_cases) ? predictionAnalysis.precedent_cases : [],
      fact_strength_analysis: Array.isArray(predictionAnalysis.fact_strength_analysis) ? predictionAnalysis.fact_strength_analysis : [],
      real_time_law_changes: Array.isArray(predictionAnalysis.real_time_law_changes) ? predictionAnalysis.real_time_law_changes : [],
      analyzed_cases: Array.isArray(predictionAnalysis.analyzed_cases) ? predictionAnalysis.analyzed_cases : [],
      similar_cases: Array.isArray(predictionAnalysis.similar_cases) ? predictionAnalysis.similar_cases : [],
      
      // Text fields
      average_time_resolution_type: predictionAnalysis.average_time_resolution_type || 'months',
      judge_analysis: predictionAnalysis.judge_analysis || 'Analysis not available',
      lawyer_analysis: predictionAnalysis.lawyer_analysis || 'Analysis not available',
      settlement_trial_analysis: predictionAnalysis.settlement_trial_analysis || 'Analysis not available',
      recommended_settlement_window: predictionAnalysis.recommended_settlement_window || 'Not specified',
      primary_strategy: predictionAnalysis.primary_strategy || 'Not specified',
      alternative_approach: predictionAnalysis.alternative_approach || 'Not specified',
      additional_facts_recommendations: predictionAnalysis.additional_facts_recommendations || 'No additional recommendations'
    };
    
    console.log('Prediction data validated and transformed:', {
      outcome_score: transformed.outcome_prediction_score,
      settlement_probability: transformed.settlement_probability,
      case_strength_score: transformed.case_strength_score,
      risk_level: transformed.risk_level,
      confidence: transformed.prediction_confidence
    });
    
    return transformed;
  }
  
  // Validate numeric fields with fallback values
  validateNumericField(value, defaultValue, min, max) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      console.warn(`Invalid numeric value: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    return Math.max(min, Math.min(max, num));
  }
  
  // Validate risk level field
  validateRiskLevel(value) {
    const validLevels = ['low', 'medium', 'high'];
    if (validLevels.includes(value?.toLowerCase())) {
      return value.toLowerCase();
    }
    console.warn(`Invalid risk level: ${value}, using default: medium`);
    return 'medium';
  }
  
  // Validate confidence field
  validateConfidence(value) {
    const validLevels = ['low', 'medium', 'high'];
    if (validLevels.includes(value?.toLowerCase())) {
      return value.toLowerCase();
    }
    console.warn(`Invalid confidence level: ${value}, using default: medium`);
    return 'medium';
  }
  
  // Validate range objects
  validateRange(range) {
    if (range && typeof range === 'object' && 'min' in range && 'max' in range) {
      return {
        min: this.validateNumericField(range.min, 0, 0, 10000000),
        max: this.validateNumericField(range.max, 100000, 0, 10000000)
      };
    }
    return { min: 0, max: 100000 };
  }
  
  // Get fallback prediction data when AI analysis fails
  getFallbackPredictionData(data) {
    console.log('Using fallback prediction data');
    
    const complexityScore = data.complexityScore || 50;
    const hasCourtListenerCases = data.courtListenerCases?.length > 0;
    
    return {
      // Core prediction fields with reasonable defaults
      outcome_prediction_score: 50,
      settlement_probability: 50,
      case_strength_score: 50,
      risk_level: complexityScore > 70 ? 'high' : complexityScore > 40 ? 'medium' : 'low',
      prediction_confidence: 'low',
      estimated_timeline: Math.max(6, Math.min(24, complexityScore / 5)),
      
      // Financial fields
      estimated_financial_outcome: 100000,
      litigation_cost_estimate: 50000,
      
      // Score fields
      jurisdiction_score: 50,
      case_type_score: 50,
      precedent_score: hasCourtListenerCases ? 60 : 40,
      procedural_score: 50,
      
      // Additional fields
      confidence_prediction_percentage: 30,
      financial_outcome_range: { min: 50000, max: 200000 },
      litigation_cost_range: { min: 25000, max: 100000 },
      plaintiff_success: 50,
      appeal_after_trial: 20,
      risk_score: complexityScore,
      witness_score: 50,
      primary_fact_strength_analysis: 50,
      average_time_resolution: 12,
      resolution_time_range: { min: 6, max: 24 },
      
      // Array fields
      prior_similar_rulings: [],
      precedent_cases: [],
      fact_strength_analysis: [],
      real_time_law_changes: [],
      analyzed_cases: [],
      similar_cases: [],
      
      // Text fields
      average_time_resolution_type: 'months',
      judge_analysis: 'Analysis not available due to processing error',
      lawyer_analysis: 'Analysis not available due to processing error',
      settlement_trial_analysis: 'Analysis not available due to processing error',
      recommended_settlement_window: 'Not specified due to processing error',
      primary_strategy: 'Not specified due to processing error',
      alternative_approach: 'Not specified due to processing error',
      additional_facts_recommendations: 'Processing error occurred - manual review recommended'
    };
  }

  // Step 13: Execute additional analysis
  async executeAdditionalAnalysis(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'executeAdditionalAnalysis', 'started');
    
    try {
      // Get relevant law updates
      const lawUpdates = await this.getRelevantLawUpdates(data);
      
      // Generate additional analysis types
      const additionalAnalysis = {
        costEstimate: this.generateCostEstimate(data),
        riskAssessment: this.generateRiskAssessment(data),
        settlementAnalysis: this.generateSettlementAnalysis(data),
        timelineEstimate: this.generateTimelineEstimate(data),
        financialPrediction: this.generateFinancialPrediction(data),
        judgeTrends: this.generateJudgeTrends(data),
        lawUpdates: lawUpdates
      };
      
      context.data.additionalAnalysis = additionalAnalysis;
      
      // Track processing stage completion
      await this.trackProcessingStage(caseId, 'executeAdditionalAnalysis', 'completed', {
        analysis_types: Object.keys(additionalAnalysis).length,
        law_updates_count: lawUpdates.length
      });
      
    } catch (error) {
      console.error(`Additional analysis failed for case ${caseId}:`, error);
      
      // Set fallback analysis data
      context.data.additionalAnalysis = {
        costEstimate: this.getFallbackCostEstimate(data),
        riskAssessment: this.getFallbackRiskAssessment(data),
        settlementAnalysis: this.getFallbackSettlementAnalysis(data),
        timelineEstimate: this.getFallbackTimelineEstimate(data),
        financialPrediction: this.getFallbackFinancialPrediction(data),
        judgeTrends: this.getFallbackJudgeTrends(data),
        lawUpdates: []
      };
      
      // Track processing stage failure
      await this.trackProcessingStage(caseId, 'executeAdditionalAnalysis', 'failed', {
        error: error.message
      });
    }
  }
  
  // Generate cost estimate from processed data
  generateCostEstimate(data) {
    const complexity = data.complexityScore || 50;
    const baseCost = 50000; // Base litigation cost
    
    const complexityMultiplier = 1 + (complexity / 100);
    const jurisdictionMultiplier = data.jurisdictionAnalysis?.is_federal ? 1.5 : 1.0;
    
    const totalCost = Math.round(baseCost * complexityMultiplier * jurisdictionMultiplier);
    
    return {
      total: {
        min: Math.round(totalCost * 0.7),
        avg: totalCost,
        max: Math.round(totalCost * 1.5)
      },
      breakdown: {
        filing: Math.round(totalCost * 0.05),
        discovery: Math.round(totalCost * 0.35),
        motions: Math.round(totalCost * 0.15),
        trial: Math.round(totalCost * 0.30),
        other: Math.round(totalCost * 0.15)
      },
      factors: {
        complexity: complexity,
        jurisdiction: data.jurisdictionAnalysis?.jurisdiction || 'unknown',
        caseType: data.caseData?.case_type || 'unknown'
      }
    };
  }
  
  // Generate risk assessment from processed data
  generateRiskAssessment(data) {
    const prediction = data.predictionAnalysis || {};
    const complexity = data.complexityScore || 50;
    
    return {
      overallRisk: prediction.risk_level || 'medium',
      riskFactors: [
        {
          factor: 'Case Complexity',
          level: complexity > 70 ? 'high' : complexity > 40 ? 'medium' : 'low',
          impact: complexity / 100
        },
        {
          factor: 'Jurisdiction',
          level: data.jurisdictionAnalysis?.is_federal ? 'high' : 'medium',
          impact: 0.3
        },
        {
          factor: 'Precedent Support',
          level: data.courtListenerCases?.length > 5 ? 'low' : 'high',
          impact: 0.4
        }
      ],
      mitigationStrategies: [
        'Thorough discovery process',
        'Strong expert witnesses',
        'Settlement negotiations'
      ]
    };
  }
  
  // Generate settlement analysis from processed data
  generateSettlementAnalysis(data) {
    const settlementProb = data.predictionAnalysis?.settlement_probability || 50;
    const caseStrength = data.predictionAnalysis?.case_strength_score || 50;
    
    return {
      settlementLikelihood: settlementProb,
      recommendedApproach: settlementProb > 60 ? 'settlement' : 'trial',
      factors: {
        caseStrength: caseStrength,
        complexity: data.complexityScore || 50,
        precedentSupport: data.courtListenerCases?.length || 0
      },
      estimatedRange: {
        min: 50000,
        likely: 150000,
        max: 300000
      }
    };
  }
  
  // Generate timeline estimate from processed data
  generateTimelineEstimate(data) {
    const complexity = data.complexityScore || 50;
    const baseMonths = 12;
    const complexityFactor = 1 + (complexity / 100);
    
    return {
      totalMonths: Math.round(baseMonths * complexityFactor),
      phases: [
        { phase: 'Filing', months: 1 },
        { phase: 'Discovery', months: Math.round(6 * complexityFactor) },
        { phase: 'Pre-trial', months: 2 },
        { phase: 'Trial', months: Math.round(3 * complexityFactor) }
      ],
      factors: {
        complexity: complexity,
        jurisdiction: data.jurisdictionAnalysis?.jurisdiction || 'unknown',
        courtBacklog: 'moderate'
      }
    };
  }
  
  // Generate financial prediction from processed data
  generateFinancialPrediction(data) {
    const successProb = data.predictionAnalysis?.outcome_prediction_score || 50;
    const baseDamages = 500000;
    
    return {
      expectedValue: Math.round(baseDamages * (successProb / 100)),
      scenarios: [
        {
          scenario: 'Best Case',
          probability: successProb,
          outcome: baseDamages * 1.5
        },
        {
          scenario: 'Likely Case',
          probability: 70,
          outcome: baseDamages
        },
        {
          scenario: 'Worst Case',
          probability: 100 - successProb,
          outcome: -100000 // Costs only
        }
      ],
      confidence: data.predictionAnalysis?.prediction_confidence || 'medium'
    };
  }
  
  // Generate judge trends from court data
  generateJudgeTrends(data) {
    const courtCases = data.courtListenerCases || [];
    
    return {
      favorabilityScore: 60, // Default moderate favorability
      rulingHistory: {
        totalCases: courtCases.length,
        plaintiffWins: Math.round(courtCases.length * 0.4),
        defendantWins: Math.round(courtCases.length * 0.6)
      },
      patterns: [
        'Tends to favor well-documented cases',
        'Strict on procedural requirements',
        'Open to settlement discussions'
      ]
    };
  }
  
  // Step 14: Insert final data
  async insertFinalData(context) {
    const { caseId, data } = context;
    
    // Track processing stage
    await this.trackProcessingStage(caseId, 'insertFinalData', 'started');
    
    try {
      console.log(`Starting final data insertion for case ${caseId}`);
      
      // Insert prediction data
      const predictionData = {
        case_id: caseId,
        outcome_prediction_score: data.predictionAnalysis.outcome_prediction_score || 50,
        confidence_prediction_percentage: data.predictionAnalysis.prediction_confidence || 50,
        estimated_financial_outcome: data.predictionAnalysis.estimated_financial_outcome || 100000,
        financial_outcome_range: data.predictionAnalysis.financial_outcome_range || { min: 50000, max: 200000 },
        litigation_cost_estimate: data.predictionAnalysis.litigation_cost_estimate || 50000,
        litigation_cost_range: data.predictionAnalysis.litigation_cost_range || { min: 25000, max: 100000 },
        settlement_success_rate: data.predictionAnalysis.settlement_probability || 50,
        plaintiff_success: data.predictionAnalysis.plaintiff_success || 50,
        appeal_after_trial: data.predictionAnalysis.appeal_after_trial || 30,
        case_complexity_score: data.complexityScore || 50,
        risk_score: data.predictionAnalysis.risk_score || 50,
        prior_similar_rulings: data.predictionAnalysis.prior_similar_rulings || [],
        precedent_cases: data.predictionAnalysis.precedent_cases || [],
        witness_score: data.predictionAnalysis.witness_score || 50,
        judge_analysis: data.predictionAnalysis.judge_analysis || 'Not available',
        lawyer_analysis: data.predictionAnalysis.lawyer_analysis || 'Not available',
        settlement_trial_analysis: data.predictionAnalysis.settlement_trial_analysis || 'Not available',
        recommended_settlement_window: data.predictionAnalysis.recommended_settlement_window || 'Not specified',
        primary_strategy: data.predictionAnalysis.primary_strategy || 'Not specified',
        alternative_approach: data.predictionAnalysis.alternative_approach || 'Not specified',
        additional_facts_recommendations: data.predictionAnalysis.additional_facts_recommendations || 'Not specified',
        primary_fact_strength_analysis: data.predictionAnalysis.primary_fact_strength_analysis || 50,
        fact_strength_analysis: data.predictionAnalysis.fact_strength_analysis || [],
        average_time_resolution: data.predictionAnalysis.average_time_resolution || 12,
        resolution_time_range: data.predictionAnalysis.resolution_time_range || { min: 6, max: 18 },
        average_time_resolution_type: data.predictionAnalysis.average_time_resolution_type || 'months',
        real_time_law_changes: data.predictionAnalysis.real_time_law_changes || [],
        analyzed_cases: data.predictionAnalysis.analyzed_cases || [],
        similar_cases: data.predictionAnalysis.similar_cases || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log('Inserting prediction data');
      const { error: predictionError } = await this.supabase
        .from('case_predictions')
        .upsert(predictionData);
      
      if (predictionError) {
        console.error('Failed to insert predictions:', predictionError);
        throw new Error(`Database error inserting predictions: ${predictionError.message}`);
      }
      
      console.log('Successfully inserted prediction data');
      
      // Store additional analysis data
      if (data.additionalAnalysis) {
        console.log('Storing additional analysis data');
        
        // Store each analysis type in case_analysis table
        const analysisTypes = [
          { type: 'cost_estimate', result: data.additionalAnalysis.costEstimate },
          { type: 'risk_assessment', result: data.additionalAnalysis.riskAssessment },
          { type: 'settlement_analysis', result: data.additionalAnalysis.settlementAnalysis },
          { type: 'timeline_estimate', result: data.additionalAnalysis.timelineEstimate },
          { type: 'financial_prediction', result: data.additionalAnalysis.financialPrediction },
          { type: 'judge_trends', result: data.additionalAnalysis.judgeTrends },
          { type: 'law_updates', result: data.additionalAnalysis.lawUpdates }
        ];
        
        for (const analysis of analysisTypes) {
          if (analysis.result) {
            try {
              const { error: analysisError } = await this.supabase
                .from('case_analysis')
                .upsert({
                  case_id: caseId,
                  analysis_type: analysis.type,
                  result: analysis.result,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              
              if (analysisError) {
                console.error(`Failed to insert ${analysis.type} analysis:`, analysisError);
                // Continue with other analysis types even if one fails
              } else {
                console.log(`Successfully inserted ${analysis.type} analysis`);
              }
            } catch (error) {
              console.error(`Error inserting ${analysis.type} analysis:`, error);
              // Continue with other analysis types
            }
          }
        }
      } else {
        console.log('No additional analysis data to store');
      }
      
      // Update case with final processing status
      const caseUpdateData = {
        case_strength_score: data.predictionAnalysis.case_strength_score || 50,
        settlement_probability: data.predictionAnalysis.settlement_probability || 50,
        estimated_timeline: data.predictionAnalysis.estimated_timeline || 12,
        risk_level: data.predictionAnalysis.risk_level || 'medium',
        success_probability: data.predictionAnalysis.outcome_prediction_score || 50,
        updated_at: new Date().toISOString()
      };
      
      console.log('Updating case_briefs with final processing status');
      const { error: caseUpdateError } = await this.supabase
        .from('case_briefs')
        .update(caseUpdateData)
        .eq('id', caseId);
      
      if (caseUpdateError) {
        console.error('Failed to update case status:', caseUpdateError);
        throw new Error(`Database error updating case status: ${caseUpdateError.message}`);
      }
      
      console.log(`Final data insertion completed successfully for case ${caseId}`);
      
      // Track processing stage completion
      await this.trackProcessingStage(caseId, 'insertFinalData', 'completed', {
        predictions_stored: true,
        analysis_types_stored: data.additionalAnalysis ? Object.keys(data.additionalAnalysis).length : 0
      });
      
    } catch (error) {
      console.error(`Final data insertion failed for case ${caseId}:`, error);
      
      // Log error to tracking service
      await this.errorTrackingService.logProcessingError(caseId, error, {
        step: 'finalDbInsert',
        context: {
          hasPredictionAnalysis: !!data.predictionAnalysis,
          hasAdditionalAnalysis: !!data.additionalAnalysis,
          predictionFields: data.predictionAnalysis ? Object.keys(data.predictionAnalysis) : []
        }
      });
      
      // Track processing stage failure
      await this.trackProcessingStage(caseId, 'insertFinalData', 'failed', {
        error: error.message
      });
      
      throw error;
    }
  }

  // Fallback methods for additional analysis types
  getFallbackCostEstimate(data) {
    return {
      total: {
        min: 25000,
        avg: 50000,
        max: 100000
      },
      breakdown: {
        filing: 2500,
        discovery: 17500,
        motions: 7500,
        trial: 15000,
        other: 7500
      },
      factors: {
        complexity: data.complexityScore || 50,
        jurisdiction: data.jurisdictionAnalysis?.jurisdiction || 'unknown',
        caseType: data.caseData?.case_type || 'unknown'
      }
    };
  }
  
  getFallbackRiskAssessment(data) {
    return {
      overallRisk: 'medium',
      riskFactors: [
        {
          factor: 'Case Complexity',
          level: 'medium',
          impact: 0.5
        },
        {
          factor: 'Jurisdiction',
          level: 'medium',
          impact: 0.3
        },
        {
          factor: 'Precedent Support',
          level: 'medium',
          impact: 0.4
        }
      ],
      mitigationStrategies: [
        'Thorough discovery process',
        'Strong expert witnesses',
        'Settlement negotiations'
      ]
    };
  }
  
  getFallbackSettlementAnalysis(data) {
    return {
      settlementLikelihood: 50,
      recommendedApproach: 'trial',
      factors: {
        caseStrength: 50,
        complexity: data.complexityScore || 50,
        precedentSupport: data.courtListenerCases?.length || 0
      },
      estimatedRange: {
        min: 50000,
        likely: 150000,
        max: 300000
      }
    };
  }
  
  getFallbackTimelineEstimate(data) {
    return {
      totalMonths: 12,
      phases: [
        { phase: 'Filing', months: 1 },
        { phase: 'Discovery', months: 6 },
        { phase: 'Pre-trial', months: 2 },
        { phase: 'Trial', months: 3 }
      ],
      factors: {
        complexity: data.complexityScore || 50,
        jurisdiction: data.jurisdictionAnalysis?.jurisdiction || 'unknown',
        courtBacklog: 'moderate'
      }
    };
  }
  
  getFallbackFinancialPrediction(data) {
    return {
      expectedValue: 100000,
      scenarios: [
        {
          scenario: 'Best Case',
          probability: 50,
          outcome: 150000
        },
        {
          scenario: 'Likely Case',
          probability: 70,
          outcome: 100000
        },
        {
          scenario: 'Worst Case',
          probability: 50,
          outcome: -50000
        }
      ],
      confidence: 'medium'
    };
  }
  
  getFallbackJudgeTrends(data) {
    return {
      favorabilityScore: 60,
      rulingHistory: {
        totalCases: 0,
        plaintiffWins: 0,
        defendantWins: 0
      },
      patterns: [
        'Analysis not available due to processing error',
        'Manual review recommended'
      ]
    };
  }

  // Helper method to get relevant law updates
  async getRelevantLawUpdates(data) {
    try {
      const caseType = data.caseData?.case_type || data.caseEnhancement?.enhanced_case_type;
      const jurisdiction = data.jurisdictionAnalysis?.jurisdiction;
      
      if (!caseType || !jurisdiction) {
        return [];
      }
      
      // Query law updates table for relevant updates
      const { data: lawUpdates, error } = await this.supabase
        .from('law_updates')
        .select('*')
        .or(`type.ilike.%${caseType}%,title.ilike.%${caseType}%`)
        .eq('jurisdiction', jurisdiction)
        .gte('effective_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()) // Last year
        .order('effective_date', { ascending: false })
        .limit(5);
      
      if (error) {
        console.warn('Failed to fetch law updates:', error);
        return [];
      }
      
      return lawUpdates || [];
    } catch (error) {
      console.warn('Error getting law updates:', error);
      return [];
    }
  }
}

module.exports = LinearPipelineService; 