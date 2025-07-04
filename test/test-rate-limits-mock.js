// test/test-rate-limits-mock.js
// Mock test for OpenAI rate limiting without requiring actual API key

const aiConfig = require('../services/ai.config');

// Mock AI service for testing rate limiting logic
class MockAIService {
  constructor() {
    // OpenAI Rate Limiting Configuration
    const limits = aiConfig.getLimitsForEnvironment();
    this.rateLimiter = {
      rpm: limits.rpm,
      tpm: limits.tpm,
      usage: {
        requests: new Map(),
        tokens: new Map(),
        lastReset: Date.now()
      }
    };
    
    this.resetUsageTracking();
  }

  // Reset usage tracking every minute
  resetUsageTracking() {
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    for (const [timestamp, _] of this.rateLimiter.usage.requests) {
      if (timestamp < minuteAgo) {
        this.rateLimiter.usage.requests.delete(timestamp);
      }
    }
    
    for (const [timestamp, _] of this.rateLimiter.usage.tokens) {
      if (timestamp < minuteAgo) {
        this.rateLimiter.usage.tokens.delete(timestamp);
      }
    }
    
    setTimeout(() => this.resetUsageTracking(), 60000);
  }

  // Check if we can make a request based on rate limits
  async checkRateLimit(model, estimatedTokens = 1000) {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000;
    
    const rpmLimit = this.rateLimiter.rpm[model] || this.rateLimiter.rpm.default;
    const tpmLimit = this.rateLimiter.tpm[model] || this.rateLimiter.tpm.default;
    
    const requestsThisMinute = this.rateLimiter.usage.requests.get(currentMinute) || 0;
    const tokensThisMinute = this.rateLimiter.usage.tokens.get(currentMinute) || 0;
    
    if (requestsThisMinute >= rpmLimit) {
      const waitTime = 60000 - (now - currentMinute);
      console.log(`Rate limit hit for requests (${requestsThisMinute}/${rpmLimit}). Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit(model, estimatedTokens);
    }
    
    if (tokensThisMinute + estimatedTokens > tpmLimit) {
      const waitTime = 60000 - (now - currentMinute);
      console.log(`Rate limit hit for tokens (${tokensThisMinute + estimatedTokens}/${tpmLimit}). Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit(model, estimatedTokens);
    }
    
    this.rateLimiter.usage.requests.set(currentMinute, requestsThisMinute + 1);
    this.rateLimiter.usage.tokens.set(currentMinute, tokensThisMinute + estimatedTokens);
    
    return true;
  }

  // Estimate token count
  estimateTokens(text) {
    return Math.ceil(text.length / aiConfig.tokenEstimation.charactersPerToken);
  }

  // Mock API call
  async makeMockCall(model, text) {
    const estimatedTokens = this.estimateTokens(text);
    await this.checkRateLimit(model, estimatedTokens);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, aiConfig.delayBetweenCalls));
    
    console.log(`Mock API call completed for model ${model} with ${estimatedTokens} estimated tokens`);
    return { success: true, tokens: estimatedTokens };
  }

  // Get current rate limit status
  getRateLimitStatus() {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000;
    
    const requestsThisMinute = this.rateLimiter.usage.requests.get(currentMinute) || 0;
    const tokensThisMinute = this.rateLimiter.usage.tokens.get(currentMinute) || 0;
    
    return {
      currentMinute: new Date(currentMinute).toISOString(),
      requestsThisMinute,
      tokensThisMinute,
      limits: {
        rpm: this.rateLimiter.rpm,
        tpm: this.rateLimiter.tpm
      }
    };
  }
}

async function testRateLimiting() {
  console.log('🧪 Testing OpenAI rate limiting (mock version)...');
  
  const mockService = new MockAIService();
  
  try {
    // Test 1: Check initial status
    console.log('\n📊 Initial rate limit status:');
    const initialStatus = mockService.getRateLimitStatus();
    console.log(JSON.stringify(initialStatus, null, 2));

    // Test 2: Make multiple rapid calls
    console.log('\n🚀 Making multiple rapid mock API calls...');
    
    const testText = 'This is a test case for employment discrimination. The employee alleges wrongful termination.';
    const promises = [];
    
    for (let i = 0; i < 8; i++) {
      const promise = mockService.makeMockCall('gpt-4-turbo-preview', testText)
        .then(result => {
          console.log(`✅ Mock call ${i + 1} completed`);
          return result;
        })
        .catch(error => {
          console.error(`❌ Mock call ${i + 1} failed:`, error.message);
          return null;
        });
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    console.log(`\n📈 Completed ${results.filter(r => r !== null).length}/8 calls`);

    // Test 3: Check final status
    console.log('\n📊 Final rate limit status:');
    const finalStatus = mockService.getRateLimitStatus();
    console.log(JSON.stringify(finalStatus, null, 2));

    // Test 4: Test configuration
    console.log('\n⚙️ Configuration test:');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('RPM limits:', aiConfig.getLimitsForEnvironment().rpm);
    console.log('TPM limits:', aiConfig.getLimitsForEnvironment().tpm);
    console.log('Delay between calls:', aiConfig.delayBetweenCalls, 'ms');

    console.log('\n✅ Mock rate limiting test completed!');

  } catch (error) {
    console.error('❌ Mock rate limiting test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testRateLimiting()
    .then(() => {
      console.log('\n🎉 All mock tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Mock test failed:', error);
      process.exit(1);
    });
}

module.exports = { testRateLimiting, MockAIService }; 