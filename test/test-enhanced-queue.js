// test/test-enhanced-queue.js
const queueService = require('../services/queue.service');

async function testEnhancedQueue() {
  console.log('🧪 Testing enhanced queue functionality...');
  
  try {
    // Test 1: Enhanced retry logic
    console.log('\n📝 Testing enhanced retry logic...');
    
    // Add a test job that will trigger processing
    const testJob = await queueService.add('case', {
      caseId: 'test-case-enhanced-123',
      userId: 'test-user-456',
      caseData: {
        id: 'test-case-enhanced-123',
        case_name: 'Enhanced Queue Test Case',
        case_type: 'Employment',
        case_narrative: 'Test case for enhanced queue functionality'
      },
      webhookType: 'ENHANCED_TEST',
      source: 'enhanced-test'
    });
    
    console.log('✅ Test job added:', testJob.id);
    
    // Test 2: Batch processing simulation
    console.log('\n📦 Testing batch processing...');
    
    // Add multiple test jobs for batch processing
    const batchJobs = [];
    for (let i = 1; i <= 3; i++) {
      const job = await queueService.add('document', {
        documentId: `test-doc-batch-${i}`,
        caseId: 'test-case-batch-123',
        filePath: `test/path/document-${i}.pdf`,
        webhookType: 'BATCH_TEST'
      });
      batchJobs.push(job);
      console.log(`✅ Batch job ${i} added:`, job.id);
    }
    
    // Test 3: Queue statistics
    console.log('\n📊 Testing queue statistics...');
    
    const caseStats = await queueService.getQueueStats('case');
    const documentStats = await queueService.getQueueStats('document');
    
    console.log('Case queue stats:', caseStats);
    console.log('Document queue stats:', documentStats);
    
    // Test 4: Get pending jobs
    console.log('\n🔍 Testing get pending jobs...');
    
    const pendingCaseJobs = await queueService.getPendingJobs('case', 5);
    const pendingDocumentJobs = await queueService.getPendingJobs('document', 5);
    
    console.log(`Pending case jobs: ${pendingCaseJobs.length}`);
    console.log(`Pending document jobs: ${pendingDocumentJobs.length}`);
    
    // Test 5: Simulate batch processing with custom handler
    console.log('\n⚙️ Testing batch processing with custom handler...');
    
    // Override processJob for testing
    queueService.processJob = async (job) => {
      console.log(`Processing job ${job.id} with data:`, job.data);
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      return { success: true, jobId: job.id };
    };
    
    // Process a batch of document jobs
    const batchResult = await queueService.processBatch('document', 2);
    console.log('Batch processing result:', batchResult);
    
    // Test 6: Test retry logic simulation
    console.log('\n🔄 Testing retry logic simulation...');
    
    // Simulate a failed job that would trigger retries
    const failedJob = await queueService.add('case', {
      caseId: 'test-case-failed-123',
      userId: 'test-user-456',
      caseData: {
        id: 'test-case-failed-123',
        case_name: 'Failed Test Case',
        case_type: 'Employment'
      },
      webhookType: 'FAILED_TEST',
      source: 'retry-test'
    });
    
    console.log('✅ Failed test job added:', failedJob.id);
    
    // Simulate marking a job as failed (this would normally happen in triggerProcessing)
    await queueService.markJobFailed(failedJob.id, 'Simulated failure for testing retry logic');
    console.log('✅ Job marked as failed for retry testing');
    
    console.log('\n✅ Enhanced queue functionality test completed successfully!');
    
    // Cleanup: Get final stats
    console.log('\n📊 Final queue statistics:');
    const finalCaseStats = await queueService.getQueueStats('case');
    const finalDocumentStats = await queueService.getQueueStats('document');
    
    console.log('Final case queue stats:', finalCaseStats);
    console.log('Final document queue stats:', finalDocumentStats);
    
  } catch (error) {
    console.error('❌ Enhanced queue test failed:', error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEnhancedQueue()
    .then(() => {
      console.log('\n🎉 All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Tests failed:', error);
      process.exit(1);
    });
}

module.exports = { testEnhancedQueue }; 