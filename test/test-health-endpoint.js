// test/test-health-endpoint.js
const { serviceInitializer } = require('../services');
const healthEndpoint = require('../api/health');

// Mock Express request and response objects
const mockReq = {};
const mockRes = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    this.data = data;
    return this;
  }
};

async function testHealthEndpoint() {
  console.log('Testing Health Endpoint with Service Initializer...\n');
  
  // Initialize services first
  console.log('1. Initializing services...');
  await serviceInitializer.initialize();
  console.log('Services initialized\n');
  
  // Test health endpoint
  console.log('2. Testing health endpoint...');
  try {
    await healthEndpoint(mockReq, mockRes);
    
    console.log('Health endpoint response:');
    console.log('Status Code:', mockRes.statusCode);
    console.log('Response Data:');
    console.log(JSON.stringify(mockRes.data, null, 2));
    
    // Verify service initialization data is included
    if (mockRes.data.service_initialization) {
      console.log('\n✓ Service initialization data is included in health response');
      console.log('  - Initialized:', mockRes.data.service_initialization.initialized);
      console.log('  - Available services:', Object.entries(mockRes.data.service_initialization.available_services)
        .filter(([_, available]) => available)
        .map(([name, _]) => name)
        .join(', '));
    } else {
      console.log('\n✗ Service initialization data is missing from health response');
    }
    
    // Verify overall health status
    if (mockRes.data.status) {
      console.log(`\n✓ Overall health status: ${mockRes.data.status}`);
    } else {
      console.log('\n✗ Overall health status is missing');
    }
    
  } catch (error) {
    console.error('Health endpoint test failed:', error);
  }
  
  console.log('\nTest completed!');
}

// Run the test
testHealthEndpoint().catch(console.error); 