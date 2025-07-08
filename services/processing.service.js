// services/processing.service.js - Case processing service

const { createClient } = require('@supabase/supabase-js');

class ProcessingService {
  constructor() {
    this.supabase = null;
    this.initializeSupabase();
    console.log('[ProcessingService] Instance created');
    console.log('[ProcessingService] Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
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
      
      // Check if Supabase is available
      if (!this.supabase) {
        throw new Error('Database service not available');
      }
      
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
        try {
          await this.supabase
            .from('case_documents')
            .update({ 
              processing_status: 'failed',
              error_message: error.message
            })
            .eq('id', data.documentId);
        } catch (updateError) {
          console.error('Failed to update document status:', updateError);
        }
      }
      
      throw error;
    }
  }

  async triggerAnalysisForExistingCase(caseId, userId) {
    try {
      console.log(`Triggering analysis for case ${caseId}`);
      
      // Check if Supabase is available
      if (!this.supabase) {
        throw new Error('Database service not available');
      }
      
      // Check if case is already being processed
      const { data: caseData } = await this.supabase
        .from('case_briefs')
        .select('processing_status')
        .eq('id', caseId)
        .single();
      
      if (caseData?.processing_status === 'processing') {
        return { 
          success: true, 
          caseId,
          message: 'Case is already being processed',
          status: 'processing'
        };
      }
      
      // Update case status to processing
      await this.supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'processing',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Import and execute linear pipeline asynchronously
      const LinearPipelineService = require('./linear-pipeline.service');
      const linearPipeline = new LinearPipelineService();
      
      setImmediate(async () => {
        try {
          console.log(`Starting linear pipeline for case ${caseId}`);
          await linearPipeline.executeLinearPipeline(caseId);
          console.log(`Linear pipeline completed for case ${caseId}`);
        } catch (error) {
          console.error(`Linear pipeline failed for case ${caseId}:`, error);
          await this.supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              error_message: error.message
            })
            .eq('id', caseId);
        }
      });

      console.log(`Analysis triggered successfully for case ${caseId}`);
      
      return { 
        success: true, 
        caseId,
        message: 'Analysis triggered successfully',
        status: 'processing',
        estimatedTime: '2-5 minutes'
      };
    } catch (error) {
      console.error('Analysis trigger error:', error);
      
      // Update case status to failed
      if (this.supabase) {
        try {
          await this.supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              error_message: error.message
            })
            .eq('id', caseId);
        } catch (updateError) {
          console.error('Failed to update case status:', updateError);
        }
      }
      
      throw error;
    }
  }
}

module.exports = new ProcessingService(); 