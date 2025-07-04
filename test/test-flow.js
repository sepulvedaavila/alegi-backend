const supabaseService = require('../services/supabase.service');

async function testCompleteFlow() {
  try {
    // Create a test case
    const { data: testCase, error } = await supabaseService.client
      .from('case_briefs')
      .insert({
        user_id: 'test-user-id',
        case_title: 'Test Case for Flow Validation',
        case_type: 'Civil Rights',
        case_stage: 'Assessing filing',
        jurisdiction: 'Federal',
        case_narrative: 'Test narrative for processing flow'
      })
      .select()
      .single();
      
    if (error) throw error;
    
    console.log('Test case created:', testCase.id);
    
    // Monitor the case processing
    let attempts = 0;
    const maxAttempts = 30;
    
    const checkInterval = setInterval(async () => {
      attempts++;
      
      const { data: enrichment } = await supabaseService.client
        .from('case_ai_enrichment')
        .select('*')
        .eq('case_id', testCase.id)
        .single();
        
      if (enrichment) {
        console.log('✅ Case processed successfully!');
        console.log('Enrichment:', enrichment);
        clearInterval(checkInterval);
        
        // Check predictions
        const { data: prediction } = await supabaseService.client
          .from('case_predictions')
          .select('*')
          .eq('case_id', testCase.id)
          .single();
          
        console.log('Prediction:', prediction);
        
        // Check similar cases
        const { data: similarCases } = await supabaseService.client
          .from('similar_cases')
          .select('*')
          .eq('case_id', testCase.id);
          
        console.log('Similar cases:', similarCases);
      } else if (attempts >= maxAttempts) {
        console.log('❌ Processing timeout');
        clearInterval(checkInterval);
      } else {
        console.log(`⏳ Waiting for processing... (${attempts}/${maxAttempts})`);
      }
    }, 2000);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testCompleteFlow();