// test/test-service-initializer.js
const { serviceInitializer } = require('../services');

async function testServiceInitializer() {
  console.log('Testing Service Initializer...\n');
  
  // Test 1: Check initial status
  console.log('1. Initial status:');
  console.log(JSON.stringify(serviceInitializer.getStatus(), null, 2));
  console.log('\n');
  
  // Test 2: Initialize services
  console.log('2. Initializing services...');
  try {
    const services = await serviceInitializer.initialize();
    console.log('Services initialized successfully');
    console.log('Available services:', Object.keys(services).filter(key => services[key] !== null));
    console.log('\n');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    console.log('\n');
  }
  
  // Test 3: Check status after initialization
  console.log('3. Status after initialization:');
  console.log(JSON.stringify(serviceInitializer.getStatus(), null, 2));
  console.log('\n');
  
  // Test 4: Test individual service access
  console.log('4. Testing individual service access:');
  const serviceNames = ['openai', 'supabase', 'pdfco', 'email', 'costMonitor'];
  
  for (const serviceName of serviceNames) {
    const service = serviceInitializer.getService(serviceName);
    const isAvailable = serviceInitializer.isServiceAvailable(serviceName);
    console.log(`${serviceName}: ${isAvailable ? '✓ Available' : '✗ Not available'} ${service ? `(${typeof service})` : ''}`);
  }
  console.log('\n');
  
  // Test 5: Test service availability checks
  console.log('5. Service availability summary:');
  const status = serviceInitializer.getStatus();
  const availableCount = Object.values(status.services).filter(Boolean).length;
  const totalCount = Object.keys(status.services).length;
  console.log(`Services available: ${availableCount}/${totalCount}`);
  
  if (availableCount === totalCount) {
    console.log('✓ All services are available');
  } else {
    console.log('⚠ Some services are not available');
    Object.entries(status.services).forEach(([name, available]) => {
      if (!available) {
        console.log(`  - ${name}: Not available`);
      }
    });
  }
  
  console.log('\nTest completed!');
}

// Run the test
testServiceInitializer().catch(console.error); 