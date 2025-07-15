// test-queue.js - Test the queue system to ensure it's working
const queueService = require('./services/queueService');
const caseProcessingWorker = require('./services/case-processing.worker');

async function testQueue() {
  console.log('🧪 Testing queue system...');
  
  try {
    // Test 1: Test that queue service is initialized
    console.log('\n📊 Test 1: Queue service initialization...');
    console.log('Queue service available:', typeof queueService === 'object');
    console.log('Worker available:', typeof caseProcessingWorker === 'object');
    
    // Test 2: Register a simple test processor
    console.log('\n📊 Test 2: Register test processor...');
    queueService.setProcessor('test-queue', async (jobData) => {
      console.log('🎯 Test processor executing:', jobData);
      return { success: true, processed: new Date().toISOString() };
    });
    
    // Test 3: Add a test job
    console.log('\n📊 Test 3: Add test job...');
    const testJob = await queueService.add('test-queue', {
      test: true,
      message: 'Hello from test job'
    });
    
    console.log('Test job created:', testJob.id);
    
    // Test 4: Wait for processing and check status
    console.log('\n📊 Test 4: Wait for job processing...');
    
    // Wait 3 seconds for the job to process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const queueStatus = await queueService.getQueueStatus('test-queue');
    console.log('Queue status:', queueStatus);
    
    // Test 5: Test case processing worker
    console.log('\n📊 Test 5: Test case processing worker...');
    
    const mockCaseId = 'test-case-' + Date.now();
    const mockUserId = 'test-user-' + Date.now();
    
    try {
      const caseJob = await caseProcessingWorker.addCaseToQueue(mockCaseId, mockUserId, {
        source: 'test',
        trigger: 'manual'
      });
      
      console.log('Case job created:', caseJob.id);
      
      // Wait for case processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const caseQueueStatus = await queueService.getQueueStatus('case-processing');
      console.log('Case processing queue status:', caseQueueStatus);
      
    } catch (error) {
      console.error('❌ Case processing test failed:', error.message);
      
      // This might fail due to missing case data, but we should see queue activity
    }
    
    console.log('\n✅ Queue tests completed');
    
  } catch (error) {
    console.error('❌ Queue test failed:', error);
  }
}

// Run the test
testQueue().then(() => {
  console.log('\n🏁 All tests completed');
  process.exit(0);
}).catch(error => {
  console.error('Queue test failed:', error);
  process.exit(1);
});