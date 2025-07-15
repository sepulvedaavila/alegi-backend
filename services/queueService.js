// services/queueService.js - Enhanced job queue service with persistence
const { createClient } = require('@supabase/supabase-js');

class QueueService {
  constructor() {
    this.queues = new Map();
    this.processors = new Map();
    this.isProcessing = new Map();
    
    // Initialize Supabase for queue persistence
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
  }

  async add(queueName, jobData, options = {}) {
    try {
      const job = {
        id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        queue_name: queueName,
        data: jobData,
        status: 'pending',
        priority: options.priority || 0,
        max_attempts: options.maxAttempts || 3,
        attempts: 0,
        created_at: new Date().toISOString(),
        scheduled_for: options.delay ? new Date(Date.now() + options.delay).toISOString() : new Date().toISOString()
      };

      // Store in database for persistence (if available)
      if (this.supabase) {
        try {
          await this.supabase
            .from('queue_jobs')
            .insert(job);
        } catch (dbError) {
          console.warn('Failed to persist job to database:', dbError.message);
        }
      }

      // Also store in memory for immediate processing
      if (!this.queues.has(queueName)) {
        this.queues.set(queueName, []);
      }
      this.queues.get(queueName).push(job);

      console.log(`✅ Added job ${job.id} to queue ${queueName} with priority ${job.priority}`);

      // Auto-trigger processing if not already running
      if (!this.isProcessing.get(queueName)) {
        setImmediate(() => this.processQueue(queueName));
      }

      return job;
    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw error;
    }
  }

  // Register a processor for a queue
  setProcessor(queueName, processor) {
    this.processors.set(queueName, processor);
    console.log(`📋 Processor registered for queue: ${queueName}`);
  }

  // Process a single job
  async processJob(job, processor) {
    try {
      // Mark job as processing
      job.status = 'processing';
      job.started_at = new Date().toISOString();
      job.attempts++;

      // Update in database
      if (this.supabase) {
        await this.supabase
          .from('queue_jobs')
          .update({
            status: job.status,
            started_at: job.started_at,
            attempts: job.attempts
          })
          .eq('id', job.id);
      }

      console.log(`🔄 Processing job ${job.id} from queue ${job.queue_name} (attempt ${job.attempts}/${job.max_attempts})`);

      // Process the job with timeout
      const result = await Promise.race([
        processor(job.data),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Job timeout after 5 minutes')), 5 * 60 * 1000)
        )
      ]);
      
      // Mark job as completed
      job.status = 'completed';
      job.completed_at = new Date().toISOString();
      job.result = result;

      // Update in database
      if (this.supabase) {
        await this.supabase
          .from('queue_jobs')
          .update({
            status: job.status,
            completed_at: job.completed_at,
            result: result
          })
          .eq('id', job.id);
      }

      console.log(`✅ Job ${job.id} completed successfully`);
      return job;
    } catch (error) {
      // Mark job as failed
      job.status = job.attempts >= job.max_attempts ? 'failed' : 'pending';
      job.failed_at = new Date().toISOString();
      job.error = error.message;

      // Update in database
      if (this.supabase) {
        await this.supabase
          .from('queue_jobs')
          .update({
            status: job.status,
            failed_at: job.failed_at,
            error: job.error,
            attempts: job.attempts
          })
          .eq('id', job.id);
      }

      if (job.status === 'failed') {
        console.error(`❌ Job ${job.id} failed permanently after ${job.attempts} attempts:`, error);
      } else {
        console.warn(`⚠️ Job ${job.id} failed, will retry (attempt ${job.attempts}/${job.max_attempts}):`, error.message);
      }
      
      throw error;
    }
  }

  // Process all jobs in a queue
  async processQueue(queueName) {
    if (this.isProcessing.get(queueName)) {
      return; // Already processing this queue
    }

    this.isProcessing.set(queueName, true);
    const processor = this.processors.get(queueName);

    if (!processor) {
      console.warn(`No processor registered for queue: ${queueName}`);
      this.isProcessing.set(queueName, false);
      return;
    }

    try {
      // Load pending jobs from database if available
      if (this.supabase) {
        const { data: dbJobs } = await this.supabase
          .from('queue_jobs')
          .select('*')
          .eq('queue_name', queueName)
          .in('status', ['pending'])
          .lte('scheduled_for', new Date().toISOString())
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(10);

        if (dbJobs && dbJobs.length > 0) {
          // Merge with in-memory queue
          if (!this.queues.has(queueName)) {
            this.queues.set(queueName, []);
          }
          
          const memoryQueue = this.queues.get(queueName);
          dbJobs.forEach(dbJob => {
            if (!memoryQueue.find(j => j.id === dbJob.id)) {
              memoryQueue.push(dbJob);
            }
          });
        }
      }

      const queue = this.queues.get(queueName) || [];
      const pendingJobs = queue
        .filter(job => job.status === 'pending' && new Date(job.scheduled_for) <= new Date())
        .sort((a, b) => {
          // Sort by priority (desc) then by created_at (asc)
          if (a.priority !== b.priority) return b.priority - a.priority;
          return new Date(a.created_at) - new Date(b.created_at);
        });

      if (pendingJobs.length === 0) {
        this.isProcessing.set(queueName, false);
        return;
      }

      // Process jobs one by one to avoid overwhelming the system
      for (const job of pendingJobs) {
        try {
          await this.processJob(job, processor);
        } catch (error) {
          // Continue processing other jobs even if one fails
          continue;
        }
      }
    } catch (error) {
      console.error(`Error processing queue ${queueName}:`, error);
    } finally {
      this.isProcessing.set(queueName, false);
      
      // Check if there are more jobs to process
      setTimeout(() => {
        if (this.hasMoreJobs(queueName)) {
          this.processQueue(queueName);
        }
      }, 1000);
    }
  }

  hasMoreJobs(queueName) {
    const queue = this.queues.get(queueName) || [];
    return queue.some(job => job.status === 'pending' && new Date(job.scheduled_for) <= new Date());
  }

  async getQueueStatus(queueName) {
    const status = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };

    // Get from database if available
    if (this.supabase) {
      try {
        const { data: jobs } = await this.supabase
          .from('queue_jobs')
          .select('status')
          .eq('queue_name', queueName);

        if (jobs) {
          jobs.forEach(job => {
            status[job.status] = (status[job.status] || 0) + 1;
            status.total++;
          });
        }
      } catch (error) {
        console.warn('Failed to get queue status from database:', error.message);
      }
    }

    // Also check in-memory queue
    if (this.queues.has(queueName)) {
      const queue = this.queues.get(queueName);
      queue.forEach(job => {
        status[job.status] = (status[job.status] || 0) + 1;
        status.total++;
      });
    }

    return {
      ...status,
      isProcessing: this.isProcessing.get(queueName) || false,
      hasProcessor: this.processors.has(queueName)
    };
  }

  async clearQueue(queueName, includeDatabase = false) {
    // Clear in-memory queue
    this.queues.delete(queueName);
    this.processors.delete(queueName);
    this.isProcessing.delete(queueName);

    // Optionally clear database
    if (includeDatabase && this.supabase) {
      try {
        await this.supabase
          .from('queue_jobs')
          .delete()
          .eq('queue_name', queueName);
        
        console.log(`🗑️ Cleared queue ${queueName} from database`);
      } catch (error) {
        console.error(`Failed to clear queue ${queueName} from database:`, error);
      }
    }

    console.log(`🗑️ Cleared queue ${queueName} from memory`);
  }

  async getJob(jobId) {
    // Check database first
    if (this.supabase) {
      try {
        const { data: job } = await this.supabase
          .from('queue_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (job) return job;
      } catch (error) {
        // Job not found in database, check memory
      }
    }

    // Check in-memory queues
    for (const [, queue] of this.queues) {
      const job = queue.find(j => j.id === jobId);
      if (job) return job;
    }

    return null;
  }

  async getAllQueues() {
    const queues = new Set();
    
    // Get queue names from memory
    for (const queueName of this.queues.keys()) {
      queues.add(queueName);
    }

    // Get queue names from database
    if (this.supabase) {
      try {
        const { data: jobs } = await this.supabase
          .from('queue_jobs')
          .select('queue_name')
          .neq('status', 'completed'); // Exclude completed jobs

        if (jobs) {
          jobs.forEach(job => queues.add(job.queue_name));
        }
      } catch (error) {
        console.warn('Failed to get queues from database:', error.message);
      }
    }

    return Array.from(queues);
  }
}

module.exports = new QueueService(); 