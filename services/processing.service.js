// services/processing.service.js
const Sentry = require('@sentry/node');
const supabaseService = require('./supabase.service');
const aiService = require('./ai.service');
const pdfcoService = require('./pdfco.service');
const courtListenerService = require('./courtlistener.service');
const errorTrackingService = require('./error-tracking.service');
const internalAPIService = require('./internal-api.service');
const queueService = require('./queue.service');

class ProcessingService {
  constructor() {
    this.processingJobs = new Map();
  }

  async processNewCase(jobData) {
    const { caseId, userId, caseData, webhookType, table, source } = jobData;
    const jobKey = `case-${caseId}-${webhookType}`;
    
    // Prevent duplicate processing
    if (this.processingJobs.has(jobKey)) {
      console.log(`Job ${jobKey} already in progress, skipping duplicate`);
      return { success: false, reason: 'Already processing' };
    }
    
    this.processingJobs.set(jobKey, Date.now());
    
    try {
      console.log(`Starting case processing for ${caseId} (${webhookType})`);
      
      // Step 1: Fetch complete case data
      const caseInfo = caseData || await supabaseService.getCaseById(caseId);
      if (!caseInfo) {
        throw new Error(`Case ${caseId} not found`);
      }
      
      // Step 2: Fetch case evidence (matching Make scenario)
      const evidence = await this.fetchCaseEvidence(caseId);
      console.log(`Found ${evidence.length} evidence records for case ${caseId}`);
      
      // Step 3: Fetch document content if available
      const documentContent = await this.fetchDocumentContent(caseId);
      
      // Step 4: Run complete AI processing flow
      const aiResults = await aiService.processCaseComplete(
        caseInfo,
        evidence,
        documentContent
      );
      
      // Step 5: Process based on results completeness
      if (this.hasCompleteEnrichment(aiResults)) {
        await this.processCompleteEnrichment(caseId, aiResults);
      } else if (this.hasPartialEnrichment(aiResults)) {
        await this.processPartialEnrichment(caseId, aiResults);
      } else {
        await this.processMinimalEnrichment(caseId, aiResults);
      }
      
      // Step 6: Update case stage if needed
      if (caseInfo.case_stage === 'Assessing filing') {
        await this.updateCaseStage(caseId, 'Analysis Complete');
      }
      
      // Step 7: Trigger additional analysis endpoints
      try {
        console.log(`Triggering additional analysis for case ${caseId}`);
        const analysisResults = await internalAPIService.triggerSequentialAnalysis(caseId, 3000); // 3 second delay
        
        if (analysisResults.errors.length > 0) {
          console.warn(`Some analysis failed for case ${caseId}:`, analysisResults.errors);
        }
        
        console.log(`Additional analysis completed for case ${caseId}`);
      } catch (error) {
        console.error(`Failed to trigger additional analysis for case ${caseId}:`, error);
        // Don't fail the entire process if analysis fails
      }
      
      console.log(`Successfully processed case ${caseId}`);
      return { 
        success: true, 
        caseId, 
        enrichment: aiResults.enhancement,
        prediction: aiResults.prediction 
      };
      
    } catch (error) {
      console.error(`Case processing error for ${caseId}:`, error);
      
      // Log error to database
      await errorTrackingService.logProcessingError(caseId, error, {
        webhookType,
        source,
        step: 'processNewCase'
      });
      
      // Report to Sentry
      Sentry.captureException(error, {
        tags: { caseId, source, webhookType },
        contexts: { jobData }
      });
      
      throw error;
    } finally {
      this.processingJobs.delete(jobKey);
    }
  }

  // Fetch case evidence matching Make scenario
  async fetchCaseEvidence(caseId) {
    try {
      const { data: evidence, error } = await supabaseService.client
        .from('case_evidence')
        .select('*')
        .eq('case_id', caseId)
        .limit(50);
        
      if (error) throw error;
      return evidence || [];
    } catch (error) {
      console.error(`Error fetching evidence for case ${caseId}:`, error);
      await errorTrackingService.logProcessingError(caseId, error, {
        step: 'fetchCaseEvidence'
      });
      return [];
    }
  }

  // Fetch document content
  async fetchDocumentContent(caseId) {
    try {
      const { data: documents, error } = await supabaseService.client
        .from('case_documents')
        .select('ai_extracted_text, file_path')
        .eq('case_id', caseId)
        .limit(10);
        
      if (error) throw error;
      
      // Combine all document content
      return documents?.map(doc => doc.ai_extracted_text).join('\n\n') || '';
    } catch (error) {
      console.error(`Error fetching documents for case ${caseId}:`, error);
      return '';
    }
  }

  // Check if we have complete enrichment data
  hasCompleteEnrichment(aiResults) {
    return aiResults.enhancement?.cause_of_action?.length > 0 &&
           aiResults.enhancement?.applicable_statute?.length > 0 &&
           aiResults.enhancement?.enhanced_case_type &&
           aiResults.prediction;
  }

  // Check if we have partial enrichment data
  hasPartialEnrichment(aiResults) {
    return aiResults.enhancement?.enhanced_case_type ||
           aiResults.enhancement?.cause_of_action?.length > 0;
  }

  // Process complete enrichment (all data available)
  async processCompleteEnrichment(caseId, aiResults) {
    console.log(`Processing complete enrichment for case ${caseId}`);
    
    try {
      // Update case_ai_enrichment table
      await supabaseService.updateCaseAIEnrichment(caseId, {
        cause_of_action: aiResults.enhancement.cause_of_action,
        applicable_statute: aiResults.enhancement.applicable_statute?.join(', '),
        applicable_case_law: aiResults.enhancement.applicable_case_law?.join(', '),
        enhanced_case_type: aiResults.enhancement.enhanced_case_type,
        jurisdiction_enriched: aiResults.enhancement.jurisdiction_enriched,
        court_abbreviation: aiResults.enhancement.court_abbreviation,
        raw_gpt_response: {
          intake: aiResults.intakeAnalysis,
          jurisdiction: aiResults.jurisdiction,
          enhancement: aiResults.enhancement,
          complexity: aiResults.complexity,
          prediction: aiResults.prediction
        }
      });
      
      // Update case_predictions table
      await supabaseService.client
        .from('case_predictions')
        .upsert({
          case_id: caseId,
          ...aiResults.prediction,
          case_complexity_score: aiResults.complexity,
          created_at: new Date().toISOString()
        });
      
      // Save CourtListener similar cases
      if (aiResults.courtListenerCases?.length > 0) {
        // First, delete existing similar cases for this case to avoid duplicates
        await supabaseService.client
          .from('similar_cases')
          .delete()
          .eq('case_id', caseId);
        
        const similarCases = aiResults.courtListenerCases.map(c => ({
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
          
          console.log(`Saved ${similarCases.length} similar cases for case ${caseId}`);
        }
      }

      // Update case_briefs with enriched data
      await supabaseService.updateCaseBrief(caseId, {
        ai_processed: true,
        processing_status: 'complete',
        success_probability: Math.round(aiResults.prediction.outcome_prediction_score * 100),
        risk_level: this.calculateRiskLevel(aiResults.prediction.risk_score)
      });
      
    } catch (error) {
      console.error(`Error updating enrichment for case ${caseId}:`, error);
      await errorTrackingService.logAIEnrichmentError(caseId, error, aiResults);
      throw error;
    }
  }

  // Process partial enrichment (some data missing)
  async processPartialEnrichment(caseId, aiResults) {
    console.log(`Processing partial enrichment for case ${caseId}`);
    
    try {
      // Update with available data
      await supabaseService.updateCaseAIEnrichment(caseId, {
        cause_of_action: aiResults.enhancement?.cause_of_action || [],
        enhanced_case_type: aiResults.enhancement?.enhanced_case_type,
        jurisdiction_enriched: aiResults.enhancement?.jurisdiction_enriched,
        raw_gpt_response: aiResults
      });
      
      await supabaseService.updateCaseBrief(caseId, {
        ai_processed: true,
        processing_status: 'partial',
      });
      
    } catch (error) {
      console.error(`Error updating partial enrichment for case ${caseId}:`, error);
      await errorTrackingService.logAIEnrichmentError(caseId, error, aiResults);
    }
  }

  // Process minimal enrichment (fallback)
  async processMinimalEnrichment(caseId, aiResults) {
    console.log(`Processing minimal enrichment for case ${caseId}`);
    
    try {
      await supabaseService.updateCaseAIEnrichment(caseId, {
        raw_gpt_response: aiResults
      });
      
      await supabaseService.updateCaseBrief(caseId, {
        ai_processed: false,
        processing_status: 'minimal',
      });
      
      // Log for manual review
      await errorTrackingService.logProcessingError(caseId, 
        new Error('Minimal enrichment only'), 
        { aiResults, severity: 'warning' }
      );
      
    } catch (error) {
      console.error(`Error updating minimal enrichment for case ${caseId}:`, error);
    }
  }

  // Update case stage
  async updateCaseStage(caseId, newStage) {
    try {
      await supabaseService.client
        .from('case_briefs')
        .update({
          case_stage: newStage,
          updated_at: new Date().toISOString()
        })
        .eq('id', caseId);
        
      console.log(`Updated case ${caseId} stage to: ${newStage}`);
    } catch (error) {
      console.error(`Error updating case stage for ${caseId}:`, error);
    }
  }

  // Calculate risk level based on score
  calculateRiskLevel(riskScore) {
    if (!riskScore) return 'unknown';
    if (riskScore < 0.3) return 'low';
    if (riskScore < 0.7) return 'medium';
    return 'high';
  }

  // Process document upload
  async processDocument(jobData) {
    const { caseId, documentId } = jobData;
    
    try {
      console.log(`Processing document ${documentId} for case ${caseId}`);
      
      const document = await supabaseService.client
        .from('case_documents')
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (!document.data) {
        throw new Error(`Document ${documentId} not found`);
      }
      
      // Process document content
      if (document.data.file_type === 'application/pdf') {
        // Get public URL for the document
        const { data: urlData } = supabaseService.client
          .storage
          .from('case-files')
          .getPublicUrl(document.data.file_path);
          
        const extractedText = await pdfcoService.extractText(urlData.publicUrl);
        
        // Update document with extracted text
        await supabaseService.client
          .from('case_documents')
          .update({
            ai_extracted_text: extractedText,
            processed: true
          })
          .eq('id', documentId);
      }
      
      // Trigger case re-analysis
      await this.reanalyzeCase({ caseId });
      
      return { success: true, documentId };
    } catch (error) {
      console.error(`Document processing error for ${documentId}:`, error);
      await errorTrackingService.logProcessingError(caseId, error, {
        documentId,
        step: 'processDocument'
      });
      throw error;
    }
  }

  // Re-analyze case after new document
  async reanalyzeCase(jobData) {
    const { caseId } = jobData;
    
    try {
      console.log(`Re-analyzing case ${caseId} due to new documents`);
      
      await this.processNewCase({
        caseId,
        webhookType: 'UPDATE',
        table: 'case_briefs',
        source: 'reanalysis'
      });
      
      return { success: true, caseId };
    } catch (error) {
      console.error(`Case re-analysis error for ${caseId}:`, error);
      throw error;
    }
  }

  // Cleanup old job tracking
  cleanupOldJobs() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    for (const [key, timestamp] of this.processingJobs.entries()) {
      if (now - timestamp > maxAge) {
        this.processingJobs.delete(key);
      }
    }
  }

  /**
   * Trigger analysis for existing cases that might not have been processed
   * This is called when the frontend tries to access case data but it's not available
   * @param {string} caseId - Case ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Processing result
   */
  async triggerAnalysisForExistingCase(caseId, userId) {
    try {
      console.log(`Triggering analysis for existing case ${caseId}`);
      
      // Check if case exists and belongs to user
      const caseInfo = await supabaseService.getCaseById(caseId);
      if (!caseInfo || caseInfo.user_id !== userId) {
        throw new Error('Case not found or access denied');
      }
      
      // Check if case has already been processed
      const { data: existingEnrichment } = await supabaseService.client
        .from('case_ai_enrichment')
        .select('*')
        .eq('case_id', caseId)
        .single();
      
      if (existingEnrichment) {
        console.log(`Case ${caseId} already has enrichment data`);
        return { success: true, alreadyProcessed: true };
      }
      
      // Check if case has predictions
      const { data: existingPredictions } = await supabaseService.client
        .from('case_predictions')
        .select('*')
        .eq('case_id', caseId)
        .single();
      
      if (existingPredictions) {
        console.log(`Case ${caseId} already has predictions`);
        return { success: true, alreadyProcessed: true };
      }
      
      // If no analysis exists, trigger the full processing flow
      console.log(`No analysis found for case ${caseId}, triggering full processing`);
      
      // Add to processing queue
      await queueService.add('case-processing', {
        caseId,
        userId,
        caseData: caseInfo,
        webhookType: 'ANALYSIS_TRIGGER',
        table: 'case_briefs',
        source: 'frontend_request'
      });
      
      return { 
        success: true, 
        message: 'Analysis triggered',
        queued: true 
      };
      
    } catch (error) {
      console.error(`Error triggering analysis for case ${caseId}:`, error);
      throw error;
    }
  }
}

module.exports = new ProcessingService();