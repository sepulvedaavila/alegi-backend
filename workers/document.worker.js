const pdfcoService = require('../services/pdfco.service');
const supabaseService = require('../services/supabase.service');
const queueService = require('../services/queue.service');

// Process document jobs - called by the serverless queue service
async function process(jobData) {
  const { documentId, caseId, filePath } = jobData;
  
  try {
    console.log(`Processing document ${documentId} for case ${caseId}`);
    
    // Get public URL for the document
    const { data: urlData } = supabaseService.client
      .storage
      .from('case-files')
      .getPublicUrl(filePath);
      
    // Extract text using PDF.co
    const extractedText = await pdfcoService.extractText(urlData.publicUrl);
    
    // Update document with extracted text
    await supabaseService.client
      .from('case_documents')
      .update({
        ai_extracted_text: extractedText,
        processing_status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('id', documentId);
      
    // Trigger case reprocessing with new document
    await queueService.add('case', {
      caseId,
      webhookType: 'document_added',
      documentId
    });
    
    return { success: true, documentId };
  } catch (error) {
    console.error(`Document processing failed:`, error);
    throw error;
  }
}

module.exports = { process };