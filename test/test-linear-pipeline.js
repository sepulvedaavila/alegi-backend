// test/test-linear-pipeline.js
const LinearPipelineService = require('../services/linear-pipeline.service');

async function testLinearPipeline() {
  console.log('Testing Linear Pipeline Service...');
  
  try {
    const pipelineService = new LinearPipelineService();
    
    // Test with a mock case ID
    const testCaseId = 'test-case-123';
    
    console.log(`Starting pipeline test for case: ${testCaseId}`);
    
    const result = await pipelineService.executeLinearPipeline(testCaseId);
    
    console.log('Pipeline completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Pipeline test failed:', error);
    console.error('Error details:', error.message);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testLinearPipeline();
}

module.exports = { testLinearPipeline }; 