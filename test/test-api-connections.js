// Test API connections
require('dotenv').config();
const aiService = require('../services/ai.service');
const pdfcoService = require('../services/pdfco.service');
const courtListenerService = require('../services/courtlistener.service');

async function testOpenAI() {
  try {
    console.log('🧪 Testing OpenAI API connection...');
    
    const testCase = {
      id: 'test-123',
      case_title: 'Test Employment Discrimination Case',
      case_type: 'Employment',
      case_narrative: 'Employee was terminated after filing EEOC complaint for workplace harassment based on race and gender.'
    };
    
    const result = await aiService.analyzeCaseIntake(testCase, [], 'Test document content');
    console.log('✅ OpenAI API working! Result:', result);
    
  } catch (error) {
    console.error('❌ OpenAI API test failed:', error.message);
  }
}

async function testPDFCo() {
  try {
    console.log('🧪 Testing PDF.co API connection...');
    
    // Test with a sample PDF URL
    const testPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const extractedText = await pdfcoService.extractText(testPdfUrl);
    
    console.log('✅ PDF.co API working! Extracted text length:', extractedText.length);
    
  } catch (error) {
    console.error('❌ PDF.co API test failed:', error.message);
  }
}

async function testCourtListener() {
  try {
    console.log('🧪 Testing CourtListener API connection...');
    
    const testCaseData = {
      case_type: 'Employment',
      cause_of_action: 'Discrimination',
      jurisdiction: 'Federal'
    };
    
    const similarCases = await courtListenerService.findSimilarCases(testCaseData, 3);
    console.log('✅ CourtListener API working! Found cases:', similarCases.length);
    
  } catch (error) {
    console.error('❌ CourtListener API test failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting API connection tests...\n');
  
  await testOpenAI();
  console.log('');
  
  await testPDFCo();
  console.log('');
  
  await testCourtListener();
  console.log('');
  
  console.log('✨ API connection tests completed!');
}

// Run tests
runAllTests().catch(console.error);