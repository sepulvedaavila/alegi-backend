class CircuitBreakerService {
  constructor() {
    this.breakers = new Map();
  }

  async callWithCircuitBreaker(serviceName, fn, options = {}) {
    const breaker = this.getBreaker(serviceName, options);
    
    if (breaker.state === 'OPEN') {
      if (Date.now() - breaker.lastFailTime < breaker.timeout) {
        throw new Error(`Circuit breaker OPEN for ${serviceName}`);
      }
      breaker.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      if (breaker.state === 'HALF_OPEN') {
        breaker.state = 'CLOSED';
        breaker.failureCount = 0;
      }
      return result;
    } catch (error) {
      breaker.failureCount++;
      breaker.lastFailTime = Date.now();
      
      if (breaker.failureCount >= breaker.threshold) {
        breaker.state = 'OPEN';
      }
      throw error;
    }
  }

  getBreaker(serviceName, options) {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, {
        state: 'CLOSED',
        failureCount: 0,
        threshold: options.threshold || 5,
        timeout: options.timeout || 60000,
        lastFailTime: 0
      });
    }
    return this.breakers.get(serviceName);
  }

  getBreakerStatus(serviceName) {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) {
      return { state: 'UNKNOWN', failureCount: 0 };
    }
    return {
      state: breaker.state,
      failureCount: breaker.failureCount,
      lastFailTime: breaker.lastFailTime,
      isOpen: breaker.state === 'OPEN'
    };
  }

  resetBreaker(serviceName) {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.state = 'CLOSED';
      breaker.failureCount = 0;
      breaker.lastFailTime = 0;
    }
  }

  getAllBreakers() {
    const status = {};
    for (const [serviceName, breaker] of this.breakers) {
      status[serviceName] = this.getBreakerStatus(serviceName);
    }
    return status;
  }
}

module.exports = new CircuitBreakerService(); 