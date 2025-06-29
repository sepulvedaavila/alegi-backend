// services/processing.service.js
const Sentry = require('@sentry/node');
const supabaseService = require('./supabase.service');
const pdfService = require('./pdf.service');
const aiService = require('./ai.service');
const externalAPIService = require('./external.service');
const emailService = require('./email.service');

class ProcessingService {
  constructor() {
    this.processingJobs = new Map(); // Track ongoing jobs to prevent duplicates
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
      console.log(`Processing case ${caseId} from ${source || 'unknown'} webhook (${webhookType})`);
      
      // Step 1: Get case data (use provided data or fetch from database)
      let caseInfo = caseData;
      if (!caseInfo) {
        caseInfo = await supabaseService.getCaseById(caseId);
      }
      
      if (!caseInfo) {
        throw new Error(`Case ${caseId} not found`);
      }
      
      console.log(`Processing case: ${caseInfo.case_name || 'Unnamed case'} (${caseInfo.case_stage})`);
      
      // Step 2: Process documents if any exist
      const documents = await supabaseService.getCaseEvidence(caseId);
      let allDocumentText = '';
      
      if (documents && documents.length > 0) {
        console.log(`Found ${documents.length} documents to process`);
        
        for (const doc of documents) {
          if (doc.file_path && doc.file_type === 'application/pdf') {
            try {
              const text = await pdfService.processCaseDocument(
                caseId, 
                doc.file_path, 
                doc.file_name
              );
              allDocumentText += text + '\n\n';
            } catch (docError) {
              console.error(`Failed to process document ${doc.id}:`, docError);
              Sentry.captureException(docError, {
                tags: { caseId, documentId: doc.id },
                contexts: { document: doc }
              });
            }
          }
        }
      }
      
      // Step 3: AI Enrichment using case narrative and documents
      const enrichment = await aiService.enrichCaseData(caseInfo, allDocumentText);
      await supabaseService.updateCaseAIEnrichment(caseId, enrichment);
      
      // Step 4: Search for precedents based on case type and jurisdiction
      let precedents = [];
      try {
        precedents = await externalAPIService.searchPrecedents(
          caseInfo.case_type || enrichment.caseType,
          caseInfo.jurisdiction,
          enrichment.keyIssues || []
        );
      } catch (precedentError) {
        console.error('Failed to search precedents:', precedentError);
        Sentry.captureException(precedentError, {
          tags: { caseId },
          contexts: { caseInfo }
        });
      }
      
      // Step 5: Generate predictions
      const prediction = await aiService.generateCasePrediction(
        caseInfo,
        enrichment,
        precedents
      );
      
      // Step 6: Update case with results
      await supabaseService.client
        .from('case_predictions')
        .upsert({
          case_id: caseId,
          prediction_data: prediction,
          precedents: precedents,
          created_at: new Date().toISOString(),
          webhook_source: source,
          webhook_type: webhookType
        });
      
      // Step 7: Update case status if needed
      if (caseInfo.case_stage === 'Assessing filing') {
        await supabaseService.client
          .from('case_briefs')
          .update({
            case_stage: 'Analysis Complete',
            updated_at: new Date().toISOString()
          })
          .eq('id', caseId);
      }
      
      // Step 8: Send notification (non-blocking)
      this.sendNotificationAsync(caseId, caseInfo);
      
      console.log(`Successfully processed case ${caseId}`);
      return { success: true, caseId, enrichment, prediction };
      
    } catch (error) {
      console.error('Case processing error:', error);
      
      // Report to Sentry
      Sentry.captureException(error, {
        tags: { caseId, source, webhookType },
        contexts: { jobData }
      });
      
      // Log error to database
      try {
        await supabaseService.client
          .from('processing_errors')
          .insert({
            case_id: caseId,
            error_message: error.message,
            error_stack: error.stack,
            webhook_source: source,
            webhook_type: webhookType,
            created_at: new Date().toISOString()
          });
      } catch (dbError) {
        console.error('Failed to log error to database:', dbError);
      }
      
      throw error;
    } finally {
      // Clean up job tracking
      this.processingJobs.delete(jobKey);
    }
  }

  async processDocument(jobData) {
    const { caseId, documentId } = jobData;
    
    try {
      const document = await supabaseService.client
        .from('case_evidence')
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (!document.data) {
        throw new Error(`Document ${documentId} not found`);
      }
      
      if (document.data.file_type === 'application/pdf') {
        await pdfService.processCaseDocument(
          caseId,
          document.data.file_path,
          document.data.file_name
        );
        
        // Trigger re-analysis of the case
        await this.reanalyzeCase({ caseId });
      }
      
      return { success: true, documentId };
    } catch (error) {
      console.error('Document processing error:', error);
      
      Sentry.captureException(error, {
        tags: { caseId, documentId },
        contexts: { jobData }
      });
      
      throw error;
    }
  }

  async reanalyzeCase(jobData) {
    const { caseId } = jobData;
    
    try {
      console.log(`Re-analyzing case ${caseId} due to new documents`);
      
      // Re-trigger the main case processing
      await this.processNewCase({
        caseId,
        webhookType: 'UPDATE',
        table: 'case_briefs',
        source: 'reanalysis'
      });
      
      return { success: true, caseId };
    } catch (error) {
      console.error('Case re-analysis error:', error);
      
      Sentry.captureException(error, {
        tags: { caseId },
        contexts: { jobData }
      });
      
      throw error;
    }
  }

  // Non-blocking notification sender
  async sendNotificationAsync(caseId, caseInfo) {
    try {
      await emailService.sendCaseProcessedNotification(caseId, caseInfo);
    } catch (error) {
      console.error('Failed to send notification:', error);
      Sentry.captureException(error, {
        tags: { caseId },
        contexts: { caseInfo }
      });
    }
  }

  // Cleanup old job tracking entries (call periodically)
  cleanupOldJobs() {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    
    for (const [key, timestamp] of this.processingJobs.entries()) {
      if (now - timestamp > maxAge) {
        this.processingJobs.delete(key);
      }
    }
  }
}

module.exports = new ProcessingService();