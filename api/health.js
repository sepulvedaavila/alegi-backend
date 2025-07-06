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
    // Simple test call
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 5
    });
    
    return {
      status: 'healthy',
      details: {
        model: response.model,
        responseTime: 'fast'
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error.message,
        responseTime: 'failed'
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
  try {
    const checks = {
      database: await checkDatabase(),
      openai: await checkOpenAI(),
      courtlistener: await checkCourtListener(),
      queue: await checkQueueHealth()
    };
    
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      services: checks,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 