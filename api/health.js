const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const healthStatus = {
      status: 'checking',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      uptime: process.uptime(),
      services: {},
      checks: []
    };

    // Check environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'OPENAI_API_KEY'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
    if (missingEnvVars.length > 0) {
      healthStatus.checks.push({
        name: 'Environment Variables',
        status: 'failed',
        message: `Missing: ${missingEnvVars.join(', ')}`
      });
    } else {
      healthStatus.checks.push({
        name: 'Environment Variables',
        status: 'passed',
        message: 'All required variables configured'
      });
    }

    // Check Supabase connection
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        
        const { count, error } = await supabase
          .from('case_briefs')
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        
        healthStatus.services.supabase = {
          status: 'up',
          message: 'Connected successfully'
        };
      } catch (error) {
        healthStatus.services.supabase = {
          status: 'down',
          error: error.message
        };
      }
    } else {
      healthStatus.services.supabase = {
        status: 'unconfigured',
        message: 'Missing credentials'
      };
    }

    // Check OpenAI
    if (process.env.OPENAI_API_KEY) {
      healthStatus.services.openai = {
        status: 'configured',
        message: 'API key present'
      };
    } else {
      healthStatus.services.openai = {
        status: 'unconfigured',
        message: 'API key missing'
      };
    }

    // Check PDFco
    if (process.env.PDF_CO_API_KEY) {
      healthStatus.services.pdfco = {
        status: 'configured',
        message: 'API key present'
      };
    } else {
      healthStatus.services.pdfco = {
        status: 'unconfigured',
        message: 'API key missing'
      };
    }

    // Determine overall health
    const criticalServices = ['supabase', 'openai'];
    const failedCritical = criticalServices.some(
      s => healthStatus.services[s]?.status === 'down'
    );
    
    const unconfiguredCritical = criticalServices.some(
      s => healthStatus.services[s]?.status === 'unconfigured'
    );

    if (failedCritical) {
      healthStatus.status = 'unhealthy';
    } else if (unconfiguredCritical) {
      healthStatus.status = 'degraded';
    } else {
      healthStatus.status = 'healthy';
    }

    // Add response time
    healthStatus.responseTime = Date.now() - startTime;

    // Return appropriate status code
    const statusCode = healthStatus.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
}; 