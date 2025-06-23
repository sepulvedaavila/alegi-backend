import Queue from 'bull';
import { logger } from '../utils/logger.js';
import { processDocumentById } from '../services/document-processor/index.js';

// Create document processing queue
const documentQueue = new Queue('document-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Process document jobs
documentQueue.process(async (job) => {
  try {
    logger.info('Processing document job', { 
      jobId: job.id, 
      documentId: job.data.documentId 
    });

    const result = await processDocumentById(job.data.documentId);
    
    logger.info('Document processing completed', { 
      jobId: job.id, 
      documentId: job.data.documentId 
    });

    return result;
  } catch (error) {
    logger.error('Document processing failed', { 
      jobId: job.id, 
      documentId: job.data.documentId,
      error: error.message 
    });
    throw error;
  }
});

// Handle job completion
documentQueue.on('completed', (job, result) => {
  logger.info('Document job completed', { 
    jobId: job.id, 
    documentId: job.data.documentId 
  });
});

// Handle job failure
documentQueue.on('failed', (job, err) => {
  logger.error('Document job failed', { 
    jobId: job.id, 
    documentId: job.data.documentId,
    error: err.message 
  });
});

// Add job to queue
export async function addToQueue(queueName, data, options = {}) {
  try {
    const job = await documentQueue.add(queueName, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      ...options
    });

    logger.info('Added job to document queue', { 
      jobId: job.id, 
      queueName, 
      data 
    });

    return job;
  } catch (error) {
    logger.error('Error adding job to document queue', { error: error.message });
    throw error;
  }
}

// Get queue status
export async function getQueueStatus() {
  try {
    const waiting = await documentQueue.getWaiting();
    const active = await documentQueue.getActive();
    const completed = await documentQueue.getCompleted();
    const failed = await documentQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  } catch (error) {
    logger.error('Error getting queue status', { error: error.message });
    throw error;
  }
}

export default documentQueue; 