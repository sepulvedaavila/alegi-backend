// services/ai.config.js
// OpenAI Rate Limiting Configuration
// Based on OpenAI's rate limits: https://platform.openai.com/docs/guides/rate-limits

module.exports = {
  // RPM (Requests Per Minute) - conservative limits
  // These are set conservatively to avoid hitting OpenAI's actual limits
  rpm: {
    'gpt-4-turbo-preview': process.env.OPENAI_RPM_GPT4 || 10, // Conservative limit for GPT-4
    'gpt-4-0125-preview': process.env.OPENAI_RPM_GPT4 || 10,
    'gpt-4-1106-preview': process.env.OPENAI_RPM_GPT4 || 10,
    'gpt-3.5-turbo': process.env.OPENAI_RPM_GPT35 || 20, // Higher limit for GPT-3.5
    'default': process.env.OPENAI_RPM_DEFAULT || 15
  },
  
  // TPM (Tokens Per Minute) - conservative limits
  // These are set conservatively to avoid hitting OpenAI's actual limits
  tpm: {
    'gpt-4-turbo-preview': process.env.OPENAI_TPM_GPT4 || 150000, // 150k tokens per minute
    'gpt-4-0125-preview': process.env.OPENAI_TPM_GPT4 || 150000,
    'gpt-4-1106-preview': process.env.OPENAI_TPM_GPT4 || 150000,
    'gpt-3.5-turbo': process.env.OPENAI_TPM_GPT35 || 90000, // 90k tokens per minute
    'default': process.env.OPENAI_TPM_DEFAULT || 100000
  },
  
  // Delay between API calls (in milliseconds)
  delayBetweenCalls: parseInt(process.env.OPENAI_DELAY_BETWEEN_CALLS) || 1000,
  
  // Retry configuration
  retry: {
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES) || 3,
    baseDelay: parseInt(process.env.OPENAI_BASE_DELAY) || 1000,
    maxDelay: parseInt(process.env.OPENAI_MAX_DELAY) || 60000
  },
  
  // Token estimation (characters per token)
  tokenEstimation: {
    charactersPerToken: parseFloat(process.env.OPENAI_CHARS_PER_TOKEN) || 4.0
  },
  
  // Environment-specific overrides
  getLimitsForEnvironment() {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'development') {
      // More conservative limits in development
      return {
        rpm: {
          'gpt-4-turbo-preview': 5,
          'gpt-4-0125-preview': 5,
          'gpt-4-1106-preview': 5,
          'gpt-3.5-turbo': 10,
          'default': 8
        },
        tpm: {
          'gpt-4-turbo-preview': 75000,
          'gpt-4-0125-preview': 75000,
          'gpt-4-1106-preview': 75000,
          'gpt-3.5-turbo': 45000,
          'default': 50000
        }
      };
    }
    
    if (env === 'production') {
      // Production limits (can be higher)
      return {
        rpm: this.rpm,
        tpm: this.tpm
      };
    }
    
    // Default to conservative limits
    return {
      rpm: this.rpm,
      tpm: this.tpm
    };
  }
}; 