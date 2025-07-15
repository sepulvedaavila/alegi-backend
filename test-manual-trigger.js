// test-manual-trigger.js - Test manual case processing triggers
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const caseProcessingWorker = require('./services/case-processing.worker');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testManualTriggers() {
  console.log('🧪 Testing manual case processing triggers...');

  try {
    // Test 1: Create a test case to work with
    console.log('\n📊 Test 1: Creating test case...');
    
    let testCaseId = `test-manual-${Date.now()}`;
    let testUserId = `test-user-${Date.now()}`;
    
    const { data: newCase, error: createError } = await supabase
      .from('case_briefs')
      .insert({
        id: testCaseId,
        user_id: testUserId,
        case_name: 'Manual Trigger Test Case',
        case_type: 'contract_dispute',
        case_stage: 'discovery',
        jurisdiction: 'federal',
        processing_status: 'pending'
      })
      .select()
      .single();

    if (createError) {
      console.log('⚠️ Could not create test case (likely using mock database)');
      console.log('📝 Using mock case ID for testing');
      testCaseId = 'mock-case-' + Date.now();
      testUserId = 'mock-user-' + Date.now();
    } else {
      console.log(`✅ Created test case: ${testCaseId}`);
    }

    // Test 2: Direct worker trigger
    console.log('\n📊 Test 2: Direct worker trigger...');
    
    const job = await caseProcessingWorker.addCaseToQueue(testCaseId, testUserId, {
      source: 'manual_test',
      trigger: 'direct_worker',
      priority: 3
    });
    
    console.log(`✅ Case added to queue directly: ${job.id}`);

    // Test 3: Check queue status
    console.log('\n📊 Test 3: Check queue status...');
    
    const queueService = require('./services/queueService');
    const queueStats = await queueService.getQueueStatus('case-processing');
    
    console.log('Queue Statistics:', queueStats);

    // Test 4: Get case processing status
    console.log('\n📊 Test 4: Get case processing status...');
    
    const status = await caseProcessingWorker.getCaseProcessingStatus(testCaseId);
    console.log('Case Status:', status);

    // Wait for processing to complete
    console.log('\n⏳ Waiting for processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Final queue check
    const finalStats = await queueService.getQueueStatus('case-processing');
    console.log('Final Queue Statistics:', finalStats);

    console.log('\n✅ Manual trigger tests completed successfully!');

  } catch (error) {
    console.error('❌ Manual trigger test failed:', error);
  }
}

testManualTriggers().then(() => {
  console.log('\n🏁 All manual trigger tests completed');
  process.exit(0);
}).catch(error => {
  console.error('Manual trigger test failed:', error);
  process.exit(1);
});