const { createClient } = require('@supabase/supabase-js');

class ServerlessQueueService {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      this.initialized = true;
    }
  }

  async add(queueName, data) {
    await this.initialize();
    
    if (!this.supabase) {
      console.error('Queue service not initialized - Supabase not configured');
      return null;
    }

    try {
      // Store job in database
      const { data: job, error } = await this.supabase
        .from('queue_jobs')
        .insert({
          queue: queueName,
          data: data,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to add job to queue:', error);
        return null;
      }

      console.log(`Job ${job.id} added to ${queueName} queue`);

      // For serverless, trigger processing via internal API call
      if (process.env.NODE_ENV === 'production') {
        this.triggerProcessing(queueName, job.id);
      }

      return job;
    } catch (error) {
      console.error('Queue add error:', error);
      return null;
    }
  }

  // Enhanced retry logic with exponential backoff
  async triggerProcessing(queueName, jobId, attempt = 1) {
    const maxAttempts = 3;
    const backoffMs = Math.pow(2, attempt) * 1000;
    
    const endpoint = `${process.env.BACKEND_URL || 'https://alegi-backend.vercel.app'}/api/workers/${queueName}`;
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-service': 'alegi-backend',
        'x-service-secret': process.env.INTERNAL_SERVICE_SECRET
      },
      body: JSON.stringify({ jobId })
    };

    try {
      const response = await fetch(endpoint, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      console.log(`Successfully triggered processing for job ${jobId} on attempt ${attempt}`);
    } catch (error) {
      console.error(`Failed to trigger processing for job ${jobId} on attempt ${attempt}:`, error.message);
      
      if (attempt < maxAttempts) {
        console.log(`Retrying job ${jobId} in ${backoffMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
        setTimeout(() => this.triggerProcessing(queueName, jobId, attempt + 1), backoffMs);
      } else {
        console.error(`Max attempts reached for job ${jobId}, marking as failed`);
        await this.markJobFailed(jobId, `Failed to trigger processing after ${maxAttempts} attempts: ${error.message}`);
      }
    }
  }

  // Mark job as failed in database
  async markJobFailed(jobId, errorMessage) {
    try {
      await this.supabase
        .from('queue_jobs')
        .update({ 
          status: 'failed', 
          error: errorMessage,
          failed_at: new Date().toISOString() 
        })
        .eq('id', jobId);
      
      console.log(`Job ${jobId} marked as failed: ${errorMessage}`);
    } catch (error) {
      console.error(`Failed to mark job ${jobId} as failed:`, error);
    }
  }

  // Get pending jobs for batch processing
  async getPendingJobs(queueName, limit = 5) {
    try {
      const { data: jobs, error } = await this.supabase
        .from('queue_jobs')
        .select('*')
        .eq('queue', queueName)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Failed to get pending jobs:', error);
        return [];
      }

      return jobs || [];
    } catch (error) {
      console.error('Error getting pending jobs:', error);
      return [];
    }
  }

  // Batch processing multiple jobs per invocation
  async processBatch(queueName, batchSize = 5) {
    await this.initialize();
    
    if (!this.supabase) {
      throw new Error('Queue service not initialized');
    }

    const jobs = await this.getPendingJobs(queueName, batchSize);
    
    if (jobs.length === 0) {
      console.log(`No pending jobs found for queue ${queueName}`);
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`Processing batch of ${jobs.length} jobs for queue ${queueName}`);

    // Mark all jobs as processing
    const jobIds = jobs.map(job => job.id);
    await this.supabase
      .from('queue_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .in('id', jobIds);

    // Process jobs in parallel with Promise.allSettled
    const results = await Promise.allSettled(
      jobs.map(job => this.processJob(job))
    );

    // Handle results and update job statuses
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const job = jobs[i];

      if (result.status === 'fulfilled') {
        // Job completed successfully
        await this.supabase
          .from('queue_jobs')
          .update({ 
            status: 'completed', 
            completed_at: new Date().toISOString() 
          })
          .eq('id', job.id);
        succeeded++;
      } else {
        // Job failed
        await this.supabase
          .from('queue_jobs')
          .update({ 
            status: 'failed', 
            error: result.reason?.message || 'Unknown error',
            failed_at: new Date().toISOString() 
          })
          .eq('id', job.id);
        failed++;
      }
    }

    console.log(`Batch processing completed for queue ${queueName}: ${succeeded} succeeded, ${failed} failed`);
    return { processed: jobs.length, succeeded, failed };
  }

  // Process individual job (extracted from process method for batch processing)
  async processJob(job) {
    // This method should be overridden by the caller with the actual job handler
    throw new Error('processJob must be implemented by the caller');
  }

  async process(queueName, handler) {
    // In serverless, this is called directly by the worker endpoint
    await this.initialize();
    
    if (!this.supabase) {
      throw new Error('Queue service not initialized');
    }

    // Get next pending job
    const { data: job, error } = await this.supabase
      .from('queue_jobs')
      .select('*')
      .eq('queue', queueName)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !job) {
      return null; // No jobs to process
    }

    // Update status to processing
    await this.supabase
      .from('queue_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id);

    try {
      // Process the job
      await handler(job.data);
      
      // Mark as completed
      await this.supabase
        .from('queue_jobs')
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        })
        .eq('id', job.id);
        
    } catch (error) {
      // Mark as failed
      await this.supabase
        .from('queue_jobs')
        .update({ 
          status: 'failed', 
          error: error.message,
          failed_at: new Date().toISOString() 
        })
        .eq('id', job.id);
        
      throw error;
    }

    return job;
  }

  // Get queue statistics
  async getQueueStats(queueName) {
    try {
      const { data: stats, error } = await this.supabase
        .from('queue_jobs')
        .select('status')
        .eq('queue', queueName);

      if (error) {
        console.error('Failed to get queue stats:', error);
        return { pending: 0, processing: 0, completed: 0, failed: 0 };
      }

      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      };

      stats.forEach(job => {
        counts[job.status] = (counts[job.status] || 0) + 1;
      });

      return counts;
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return { pending: 0, processing: 0, completed: 0, failed: 0 };
    }
  }
}

module.exports = new ServerlessQueueService();