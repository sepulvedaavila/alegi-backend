// services/rateLimiter.js
class RateLimiter {
  constructor() {
    this.limits = {
      openai: {
        rpm: parseInt(process.env.OPENAI_RPM_GPT4) || 10,
        tpm: parseInt(process.env.OPENAI_TPM_GPT4) || 150000
      },
      courtlistener: {
        rpm: 60,
        daily: 1000
      },
      pdfco: {
        rpm: 30,
        monthly: 10000
      }
    };
    
    this.usage = new Map();
  }
  
  async checkLimit(service, userId) {
    const key = `${service}:${userId}`;
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    if (!this.usage.has(key)) {
      this.usage.set(key, { minute: minute, count: 0 });
    }
    
    const usage = this.usage.get(key);
    
    if (usage.minute !== minute) {
      usage.minute = minute;
      usage.count = 0;
    }
    
    if (usage.count >= this.limits[service].rpm) {
      throw new Error(`Rate limit exceeded for ${service}`);
    }
    
    usage.count++;
  }
  
  getLimits(service) {
    return this.limits[service] || {};
  }
  
  getUsage(service, userId) {
    const key = `${service}:${userId}`;
    return this.usage.get(key) || { count: 0, minute: 0 };
  }
}

module.exports = new RateLimiter(); 