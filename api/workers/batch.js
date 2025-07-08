const queueService = require('../../../services/queue.service');

module.exports = async (req, res) => {
  // Verify internal service authentication
  if (req.headers['x-internal-service'] !== 'alegi-backend' || 
      req.headers['x-service-secret'] !== process.env.INTERNAL_SERVICE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { queueName, batchSize = 5, handler } = req.body;
    
    if (!queueName) {
      return res.status(400).json({ error: 'Queue name is required' });
    }

    if (!handler) {
      return res.status(400).json({ error: 'Handler function is required' });
    }

    // Override the processJob method with the provided handler
    queueService.processJob = async (job) => {
      return await handler(job.data);
    };

    // Process the batch
    const result = await queueService.processBatch(queueName, batchSize);

    res.json({ 
      success: true, 
      message: 'Batch processing completed',
      result
    });

  } catch (error) {
    console.error('Batch worker error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}; 