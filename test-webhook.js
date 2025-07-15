// test-webhook.js - Test webhook processing flow
const express = require('express');
const request = require('supertest');

// Mock the environment
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

const app = express();
app.use(express.json());

// Import our webhook routes
const webhookRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhookRoutes);

async function testWebhook() {
  console.log('🧪 Testing webhook processing flow...');
  
  try {
    // Test 1: Test external webhook for case creation
    console.log('\n📊 Test 1: External webhook for case creation...');
    
    const caseData = {
      type: 'INSERT',
      table: 'case_briefs',
      record: {
        id: 'test-case-' + Date.now(),
        user_id: 'test-user-' + Date.now(),
        case_name: 'Test Case vs Example Corp',
        case_stage: 'discovery',
        jurisdiction: 'federal'
      }
    };
    
    const response = await request(app)
      .post('/api/webhooks/external/case-briefs')
      .send(caseData)
      .expect(200);
    
    console.log('✅ External webhook response:', response.body);
    
    // Test 2: Test universal webhook
    console.log('\n📊 Test 2: Universal webhook...');
    
    const universalResponse = await request(app)
      .post('/api/webhooks/universal')
      .send(caseData)
      .expect(200);
    
    console.log('✅ Universal webhook response:', universalResponse.body);
    
    // Wait a bit for background processing
    console.log('\n⏳ Waiting for background processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Webhook tests completed');
    
  } catch (error) {
    console.error('❌ Webhook test failed:', error);
  }
}

// Run the test
testWebhook().then(() => {
  console.log('\n🏁 All webhook tests completed');
  process.exit(0);
}).catch(error => {
  console.error('Webhook test failed:', error);
  process.exit(1);
});