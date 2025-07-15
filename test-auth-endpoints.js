// test-auth-endpoints.js - Test authentication on the new endpoints
const express = require('express');
const request = require('supertest');

// Mock environment for testing
process.env.NODE_ENV = 'development';
process.env.INTERNAL_SERVICE_SECRET = 'test-secret-123';

const app = express();
app.use(express.json());

// Import the endpoints to test
const processEndpoint = require('./api/cases/[id]/process');
const statusEndpoint = require('./api/cases/[id]/status');
const adminEndpoint = require('./api/admin/process-stuck-cases');

// Mount the endpoints for testing
app.post('/api/cases/:id/process', (req, res) => {
  req.query = { id: req.params.id };
  processEndpoint(req, res);
});

app.get('/api/cases/:id/status', (req, res) => {
  req.query = { id: req.params.id };
  statusEndpoint(req, res);
});

app.post('/api/admin/process-stuck-cases', adminEndpoint);

async function testAuthentication() {
  console.log('🧪 Testing authentication on case processing endpoints...');

  const testCaseId = 'test-case-auth-' + Date.now();

  try {
    // Test 1: No authentication (should fail)
    console.log('\n📊 Test 1: No authentication (should fail)...');
    
    const noAuthResponse = await request(app)
      .post(`/api/cases/${testCaseId}/process`)
      .send({ force: true });
    
    console.log('No auth response:', noAuthResponse.status, noAuthResponse.body);

    // Test 2: Development bypass (should work)
    console.log('\n📊 Test 2: Development bypass (should work)...');
    
    const devBypassResponse = await request(app)
      .post(`/api/cases/${testCaseId}/process`)
      .set('X-Dev-Bypass', 'true')
      .send({ force: true });
    
    console.log('Dev bypass response:', devBypassResponse.status, devBypassResponse.body);

    // Test 3: Internal service auth (should work)
    console.log('\n📊 Test 3: Internal service auth (should work)...');
    
    const serviceAuthResponse = await request(app)
      .post(`/api/cases/${testCaseId}/process`)
      .set('X-Internal-Service', 'alegi-backend')
      .set('X-Service-Secret', 'test-secret-123')
      .send({ force: true });
    
    console.log('Service auth response:', serviceAuthResponse.status, serviceAuthResponse.body);

    // Test 4: Admin endpoint with dev bypass
    console.log('\n📊 Test 4: Admin endpoint with dev bypass...');
    
    const adminResponse = await request(app)
      .post('/api/admin/process-stuck-cases')
      .set('X-Dev-Bypass', 'true')
      .send({ dryRun: true, maxCases: 1 });
    
    console.log('Admin response:', adminResponse.status, adminResponse.body);

    // Test 5: Case status endpoint
    console.log('\n📊 Test 5: Case status endpoint with dev bypass...');
    
    const statusResponse = await request(app)
      .get(`/api/cases/${testCaseId}/status`)
      .set('X-Dev-Bypass', 'true');
    
    console.log('Status response:', statusResponse.status, statusResponse.body);

    console.log('\n✅ Authentication tests completed!');

  } catch (error) {
    console.error('❌ Authentication test failed:', error);
  }
}

testAuthentication().then(() => {
  console.log('\n🏁 All authentication tests completed');
  process.exit(0);
}).catch(error => {
  console.error('Authentication test failed:', error);
  process.exit(1);
});