// services/processing.service.js - Case processing service (Proxy to Enhanced Pipeline)

const EnhancedLinearPipelineService = require('./enhanced-linear-pipeline.service');
const { createClient } = require('@supabase/supabase-js');

class ProcessingService {
  constructor() {
    this.enhancedPipeline = new EnhancedLinearPipelineService();
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
    console.log('[ProcessingService] Initialized as Enhanced Pipeline proxy');
  }

  async processDocument(data) {
    // This method is called from API but document processing is handled by the pipeline
    // Just return success since the enhanced pipeline handles document processing
    console.log(`Document processing delegated to enhanced pipeline for case ${data.caseId}`);
    return { success: true, documentId: data.documentId };
  }

  async triggerAnalysisForExistingCase(caseId, userId) {
    try {
      console.log(`Triggering enhanced pipeline for case ${caseId}`);
      
      if (!this.supabase) {
        throw new Error('Database service not available - Supabase client not initialized');
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

      // Execute enhanced pipeline asynchronously
      setImmediate(async () => {
        try {
          console.log(`Starting enhanced pipeline for case ${caseId}`);
          await this.enhancedPipeline.executeEnhancedPipeline(caseId);
          console.log(`Enhanced pipeline completed for case ${caseId}`);
        } catch (error) {
          console.error(`Enhanced pipeline failed for case ${caseId}:`, error);
          
          // Update case status to failed
          await this.supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              processing_error: error.message
            })
            .eq('id', caseId);
        }
      });
      
      return { 
        success: true, 
        caseId,
        message: 'Enhanced pipeline processing initiated',
        status: 'processing'
      };
    } catch (error) {
      console.error('Processing service error:', error);
      throw error;
    }
  }
}

module.exports = new ProcessingService();