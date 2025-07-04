// test/test-queue-system.js
const queueService = require('../services/queue.service');

async function testQueueSystem() {
  console.log('🧪 Testing queue system...');
  
  try {
    // Test 1: Add a job to the queue
    console.log('\n📝 Adding test job to case-processing queue...');
    const testJob = await queueService.add('case-processing', {
      caseId: 'test-case-123',
      userId: 'test-user-456',
      caseData: {
        id: 'test-case-123',
        case_name: 'Test Case for Queue',
        case_type: 'Employment',
        case_narrative: 'Test case for queue system verification'
      },
      webhookType: 'TEST',
      source: 'test'
    });
    
    console.log('✅ Job added successfully:', testJob.id);
    
    // Test 2: Check queue status
    console.log('\n📊 Queue status:');
    console.log('- case-processing queue exists:', queueService.queues.has('case-processing'));
    console.log('- document-processing queue exists:', queueService.queues.has('document-processing'));
    
    // Test 3: Test document processing queue
    console.log('\n📄 Adding test job to document-processing queue...');
    const docJob = await queueService.add('document-processing', {
      documentId: 'test-doc-789',
      caseId: 'test-case-123',
      filePath: 'test/path/document.pdf',
      webhookType: 'TEST_DOCUMENT'
    });
    
    console.log('✅ Document job added successfully:', docJob.id);
    
    // Test 4: Check processing status
    console.log('\n⚙️ Processing status:');
    console.log('- case-processing jobs:', queueService.queues.get('case-processing')?.length || 0);
    console.log('- document-processing jobs:', queueService.queues.get('document-processing')?.length || 0);
    console.log('- active processing jobs:', queueService.processing.size);
    
    // Test 5: Test job retrieval
    console.log('\n🔍 Testing job retrieval...');
    const caseQueue = queueService.queues.get('case-processing');
    const docQueue = queueService.queues.get('document-processing');
    
    if (caseQueue && caseQueue.length > 0) {
      console.log('- First case job:', caseQueue[0].id);
      console.log('- Case job data:', caseQueue[0].data.caseId);
    }
    
    if (docQueue && docQueue.length > 0) {
      console.log('- First document job:', docQueue[0].id);
      console.log('- Document job data:', docQueue[0].data.documentId);
    }
    
    console.log('\n✅ Queue system test completed successfully!');
    
    // Cleanup: Remove test jobs
    console.log('\n🧹 Cleaning up test jobs...');
    
    if (caseQueue) {
      caseQueue.length = 0; // Clear queue
    }
    if (docQueue) {
      docQueue.length = 0; // Clear queue
    }
    
    console.log('✅ Test cleanup completed');
    
  } catch (error) {
    console.error('❌ Queue system test failed:', error);
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testQueueSystem()
    .then(() => {
      console.log('\n🎉 Queue system test completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Queue system test failed:', error);
      process.exit(1);
    });
}

module.exports = { testQueueSystem }; 