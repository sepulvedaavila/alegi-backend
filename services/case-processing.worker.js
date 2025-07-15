// services/case-processing.worker.js - Case processing worker using queue system
const queueService = require('./queueService');
const EnhancedLinearPipelineService = require('./enhanced-linear-pipeline.service');
const { createClient } = require('@supabase/supabase-js');
const Sentry = require('@sentry/node');

class CaseProcessingWorker {
  constructor() {
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
    
    this.enhancedPipeline = new EnhancedLinearPipelineService();
    
    // Register the case processing queue processor
    this.setupProcessor();
  }

  setupProcessor() {
    queueService.setProcessor('case-processing', this.processCase.bind(this));
    console.log('🏭 Case processing worker initialized');
  }

  async processCase(jobData) {
    const { caseId, userId, source, trigger } = jobData;
    
    console.log(`🚀 Starting case processing for case ${caseId} from ${source}`);
    
    try {
      // Update case status to processing
      if (this.supabase) {
        await this.supabase
          .from('case_briefs')
          .update({ 
            processing_status: 'processing',
            last_ai_update: new Date().toISOString()
          })
          .eq('id', caseId);
      }

      // Execute the enhanced pipeline
      const features = await this.enhancedPipeline.executeEnhancedPipeline(caseId);
      
      console.log(`✅ Case processing completed for case ${caseId} with ${Object.keys(features).length} features`);
      
      return {
        success: true,
        caseId,
        features: Object.keys(features),
        completedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Case processing failed for case ${caseId}:`, error);
      
      // Update case status to failed
      if (this.supabase) {
        try {
          await this.supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              processing_error: error.message
            })
            .eq('id', caseId);
        } catch (updateError) {
          console.error(`Failed to update case status for ${caseId}:`, updateError);
        }
      }
      
      // Report to Sentry
      Sentry.captureException(error, {
        tags: { 
          caseId, 
          source, 
          trigger: trigger || 'unknown',
          service: 'case-processing-worker'
        },
        extra: { jobData }
      });
      
      throw error;
    }
  }

  // Add a case to the processing queue
  async addCaseToQueue(caseId, userId, options = {}) {
    const jobData = {
      caseId,
      userId,
      source: options.source || 'api',
      trigger: options.trigger || 'manual',
      timestamp: new Date().toISOString()
    };

    const job = await queueService.add('case-processing', jobData, {
      priority: options.priority || 1,
      maxAttempts: options.maxAttempts || 3,
      delay: options.delay || 0
    });

    console.log(`📋 Added case ${caseId} to processing queue (job: ${job.id})`);
    return job;
  }

  // Get the status of a case processing job
  async getCaseProcessingStatus(caseId) {
    if (!this.supabase) {
      return { status: 'unknown', message: 'Database not available' };
    }

    try {
      // Check database for queue jobs
      const { data: jobs } = await this.supabase
        .from('queue_jobs')
        .select('*')
        .eq('queue_name', 'case-processing')
        .contains('data', { caseId })
        .order('created_at', { ascending: false })
        .limit(1);

      if (jobs && jobs.length > 0) {
        const job = jobs[0];
        return {
          status: job.status,
          jobId: job.id,
          attempts: job.attempts,
          maxAttempts: job.max_attempts,
          createdAt: job.created_at,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          failedAt: job.failed_at,
          error: job.error
        };
      }

      // Check case status directly
      const { data: caseData } = await this.supabase
        .from('case_briefs')
        .select('processing_status, last_ai_update, processing_error')
        .eq('id', caseId)
        .single();

      if (caseData) {
        return {
          status: caseData.processing_status || 'unknown',
          lastUpdate: caseData.last_ai_update,
          error: caseData.processing_error
        };
      }

      return { status: 'not_found', message: 'Case not found' };
    } catch (error) {
      console.error('Error getting case processing status:', error);
      return { status: 'error', error: error.message };
    }
  }

  // Get queue statistics
  async getQueueStats() {
    return await queueService.getQueueStatus('case-processing');
  }
}

module.exports = new CaseProcessingWorker();