// test/test-internal-api.js
require('dotenv').config();

const internalAPIService = require('../services/internal-api.service');

async function testInternalAPI() {
  console.log('Testing Internal API Service...\n');
  
  // Test case ID (you can replace this with a real case ID)
  const testCaseId = 'test-case-123';
  
  try {
    console.log('1. Testing internal client creation...');
    const client = internalAPIService.createInternalClient();
    console.log('✅ Internal client created successfully');
    console.log('Headers:', client.defaults.headers);
    
    console.log('\n2. Testing single endpoint call...');
    try {
      const result = await internalAPIService.triggerJudgeTrends(testCaseId);
      console.log('✅ Judge trends call completed');
      console.log('Result:', result);
    } catch (error) {
      console.log('⚠️ Judge trends call failed (expected for test case):', error.message);
    }
    
    console.log('\n3. Testing sequential analysis...');
    try {
      const results = await internalAPIService.triggerSequentialAnalysis(testCaseId, 1000);
      console.log('✅ Sequential analysis completed');
      console.log('Results:', {
        successful: Object.values(results).filter(r => r !== null).length,
        errors: results.errors.length,
        errorDetails: results.errors
      });
    } catch (error) {
      console.log('⚠️ Sequential analysis failed (expected for test case):', error.message);
    }
    
    console.log('\n✅ Internal API service test completed successfully!');
    
  } catch (error) {
    console.error('❌ Internal API service test failed:', error);
  }
}

// Run the test
testInternalAPI().catch(console.error); 