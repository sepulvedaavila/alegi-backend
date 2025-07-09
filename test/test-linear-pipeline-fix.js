// test/test-linear-pipeline-fix.js
const LinearPipelineService = require('../services/linear-pipeline.service');
const AIService = require('../services/ai.service');
const PDFService = require('../services/pdf.service');
const CourtListenerService = require('../services/courtlistener.service');

async function testLinearPipelineFix() {
  console.log('🔍 Testing Linear Pipeline Configuration and Services...\n');

  // Test case ID
  const testCaseId = '4be4bdfc-739f-401c-9dbc-c1b20e70c937';

  try {
    // 1. Check environment variables
    console.log('📋 Environment Variables Check:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configured' : '❌ Missing');
    console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ Configured' : '❌ Missing');
    console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing');
    console.log('PDF_CO_API_KEY:', process.env.PDF_CO_API_KEY ? '✅ Configured' : '❌ Missing');
    console.log('COURTLISTENER_API_KEY:', process.env.COURTLISTENER_API_KEY ? '✅ Configured' : '❌ Missing');
    console.log('');

    // 2. Test service initialization
    console.log('🔧 Service Initialization Test:');
    
    const linearPipeline = new LinearPipelineService();
    console.log('LinearPipelineService: ✅ Initialized');
    
    const aiService = AIService;
    console.log('AIService:', aiService.isMock ? '⚠️ Mock Mode (no OpenAI key)' : '✅ Initialized');
    
    const pdfService = PDFService;
    console.log('PDFService:', pdfService.isConfigured() ? '✅ Configured' : '⚠️ Not configured');
    
    const courtListenerService = CourtListenerService;
    console.log('CourtListenerService:', courtListenerService.apiKey ? '✅ Configured' : '⚠️ No API key');
    console.log('');

    // 3. Test database connection
    console.log('🗄️ Database Connection Test:');
    try {
      const { data: caseData, error } = await linearPipeline.supabase
        .from('case_briefs')
        .select('id, case_name, processing_status, ai_processed')
        .eq('id', testCaseId)
        .single();
      
      if (error) {
        console.log('❌ Database connection failed:', error.message);
      } else {
        console.log('✅ Database connection successful');
        console.log('Case data:', {
          id: caseData.id,
          name: caseData.case_name,
          status: caseData.processing_status,
          aiProcessed: caseData.ai_processed
        });
      }
    } catch (error) {
      console.log('❌ Database test failed:', error.message);
    }
    console.log('');

    // 4. Test AI service functionality
    console.log('🤖 AI Service Test:');
    try {
      const mockCaseData = {
        id: testCaseId,
        case_name: 'Test Case',
        case_type: 'Personal Injury',
        jurisdiction: 'California'
      };
      
      const intakeResult = await aiService.executeIntakeAnalysis(mockCaseData, [], 'Test document content');
      console.log('✅ AI service working:', intakeResult ? 'Response received' : 'No response');
    } catch (error) {
      console.log('❌ AI service test failed:', error.message);
    }
    console.log('');

    // 5. Test PDF service
    console.log('📄 PDF Service Test:');
    try {
      const testResult = await pdfService.testConnection();
      console.log('PDF service test:', testResult.success ? '✅ Working' : '❌ Failed');
      if (!testResult.success) {
        console.log('Error:', testResult.error);
      }
    } catch (error) {
      console.log('❌ PDF service test failed:', error.message);
    }
    console.log('');

    // 6. Test CourtListener service
    console.log('⚖️ CourtListener Service Test:');
    try {
      const mockCaseData = {
        case_type: 'Personal Injury',
        jurisdiction: 'California'
      };
      
      const similarCases = await courtListenerService.findSimilarCases(mockCaseData);
      console.log('✅ CourtListener service working:', similarCases.mock ? 'Mock data returned' : 'Real data returned');
    } catch (error) {
      console.log('❌ CourtListener service test failed:', error.message);
    }
    console.log('');

    // 7. Test linear pipeline execution
    console.log('🚀 Linear Pipeline Execution Test:');
    try {
      console.log('Starting linear pipeline execution...');
      const startTime = Date.now();
      
      const result = await linearPipeline.executeLinearPipeline(testCaseId);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`✅ Linear pipeline completed in ${duration}s`);
      console.log('Result keys:', Object.keys(result || {}));
      
      if (result) {
        console.log('Pipeline data summary:');
        console.log('- Has case data:', !!result.caseData);
        console.log('- Has intake analysis:', !!result.intakeAnalysis);
        console.log('- Has jurisdiction analysis:', !!result.jurisdictionAnalysis);
        console.log('- Has case enhancement:', !!result.caseEnhancement);
        console.log('- Has court listener cases:', !!(result.courtListenerCases?.length));
        console.log('- Has complexity score:', !!result.complexityScore);
        console.log('- Has prediction analysis:', !!result.predictionAnalysis);
        console.log('- Has additional analysis:', !!result.additionalAnalysis);
        console.log('- Has trigger analysis:', !!result.triggerAnalysis);
      }
      
    } catch (error) {
      console.log('❌ Linear pipeline execution failed:', error.message);
      console.log('Error stack:', error.stack);
    }
    console.log('');

    // 8. Check if enhanced data is available
    console.log('📊 Enhanced Data Availability Test:');
    try {
      const [
        enrichmentResult,
        predictionsResult,
        fusedDataResult,
        documentExtractionsResult,
        precedentCasesResult
      ] = await Promise.allSettled([
        linearPipeline.supabase.from('case_ai_enrichment').select('*').eq('case_id', testCaseId).single(),
        linearPipeline.supabase.from('case_predictions').select('*').eq('case_id', testCaseId).single(),
        linearPipeline.supabase.from('case_data_fusion').select('*').eq('case_id', testCaseId).single(),
        linearPipeline.supabase.from('case_document_extractions').select('*').eq('case_id', testCaseId),
        linearPipeline.supabase.from('precedent_cases').select('*').eq('case_id', testCaseId)
      ]);

      console.log('Enhanced data availability:');
      console.log('- AI Enrichment:', enrichmentResult.status === 'fulfilled' && enrichmentResult.value.data ? '✅ Available' : '❌ Not available');
      console.log('- Predictions:', predictionsResult.status === 'fulfilled' && predictionsResult.value.data ? '✅ Available' : '❌ Not available');
      console.log('- Fused Data:', fusedDataResult.status === 'fulfilled' && fusedDataResult.value.data ? '✅ Available' : '❌ Not available');
      console.log('- Document Extractions:', documentExtractionsResult.status === 'fulfilled' && documentExtractionsResult.value.data?.length ? '✅ Available' : '❌ Not available');
      console.log('- Precedent Cases:', precedentCasesResult.status === 'fulfilled' && precedentCasesResult.value.data?.length ? '✅ Available' : '❌ Not available');
      
    } catch (error) {
      console.log('❌ Enhanced data check failed:', error.message);
    }

    console.log('\n🎯 Test Summary:');
    console.log('The linear pipeline should now be working properly.');
    console.log('If you see any ❌ marks above, those services need to be configured.');
    console.log('The enhanced-data endpoint should now be accessible at:');
    console.log(`https://alegi-backend.vercel.app/api/cases/${testCaseId}/enhanced-data`);

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error stack:', error.stack);
  }
}

// Run the test
testLinearPipelineFix().catch(console.error); 