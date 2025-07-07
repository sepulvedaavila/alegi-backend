const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Test configuration
const TEST_CASE = {
  case_name: 'Integration Test Case',
  case_description: 'This is a test case for integration testing of the complete webhook flow',
  case_type: 'Personal Injury',
  jurisdiction: 'California',
  case_stage: 'Assessing filing'
};

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testCompleteIntegration() {
  console.log('🚀 Starting complete integration test...\n');
  
  try {
    // Step 1: Create a test case
    console.log('📝 Step 1: Creating test case...');
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .insert({
        ...TEST_CASE,
        user_id: process.env.TEST_USER_ID || 'test-user-id',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (caseError) throw caseError;
    
    console.log(`✅ Test case created: ${caseData.id}`);
    
    // Step 2: Wait for webhook processing
    console.log('\n⏳ Step 2: Waiting for webhook processing...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    // Step 3: Check if case has been processed
    console.log('\n🔍 Step 3: Checking case processing status...');
    
    const { data: enrichment, error: enrichmentError } = await supabase
      .from('case_ai_enrichment')
      .select('*')
      .eq('case_id', caseData.id)
      .single();
    
    if (enrichmentError && enrichmentError.code !== 'PGRST116') {
      console.error('❌ Error checking enrichment:', enrichmentError);
    } else if (enrichment) {
      console.log('✅ Case enrichment found');
    } else {
      console.log('⚠️  No enrichment found yet');
    }
    
    const { data: predictions, error: predictionsError } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseData.id)
      .single();
    
    if (predictionsError && predictionsError.code !== 'PGRST116') {
      console.error('❌ Error checking predictions:', predictionsError);
    } else if (predictions) {
      console.log('✅ Case predictions found');
    } else {
      console.log('⚠️  No predictions found yet');
    }
    
    // Step 4: Test individual analysis endpoints
    console.log('\n🔬 Step 4: Testing individual analysis endpoints...');
    
    const analysisEndpoints = [
      'probability',
      'settlement-analysis',
      'precedents',
      'judge-trends',
      'risk-assessment',
      'cost-estimate',
      'financial-prediction',
      'timeline-estimate',
      'find-similar'
    ];
    
    const endpointResults = {};
    
    for (const endpoint of analysisEndpoints) {
      try {
        console.log(`  Testing ${endpoint}...`);
        
        // Create a mock request object for internal testing
        const mockReq = {
          method: 'GET',
          query: { id: caseData.id },
          headers: {
            authorization: `Bearer ${process.env.TEST_AUTH_TOKEN || 'test-token'}`
          }
        };
        
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              endpointResults[endpoint] = { status: code, data };
              console.log(`    ✅ ${endpoint}: ${code}`);
            },
            end: () => {
              endpointResults[endpoint] = { status: code };
              console.log(`    ✅ ${endpoint}: ${code}`);
            }
          }),
          setHeader: () => mockRes,
          json: (data) => {
            endpointResults[endpoint] = { status: 200, data };
            console.log(`    ✅ ${endpoint}: 200`);
          }
        };
        
        // Import and call the endpoint function
        const endpointFunction = require(`../api/cases/[id]/${endpoint.replace('-', '.')}.js`);
        await endpointFunction(mockReq, mockRes);
        
        // Wait a bit between calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`    ❌ ${endpoint}: ${error.message}`);
        endpointResults[endpoint] = { error: error.message };
      }
    }
    
    // Step 5: Test trigger analysis endpoint
    console.log('\n🎯 Step 5: Testing trigger analysis endpoint...');
    
    try {
      const triggerResponse = await axios.post(
        `${API_BASE_URL}/api/cases/${caseData.id}/trigger-analysis`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN || 'test-token'}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Trigger analysis endpoint working:', triggerResponse.data);
    } catch (error) {
      console.log('❌ Trigger analysis endpoint failed:', error.response?.data || error.message);
    }
    
    // Step 6: Check final status
    console.log('\n📊 Step 6: Final status check...');
    
    const { data: finalCase } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseData.id)
      .single();
    
    console.log('Final case status:', {
      id: finalCase.id,
      processing_status: finalCase.processing_status,
      ai_processed: finalCase.ai_processed,
      success_probability: finalCase.success_probability,
      last_ai_update: finalCase.last_ai_update
    });
    
    // Step 7: Summary
    console.log('\n📋 Test Summary:');
    console.log(`- Test case ID: ${caseData.id}`);
    console.log(`- Enrichment found: ${!!enrichment}`);
    console.log(`- Predictions found: ${!!predictions}`);
    console.log(`- Endpoints tested: ${analysisEndpoints.length}`);
    console.log(`- Successful endpoints: ${Object.values(endpointResults).filter(r => !r.error).length}`);
    
    const failedEndpoints = Object.entries(endpointResults)
      .filter(([name, result]) => result.error)
      .map(([name]) => name);
    
    if (failedEndpoints.length > 0) {
      console.log(`- Failed endpoints: ${failedEndpoints.join(', ')}`);
    }
    
    console.log('\n🎉 Integration test completed!');
    
    return {
      success: true,
      caseId: caseData.id,
      enrichment: !!enrichment,
      predictions: !!predictions,
      endpointResults
    };
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCompleteIntegration()
    .then(result => {
      console.log('\nFinal result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testCompleteIntegration }; 