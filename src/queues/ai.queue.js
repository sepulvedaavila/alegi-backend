import Queue from 'bull';
import { logger } from '../utils/logger.js';
import { enrichCaseWithAI } from '../services/ai-enrichment/index.js';

// Create AI processing queue
const aiQueue = new Queue('ai-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Process AI jobs
aiQueue.process(async (job) => {
  try {
    logger.info('Processing AI job', { 
      jobId: job.id, 
      caseId: job.data.caseId,
      action: job.data.action 
    });

    let result;
    
    switch (job.data.action) {
      case 'enrich-case':
        result = await enrichCaseWithAI(job.data.caseId);
        break;
      case 'generate-predictions':
        // Handle prediction generation
        result = { message: 'Predictions generated' };
        break;
      default:
        throw new Error(`Unknown AI action: ${job.data.action}`);
    }
    
    logger.info('AI processing completed', { 
      jobId: job.id, 
      caseId: job.data.caseId 
    });

    return result;
  } catch (error) {
    logger.error('AI processing failed', { 
      jobId: job.id, 
      caseId: job.data.caseId,
      error: error.message 
    });
    throw error;
  }
});

// Handle job completion
aiQueue.on('completed', (job, result) => {
  logger.info('AI job completed', { 
    jobId: job.id, 
    caseId: job.data.caseId 
  });
});

// Handle job failure
aiQueue.on('failed', (job, err) => {
  logger.error('AI job failed', { 
    jobId: job.id, 
    caseId: job.data.caseId,
    error: err.message 
  });
});

// Add job to AI queue
export async function addToAIQueue(action, data, options = {}) {
  try {
    const job = await aiQueue.add(action, data, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      ...options
    });

    logger.info('Added job to AI queue', { 
      jobId: job.id, 
      action, 
      data 
    });

    return job;
  } catch (error) {
    logger.error('Error adding job to AI queue', { error: error.message });
    throw error;
  }
}

// Get AI queue status
export async function getAIQueueStatus() {
  try {
    const waiting = await aiQueue.getWaiting();
    const active = await aiQueue.getActive();
    const completed = await aiQueue.getCompleted();
    const failed = await aiQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  } catch (error) {
    logger.error('Error getting AI queue status', { error: error.message });
    throw error;
  }
}

export default aiQueue; 