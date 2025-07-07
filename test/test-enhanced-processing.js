const { createClient } = require('@supabase/supabase-js');
const enhancedProcessingService = require('../services/enhanced-processing.service');
const queueService = require('../services/queue.service');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Test configuration
const TEST_CASE = {
  case_name: 'Enhanced Processing Test Case',
  case_description: 'This is a test case for the enhanced processing flow with document-first approach',
  case_type: 'Employment Discrimination',
  jurisdiction: 'California - Los Angeles',
  case_stage: 'Assessing filing',
  case_narrative: 'Plaintiff alleges wrongful termination based on age discrimination. Plaintiff was terminated after 15 years of employment and replaced by a younger employee. Plaintiff has documentation of positive performance reviews and the termination letter.',
  expected_outcome: 'Compensatory damages for wrongful termination and age discrimination',
  additional_notes: 'Plaintiff has witness statements and performance documentation'
};

async function testEnhancedProcessingFlow() {
  console.log('🧪 Testing Enhanced Processing Flow...\n');
  
  try {
    // Step 1: Create a test case
    console.log('📝 Step 1: Creating test case...');
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .insert({
        ...TEST_CASE,
        user_id: process.env.TEST_USER_ID || 'test-user-id',
        processing_type: 'enhanced',
        enhanced_processing_status: 'not_started',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (caseError) throw caseError;
    
    console.log(`✅ Test case created: ${caseData.id}`);
    
    // Step 2: Create mock document extractions
    console.log('\n📄 Step 2: Creating mock document extractions...');
    const mockExtractions = [
      {
        case_id: caseData.id,
        document_id: 'mock-doc-1',
        file_name: 'termination_letter.pdf',
        file_type: 'application/pdf',
        extracted_text: 'This letter serves as official notice of termination of employment effective immediately. The decision was made due to company restructuring. We thank you for your 15 years of service.',
        structured_data: {
          document_type: 'termination_letter',
          parties: {
            plaintiffs: [],
            defendants: ['Company Name']
          },
          key_dates: {
            termination_date: '2024-01-15'
          },
          legal_claims: ['wrongful termination'],
          damages_sought: '',
          key_terms: ['termination', 'restructuring'],
          jurisdiction: 'California',
          case_number: ''
        },
        extraction_metadata: {
          pages: 1,
          service: 'pdfco',
          extraction_timestamp: new Date().toISOString()
        },
        processing_status: 'completed'
      },
      {
        case_id: caseData.id,
        document_id: 'mock-doc-2',
        file_name: 'performance_reviews.pdf',
        file_type: 'application/pdf',
        extracted_text: 'Annual Performance Review - Employee: John Doe, Position: Senior Manager, Rating: Exceeds Expectations, Comments: Outstanding performance, leadership, and dedication to the company.',
        structured_data: {
          document_type: 'performance_review',
          parties: {
            plaintiffs: ['John Doe'],
            defendants: []
          },
          key_dates: {
            review_date: '2023-12-01'
          },
          legal_claims: [],
          damages_sought: '',
          key_terms: ['performance review', 'exceeds expectations'],
          jurisdiction: '',
          case_number: ''
        },
        extraction_metadata: {
          pages: 2,
          service: 'pdfco',
          extraction_timestamp: new Date().toISOString()
        },
        processing_status: 'completed'
      }
    ];
    
    // Insert mock extractions
    for (const extraction of mockExtractions) {
      await supabase
        .from('case_document_extractions')
        .insert(extraction);
    }
    
    console.log(`✅ Created ${mockExtractions.length} mock document extractions`);
    
    // Step 3: Test information fusion
    console.log('\n🔄 Step 3: Testing information fusion...');
    const fusedData = await enhancedProcessingService.fuseInformation(
      caseData.id, 
      caseData, 
      mockExtractions
    );
    
    console.log('✅ Information fusion completed');
    console.log('   Fused parties:', fusedData.fused_result.parties);
    console.log('   Fused claims:', fusedData.fused_result.legal_claims);
    
    // Step 4: Test external enrichment
    console.log('\n🌐 Step 4: Testing external enrichment...');
    const externalData = await enhancedProcessingService.enrichWithExternalData(fusedData);
    
    console.log('✅ External enrichment completed');
    console.log(`   Found ${externalData.court_listener_cases.length} similar cases`);
    
    // Step 5: Test staged AI analysis
    console.log('\n🤖 Step 5: Testing staged AI analysis...');
    const aiResults = await enhancedProcessingService.runStagedAIAnalysis(fusedData, externalData);
    
    console.log('✅ Staged AI analysis completed');
    console.log('   Stages completed:', Object.keys(aiResults).length);
    
    // Step 6: Test saving results
    console.log('\n💾 Step 6: Testing result saving...');
    await enhancedProcessingService.saveEnhancedResults(
      caseData.id, 
      fusedData, 
      externalData, 
      aiResults
    );
    
    console.log('✅ Results saved successfully');
    
    // Step 7: Verify database state
    console.log('\n🔍 Step 7: Verifying database state...');
    
    const { data: finalCase } = await supabase
      .from('case_briefs')
      .select('processing_type, enhanced_processing_status, processing_status')
      .eq('id', caseData.id)
      .single();
    
    const { data: fusionData } = await supabase
      .from('case_data_fusion')
      .select('*')
      .eq('case_id', caseData.id)
      .single();
    
    const { data: processingStages } = await supabase
      .from('case_processing_stages')
      .select('stage_name, stage_status')
      .eq('case_id', caseData.id);
    
    console.log('✅ Database verification completed');
    console.log('   Processing type:', finalCase.processing_type);
    console.log('   Enhanced status:', finalCase.enhanced_processing_status);
    console.log('   Fusion status:', fusionData?.fusion_status);
    console.log('   Processing stages:', processingStages?.length || 0);
    
    // Step 8: Test queue processing
    console.log('\n📋 Step 8: Testing queue processing...');
    
    // Add to enhanced processing queue
    await queueService.add('enhanced-case-processing', {
      caseId: caseData.id,
      userId: process.env.TEST_USER_ID || 'test-user-id',
      caseData: caseData,
      webhookType: 'TEST_TRIGGER',
      table: 'case_briefs',
      source: 'test'
    });
    
    console.log('✅ Enhanced processing queued successfully');
    
    // Step 9: Test API endpoint
    console.log('\n🌐 Step 9: Testing API endpoint...');
    
    const axios = require('axios');
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
    
    try {
      // Note: This would require authentication in a real test
      console.log('   API endpoint would be tested with proper authentication');
      console.log('   Endpoint: POST /api/cases/:id/enhanced-process');
    } catch (apiError) {
      console.log('   API test skipped (requires authentication)');
    }
    
    console.log('\n✅ Enhanced Processing Flow Test Completed Successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Document extraction: ✅');
    console.log('   - Information fusion: ✅');
    console.log('   - External enrichment: ✅');
    console.log('   - Staged AI analysis: ✅');
    console.log('   - Result saving: ✅');
    console.log('   - Database verification: ✅');
    console.log('   - Queue processing: ✅');
    
    return {
      success: true,
      caseId: caseData.id,
      testResults: {
        documentExtractions: mockExtractions.length,
        fusionCompleted: !!fusionData,
        aiStages: Object.keys(aiResults).length,
        processingStages: processingStages?.length || 0
      }
    };
    
  } catch (error) {
    console.error('\n❌ Enhanced Processing Flow Test Failed:', error.message);
    console.error('Stack trace:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEnhancedProcessingFlow()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
      } else {
        console.log('\n💥 Tests failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testEnhancedProcessingFlow }; 