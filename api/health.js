const healthMonitor = require('../services/health-monitor.service');

module.exports = async (req, res) => {
  try {
    const healthSummary = await healthMonitor.checkAllServices();
    
    const response = {
      status: healthSummary.overall,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: healthSummary.services,
      features: {
        realtime: process.env.NODE_ENV !== 'production',
        polling: true,
        authentication: true,
        ai_processing: healthSummary.services.openai?.status === 'up',
        pdf_processing: healthSummary.services.pdf?.status === 'up',
        email_notifications: healthSummary.services.email?.status === 'up'
      },
      circuit_breakers: healthMonitor.getCircuitBreakerStatus()
    };

    const statusCode = healthSummary.overall === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(response);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}; 