const enhancedProcessingService = require('../services/enhanced-processing.service');
const notificationService = require('../services/notification.service');
const Sentry = require('@sentry/node');

// Process enhanced case jobs - called by the serverless queue service
async function process(jobData) {
  const { caseId, userId, caseData, webhookType } = jobData;
  
  try {
    console.log(`Processing enhanced case ${caseId}`);
    
    // Notify frontend that enhanced processing has started
    await notificationService.notifyEnhancedProcessingStarted(caseId, userId, caseData);
    
    // Use the enhanced processing service
    const result = await enhancedProcessingService.processCaseEnhanced({
      caseId,
      userId,
      caseData,
      webhookType,
      table: 'case_briefs',
      source: 'enhanced_webhook'
    });
    
    console.log(`Enhanced case ${caseId} processed successfully`);
    
    // Notify frontend that enhanced processing has completed
    await notificationService.notifyEnhancedProcessingCompleted(caseId, userId, caseData, result);
    
    return result;
  } catch (error) {
    console.error(`Enhanced case processing failed for ${caseId}:`, error);
    
    // Notify frontend that enhanced processing has failed
    await notificationService.notifyEnhancedProcessingFailed(caseId, userId, caseData, error);
    
    Sentry.captureException(error, {
      tags: { caseId, processingType: 'enhanced' }
    });
    throw error;
  }
}

// Process document extraction jobs (for enhanced flow)
async function processDocumentExtraction(jobData) {
  const { caseId, documentId, filePath } = jobData;
  
  try {
    console.log(`Processing document extraction for ${documentId} in case ${caseId}`);
    
    // Update document status to processing
    const supabaseService = require('../services/supabase.service');
    await supabaseService.client
      .from('case_documents')
      .update({
        extraction_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    // Extract document using enhanced processing
    const extractionResult = await enhancedProcessingService.extractSingleDocument(caseId, documentId, filePath);
    
    console.log(`Document extraction completed for ${documentId}`);
    return extractionResult;
  } catch (error) {
    console.error(`Document extraction failed for ${documentId}:`, error);
    
    // Update document status to failed
    const supabaseService = require('../services/supabase.service');
    await supabaseService.client
      .from('case_documents')
      .update({
        extraction_status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    Sentry.captureException(error, {
      tags: { caseId, documentId, processingType: 'document_extraction' }
    });
    throw error;
  }
}

// Process information fusion jobs
async function processInformationFusion(jobData) {
  const { caseId, caseData } = jobData;
  
  try {
    console.log(`Processing information fusion for case ${caseId}`);
    
    // Get document extractions
    const supabaseService = require('../services/supabase.service');
    const { data: extractions } = await supabaseService.client
      .from('case_document_extractions')
      .select('*')
      .eq('case_id', caseId)
      .eq('processing_status', 'completed');
    
    // Perform information fusion
    const fusedData = await enhancedProcessingService.fuseInformation(caseId, caseData, extractions || []);
    
    console.log(`Information fusion completed for case ${caseId}`);
    return { success: true, caseId, fusedData };
  } catch (error) {
    console.error(`Information fusion failed for case ${caseId}:`, error);
    
    Sentry.captureException(error, {
      tags: { caseId, processingType: 'information_fusion' }
    });
    throw error;
  }
}

// Process external enrichment jobs
async function processExternalEnrichment(jobData) {
  const { caseId, fusedData } = jobData;
  
  try {
    console.log(`Processing external enrichment for case ${caseId}`);
    
    // Perform external enrichment
    const externalData = await enhancedProcessingService.enrichWithExternalData(fusedData);
    
    console.log(`External enrichment completed for case ${caseId}`);
    return { success: true, caseId, externalData };
  } catch (error) {
    console.error(`External enrichment failed for case ${caseId}:`, error);
    
    Sentry.captureException(error, {
      tags: { caseId, processingType: 'external_enrichment' }
    });
    throw error;
  }
}

// Process staged AI analysis jobs
async function processStagedAIAnalysis(jobData) {
  const { caseId, fusedData, externalData } = jobData;
  
  try {
    console.log(`Processing staged AI analysis for case ${caseId}`);
    
    // Perform staged AI analysis
    const aiResults = await enhancedProcessingService.runStagedAIAnalysis(fusedData, externalData);
    
    console.log(`Staged AI analysis completed for case ${caseId}`);
    return { success: true, caseId, aiResults };
  } catch (error) {
    console.error(`Staged AI analysis failed for case ${caseId}:`, error);
    
    Sentry.captureException(error, {
      tags: { caseId, processingType: 'staged_ai_analysis' }
    });
    throw error;
  }
}

module.exports = {
  process,
  processDocumentExtraction,
  processInformationFusion,
  processExternalEnrichment,
  processStagedAIAnalysis,
  // Export for testing purposes
  enhancedProcessingService
}; 