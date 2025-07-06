const { testOpenAIIntegration } = require('./test-openai-integration');
const { testCourtListenerIntegration } = require('./test-courtlistener-integration');
const { testPDFProcessing } = require('./test-pdf-processing');
const { testEmailService } = require('./test-email-service');
const { testHealthMonitoring } = require('./test-health-monitoring');

async function testCompleteIntegration() {
  console.log('🚀 Starting Complete Integration Test Suite...\n');
  
  const results = {
    openai: false,
    courtlistener: false,
    pdf: false,
    email: false,
    health: false
  };

  try {
    // Test 1: OpenAI Integration
    console.log('='.repeat(60));
    console.log('TEST 1: OpenAI Integration');
    console.log('='.repeat(60));
    results.openai = await testOpenAIIntegration();

    // Test 2: CourtListener Integration
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: CourtListener Integration');
    console.log('='.repeat(60));
    results.courtlistener = await testCourtListenerIntegration();

    // Test 3: PDF Processing Integration
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: PDF Processing Integration');
    console.log('='.repeat(60));
    results.pdf = await testPDFProcessing();

    // Test 4: Email Service Integration
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: Email Service Integration');
    console.log('='.repeat(60));
    results.email = await testEmailService();

    // Test 5: Health Monitoring Integration
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5: Health Monitoring Integration');
    console.log('='.repeat(60));
    results.health = await testHealthMonitoring();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('INTEGRATION TEST SUMMARY');
    console.log('='.repeat(60));
    
    const passedTests = Object.values(results).filter(result => result).length;
    const totalTests = Object.keys(results).length;
    
    Object.entries(results).forEach(([service, result]) => {
      const status = result ? '✅ PASSED' : '❌ FAILED';
      console.log(`${service.padEnd(15)}: ${status}`);
    });
    
    console.log('\n' + '-'.repeat(60));
    console.log(`Overall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL INTEGRATION TESTS PASSED!');
      console.log('✅ The Alegi backend is ready for production deployment.');
    } else {
      console.log('⚠️  Some tests failed. Please review the issues above.');
      console.log('🔧 Check the individual test outputs for specific problems.');
    }

    // Environment Check
    console.log('\n' + '='.repeat(60));
    console.log('ENVIRONMENT CHECK');
    console.log('='.repeat(60));
    
    const envVars = [
      'NODE_ENV',
      'OPENAI_API_KEY',
      'COURTLISTENER_API_KEY',
      'PDF_CO_API_KEY',
      'SENDGRID_API_KEY',
      'SMTP_HOST',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY'
    ];
    
    envVars.forEach(varName => {
      const value = process.env[varName];
      const status = value ? '✅ Configured' : '❌ Missing';
      console.log(`${varName.padEnd(20)}: ${status}`);
    });

    // Production Readiness Assessment
    console.log('\n' + '='.repeat(60));
    console.log('PRODUCTION READINESS ASSESSMENT');
    console.log('='.repeat(60));
    
    const criticalServices = ['openai', 'health'];
    const criticalPassed = criticalServices.every(service => results[service]);
    
    if (criticalPassed) {
      console.log('✅ Critical services are working properly');
    } else {
      console.log('❌ Critical services have issues that must be resolved');
    }
    
    const optionalServices = ['courtlistener', 'pdf', 'email'];
    const optionalPassed = optionalServices.filter(service => results[service]).length;
    
    console.log(`📊 Optional services: ${optionalPassed}/${optionalServices.length} working`);
    
    if (passedTests >= 3) {
      console.log('✅ System is ready for production deployment');
    } else {
      console.log('⚠️  System needs additional fixes before production');
    }

    return passedTests === totalTests;

  } catch (error) {
    console.error('\n❌ Integration test suite failed:', error.message);
    return false;
  }
}

// Run the complete integration test if this file is executed directly
if (require.main === module) {
  testCompleteIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Integration test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testCompleteIntegration }; 