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
  const { caseId } = job.data;
  
  try {
    // Step 1: Get case data
    const caseData = await supabaseService.getCaseById(caseId);
    
    // Step 2: Process documents
    const documents = await supabaseService.getCaseEvidence(caseId);
    let allDocumentText = '';
    
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
    
    // Step 3: AI Enrichment
    const enrichment = await aiService.enrichCaseData(caseData, allDocumentText);
    await supabaseService.updateCaseAIEnrichment(caseId, enrichment);
    
    // Step 4: Search for precedents
    const precedents = await externalAPIService.searchPrecedents(
      enrichment.caseType,
      caseData.jurisdiction,
      enrichment.keyIssues
    );
    
    // Step 5: Generate predictions
    const prediction = await aiService.generateCasePrediction(
      caseData,
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
        created_at: new Date().toISOString()
      });
    
    // Step 7: Send notification
    await emailService.sendCaseProcessedNotification(caseId, caseData);
    
    return { success: true, caseId };
  } catch (error) {
    console.error('Case processing error:', error);
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

module.exports = caseProcessingQueue;
