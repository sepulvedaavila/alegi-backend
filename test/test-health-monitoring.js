const healthMonitor = require('../services/health-monitor.service');
const circuitBreaker = require('../services/circuit-breaker.service');

async function testHealthMonitoring() {
  console.log('🧪 Testing Health Monitoring Integration...\n');

  try {
    // Test 1: Check if health monitor is properly initialized
    console.log('1. Testing Health Monitor Initialization...');
    console.log('   Services being monitored:', Object.keys(healthMonitor.services));
    
    Object.entries(healthMonitor.services).forEach(([service, status]) => {
      console.log(`   ${service}: ${status.status} (last check: ${status.lastCheck})`);
    });

    // Test 2: Test individual service health checks
    console.log('\n2. Testing Individual Service Health Checks...');
    
    const openaiHealth = await healthMonitor.checkService('openai');
    console.log('   OpenAI Health:', {
      status: openaiHealth.status,
      rateLimit: openaiHealth.rateLimit ? 'Available' : 'Not Available'
    });

    const courtlistenerHealth = await healthMonitor.checkService('courtlistener');
    console.log('   CourtListener Health:', {
      status: courtlistenerHealth.status,
      message: courtlistenerHealth.message || 'No message'
    });

    const pdfHealth = await healthMonitor.checkService('pdf');
    console.log('   PDF Service Health:', {
      status: pdfHealth.status,
      providers: pdfHealth.providers || 'Unknown'
    });

    const emailHealth = await healthMonitor.checkService('email');
    console.log('   Email Service Health:', {
      status: emailHealth.status,
      providers: emailHealth.providers || 'Unknown'
    });

    const supabaseHealth = await healthMonitor.checkService('supabase');
    console.log('   Supabase Health:', {
      status: supabaseHealth.status,
      connection: supabaseHealth.connection || 'Unknown'
    });

    // Test 3: Test overall health summary
    console.log('\n3. Testing Health Summary...');
    const healthSummary = healthMonitor.getHealthSummary();
    console.log('   Overall Status:', healthSummary.overall);
    console.log('   Issues Count:', healthSummary.issues || 0);
    console.log('   Timestamp:', healthSummary.timestamp);

    // Test 4: Test circuit breaker status
    console.log('\n4. Testing Circuit Breaker Status...');
    const circuitBreakerStatus = healthMonitor.getCircuitBreakerStatus();
    console.log('   Circuit Breakers:', Object.keys(circuitBreakerStatus));
    
    Object.entries(circuitBreakerStatus).forEach(([service, status]) => {
      console.log(`   ${service}: ${status.state} (failures: ${status.failureCount})`);
    });

    // Test 5: Test detailed health information
    console.log('\n5. Testing Detailed Health Information...');
    const detailedHealth = healthMonitor.getDetailedHealth();
    console.log('   Detailed Health Keys:', Object.keys(detailedHealth));
    console.log('   Environment:', detailedHealth.environment);
    console.log('   Circuit Breakers Count:', Object.keys(detailedHealth.circuitBreakers).length);

    // Test 6: Test all services check
    console.log('\n6. Testing All Services Check...');
    const allServicesHealth = await healthMonitor.checkAllServices();
    console.log('   All Services Check Result:', {
      overall: allServicesHealth.overall,
      services: Object.keys(allServicesHealth.services),
      issues: allServicesHealth.issues || 0
    });

    // Test 7: Test circuit breaker functionality
    console.log('\n7. Testing Circuit Breaker Functionality...');
    
    // Test reset functionality
    const testService = 'test-service';
    circuitBreaker.resetBreaker(testService);
    const resetStatus = circuitBreaker.getBreakerStatus(testService);
    console.log('   Circuit Breaker Reset Test:', {
      service: testService,
      state: resetStatus.state,
      failureCount: resetStatus.failureCount
    });

    // Test 8: Test error handling
    console.log('\n8. Testing Error Handling...');
    try {
      await healthMonitor.checkService('unknown-service');
    } catch (error) {
      console.log('   Error Handling Working:', error.message);
    }

    // Test 9: Test health endpoint simulation
    console.log('\n9. Testing Health Endpoint Simulation...');
    const mockResponse = {
      status: (code) => ({
        json: (data) => {
          console.log('   Mock Response:', {
            statusCode: code,
            status: data.status,
            services: Object.keys(data.services || {}),
            features: Object.keys(data.features || {})
          });
        }
      })
    };

    // Simulate the health endpoint logic
    const healthSummaryForEndpoint = await healthMonitor.checkAllServices();
    const response = {
      status: healthSummaryForEndpoint.overall,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: healthSummaryForEndpoint.services,
      features: {
        realtime: process.env.NODE_ENV !== 'production',
        polling: true,
        authentication: true,
        ai_processing: healthSummaryForEndpoint.services.openai?.status === 'up',
        pdf_processing: healthSummaryForEndpoint.services.pdf?.status === 'up',
        email_notifications: healthSummaryForEndpoint.services.email?.status === 'up'
      },
      circuit_breakers: healthMonitor.getCircuitBreakerStatus()
    };

    const statusCode = healthSummaryForEndpoint.overall === 'unhealthy' ? 503 : 200;
    mockResponse.status(statusCode).json(response);

    console.log('\n✅ Health Monitoring Integration Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ Health Monitoring Integration Test Failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testHealthMonitoring()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testHealthMonitoring }; 