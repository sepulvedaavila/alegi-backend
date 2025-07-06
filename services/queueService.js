const { createClient } = require('@supabase/supabase-js');
const Sentry = require('@sentry/node');

class QueueService {
  constructor() {
    this.queues = new Map();
    this.processing = new Map();
    
    // Initialize Supabase for job persistence
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
    } else {
      this.supabase = null;
      console.warn('Supabase not configured - queue jobs will not persist');
    }
  }
  
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  async addJob(queueName, data, options = {}) {
    const jobId = this.generateJobId();
    const job = {
      id: jobId,
      queue: queueName,
      data: data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: new Date(),
      scheduledFor: options.delay ? 
        new Date(Date.now() + options.delay) : new Date()
    };
    
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    
    this.queues.get(queueName).push(job);
    
    // Store in database for persistence if Supabase is available
    if (this.supabase) {
      try {
        await this.supabase
          .from('job_queue')
          .insert(job);
      } catch (error) {
        console.error('Failed to persist job to database:', error);
        Sentry.captureException(error, { extra: { job } });
      }
    }
    
    return jobId;
  }
  
  async processQueue(queueName, handler) {
    const queue = this.queues.get(queueName) || [];
    const now = new Date();
    
    const readyJobs = queue.filter(
      job => job.status === 'pending' && job.scheduledFor <= now
    );
    
    for (const job of readyJobs) {
      try {
        job.status = 'processing';
        this.processing.set(job.id, job);
        
        await handler(job.data);
        
        job.status = 'completed';
        await this.updateJobStatus(job);
        
      } catch (error) {
        job.attempts++;
        
        if (job.attempts >= job.maxAttempts) {
          job.status = 'failed';
          job.error = error.message;
        } else {
          job.status = 'pending';
          job.scheduledFor = new Date(Date.now() + 
            Math.pow(2, job.attempts) * 60000); // Exponential backoff
        }
        
        await this.updateJobStatus(job);
        Sentry.captureException(error, { extra: { job } });
      } finally {
        this.processing.delete(job.id);
      }
    }
  }
  
  async updateJobStatus(job) {
    if (this.supabase) {
      try {
        await this.supabase
          .from('job_queue')
          .update({
            status: job.status,
            attempts: job.attempts,
            error: job.error,
            completedAt: job.status === 'completed' ? new Date() : null
          })
          .eq('id', job.id);
      } catch (error) {
        console.error('Failed to update job status:', error);
        Sentry.captureException(error, { extra: { job } });
      }
    }
  }
  
  async getJobStatus(jobId) {
    // Check in-memory first
    const processingJob = this.processing.get(jobId);
    if (processingJob) {
      return processingJob;
    }
    
    // Check in database
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('job_queue')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Failed to get job status:', error);
        return null;
      }
    }
    
    return null;
  }
  
  getQueueStats(queueName) {
    const queue = this.queues.get(queueName) || [];
    const processing = Array.from(this.processing.values())
      .filter(job => job.queue === queueName);
    
    return {
      pending: queue.filter(job => job.status === 'pending').length,
      processing: processing.length,
      completed: queue.filter(job => job.status === 'completed').length,
      failed: queue.filter(job => job.status === 'failed').length
    };
  }
}

module.exports = new QueueService(); 