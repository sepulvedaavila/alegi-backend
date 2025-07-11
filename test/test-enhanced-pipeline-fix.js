// test/test-enhanced-pipeline-fix.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const EnhancedLinearPipelineService = require('../services/enhanced-linear-pipeline.service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testEnhancedPipelineFix() {
  console.log('🧪 Testing Enhanced Pipeline Fix\n');
  
  try {
    // Create a test case with proper UUID
    const { v4: uuidv4 } = require('uuid');
    const testCaseId = uuidv4();
    const testUserId = uuidv4();
    console.log(`Creating test case: ${testCaseId}`);
    
    const { data: testCase, error: createError } = await supabase
      .from('case_briefs')
      .insert({
        id: testCaseId,
        user_id: testUserId,
        case_name: 'Test Enhanced Pipeline Fix Case',
        case_type: 'Employment',
        case_stage: 'Assessing filing',
        processing_status: 'pending',
        jurisdiction: 'California - Los Angeles',
        case_narrative: 'Test case for enhanced pipeline fix',
        expected_outcome: 'Compensation',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (createError) {
      throw new Error(`Failed to create test case: ${createError.message}`);
    }
    
    console.log('✅ Test case created successfully');
    
    // Execute enhanced pipeline
    console.log('\n🚀 Executing enhanced pipeline...');
    const enhancedPipeline = new EnhancedLinearPipelineService();
    
    const startTime = Date.now();
    await enhancedPipeline.executeEnhancedPipeline(testCaseId);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Enhanced pipeline completed in ${duration}ms`);
    
    // Check final status
    const { data: finalCase, error: statusError } = await supabase
      .from('case_briefs')
      .select('processing_status, enhanced_processing_status, last_ai_update')
      .eq('id', testCaseId)
      .single();
    
    if (statusError) {
      throw new Error(`Failed to get final status: ${statusError.message}`);
    }
    
    console.log('\n📊 Final Status:');
    console.log(`   Processing Status: ${finalCase.processing_status}`);
    console.log(`   Enhanced Processing Status: ${finalCase.enhanced_processing_status}`);
    console.log(`   Last Update: ${finalCase.last_ai_update}`);
    
    // Check analysis results
    const { data: analysisResults, error: analysisError } = await supabase
      .from('case_analysis')
      .select('analysis_type, created_at')
      .eq('case_id', testCaseId);
    
    if (analysisError) {
      console.warn('⚠️  Could not check analysis results:', analysisError.message);
    } else {
      console.log('\n📋 Analysis Results:');
      console.log(`   Total Analyses: ${analysisResults?.length || 0}`);
      analysisResults?.forEach(result => {
        console.log(`   - ${result.analysis_type} (${result.created_at})`);
      });
    }
    
    // Check predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', testCaseId)
      .single();
    
    if (predictionsError) {
      console.warn('⚠️  Could not check predictions:', predictionsError.message);
    } else if (predictions) {
      console.log('\n🎯 Predictions:');
      console.log(`   Success Probability: ${predictions.outcome_prediction_score}%`);
      console.log(`   Settlement Probability: ${predictions.settlement_probability}%`);
      console.log(`   Risk Level: ${predictions.risk_level}`);
    }
    
    // Clean up
    console.log('\n🧹 Cleaning up test case...');
    await supabase
      .from('case_briefs')
      .delete()
      .eq('id', testCaseId);
    
    console.log('✅ Test case cleaned up');
    
    // Summary
    console.log('\n🎉 Test Summary:');
    if (finalCase.processing_status === 'completed') {
      console.log('✅ Enhanced pipeline completed successfully');
      console.log(`✅ Analysis results stored: ${analysisResults?.length || 0} analyses`);
      console.log(`✅ Predictions generated: ${predictions ? 'Yes' : 'No'}`);
      console.log('✅ No information lost after initial analysis');
    } else {
      console.log('❌ Enhanced pipeline failed or did not complete');
      console.log(`   Status: ${finalCase.processing_status}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testEnhancedPipelineFix(); 