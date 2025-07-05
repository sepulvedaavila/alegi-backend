require('dotenv').config();

const queueService = require('../services/queue.service');
const { createClient } = require('@supabase/supabase-js');

// Initialize workers
require('../workers/case.worker');
require('../workers/document.worker');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function manuallyProcessCase() {
  // Get a stuck case
  const { data: stuckCase, error } = await supabase
    .from('case_briefs')
    .select('*')
    .eq('processing_status', 'processing')
    .eq('ai_processed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !stuckCase) {
    console.log('No stuck cases found');
    return;
  }

  console.log('Found stuck case:', stuckCase.case_name);
  console.log('Case ID:', stuckCase.id);
  console.log('Created:', stuckCase.created_at);
  console.log('Last AI Update:', stuckCase.last_ai_update);
  
  console.log('\nAdding to queue for reprocessing...');
  
  // Add to processing queue
  const job = await queueService.add('case-processing', {
    caseId: stuckCase.id,
    userId: stuckCase.user_id,
    caseData: stuckCase,
    webhookType: 'MANUAL_REPROCESS',
    source: 'manual-test'
  });
  
  console.log('Job added:', job.id);
  console.log('\nWaiting for processing... (this may take up to 60 seconds due to rate limits)');
  
  // Monitor the case status
  let attempts = 0;
  const maxAttempts = 20; // 2 minutes max
  
  const checkInterval = setInterval(async () => {
    attempts++;
    
    const { data: updatedCase, error: checkError } = await supabase
      .from('case_briefs')
      .select('processing_status, ai_processed')
      .eq('id', stuckCase.id)
      .single();
    
    if (checkError) {
      console.error('Error checking status:', checkError);
      clearInterval(checkInterval);
      return;
    }
    
    console.log(`Attempt ${attempts}: Status = ${updatedCase.processing_status}, AI Processed = ${updatedCase.ai_processed}`);
    
    if (updatedCase.processing_status !== 'processing' || updatedCase.ai_processed || attempts >= maxAttempts) {
      clearInterval(checkInterval);
      
      if (updatedCase.ai_processed) {
        console.log('\n✅ Case successfully processed!');
      } else if (updatedCase.processing_status === 'failed') {
        console.log('\n❌ Case processing failed!');
        
        // Check for errors
        const { data: errors } = await supabase
          .from('processing_errors')
          .select('*')
          .eq('case_id', stuckCase.id)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (errors && errors.length > 0) {
          console.log('Error details:', errors[0].error_message);
        }
      } else if (attempts >= maxAttempts) {
        console.log('\n⏱️  Timeout - case still processing after 2 minutes');
      }
      
      process.exit(0);
    }
  }, 6000); // Check every 6 seconds
}

// Run the manual processing
manuallyProcessCase().catch(error => {
  console.error('Failed:', error);
  process.exit(1);
});