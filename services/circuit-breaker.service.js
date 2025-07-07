class CircuitBreakerService {
  constructor() {
    this.breakers = new Map();
  }

  async callWithCircuitBreaker(serviceName, fn, options = {}) {
    const breaker = this.getBreaker(serviceName, options);
    
    if (breaker.state === 'OPEN') {
      if (Date.now() - breaker.lastFailTime < breaker.timeout) {
        const remainingTime = Math.ceil((breaker.timeout - (Date.now() - breaker.lastFailTime)) / 1000);
        throw new Error(`Circuit breaker OPEN for ${serviceName} (resets in ${remainingTime}s)`);
      }
      breaker.state = 'HALF_OPEN';
      console.log(`Circuit breaker for ${serviceName} transitioning to HALF_OPEN`);
    }

    try {
      const result = await fn();
      if (breaker.state === 'HALF_OPEN') {
        breaker.state = 'CLOSED';
        breaker.failureCount = 0;
        console.log(`Circuit breaker for ${serviceName} reset to CLOSED`);
      }
      return result;
    } catch (error) {
      breaker.failureCount++;
      breaker.lastFailTime = Date.now();
      
      // Log the failure for debugging
      console.warn(`Circuit breaker failure for ${serviceName}:`, {
        failureCount: breaker.failureCount,
        threshold: breaker.threshold,
        error: error.message
      });
      
      if (breaker.failureCount >= breaker.threshold) {
        breaker.state = 'OPEN';
        console.error(`Circuit breaker for ${serviceName} opened after ${breaker.failureCount} failures`);
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
    
    const timeSinceLastFail = Date.now() - breaker.lastFailTime;
    const remainingTimeout = breaker.state === 'OPEN' ? 
      Math.max(0, breaker.timeout - timeSinceLastFail) : 0;
    
    return {
      state: breaker.state,
      failureCount: breaker.failureCount,
      threshold: breaker.threshold,
      lastFailTime: breaker.lastFailTime,
      remainingTimeout,
      isOpen: breaker.state === 'OPEN'
    };
  }

  resetBreaker(serviceName) {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.state = 'CLOSED';
      breaker.failureCount = 0;
      breaker.lastFailTime = 0;
      console.log(`Circuit breaker for ${serviceName} manually reset`);
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