const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Test the specific case that's failing
const FAILING_CASE_ID = 'ebeda091-dda7-42b9-88b5-0afdfb026cad';

async function testCostEstimateDebug() {
  console.log('🔍 Debugging cost-estimate endpoint for case:', FAILING_CASE_ID);
  
  // Initialize Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  try {
    // Step 1: Check if the case exists
    console.log('\n📋 Step 1: Checking if case exists...');
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', FAILING_CASE_ID)
      .single();
    
    if (caseError) {
      console.error('❌ Case not found:', caseError);
      return;
    }
    
    console.log('✅ Case found:', {
      id: caseData.id,
      user_id: caseData.user_id,
      case_type: caseData.case_type,
      jurisdiction: caseData.jurisdiction,
      case_stage: caseData.case_stage,
      complexity_score: caseData.complexity_score
    });
    
    // Step 2: Check environment variables
    console.log('\n🔧 Step 2: Checking environment variables...');
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'OPENAI_API_KEY'
    ];
    
    requiredEnvVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
      } else {
        console.log(`❌ ${varName}: NOT SET`);
      }
    });
    
    // Step 3: Test Supabase connection
    console.log('\n🔌 Step 3: Testing Supabase connection...');
    try {
      const { data: testData, error: testError } = await supabase
        .from('case_briefs')
        .select('count')
        .limit(1);
      
      if (testError) {
        console.error('❌ Supabase connection failed:', testError);
      } else {
        console.log('✅ Supabase connection successful');
      }
    } catch (error) {
      console.error('❌ Supabase connection error:', error);
    }
    
    // Step 4: Test OpenAI connection (if available)
    console.log('\n🤖 Step 4: Testing OpenAI connection...');
    if (process.env.OPENAI_API_KEY) {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 5
        });
        console.log('✅ OpenAI connection successful');
      } catch (error) {
        console.error('❌ OpenAI connection failed:', error.message);
      }
    } else {
      console.log('⚠️ OpenAI API key not set');
    }
    
    // Step 5: Test the endpoint logic without authentication
    console.log('\n🎯 Step 5: Testing endpoint logic (bypassing auth)...');
    
    // Import the cost estimate function
    const costEstimateFunction = require('../api/cases/[id]/cost-estimate.js');
    
    // Create a mock request with internal service headers to bypass auth
    const mockReq = {
      method: 'GET',
      query: { id: FAILING_CASE_ID },
      headers: {
        'x-internal-service': 'alegi-backend',
        'x-service-secret': process.env.INTERNAL_SERVICE_SECRET || 'test-secret'
      }
    };
    
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`✅ Endpoint returned status ${code}:`, data);
        },
        end: () => {
          console.log(`✅ Endpoint returned status ${code}`);
        }
      }),
      setHeader: () => mockRes,
      json: (data) => {
        console.log('✅ Endpoint returned 200:', data);
      }
    };
    
    try {
      await costEstimateFunction(mockReq, mockRes);
    } catch (error) {
      console.error('❌ Endpoint test failed:', error);
      console.error('Error stack:', error.stack);
    }
    
    // Step 6: Test with invalid token to see the actual error
    console.log('\n🔐 Step 6: Testing with invalid token...');
    
    const mockReqInvalid = {
      method: 'GET',
      query: { id: FAILING_CASE_ID },
      headers: {
        authorization: 'Bearer invalid-token'
      }
    };
    
    const mockResInvalid = {
      status: (code) => ({
        json: (data) => {
          console.log(`🔐 Invalid token returned status ${code}:`, data);
        },
        end: () => {
          console.log(`🔐 Invalid token returned status ${code}`);
        }
      }),
      setHeader: () => mockResInvalid,
      json: (data) => {
        console.log('🔐 Invalid token returned 200:', data);
      }
    };
    
    try {
      await costEstimateFunction(mockReqInvalid, mockResInvalid);
    } catch (error) {
      console.error('❌ Invalid token test failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Debug test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testCostEstimateDebug()
    .then(() => {
      console.log('\n🎉 Debug test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Debug test failed:', error);
      process.exit(1);
    });
}

module.exports = { testCostEstimateDebug }; 