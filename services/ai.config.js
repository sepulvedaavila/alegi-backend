// services/ai.config.js
module.exports = {
  // Rate limiting configuration
  rateLimiting: {
    // Requests per minute by model
    rpm: {
      'gpt-4': 15,
      'gpt-4-turbo': 15,
      'gpt-4o': 20,
      'gpt-4o-mini': 40,
      default: 15
    },
    
    // Tokens per minute by model
    tpm: {
      'gpt-4': 150000,
      'gpt-4-turbo': 150000,
      'gpt-4o': 200000,
      'gpt-4o-mini': 300000,
      default: 150000
    }
  },
  
  // Token estimation
  tokenEstimation: {
    charactersPerToken: 4 // Rough approximation
  },
  
  // Delays between calls
  delayBetweenCalls: 1000, // 1 second
  
  // Retry configuration
  retry: {
    maxRetries: 3,
    baseDelay: 2000, // 2 seconds
    maxDelay: 30000 // 30 seconds
  },
  
  // Model preferences
  models: {
    intake: 'gpt-4o-mini',
    jurisdiction: 'gpt-4o',
    enhancement: 'gpt-4o',
    complexity: 'gpt-4o-mini',
    prediction: 'gpt-4o',
    analysis: 'gpt-4-turbo'
  },

  // Get rate limits for current environment
  getLimitsForEnvironment() {
    const environment = process.env.NODE_ENV || 'development';
    
    // Use more conservative limits in production
    if (environment === 'production') {
      return {
        rpm: {
          'gpt-4': 10,
          'gpt-4-turbo': 10,
          'gpt-4o': 15,
          'gpt-4o-mini': 30,
          default: 10
        },
        tpm: {
          'gpt-4': 100000,
          'gpt-4-turbo': 100000,
          'gpt-4o': 150000,
          'gpt-4o-mini': 200000,
          default: 100000
        }
      };
    }
    
    // Use standard limits for development
    return {
      rpm: this.rateLimiting.rpm,
      tpm: this.rateLimiting.tpm
    };
  }
};