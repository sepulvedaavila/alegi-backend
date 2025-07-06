const aiService = require('../services/ai.service');
const circuitBreaker = require('../services/circuit-breaker.service');

async function testOpenAIIntegration() {
  console.log('🧪 Testing OpenAI Integration...\n');

  try {
    // Test 1: Check if AI service is properly initialized
    console.log('1. Testing AI Service Initialization...');
    console.log(`   Mock Mode: ${aiService.isMock}`);
    console.log(`   OpenAI Client: ${aiService.openai ? 'Initialized' : 'Not Available'}`);
    
    // Test 2: Check rate limiting status
    console.log('\n2. Testing Rate Limiting...');
    const rateLimitStatus = aiService.getRateLimitStatus();
    console.log('   Rate Limit Status:', JSON.stringify(rateLimitStatus, null, 2));

    // Test 3: Test circuit breaker status
    console.log('\n3. Testing Circuit Breaker...');
    const breakerStatus = circuitBreaker.getBreakerStatus('openai');
    console.log('   Circuit Breaker Status:', JSON.stringify(breakerStatus, null, 2));

    // Test 4: Make a test API call (if not in mock mode)
    if (!aiService.isMock) {
      console.log('\n4. Testing OpenAI API Call...');
      const testMessages = [
        { role: 'user', content: 'Hello, this is a test message. Please respond with "Test successful".' }
      ];
      
      const response = await aiService.makeOpenAICall('gpt-3.5-turbo', testMessages, {
        max_tokens: 50,
        temperature: 0.1
      });
      
      console.log('   API Call Successful:', response.choices[0].message.content);
      console.log('   Usage:', response.usage);
    } else {
      console.log('\n4. Skipping API Call (Mock Mode)');
    }

    // Test 5: Test error handling
    console.log('\n5. Testing Error Handling...');
    try {
      await aiService.makeOpenAICall('invalid-model', [
        { role: 'user', content: 'test' }
      ]);
    } catch (error) {
      console.log('   Error Handling Working:', error.message);
    }

    console.log('\n✅ OpenAI Integration Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ OpenAI Integration Test Failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testOpenAIIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testOpenAIIntegration }; 