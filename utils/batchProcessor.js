// utils/batchProcessor.js
const queueService = require('../services/queue.service');

class BatchProcessor {
  constructor() {
    this.defaultBatchSize = 5;
    this.maxConcurrentBatches = 3;
  }

  /**
   * Process multiple jobs in a queue using batch processing
   * @param {string} queueName - Name of the queue to process
   * @param {Function} handler - Function to process each job
   * @param {Object} options - Processing options
   * @param {number} options.batchSize - Number of jobs to process per batch
   * @param {number} options.maxBatches - Maximum number of batches to process
   * @param {number} options.delayBetweenBatches - Delay between batches in ms
   * @returns {Promise<Object>} Processing results
   */
  async processQueueBatches(queueName, handler, options = {}) {
    const {
      batchSize = this.defaultBatchSize,
      maxBatches = this.maxConcurrentBatches,
      delayBetweenBatches = 1000
    } = options;

    console.log(`Starting batch processing for queue: ${queueName}`);
    console.log(`Batch size: ${batchSize}, Max batches: ${maxBatches}`);

    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let batchesProcessed = 0;

    // Override the processJob method with the provided handler
    queueService.processJob = async (job) => {
      return await handler(job.data);
    };

    while (batchesProcessed < maxBatches) {
      try {
        // Process one batch
        const result = await queueService.processBatch(queueName, batchSize);
        
        totalProcessed += result.processed;
        totalSucceeded += result.succeeded;
        totalFailed += result.failed;
        batchesProcessed++;

        console.log(`Batch ${batchesProcessed} completed:`, result);

        // If no jobs were processed, we're done
        if (result.processed === 0) {
          console.log('No more jobs to process');
          break;
        }

        // Add delay between batches if specified and not the last batch
        if (delayBetweenBatches > 0 && batchesProcessed < maxBatches) {
          console.log(`Waiting ${delayBetweenBatches}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

      } catch (error) {
        console.error(`Error processing batch ${batchesProcessed + 1}:`, error);
        totalFailed += batchSize; // Assume all jobs in the batch failed
        batchesProcessed++;
        
        // Continue with next batch even if this one failed
        if (delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
    }

    const finalResult = {
      totalProcessed,
      totalSucceeded,
      totalFailed,
      batchesProcessed,
      successRate: totalProcessed > 0 ? (totalSucceeded / totalProcessed) * 100 : 0
    };

    console.log(`Batch processing completed for queue ${queueName}:`, finalResult);
    return finalResult;
  }

  /**
   * Process multiple queues concurrently
   * @param {Array} queueConfigs - Array of queue configurations
   * @param {string} queueConfigs[].queueName - Name of the queue
   * @param {Function} queueConfigs[].handler - Handler function for the queue
   * @param {Object} queueConfigs[].options - Options for the queue
   * @returns {Promise<Array>} Results for each queue
   */
  async processMultipleQueues(queueConfigs) {
    console.log(`Processing ${queueConfigs.length} queues concurrently`);

    const results = await Promise.allSettled(
      queueConfigs.map(config => 
        this.processQueueBatches(
          config.queueName, 
          config.handler, 
          config.options
        )
      )
    );

    const processedResults = results.map((result, index) => ({
      queueName: queueConfigs[index].queueName,
      success: result.status === 'fulfilled',
      result: result.status === 'fulfilled' ? result.value : result.reason
    }));

    console.log('Multiple queue processing completed:', processedResults);
    return processedResults;
  }

  /**
   * Get processing statistics for multiple queues
   * @param {Array<string>} queueNames - Array of queue names
   * @returns {Promise<Object>} Statistics for each queue
   */
  async getMultipleQueueStats(queueNames) {
    const stats = {};
    
    for (const queueName of queueNames) {
      try {
        stats[queueName] = await queueService.getQueueStats(queueName);
      } catch (error) {
        console.error(`Error getting stats for queue ${queueName}:`, error);
        stats[queueName] = { error: error.message };
      }
    }

    return stats;
  }

  /**
   * Clean up failed jobs older than specified age
   * @param {string} queueName - Name of the queue
   * @param {number} maxAgeHours - Maximum age in hours for failed jobs
   * @returns {Promise<number>} Number of jobs cleaned up
   */
  async cleanupOldFailedJobs(queueName, maxAgeHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
      
      const { data: oldJobs, error } = await queueService.supabase
        .from('queue_jobs')
        .select('id')
        .eq('queue', queueName)
        .eq('status', 'failed')
        .lt('failed_at', cutoffTime.toISOString());

      if (error) {
        console.error('Error fetching old failed jobs:', error);
        return 0;
      }

      if (oldJobs.length === 0) {
        console.log(`No old failed jobs found for queue ${queueName}`);
        return 0;
      }

      const jobIds = oldJobs.map(job => job.id);
      
      const { error: deleteError } = await queueService.supabase
        .from('queue_jobs')
        .delete()
        .in('id', jobIds);

      if (deleteError) {
        console.error('Error deleting old failed jobs:', deleteError);
        return 0;
      }

      console.log(`Cleaned up ${oldJobs.length} old failed jobs from queue ${queueName}`);
      return oldJobs.length;

    } catch (error) {
      console.error(`Error cleaning up old failed jobs for queue ${queueName}:`, error);
      return 0;
    }
  }
}

module.exports = new BatchProcessor(); 