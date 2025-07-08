// services/rateLimiter.js - Rate limiting service

class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.usage = new Map();
    
    // Default rate limits
    this.defaultLimits = {
      openai: {
        requestsPerMinute: 60,
        tokensPerMinute: 150000,
        requestsPerHour: 3500
      },
      courtlistener: {
        requestsPerMinute: 30,
        requestsPerHour: 1000
      },
      supabase: {
        requestsPerMinute: 100,
        requestsPerHour: 5000
      }
    };
  }

  async checkLimit(service, userId, options = {}) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    
    const limits = this.defaultLimits[service] || this.defaultLimits.openai;
    const key = `${service}:${userId}`;
    
    // Initialize usage tracking if not exists
    if (!this.usage.has(key)) {
      this.usage.set(key, {
        requests: new Map(),
        tokens: new Map(),
        lastReset: now
      });
    }
    
    const usage = this.usage.get(key);
    
    // Clean up old entries
    this.cleanupOldEntries(usage, now);
    
    // Check minute limits
    const requestsThisMinute = usage.requests.get(minute) || 0;
    if (requestsThisMinute >= limits.requestsPerMinute) {
      throw new Error(`Rate limit exceeded for ${service}: ${limits.requestsPerMinute} requests per minute`);
    }
    
    // Check hour limits
    const requestsThisHour = this.getHourlyRequests(usage, hour);
    if (requestsThisHour >= limits.requestsPerHour) {
      throw new Error(`Rate limit exceeded for ${service}: ${limits.requestsPerHour} requests per hour`);
    }
    
    // Check token limits for OpenAI
    if (service === 'openai' && options.tokens) {
      const tokensThisMinute = usage.tokens.get(minute) || 0;
      if (tokensThisMinute + options.tokens > limits.tokensPerMinute) {
        throw new Error(`Token limit exceeded for OpenAI: ${limits.tokensPerMinute} tokens per minute`);
      }
      usage.tokens.set(minute, tokensThisMinute + options.tokens);
    }
    
    // Update request count
    usage.requests.set(minute, requestsThisMinute + 1);
    
    return true;
  }

  cleanupOldEntries(usage, now) {
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    
    // Clean up requests older than 1 hour
    for (const [timestamp] of usage.requests) {
      if (timestamp < minute - 60) {
        usage.requests.delete(timestamp);
      }
    }
    
    // Clean up tokens older than 1 hour
    for (const [timestamp] of usage.tokens) {
      if (timestamp < minute - 60) {
        usage.tokens.delete(timestamp);
      }
    }
  }

  getHourlyRequests(usage, currentHour) {
    let total = 0;
    for (const [timestamp, count] of usage.requests) {
      const hour = Math.floor(timestamp / 60);
      if (hour === currentHour) {
        total += count;
      }
    }
    return total;
  }

  getUsage(service, userId) {
    const key = `${service}:${userId}`;
    const usage = this.usage.get(key);
    
    if (!usage) {
      return {
        requests: 0,
        tokens: 0,
        limits: this.defaultLimits[service] || this.defaultLimits.openai
      };
    }
    
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    
    return {
      requestsThisMinute: usage.requests.get(minute) || 0,
      requestsThisHour: this.getHourlyRequests(usage, hour),
      tokensThisMinute: usage.tokens.get(minute) || 0,
      limits: this.defaultLimits[service] || this.defaultLimits.openai
    };
  }

  resetUsage(service, userId) {
    const key = `${service}:${userId}`;
    this.usage.delete(key);
  }
}

// Export singleton instance
const rateLimiter = new RateLimiter();
module.exports = rateLimiter; 