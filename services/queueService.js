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

      // Store in database for persistence (if available and schema supports it)
      if (this.supabase) {
        try {
          console.log('💾 Attempting to store job in database:', job.id);
          
          // Try a simple insert first to test table schema
          const simpleJob = {
            id: job.id,
            data: job.data,
            status: job.status
          };
          
          const { data, error } = await this.supabase
            .from('queue_jobs')
            .insert(simpleJob);
          
          if (error) {
            console.error('❌ Database insert error (trying simple schema):', error);
            
            // If simple insert fails, it means the table doesn't exist or has permission issues
            console.warn('⚠️ queue_jobs table schema incompatible, using in-memory queue only');
            throw error;
          } else {
            console.log('✅ Job stored in database successfully (simple schema):', job.id);
          }
        } catch (dbError) {
          console.error('❌ Failed to persist job to database:', {
            message: dbError.message,
            details: dbError.details || 'No additional details',
            hint: dbError.hint || 'No hint available',
            code: dbError.code || 'No error code'
          });
          console.log('📝 Note: The queue_jobs table may need to be created with proper schema');
          // Continue without database persistence - fallback to in-memory only
        }
      } else {
        console.warn('⚠️ Supabase not available - storing job in memory only');
      }

      // Store in memory for immediate processing (this is the primary queue now)
      if (!this.queues.has(queueName)) {
        this.queues.set(queueName, []);
      }
      this.queues.get(queueName).push(job);

      console.log(`✅ Added job ${job.id} to queue ${queueName} with priority ${job.priority} (in-memory)`);

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
      // Mark job as processing (in-memory only for now)
      job.status = 'processing';
      job.started_at = new Date().toISOString();
      job.attempts++;

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

      console.log(`✅ Job ${job.id} completed successfully`);
      return job;
    } catch (error) {
      // Mark job as failed
      job.status = job.attempts >= job.max_attempts ? 'failed' : 'pending';
      job.failed_at = new Date().toISOString();
      job.error = error.message;

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
      console.log(`🔄 Processing queue: ${queueName}`);
      
      // Focus on in-memory queue processing (database might have schema issues)
      const queue = this.queues.get(queueName) || [];
      const pendingJobs = queue
        .filter(job => job.status === 'pending' && new Date(job.scheduled_for) <= new Date())
        .sort((a, b) => {
          // Sort by priority (desc) then by created_at (asc)
          if (a.priority !== b.priority) return b.priority - a.priority;
          return new Date(a.created_at) - new Date(b.created_at);
        });

      console.log(`📋 Found ${pendingJobs.length} pending jobs in queue ${queueName}`);

      if (pendingJobs.length === 0) {
        this.isProcessing.set(queueName, false);
        return;
      }

      // Process jobs one by one to avoid overwhelming the system
      for (const job of pendingJobs) {
        try {
          console.log(`⚡ Processing job ${job.id}...`);
          await this.processJob(job, processor);
        } catch (error) {
          console.error(`❌ Job ${job.id} failed:`, error.message);
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
          console.log(`🔄 More jobs found in ${queueName}, continuing processing...`);
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