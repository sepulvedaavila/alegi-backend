require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://alegi-backend.vercel.app' 
  : 'http://localhost:3000';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function diagnoseWebhookPipeline() {
  console.log('🔍 DIAGNOSING WEBHOOK PROCESSING PIPELINE\n');
  console.log('Base URL:', BASE_URL);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  
  const diagnostics = {
    apiAccessibility: false,
    webhookEndpoints: {},
    supabaseConnection: false,
    serviceInitialization: false,
    pipelineExecution: false,
    environmentVariables: {}
  };

  // Check 1: API Accessibility
  console.log('\n1. Checking API accessibility...');
  try {
    const healthResponse = await axios.get(`${BASE_URL}/api`, { timeout: 10000 });
    console.log('✅ API is accessible');
    console.log('   Status:', healthResponse.status);
    console.log('   Response:', healthResponse.data);
    diagnostics.apiAccessibility = true;
  } catch (error) {
    console.log('❌ API is not accessible');
    console.log('   Error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }

  // Check 2: Environment Variables
  console.log('\n2. Checking environment variables...');
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'OPENAI_API_KEY',
    'SUPABASE_WEBHOOK_SECRET'
  ];
  
  for (const envVar of requiredEnvVars) {
    const hasValue = !!process.env[envVar];
    diagnostics.environmentVariables[envVar] = hasValue;
    console.log(`${hasValue ? '✅' : '❌'} ${envVar}: ${hasValue ? 'Set' : 'Missing'}`);
  }

  // Check 3: Supabase Connection
  console.log('\n3. Testing Supabase connection...');
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ Supabase connection successful');
    diagnostics.supabaseConnection = true;
  } catch (error) {
    console.log('❌ Supabase connection failed');
    console.log('   Error:', error.message);
  }

  // Check 4: Webhook Endpoints
  console.log('\n4. Testing webhook endpoints...');
  
  const testPayload = {
    type: "INSERT",
    table: "case_briefs",
    record: {
      id: "diagnostic-test-" + Date.now(),
      user_id: "diagnostic-user-" + Date.now(),
      case_name: "Diagnostic Test Case",
      case_type: "Employment",
      case_stage: "Assessing filing",
      created_at: new Date().toISOString()
    },
    schema: "public",
    old_record: null
  };

  const webhookEndpoints = [
    '/api/webhooks/universal',
    '/api/webhooks/external/case-briefs',
    '/api/webhooks/supabase/case-created'
  ];

  for (const endpoint of webhookEndpoints) {
    try {
      console.log(`   Testing ${endpoint}...`);
      const response = await axios.post(`${BASE_URL}${endpoint}`, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Diagnostic-Test/1.0'
        },
        timeout: 15000
      });
      
      console.log(`   ✅ ${endpoint} - Status: ${response.status}`);
      diagnostics.webhookEndpoints[endpoint] = {
        accessible: true,
        status: response.status,
        response: response.data
      };
    } catch (error) {
      console.log(`   ❌ ${endpoint} - Failed`);
      console.log(`      Status: ${error.response?.status || 'No response'}`);
      console.log(`      Error: ${error.message}`);
      diagnostics.webhookEndpoints[endpoint] = {
        accessible: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  // Check 5: Service Initialization
  console.log('\n5. Testing service initialization...');
  try {
    const EnhancedLinearPipelineService = require('../services/enhanced-linear-pipeline.service');
    const pipeline = new EnhancedLinearPipelineService();
    
    console.log('✅ Enhanced Linear Pipeline Service initialized');
    diagnostics.serviceInitialization = true;
    
    // Test a simple pipeline execution with a mock case
    console.log('   Testing pipeline execution...');
    const mockCaseId = 'diagnostic-pipeline-test-' + Date.now();
    
    // Create a test case in database
    const { data: testCase, error: caseError } = await supabase
      .from('case_briefs')
      .insert({
        id: mockCaseId,
        user_id: 'diagnostic-user',
        case_name: 'Pipeline Test Case',
        case_type: 'Employment',
        case_stage: 'Assessing filing',
        processing_status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (caseError) {
      console.log('   ❌ Failed to create test case:', caseError.message);
    } else {
      console.log('   ✅ Test case created for pipeline testing');
      
      // Test pipeline execution (this might fail but we want to see where)
      try {
        await pipeline.executeEnhancedPipeline(mockCaseId);
        console.log('   ✅ Pipeline execution completed successfully');
        diagnostics.pipelineExecution = true;
      } catch (error) {
        console.log('   ❌ Pipeline execution failed:', error.message);
        console.log('   Stack:', error.stack);
      }
    }
    
  } catch (error) {
    console.log('❌ Service initialization failed');
    console.log('   Error:', error.message);
  }

  // Check 6: Recent Cases Analysis
  console.log('\n6. Analyzing recent cases...');
  try {
    const { data: recentCases, error } = await supabase
      .from('case_briefs')
      .select('id, case_name, processing_status, created_at, processing_error')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) throw error;
    
    console.log('   Recent cases:');
    for (const case_ of recentCases || []) {
      console.log(`   - ${case_.id}: ${case_.case_name} (${case_.processing_status})`);
      if (case_.processing_error) {
        console.log(`     Error: ${case_.processing_error}`);
      }
    }
  } catch (error) {
    console.log('   ❌ Failed to fetch recent cases:', error.message);
  }

  // Check 7: Processing Errors
  console.log('\n7. Checking processing errors...');
  try {
    const { data: processingErrors, error } = await supabase
      .from('processing_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) throw error;
    
    if (processingErrors && processingErrors.length > 0) {
      console.log('   Recent processing errors:');
      for (const error of processingErrors) {
        console.log(`   - Case ${error.case_id}: ${error.error_message}`);
      }
    } else {
      console.log('   ✅ No recent processing errors found');
    }
  } catch (error) {
    console.log('   ❌ Failed to fetch processing errors:', error.message);
  }

  // Summary
  console.log('\n📊 DIAGNOSTIC SUMMARY');
  console.log('========================');
  console.log(`API Accessible: ${diagnostics.apiAccessibility ? '✅' : '❌'}`);
  console.log(`Supabase Connected: ${diagnostics.supabaseConnection ? '✅' : '❌'}`);
  console.log(`Service Initialized: ${diagnostics.serviceInitialization ? '✅' : '❌'}`);
  console.log(`Pipeline Executable: ${diagnostics.pipelineExecution ? '✅' : '❌'}`);
  
  console.log('\nWebhook Endpoints:');
  for (const [endpoint, status] of Object.entries(diagnostics.webhookEndpoints)) {
    console.log(`  ${endpoint}: ${status.accessible ? '✅' : '❌'} (${status.status || 'N/A'})`);
  }
  
  console.log('\nEnvironment Variables:');
  for (const [envVar, hasValue] of Object.entries(diagnostics.environmentVariables)) {
    console.log(`  ${envVar}: ${hasValue ? '✅' : '❌'}`);
  }

  // Recommendations
  console.log('\n🔧 RECOMMENDATIONS');
  console.log('==================');
  
  if (!diagnostics.apiAccessibility) {
    console.log('1. Check if the API server is running and accessible');
    console.log('2. Verify the BASE_URL configuration');
  }
  
  if (!diagnostics.supabaseConnection) {
    console.log('3. Verify Supabase credentials and connection');
    console.log('4. Check if the database is accessible');
  }
  
  if (!diagnostics.serviceInitialization) {
    console.log('5. Check service dependencies and imports');
    console.log('6. Verify all required environment variables are set');
  }
  
  if (!diagnostics.pipelineExecution) {
    console.log('7. Check AI service configuration (OpenAI API key)');
    console.log('8. Verify PDF service configuration');
    console.log('9. Check CourtListener service configuration');
  }
  
  const failedWebhooks = Object.entries(diagnostics.webhookEndpoints)
    .filter(([_, status]) => !status.accessible);
  
  if (failedWebhooks.length > 0) {
    console.log('10. Check webhook route registration in api/index.js');
    console.log('11. Verify middleware authentication');
    console.log('12. Check Vercel deployment status');
  }

  return diagnostics;
}

diagnoseWebhookPipeline().catch(error => {
  console.error('Diagnostic failed:', error);
  process.exit(1);
}); 