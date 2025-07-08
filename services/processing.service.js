// services/processing.service.js - Case processing service

const { createClient } = require('@supabase/supabase-js');

class ProcessingService {
  constructor() {
    this.supabase = null;
    this.initializeSupabase();
  }

  initializeSupabase() {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
    }
  }

  async processDocument(data) {
    try {
      const { caseId, documentId, filePath } = data;
      
      console.log(`Processing document ${documentId} for case ${caseId}`);
      
      // Update document status to processing
      await this.supabase
        .from('case_documents')
        .update({ 
          processing_status: 'processing',
          processed_at: new Date().toISOString()
        })
        .eq('id', documentId);

      // Simulate document processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update document status to completed
      await this.supabase
        .from('case_documents')
        .update({ 
          processing_status: 'completed',
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq('id', documentId);

      console.log(`Document ${documentId} processed successfully`);
      
      return { success: true, documentId };
    } catch (error) {
      console.error('Document processing error:', error);
      
      // Update document status to failed
      if (this.supabase) {
        await this.supabase
          .from('case_documents')
          .update({ 
            processing_status: 'failed',
            error_message: error.message
          })
          .eq('id', data.documentId);
      }
      
      throw error;
    }
  }

  async triggerAnalysisForExistingCase(caseId, userId) {
    try {
      console.log(`Triggering analysis for case ${caseId}`);
      
      // Update case status
      await this.supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'processing',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Simulate analysis processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Update case status to completed
      await this.supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'completed',
          ai_processed: true,
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      console.log(`Analysis triggered successfully for case ${caseId}`);
      
      return { 
        success: true, 
        caseId,
        message: 'Analysis triggered successfully'
      };
    } catch (error) {
      console.error('Analysis trigger error:', error);
      
      // Update case status to failed
      if (this.supabase) {
        await this.supabase
          .from('case_briefs')
          .update({ 
            processing_status: 'failed',
            error_message: error.message
          })
          .eq('id', caseId);
      }
      
      throw error;
    }
  }
}

module.exports = new ProcessingService(); 