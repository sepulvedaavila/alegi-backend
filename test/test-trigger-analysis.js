// test/test-trigger-analysis.js - Test trigger analysis endpoint

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_CASE_ID = process.env.TEST_CASE_ID || 'test-case-123';
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN || 'test-token';

async function testTriggerAnalysis() {
  console.log('=== Testing Trigger Analysis Endpoint ===\n');
  
  try {
    console.log(`Testing endpoint: ${BASE_URL}/api/cases/${TEST_CASE_ID}/trigger-analysis`);
    console.log(`Using case ID: ${TEST_CASE_ID}`);
    
    const response = await axios.post(
      `${BASE_URL}/api/cases/${TEST_CASE_ID}/trigger-analysis`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    console.log('✅ Request successful');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('❌ Request failed');
    
    if (error.response) {
      // Server responded with error status
      console.log('Status:', error.response.status);
      console.log('Error Response:', JSON.stringify(error.response.data, null, 2));
      
      // Provide helpful debugging info
      if (error.response.data.code) {
        console.log(`\nError Code: ${error.response.data.code}`);
        
        switch (error.response.data.code) {
          case 'DATABASE_UNAVAILABLE':
            console.log('💡 This indicates missing or invalid Supabase credentials');
            console.log('   Check your environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY');
            break;
          case 'SERVICE_UNAVAILABLE':
            console.log('💡 This indicates the processing service failed to load');
            console.log('   Check for syntax errors in processing.service.js');
            break;
          case 'CASE_NOT_FOUND':
            console.log('💡 This indicates the test case ID does not exist');
            console.log('   Try using a valid case ID from your database');
            break;
          default:
            console.log('💡 Check the error message above for more details');
        }
      }
    } else if (error.request) {
      // Request was made but no response received
      console.log('❌ No response received from server');
      console.log('   Check if the server is running and accessible');
    } else {
      // Something else happened
      console.log('❌ Error:', error.message);
    }
  }
}

// Run the test
testTriggerAnalysis().then(() => {
  console.log('\n=== Test Complete ===');
  process.exit(0);
}).catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
}); 