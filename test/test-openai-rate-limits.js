// test/test-openai-rate-limits.js
const aiService = require('../services/ai.service');

async function testRateLimiting() {
  console.log('🧪 Testing OpenAI rate limiting...');
  
  const testCase = {
    id: 'test-rate-limit-123',
    case_title: 'Test Rate Limiting Case',
    case_type: 'Employment',
    case_narrative: 'Employee was terminated after filing EEOC complaint for workplace harassment based on race and gender.'
  };

  try {
    // Test 1: Check rate limit status before calls
    console.log('\n📊 Initial rate limit status:');
    const initialStatus = aiService.getRateLimitStatus();
    console.log(JSON.stringify(initialStatus, null, 2));

    // Test 2: Make multiple rapid calls to test rate limiting
    console.log('\n🚀 Making multiple rapid API calls to test rate limiting...');
    
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const promise = aiService.analyzeCaseIntake(testCase, [], 'Test document content')
        .then(result => {
          console.log(`✅ Call ${i + 1} completed`);
          return result;
        })
        .catch(error => {
          console.error(`❌ Call ${i + 1} failed:`, error.message);
          return null;
        });
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    console.log(`\n📈 Completed ${results.filter(r => r !== null).length}/5 calls`);

    // Test 3: Check rate limit status after calls
    console.log('\n📊 Final rate limit status:');
    const finalStatus = aiService.getRateLimitStatus();
    console.log(JSON.stringify(finalStatus, null, 2));

    // Test 4: Test configuration
    console.log('\n⚙️ Testing configuration...');
    const aiConfig = require('../services/ai.config');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('RPM limits:', aiConfig.getLimitsForEnvironment().rpm);
    console.log('TPM limits:', aiConfig.getLimitsForEnvironment().tpm);

    console.log('\n✅ Rate limiting test completed!');

  } catch (error) {
    console.error('❌ Rate limiting test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testRateLimiting()
    .then(() => {
      console.log('\n🎉 All tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testRateLimiting }; 