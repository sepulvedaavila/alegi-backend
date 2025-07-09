require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://alegi-backend.vercel.app' 
  : 'http://localhost:3000';

async function testUniversalWebhook() {
  console.log('=== TESTING UNIVERSAL WEBHOOK ENDPOINT ===\n');
  console.log('Base URL:', BASE_URL);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  
  // Test payload based on the sample
  const testPayload = {
    type: "INSERT",
    table: "case_briefs",
    record: {
      id: "test-case-" + Date.now(),
      user_id: "test-user-" + Date.now(),
      case_name: "Test Case",
      case_type: "Employment",
      case_stage: "Assessing filing",
      created_at: new Date().toISOString(),
      date_filed: null,
      updated_at: new Date().toISOString(),
      case_number: "TEST-2024-001",
      jurisdiction: "Colorado - Denver",
      applicable_law: "Employment Law",
      case_narrative: "Test case narrative for webhook testing",
      additional_notes: "Test notes",
      expected_outcome: "For compensatory damages",
      history_narrative: null,
      attorneys_of_record: []
    },
    schema: "public",
    old_record: null
  };

  console.log('\n1. Testing webhook endpoint availability...');
  try {
    const healthResponse = await axios.get(`${BASE_URL}/api`);
    console.log('✅ API is accessible');
    console.log('Response:', healthResponse.data);
  } catch (error) {
    console.log('❌ API is not accessible');
    console.log('Error:', error.message);
    return;
  }

  console.log('\n2. Testing universal webhook endpoint...');
  try {
    const webhookResponse = await axios.post(`${BASE_URL}/api/webhooks/universal`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Webhook-Client/1.0'
      },
      timeout: 10000
    });
    
    console.log('✅ Universal webhook endpoint responded successfully');
    console.log('Status:', webhookResponse.status);
    console.log('Response:', webhookResponse.data);
  } catch (error) {
    console.log('❌ Universal webhook endpoint failed');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Message:', error.message);
    
    if (error.response?.data) {
      console.log('Response Data:', error.response.data);
    }
    
    if (error.response?.headers) {
      console.log('Response Headers:', error.response.headers);
    }
  }

  console.log('\n3. Testing with Supabase signature header...');
  try {
    const webhookResponse = await axios.post(`${BASE_URL}/api/webhooks/universal`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Webhook-Client/1.0',
        'x-supabase-signature': 'sha256=test-signature'
      },
      timeout: 10000
    });
    
    console.log('✅ Universal webhook with Supabase signature responded successfully');
    console.log('Status:', webhookResponse.status);
    console.log('Response:', webhookResponse.data);
  } catch (error) {
    console.log('❌ Universal webhook with Supabase signature failed');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Message:', error.message);
    
    if (error.response?.data) {
      console.log('Response Data:', error.response.data);
    }
  }

  console.log('\n4. Testing with external webhook signature header...');
  try {
    const webhookResponse = await axios.post(`${BASE_URL}/api/webhooks/universal`, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Webhook-Client/1.0',
        'x-webhook-signature': 'test-external-signature'
      },
      timeout: 10000
    });
    
    console.log('✅ Universal webhook with external signature responded successfully');
    console.log('Status:', webhookResponse.status);
    console.log('Response:', webhookResponse.data);
  } catch (error) {
    console.log('❌ Universal webhook with external signature failed');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Message:', error.message);
    
    if (error.response?.data) {
      console.log('Response Data:', error.response.data);
    }
  }

  console.log('\n5. Testing with minimal payload...');
  try {
    const minimalPayload = {
      type: "INSERT",
      table: "case_briefs",
      record: {
        id: "minimal-test-" + Date.now(),
        user_id: "minimal-user-" + Date.now()
      }
    };

    const webhookResponse = await axios.post(`${BASE_URL}/api/webhooks/universal`, minimalPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Universal webhook with minimal payload responded successfully');
    console.log('Status:', webhookResponse.status);
    console.log('Response:', webhookResponse.data);
  } catch (error) {
    console.log('❌ Universal webhook with minimal payload failed');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Message:', error.message);
    
    if (error.response?.data) {
      console.log('Response Data:', error.response.data);
    }
  }

  console.log('\n=== TEST SUMMARY ===');
  console.log('If you see 404 errors, the issue might be:');
  console.log('1. Route not properly registered in api/index.js');
  console.log('2. Vercel deployment not updated');
  console.log('3. Environment variables missing');
  console.log('4. Middleware blocking the request');
}

testUniversalWebhook().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 