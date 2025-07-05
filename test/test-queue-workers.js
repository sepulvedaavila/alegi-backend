require('dotenv').config();

const queueService = require('../services/queue.service');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize workers
console.log('Initializing workers...');
require('../workers/case.worker');
require('../workers/document.worker');

async function testQueueSystem() {
  console.log('Testing queue system...\n');

  // Test 1: Check if queue service is working
  console.log('1. Testing queue service...');
  const testJob = await queueService.add('test-queue', {
    test: true,
    timestamp: new Date().toISOString()
  });
  console.log('✓ Queue service working, job added:', testJob.id);

  // Test 2: Check if case worker is processing
  console.log('\n2. Testing case worker...');
  
  // First, let's find a test case or create one
  const { data: cases, error: fetchError } = await supabase
    .from('case_briefs')
    .select('id, user_id, case_name')
    .limit(1);

  if (fetchError) {
    console.error('✗ Error fetching cases:', fetchError);
    return;
  }

  if (cases && cases.length > 0) {
    const testCase = cases[0];
    console.log(`Found test case: ${testCase.case_name} (${testCase.id})`);
    
    // Add a case processing job
    const caseJob = await queueService.add('case-processing', {
      caseId: testCase.id,
      userId: testCase.user_id,
      caseData: testCase,
      webhookType: 'TEST',
      source: 'test-script'
    });
    
    console.log('✓ Case processing job added:', caseJob.id);
    
    // Wait a bit to see if it processes
    console.log('Waiting 5 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check case status
    const { data: updatedCase, error: statusError } = await supabase
      .from('case_briefs')
      .select('processing_status, ai_processed')
      .eq('id', testCase.id)
      .single();
    
    if (statusError) {
      console.error('✗ Error checking case status:', statusError);
    } else {
      console.log('Case status after processing:', {
        processing_status: updatedCase.processing_status,
        ai_processed: updatedCase.ai_processed
      });
    }
  } else {
    console.log('✗ No cases found to test with');
  }

  // Test 3: Check queue event listeners
  console.log('\n3. Testing queue event listeners...');
  let listenerWorking = false;
  
  queueService.process('test-listener', async (job) => {
    console.log('✓ Test listener received job:', job.id);
    listenerWorking = true;
  });
  
  await queueService.add('test-listener', { test: true });
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  if (listenerWorking) {
    console.log('✓ Queue listeners are working');
  } else {
    console.log('✗ Queue listeners not responding');
  }

  // Test 4: Check OpenAI service
  console.log('\n4. Testing OpenAI service...');
  try {
    const aiService = require('../services/ai.service');
    const rateLimitStatus = aiService.getRateLimitStatus();
    console.log('✓ OpenAI service loaded, rate limit status:', rateLimitStatus);
    
    if (aiService.isMock) {
      console.log('⚠️  OpenAI is running in mock mode (no API key configured)');
    } else {
      console.log('✓ OpenAI service is configured with real API');
    }
  } catch (error) {
    console.error('✗ Error loading OpenAI service:', error.message);
  }

  // Test 5: Check PDFco service
  console.log('\n5. Testing PDFco service...');
  try {
    const pdfcoService = require('../services/pdfco.service');
    const hasPDFcoKey = !!process.env.PDFCO_API_KEY;
    console.log(`✓ PDFco service loaded, API key configured: ${hasPDFcoKey}`);
  } catch (error) {
    console.error('✗ Error loading PDFco service:', error.message);
  }

  console.log('\n✅ Queue system test complete!');
  
  // Keep the process running for a bit to see any async operations
  console.log('\nKeeping process alive for 10 seconds to observe any background processing...');
  setTimeout(() => {
    console.log('\nTest complete. Exiting...');
    process.exit(0);
  }, 10000);
}

// Run the test
testQueueSystem().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});