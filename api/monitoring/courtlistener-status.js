const courtListenerService = require('../../services/courtlistener.service');
const circuitBreaker = require('../../services/circuit-breaker.service');

module.exports = async (req, res) => {
  try {
    // Get circuit breaker status
    const breakerStatus = circuitBreaker.getBreakerStatus('courtlistener');
    
    // Get service configuration
    const config = {
      apiKeyConfigured: !!process.env.COURTLISTENER_API_KEY,
      baseURL: courtListenerService.baseURL,
      requestTimeout: courtListenerService.requestTimeout,
      rateLimiter: courtListenerService.rateLimiter
    };

    // Try a quick health check
    let healthCheck = { status: 'unknown' };
    try {
      const startTime = Date.now();
      const results = await courtListenerService.searchCases('test', { 
        page_size: 1,
        filed_after: '2024-01-01'
      });
      const endTime = Date.now();
      
      healthCheck = {
        status: 'healthy',
        responseTime: endTime - startTime,
        resultsCount: results.length
      };
    } catch (error) {
      healthCheck = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }

    const status = {
      service: 'courtlistener',
      timestamp: new Date().toISOString(),
      config,
      circuitBreaker: breakerStatus,
      healthCheck,
      environment: process.env.NODE_ENV || 'development'
    };

    res.status(200).json(status);
  } catch (error) {
    console.error('CourtListener status check failed:', error);
    res.status(500).json({
      error: 'Failed to get CourtListener status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 