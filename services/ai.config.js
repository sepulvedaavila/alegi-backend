// services/ai.config.js
// OpenAI Rate Limiting Configuration
// Based on OpenAI's rate limits: https://platform.openai.com/docs/guides/rate-limits

module.exports = {
  // Production environment limits (optimized for production)
  production: {
    rpm: {
      'gpt-4-turbo-preview': process.env.OPENAI_RPM_GPT4 || 40,
      'gpt-4-0125-preview': process.env.OPENAI_RPM_GPT4 || 40,
      'gpt-4-1106-preview': process.env.OPENAI_RPM_GPT4 || 40,
      'gpt-3.5-turbo': process.env.OPENAI_RPM_GPT35 || 60,
      'default': process.env.OPENAI_RPM_DEFAULT || 50
    },
    tpm: {
      'gpt-4-turbo-preview': process.env.OPENAI_TPM_GPT4 || 120000,
      'gpt-4-0125-preview': process.env.OPENAI_TPM_GPT4 || 120000,
      'gpt-4-1106-preview': process.env.OPENAI_TPM_GPT4 || 120000,
      'gpt-3.5-turbo': process.env.OPENAI_TPM_GPT35 || 180000,
      'default': process.env.OPENAI_TPM_DEFAULT || 150000
    }
  },
  
  // Development environment limits (more conservative)
  development: {
    rpm: {
      'gpt-4-turbo-preview': process.env.OPENAI_RPM_GPT4 || 15,
      'gpt-4-0125-preview': process.env.OPENAI_RPM_GPT4 || 15,
      'gpt-4-1106-preview': process.env.OPENAI_RPM_GPT4 || 15,
      'gpt-3.5-turbo': process.env.OPENAI_RPM_GPT35 || 25,
      'default': process.env.OPENAI_RPM_DEFAULT || 20
    },
    tpm: {
      'gpt-4-turbo-preview': process.env.OPENAI_TPM_GPT4 || 40000,
      'gpt-4-0125-preview': process.env.OPENAI_TPM_GPT4 || 40000,
      'gpt-4-1106-preview': process.env.OPENAI_TPM_GPT4 || 40000,
      'gpt-3.5-turbo': process.env.OPENAI_TPM_GPT35 || 80000,
      'default': process.env.OPENAI_TPM_DEFAULT || 60000
    }
  },
  
  // Legacy configuration for backward compatibility
  rpm: {
    'gpt-4-turbo-preview': process.env.OPENAI_RPM_GPT4 || 10,
    'gpt-4-0125-preview': process.env.OPENAI_RPM_GPT4 || 10,
    'gpt-4-1106-preview': process.env.OPENAI_RPM_GPT4 || 10,
    'gpt-3.5-turbo': process.env.OPENAI_RPM_GPT35 || 20,
    'default': process.env.OPENAI_RPM_DEFAULT || 15
  },
  
  tpm: {
    'gpt-4-turbo-preview': process.env.OPENAI_TPM_GPT4 || 150000,
    'gpt-4-0125-preview': process.env.OPENAI_TPM_GPT4 || 150000,
    'gpt-4-1106-preview': process.env.OPENAI_TPM_GPT4 || 150000,
    'gpt-3.5-turbo': process.env.OPENAI_TPM_GPT35 || 90000,
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
    
    if (env === 'production') {
      return {
        rpm: this.production.rpm,
        tpm: this.production.tpm
      };
    }
    
    // Development and other environments
    return {
      rpm: this.development.rpm,
      tpm: this.development.tpm
    };
  }
}; 