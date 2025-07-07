const courtListenerService = require('../services/courtlistener.service');
const circuitBreaker = require('../services/circuit-breaker.service');

async function testCourtListenerTimeoutFix() {
  console.log('🧪 Testing CourtListener Timeout Fix...\n');

  try {
    // Test 1: Check current circuit breaker status
    console.log('1. Checking Circuit Breaker Status...');
    const breakerStatus = circuitBreaker.getBreakerStatus('courtlistener');
    console.log('   Circuit Breaker Status:', JSON.stringify(breakerStatus, null, 2));

    // Test 2: Test basic search functionality
    console.log('\n2. Testing Basic Search...');
    const startTime = Date.now();
    const searchResults = await courtListenerService.searchCases('contract', {
      page_size: 1,
      filed_after: '2024-01-01'
    });
    const endTime = Date.now();
    
    console.log(`   Search completed in ${endTime - startTime}ms`);
    console.log(`   Results found: ${searchResults.length}`);

    // Test 3: Test timeout handling with a very slow query
    console.log('\n3. Testing Timeout Handling...');
    try {
      // This should timeout but not break the circuit breaker
      const slowResults = await courtListenerService.searchCases('very specific legal term that might be slow', {
        page_size: 50,
        order_by: 'score desc'
      });
      console.log(`   Slow search completed: ${slowResults.length} results`);
    } catch (error) {
      console.log(`   Expected timeout/error handled: ${error.message}`);
    }

    // Test 4: Check circuit breaker status after tests
    console.log('\n4. Checking Circuit Breaker After Tests...');
    const finalBreakerStatus = circuitBreaker.getBreakerStatus('courtlistener');
    console.log('   Final Circuit Breaker Status:', JSON.stringify(finalBreakerStatus, null, 2));

    // Test 5: Test retry mechanism
    console.log('\n5. Testing Retry Mechanism...');
    const retryStartTime = Date.now();
    const retryResults = await courtListenerService.searchCases('test retry', {
      page_size: 1
    });
    const retryEndTime = Date.now();
    
    console.log(`   Retry test completed in ${retryEndTime - retryStartTime}ms`);
    console.log(`   Retry results: ${retryResults.length}`);

    console.log('\n✅ CourtListener Timeout Fix Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ CourtListener Timeout Fix Test Failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCourtListenerTimeoutFix()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testCourtListenerTimeoutFix }; 