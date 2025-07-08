// test/test-processing-service.js - Test script to diagnose processing service issues

const { processingService } = require('../services');

async function testProcessingService() {
  console.log('=== Processing Service Diagnosis ===\n');
  
  try {
    // Test 1: Check if processing service is loaded
    console.log('1. Testing processing service loading...');
    if (!processingService) {
      console.log('❌ Processing service is null/undefined');
      return;
    }
    console.log('✅ Processing service loaded successfully');
    
    // Test 2: Check if methods exist
    console.log('\n2. Testing method availability...');
    const requiredMethods = ['processDocument', 'triggerAnalysisForExistingCase'];
    for (const method of requiredMethods) {
      if (typeof processingService[method] === 'function') {
        console.log(`✅ Method ${method} exists`);
      } else {
        console.log(`❌ Method ${method} missing or not a function`);
      }
    }
    
    // Test 3: Check Supabase connection
    console.log('\n3. Testing Supabase connection...');
    if (processingService.supabase) {
      console.log('✅ Supabase client exists');
      
      // Test database connection
      try {
        const { data, error } = await processingService.supabase
          .from('case_briefs')
          .select('id')
          .limit(1);
        
        if (error) {
          console.log(`❌ Database connection failed: ${error.message}`);
        } else {
          console.log('✅ Database connection successful');
        }
      } catch (dbError) {
        console.log(`❌ Database test failed: ${dbError.message}`);
      }
    } else {
      console.log('❌ Supabase client not initialized');
    }
    
    // Test 4: Check environment variables
    console.log('\n4. Testing environment variables...');
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'OPENAI_API_KEY'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`✅ ${envVar} is set`);
      } else {
        console.log(`❌ ${envVar} is missing`);
      }
    }
    
    // Test 5: Test trigger analysis method (with mock data)
    console.log('\n5. Testing trigger analysis method...');
    try {
      const testCaseId = 'test-case-123';
      const testUserId = 'test-user-456';
      
      console.log(`Testing with case ID: ${testCaseId}, user ID: ${testUserId}`);
      
      // This should either succeed or fail gracefully
      const result = await processingService.triggerAnalysisForExistingCase(testCaseId, testUserId);
      console.log('✅ Trigger analysis method executed successfully');
      console.log('Result:', result);
    } catch (error) {
      console.log(`❌ Trigger analysis method failed: ${error.message}`);
      console.log('Error details:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testProcessingService().then(() => {
  console.log('\n=== Diagnosis Complete ===');
  process.exit(0);
}).catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
}); 