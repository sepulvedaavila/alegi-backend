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
  }
};