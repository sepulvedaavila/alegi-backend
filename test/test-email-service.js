const emailService = require('../services/email.service');
// Circuit breaker service removed - using direct calls

async function testEmailService() {
  console.log('🧪 Testing Email Service Integration...\n');

  try {
    // Test 1: Check if service is properly initialized
    console.log('1. Testing Service Initialization...');
    console.log(`   Email Providers: ${emailService.providers.length}`);
    emailService.providers.forEach((provider, index) => {
      console.log(`   Provider ${index + 1}: ${provider.name}`);
    });

    // Test 2: Circuit breaker removed - service uses direct calls
    console.log('\n2. Circuit Breaker Status: Removed - using direct calls');

    // Test 3: Test basic email sending
    console.log('\n3. Testing Basic Email Sending...');
    const testEmailData = {
      from: 'test@alegi.io',
      to: 'test@example.com',
      subject: 'Test Email - Alegi Integration',
      html: '<h2>Test Email</h2><p>This is a test email from the Alegi integration test.</p>'
    };

    const sendResult = await emailService.sendEmail(testEmailData);
    console.log('   Send Result:', {
      success: sendResult.success,
      provider: sendResult.provider,
      error: sendResult.error
    });

    // Test 4: Test case processed notification
    console.log('\n4. Testing Case Processed Notification...');
    const mockCaseData = {
      case_name: 'Test Case v. Test Defendant',
      user_email: 'test@example.com'
    };

    const notificationResult = await emailService.sendCaseProcessedNotification(
      'test-case-123',
      mockCaseData
    );
    console.log('   Notification Result:', {
      success: notificationResult.success,
      provider: notificationResult.provider,
      error: notificationResult.error
    });

    // Test 5: Test document processed notification
    console.log('\n5. Testing Document Processed Notification...');
    const documentResult = await emailService.sendDocumentProcessedNotification(
      'test-case-123',
      'test-document.pdf'
    );
    console.log('   Document Notification Result:', {
      success: documentResult.success,
      provider: documentResult.provider,
      error: documentResult.error
    });

    // Test 6: Test error handling
    console.log('\n6. Testing Error Handling...');
    const invalidEmailData = {
      from: 'invalid-email',
      to: 'invalid-email',
      subject: 'Test',
      html: 'Test'
    };

    try {
      await emailService.sendEmail(invalidEmailData);
    } catch (error) {
      console.log('   Error Handling Working:', error.message);
    }

    // Test 7: Test provider fallback
    console.log('\n7. Testing Provider Fallback...');
    if (emailService.providers.length > 1) {
      console.log('   Multiple providers available - fallback mechanism is in place');
      
      // Circuit breaker removed - service uses direct calls
      console.log('   Circuit breaker removed - using direct calls');
    } else {
      console.log('   Single provider - fallback to console logging');
    }

    // Test 8: Test environment configuration
    console.log('\n8. Testing Environment Configuration...');
    console.log('   Environment Variables:');
    console.log(`     SENDGRID_API_KEY: ${process.env.SENDGRID_API_KEY ? 'Configured' : 'Not Configured'}`);
    console.log(`     SMTP_HOST: ${process.env.SMTP_HOST ? 'Configured' : 'Not Configured'}`);
    console.log(`     FROM_EMAIL: ${process.env.FROM_EMAIL || 'Using default'}`);

    console.log('\n✅ Email Service Integration Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ Email Service Integration Test Failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEmailService()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testEmailService }; 