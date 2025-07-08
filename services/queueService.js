// services/queueService.js - Job queue service

class QueueService {
  constructor() {
    this.queues = new Map();
    this.processors = new Map();
  }

  async add(queueName, jobData) {
    try {
      if (!this.queues.has(queueName)) {
        this.queues.set(queueName, []);
      }

      const job = {
        id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data: jobData,
        status: 'pending',
        createdAt: new Date().toISOString(),
        attempts: 0
      };

      this.queues.get(queueName).push(job);
      console.log(`Added job ${job.id} to queue ${queueName}`);

      return job;
    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw error;
    }
  }

  async process(queueName, processor) {
    try {
      this.processors.set(queueName, processor);
      
      if (!this.queues.has(queueName)) {
        return null;
      }

      const queue = this.queues.get(queueName);
      const pendingJob = queue.find(job => job.status === 'pending');

      if (!pendingJob) {
        return null;
      }

      // Mark job as processing
      pendingJob.status = 'processing';
      pendingJob.startedAt = new Date().toISOString();

      console.log(`Processing job ${pendingJob.id} from queue ${queueName}`);

      try {
        // Process the job
        const result = await processor(pendingJob.data);
        
        // Mark job as completed
        pendingJob.status = 'completed';
        pendingJob.completedAt = new Date().toISOString();
        pendingJob.result = result;

        console.log(`Job ${pendingJob.id} completed successfully`);
        
        return pendingJob;
      } catch (error) {
        // Mark job as failed
        pendingJob.status = 'failed';
        pendingJob.failedAt = new Date().toISOString();
        pendingJob.error = error.message;
        pendingJob.attempts++;

        console.error(`Job ${pendingJob.id} failed:`, error);
        
        throw error;
      }
    } catch (error) {
      console.error('Error processing queue:', error);
      throw error;
    }
  }

  getQueueStatus(queueName) {
    if (!this.queues.has(queueName)) {
      return { pending: 0, processing: 0, completed: 0, failed: 0 };
    }

    const queue = this.queues.get(queueName);
    const status = { pending: 0, processing: 0, completed: 0, failed: 0 };

    queue.forEach(job => {
      status[job.status]++;
    });

    return status;
  }

  clearQueue(queueName) {
    this.queues.delete(queueName);
    this.processors.delete(queueName);
  }
}

module.exports = new QueueService(); 