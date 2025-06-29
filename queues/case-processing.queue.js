// queues/case-processing.queue.js
const Bull = require('bull');
const supabaseService = require('../services/supabase.service');
const pdfService = require('../services/pdf.service');
const aiService = require('../services/ai.service');
const externalAPIService = require('../services/external.service');
const emailService = require('../services/email.service');

const caseProcessingQueue = new Bull('case-processing', {
  redis: process.env.REDIS_URL
});

// Process new cases
caseProcessingQueue.process('process-new-case', async (job) => {
  const { caseId, userId, caseData, webhookType, table, source } = job.data;
  
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
          const text = await pdfService.processCaseDocument(
            caseId, 
            doc.file_path, 
            doc.file_name
          );
          allDocumentText += text + '\n\n';
        }
      }
    }
    
    // Step 3: AI Enrichment using case narrative and documents
    const enrichmentData = {
      caseType: caseInfo.case_type,
      jurisdiction: caseInfo.jurisdiction,
      caseNarrative: caseInfo.case_narrative,
      expectedOutcome: caseInfo.expected_outcome,
      additionalNotes: caseInfo.additional_notes,
      documentText: allDocumentText
    };
    
    const enrichment = await aiService.enrichCaseData(caseInfo, allDocumentText);
    await supabaseService.updateCaseAIEnrichment(caseId, enrichment);
    
    // Step 4: Search for precedents based on case type and jurisdiction
    const precedents = await externalAPIService.searchPrecedents(
      caseInfo.case_type || enrichment.caseType,
      caseInfo.jurisdiction,
      enrichment.keyIssues || []
    );
    
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
    
    // Step 8: Send notification
    await emailService.sendCaseProcessedNotification(caseId, caseInfo);
    
    console.log(`Successfully processed case ${caseId}`);
    return { success: true, caseId, enrichment, prediction };
  } catch (error) {
    console.error('Case processing error:', error);
    
    // Log error to database
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
    
    throw error;
  }
});

// Handle document uploads
caseProcessingQueue.process('process-document', async (job) => {
  const { caseId, documentId } = job.data;
  
  try {
    const document = await supabaseService.client
      .from('case_evidence')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (document.data.file_type === 'application/pdf') {
      await pdfService.processCaseDocument(
        caseId,
        document.data.file_path,
        document.data.file_name
      );
      
      // Trigger re-analysis of the case
      await caseProcessingQueue.add('reanalyze-case', { caseId });
    }
    
    return { success: true, documentId };
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
  }
});

// Re-analyze case when new documents are added
caseProcessingQueue.process('reanalyze-case', async (job) => {
  const { caseId } = job.data;
  
  try {
    console.log(`Re-analyzing case ${caseId} due to new documents`);
    
    // Re-trigger the main case processing
    await caseProcessingQueue.add('process-new-case', {
      caseId,
      webhookType: 'UPDATE',
      table: 'case_briefs',
      source: 'reanalysis'
    });
    
    return { success: true, caseId };
  } catch (error) {
    console.error('Case re-analysis error:', error);
    throw error;
  }
});

module.exports = caseProcessingQueue;
