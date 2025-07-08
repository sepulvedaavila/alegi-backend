const queueService = require('../../../services/queue.service');
const caseWorker = require('../../../workers/case.worker');

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
    const { jobId } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // Process the case job
    const result = await queueService.process('case', async (jobData) => {
      return await caseWorker.process(jobData);
    });

    if (!result) {
      return res.status(404).json({ error: 'No pending jobs found' });
    }

    res.json({ 
      success: true, 
      jobId: result.id,
      message: 'Case job processed successfully' 
    });

  } catch (error) {
    console.error('Case worker error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}; 