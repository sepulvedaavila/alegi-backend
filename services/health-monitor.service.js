class HealthMonitorService {
  constructor() {
    this.services = {
      openai: { status: 'unknown', lastCheck: 0 },
      courtlistener: { status: 'unknown', lastCheck: 0 },
      pdf: { status: 'unknown', lastCheck: 0 },
      email: { status: 'unknown', lastCheck: 0 },
      supabase: { status: 'unknown', lastCheck: 0 }
    };
    
    // Check services every 5 minutes
    setInterval(() => this.checkAllServices(), 300000);
    
    // Initial check
    this.checkAllServices();
  }

  async checkAllServices() {
    const checks = Object.keys(this.services).map(service => 
      this.checkService(service).catch(error => ({
        service,
        status: 'down',
        error: error.message,
        timestamp: new Date().toISOString()
      }))
    );

    const results = await Promise.allSettled(checks);
    
    results.forEach((result, index) => {
      const serviceName = Object.keys(this.services)[index];
      if (result.status === 'fulfilled') {
        this.services[serviceName] = {
          ...result.value,
          lastCheck: Date.now()
        };
      }
    });

    return this.getHealthSummary();
  }

  async checkService(serviceName) {
    switch (serviceName) {
      case 'openai':
        return this.checkOpenAI();
      case 'courtlistener':
        return this.checkCourtListener();
      case 'pdf':
        return this.checkPDFService();
      case 'email':
        return this.checkEmailService();
      case 'supabase':
        return this.checkSupabase();
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }

  async checkOpenAI() {
    const aiService = require('./ai.service');
    try {
      if (aiService.isMock) {
        return {
          service: 'openai',
          status: 'mock',
          message: 'OpenAI API key not configured - using mock service',
          timestamp: new Date().toISOString()
        };
      }

      const status = aiService.getRateLimitStatus();
      return {
        service: 'openai',
        status: 'up',
        rateLimit: status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'openai',
        status: 'down',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkCourtListener() {
    const courtListenerService = require('./courtlistener.service');
    try {
      // Simple health check - try to make a minimal API call
      if (!process.env.COURTLISTENER_API_KEY) {
        return {
          service: 'courtlistener',
          status: 'unconfigured',
          message: 'API key not configured',
          timestamp: new Date().toISOString()
        };
      }

      // Try a simple search to test connectivity
      const results = await courtListenerService.searchCases('test', { page_size: 1 });
      return {
        service: 'courtlistener',
        status: 'up',
        results: results.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'courtlistener',
        status: 'down',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkPDFService() {
    try {
      const pdfService = require('./pdf.service');
      // Check if PDF service is properly initialized
      if (pdfService.services && pdfService.services.length > 0) {
        return {
          service: 'pdf',
          status: 'up',
          providers: pdfService.services.length,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          service: 'pdf',
          status: 'down',
          error: 'No PDF providers configured',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        service: 'pdf',
        status: 'down',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkEmailService() {
    try {
      const emailService = require('./email.service');
      if (emailService.providers && emailService.providers.length > 0) {
        return {
          service: 'email',
          status: 'up',
          providers: emailService.providers.length,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          service: 'email',
          status: 'down',
          error: 'No email providers configured',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        service: 'email',
        status: 'down',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkSupabase() {
    try {
      const supabaseService = require('./supabase.service');
      
      // Check if using mock client
      if (supabaseService.isMock) {
        return {
          service: 'supabase',
          status: 'mock',
          message: 'Supabase not configured - using mock client',
          timestamp: new Date().toISOString()
        };
      }
      
      // Try a simple database query
      const { data, error } = await supabaseService.client
        .from('case_briefs')
        .select('id', { count: 'exact', head: true });
      
      if (error) throw error;
      
      return {
        service: 'supabase',
        status: 'up',
        connection: 'successful',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'supabase',
        status: 'down',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  getHealthSummary() {
    const summary = {
      overall: 'healthy',
      services: this.services,
      timestamp: new Date().toISOString()
    };

    const downServices = Object.values(this.services)
      .filter(service => service.status === 'down');
    
    if (downServices.length > 0) {
      summary.overall = downServices.length > 2 ? 'unhealthy' : 'degraded';
      summary.issues = downServices.length;
    }

    return summary;
  }

  getCircuitBreakerStatus() {
    const circuitBreaker = require('./circuit-breaker.service');
    return circuitBreaker.getAllBreakers();
  }

  getDetailedHealth() {
    return {
      summary: this.getHealthSummary(),
      circuitBreakers: this.getCircuitBreakerStatus(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new HealthMonitorService(); 