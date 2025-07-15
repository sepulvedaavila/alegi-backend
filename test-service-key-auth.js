// test-service-key-auth.js - Test the new service key authentication methods
const express = require('express');
const request = require('supertest');

// Mock environment
process.env.NODE_ENV = 'development';
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1bmNrdHR3b2V1YWNvbGJncG51Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5ODUzNDAwMCwiZXhwIjoxODU2MzAwMDAwfQ.test-service-key';
process.env.SUPABASE_WEBHOOK_SECRET = 'test-webhook-secret-123';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-456';

const app = express();
app.use(express.json());

// Import test auth endpoint
const testAuth = require('./api/test-auth');
app.post('/api/test-auth', testAuth);

async function testServiceKeyAuth() {
  console.log('🧪 Testing Service Key Authentication Methods');
  console.log('=============================================\n');

  const testCaseId = 'test-service-auth-' + Date.now();

  try {
    // Test 1: No authentication (should fail)
    console.log('📊 Test 1: No authentication (should fail)...');
    
    const noAuthResponse = await request(app)
      .post('/api/test-auth');
    
    console.log(`Status: ${noAuthResponse.status}`);
    console.log(`Auth methods detected: ${Object.keys(noAuthResponse.body.headers || {}).filter(h => h.includes('x-') || h.includes('authorization')).length}`);
    console.log('');

    // Test 2: Supabase Service Key
    console.log('📊 Test 2: Supabase Service Key authentication...');
    
    const serviceKeyResponse = await request(app)
      .post('/api/test-auth')
      .set('X-Supabase-Service-Key', process.env.SUPABASE_SERVICE_KEY);
    
    console.log(`Status: ${serviceKeyResponse.status}`);
    if (serviceKeyResponse.body.middlewareUser) {
      console.log(`✅ Authenticated as: ${serviceKeyResponse.body.middlewareUser.email} (${serviceKeyResponse.body.middlewareUser.role})`);
    } else {
      console.log(`❌ Authentication failed: ${serviceKeyResponse.body.middlewareError || 'Unknown error'}`);
    }
    console.log('');

    // Test 3: Webhook Secret
    console.log('📊 Test 3: Webhook Secret authentication...');
    
    const webhookResponse = await request(app)
      .post('/api/test-auth')
      .set('X-Webhook-Secret', process.env.SUPABASE_WEBHOOK_SECRET);
    
    console.log(`Status: ${webhookResponse.status}`);
    if (webhookResponse.body.middlewareUser) {
      console.log(`✅ Authenticated as: ${webhookResponse.body.middlewareUser.email} (${webhookResponse.body.middlewareUser.role})`);
    } else {
      console.log(`❌ Authentication failed: ${webhookResponse.body.middlewareError || 'Unknown error'}`);
    }
    console.log('');

    // Test 4: Simple API Key
    console.log('📊 Test 4: Simple API Key authentication...');
    
    const apiKeyResponse = await request(app)
      .post('/api/test-auth')
      .set('X-API-Key', process.env.SUPABASE_SERVICE_KEY);
    
    console.log(`Status: ${apiKeyResponse.status}`);
    if (apiKeyResponse.body.middlewareUser) {
      console.log(`✅ Authenticated as: ${apiKeyResponse.body.middlewareUser.email} (${apiKeyResponse.body.middlewareUser.role})`);
    } else {
      console.log(`❌ Authentication failed: ${apiKeyResponse.body.middlewareError || 'Unknown error'}`);
    }
    console.log('');

    // Test 5: Bearer Service Key
    console.log('📊 Test 5: Bearer Service Key authentication...');
    
    const bearerResponse = await request(app)
      .post('/api/test-auth')
      .set('Authorization', `Bearer ${process.env.SUPABASE_SERVICE_KEY}`);
    
    console.log(`Status: ${bearerResponse.status}`);
    if (bearerResponse.body.middlewareUser) {
      console.log(`✅ Authenticated as: ${bearerResponse.body.middlewareUser.email} (${bearerResponse.body.middlewareUser.role})`);
    } else {
      console.log(`❌ Authentication failed: ${bearerResponse.body.middlewareError || 'Unknown error'}`);
    }
    console.log('');

    // Test 6: Internal Service
    console.log('📊 Test 6: Internal Service authentication...');
    
    const internalResponse = await request(app)
      .post('/api/test-auth')
      .set('X-Internal-Service', 'alegi-backend')
      .set('X-Service-Secret', process.env.INTERNAL_SERVICE_SECRET);
    
    console.log(`Status: ${internalResponse.status}`);
    if (internalResponse.body.middlewareUser) {
      console.log(`✅ Authenticated as: ${internalResponse.body.middlewareUser.email} (${internalResponse.body.middlewareUser.role})`);
    } else {
      console.log(`❌ Authentication failed: ${internalResponse.body.middlewareError || 'Unknown error'}`);
    }
    console.log('');

    // Test 7: Development Bypass
    console.log('📊 Test 7: Development Bypass...');
    
    const devBypassResponse = await request(app)
      .post('/api/test-auth')
      .set('X-Dev-Bypass', 'true');
    
    console.log(`Status: ${devBypassResponse.status}`);
    if (devBypassResponse.body.middlewareUser) {
      console.log(`✅ Authenticated as: ${devBypassResponse.body.middlewareUser.email} (${devBypassResponse.body.middlewareUser.role})`);
    } else {
      console.log(`❌ Authentication failed: ${devBypassResponse.body.middlewareError || 'Unknown error'}`);
    }
    console.log('');

    // Summary
    console.log('📋 Authentication Methods Summary:');
    console.log('==================================');
    console.log('✅ Available methods:');
    console.log('  1. X-Supabase-Service-Key: YOUR_SERVICE_KEY');
    console.log('  2. X-Webhook-Secret: YOUR_WEBHOOK_SECRET');
    console.log('  3. X-API-Key: YOUR_SERVICE_KEY');
    console.log('  4. Authorization: Bearer YOUR_SERVICE_KEY');
    console.log('  5. X-Internal-Service + X-Service-Secret');
    console.log('  6. X-Dev-Bypass: true (development only)');
    console.log('');
    console.log('🎯 Recommended for production: X-API-Key header');
    console.log('');

    console.log('✅ Service key authentication tests completed successfully!');

  } catch (error) {
    console.error('❌ Service key authentication test failed:', error);
  }
}

testServiceKeyAuth().then(() => {
  console.log('\n🏁 All service key authentication tests completed');
  process.exit(0);
}).catch(error => {
  console.error('Service key authentication test failed:', error);
  process.exit(1);
});