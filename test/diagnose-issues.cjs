require('dotenv').config();

async function runDiagnostics() {
  console.log('=== DIAGNOSING ALEGI BACKEND ISSUES ===\n');

  // 1. Check environment variables
  console.log('1. ENVIRONMENT VARIABLES CHECK:');
  console.log('-----------------------------------');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('PDF_CO_API_KEY:', process.env.PDF_CO_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('PDFCO_API_KEY:', process.env.PDFCO_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configured' : '❌ Missing');
  console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ Configured' : '❌ Missing');

  // 2. Check AI Service configuration
  console.log('\n2. AI SERVICE CONFIGURATION:');
  console.log('-----------------------------------');
  const aiService = require('../services/ai.service');
  const aiConfig = require('../services/ai.config');

  if (aiService.isMock) {
    console.log('❌ AI Service is running in MOCK mode (no OpenAI API key)');
  } else {
    console.log('✅ AI Service is configured with real OpenAI API');
    const limits = aiConfig.getLimitsForEnvironment();
    console.log('Rate Limits for environment:', process.env.NODE_ENV || 'development');
    console.log('- RPM (Requests Per Minute):', JSON.stringify(limits.rpm, null, 2));
    console.log('- TPM (Tokens Per Minute):', JSON.stringify(limits.tpm, null, 2));
    console.log('- Delay between calls:', aiConfig.delayBetweenCalls, 'ms');
  }

  // 3. Check current rate limit status
  console.log('\n3. CURRENT RATE LIMIT STATUS:');
  console.log('-----------------------------------');
  const rateLimitStatus = aiService.getRateLimitStatus();
  console.log('Current minute:', rateLimitStatus.currentMinute);
  console.log('Requests this minute:', rateLimitStatus.requestsThisMinute);
  console.log('Tokens this minute:', rateLimitStatus.tokensThisMinute);

  // 4. Check if workers are initialized
  console.log('\n4. WORKER INITIALIZATION:');
  console.log('-----------------------------------');
  try {
    // Initialize workers
    require('../workers/case.worker');
    require('../workers/document.worker');
    console.log('✅ Workers initialized successfully');
  } catch (error) {
    console.log('❌ Worker initialization failed:', error.message);
  }

  // 5. Check queue processing
  console.log('\n5. QUEUE PROCESSING TEST:');
  console.log('-----------------------------------');
  const queueService = require('../services/queue.service');

  // Register a test processor
  let testProcessed = false;
  queueService.process('diagnostic-test', async (job) => {
    console.log('✅ Queue processor received job:', job.data);
    testProcessed = true;
  });

  // Add a test job
  const testJob = await queueService.add('diagnostic-test', {
    test: true,
    timestamp: new Date().toISOString()
  });

  console.log('Test job added:', testJob.id);

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (testProcessed) {
    console.log('✅ Queue processing is working correctly');
  } else {
    console.log('❌ Queue processing is NOT working');
  }

  // 6. Check for recent processing errors
  console.log('\n6. RECENT PROCESSING ERRORS:');
  console.log('-----------------------------------');
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: errors, error: errorFetchError } = await supabase
    .from('processing_errors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (errorFetchError) {
    console.log('❌ Could not fetch processing errors:', errorFetchError.message);
  } else if (errors && errors.length > 0) {
    console.log(`Found ${errors.length} recent errors:`);
    errors.forEach((err, index) => {
      console.log(`\nError ${index + 1}:`);
      console.log('- Case ID:', err.case_id);
      console.log('- Error:', err.error_message);
      console.log('- Created at:', err.created_at);
    });
  } else {
    console.log('✅ No recent processing errors found');
  }

  // 7. Check recent case processing status
  console.log('\n7. RECENT CASE PROCESSING STATUS:');
  console.log('-----------------------------------');
  const { data: recentCases, error: caseFetchError } = await supabase
    .from('case_briefs')
    .select('id, case_name, processing_status, ai_processed, created_at, last_ai_update')
    .order('created_at', { ascending: false })
    .limit(5);

  if (caseFetchError) {
    console.log('❌ Could not fetch recent cases:', caseFetchError.message);
  } else if (recentCases && recentCases.length > 0) {
    console.log(`Found ${recentCases.length} recent cases:`);
    recentCases.forEach((c, index) => {
      console.log(`\nCase ${index + 1}: ${c.case_name}`);
      console.log('- ID:', c.id);
      console.log('- Processing Status:', c.processing_status || 'not set');
      console.log('- AI Processed:', c.ai_processed ? '✅' : '❌');
      console.log('- Created:', c.created_at);
      console.log('- Last AI Update:', c.last_ai_update || 'never');
    });
  } else {
    console.log('No recent cases found');
  }

  console.log('\n=== DIAGNOSIS SUMMARY ===');
  console.log('-----------------------------------');

  const issues = [];

  if (!process.env.OPENAI_API_KEY) {
    issues.push('❌ OpenAI API key is missing - AI processing will use mock responses');
  }

  if (!process.env.PDF_CO_API_KEY && !process.env.PDFCO_API_KEY) {
    issues.push('❌ PDF.co API key is missing - PDF text extraction will fail');
  }

  if (rateLimitStatus.requestsThisMinute >= 5) {
    issues.push('⚠️  High request rate detected - may hit rate limits');
  }

  if (issues.length === 0) {
    console.log('✅ All systems appear to be configured correctly');
  } else {
    console.log('Issues found:');
    issues.forEach(issue => console.log(issue));
  }

  console.log('\n=== RECOMMENDATIONS ===');
  console.log('-----------------------------------');
  console.log('1. If OpenAI is not processing:');
  console.log('   - Check if OPENAI_API_KEY is set in .env file');
  console.log('   - Verify the API key is valid and has credits');
  console.log('   - Check if rate limits are being hit (wait 60 seconds)');
  console.log('\n2. If PDF.co is not processing:');
  console.log('   - Set PDF_CO_API_KEY or PDFCO_API_KEY in .env file');
  console.log('   - Verify the API key is valid');
  console.log('\n3. If cases are stuck in "processing" status:');
  console.log('   - Check processing_errors table for details');
  console.log('   - Use manual trigger endpoint: POST /api/cases/:caseId/process');
  console.log('   - Check worker logs for errors');

  process.exit(0);
}

// Run the diagnostics
runDiagnostics().catch(error => {
  console.error('Diagnostic failed:', error);
  process.exit(1);
});