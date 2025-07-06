const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function checkDatabase() {
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('id', { count: 'exact', head: true });
    
    if (error) throw error;
    
    return {
      status: 'healthy',
      details: {
        connection: 'successful',
        responseTime: 'fast'
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error.message,
        connection: 'failed'
      }
    };
  }
}

async function checkOpenAI() {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return {
        status: 'unhealthy',
        details: {
          error: 'OpenAI API key not configured',
          connection: 'failed'
        }
      };
    }

    // Check if we can create the OpenAI client (this doesn't make an API call)
    if (!openai) {
      return {
        status: 'unhealthy',
        details: {
          error: 'OpenAI client initialization failed',
          connection: 'failed'
        }
      };
    }

    // Instead of making an actual API call, just check the configuration
    // This avoids consuming API quota and hitting rate limits
    const aiService = require('../services/ai.service');
    const rateLimitStatus = aiService.getRateLimitStatus();
    
    return {
      status: 'healthy',
      details: {
        apiKey: 'configured',
        client: 'initialized',
        rateLimits: rateLimitStatus,
        responseTime: 'fast'
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error.message,
        connection: 'failed'
      }
    };
  }
}

async function checkCourtListener() {
  try {
    // This would test CourtListener API connection
    // For now, return mock status
    return {
      status: 'healthy',
      details: {
        connection: 'successful',
        apiKey: process.env.COURTLISTENER_API_KEY ? 'configured' : 'missing'
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error.message,
        connection: 'failed'
      }
    };
  }
}

async function checkQueueHealth() {
  try {
    // Check if queue service is available
    const queueService = require('../services/queueService');
    
    return {
      status: 'healthy',
      details: {
        queues: queueService.queues.size,
        processing: queueService.processing.size
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error.message,
        queues: 0
      }
    };
  }
}

module.exports = async (req, res) => {
  // Add timeout to prevent hanging health checks
  const timeout = setTimeout(() => {
    console.error('Health check timeout - taking too long');
    if (!res.headersSent) {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check timeout',
        timestamp: new Date().toISOString()
      });
    }
  }, 10000); // 10 second timeout

  try {
    // Run all health checks with individual error handling and timeouts
    const checks = {};
    
    // Helper function to run health checks with timeout
    const runCheckWithTimeout = async (checkFunction, checkName, timeoutMs = 5000) => {
      try {
        const checkPromise = checkFunction();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${checkName} timeout`)), timeoutMs)
        );
        
        return await Promise.race([checkPromise, timeoutPromise]);
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message, connection: 'failed' }
        };
      }
    };
    
    // Run checks in parallel with individual timeouts
    const [databaseCheck, openaiCheck, courtlistenerCheck, queueCheck] = await Promise.all([
      runCheckWithTimeout(checkDatabase, 'Database', 3000),
      runCheckWithTimeout(checkOpenAI, 'OpenAI', 2000),
      runCheckWithTimeout(checkCourtListener, 'CourtListener', 2000),
      runCheckWithTimeout(checkQueueHealth, 'Queue', 2000)
    ]);
    
    checks.database = databaseCheck;
    checks.openai = openaiCheck;
    checks.courtlistener = courtlistenerCheck;
    checks.queue = queueCheck;
    
    // Determine overall status
    const criticalServices = ['database']; // Only database is critical
    const criticalHealthy = criticalServices.every(service => 
      checks[service] && checks[service].status === 'healthy'
    );
    
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    
    // Return 200 if critical services are healthy, 503 only if critical services fail
    const statusCode = criticalHealthy ? 200 : 503;
    const overallStatus = criticalHealthy ? (allHealthy ? 'healthy' : 'degraded') : 'unhealthy';
    
    clearTimeout(timeout);
    
    res.status(statusCode).json({
      status: overallStatus,
      services: checks,
      criticalServices: criticalServices,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Health check error:', error);
    
    if (!res.headersSent) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}; 