// test-pdf-extraction.js - Test script for PDF.co text extraction
require('dotenv').config();
const PDFService = require('./services/pdf.service');

async function testPDFExtraction() {
  console.log('🧪 Testing PDF.co text extraction...');
  
  // Test 1: Check if service is configured
  console.log('\n1. Checking service configuration...');
  console.log('API Key configured:', !!PDFService.apiKey);
  console.log('Base URL:', PDFService.baseURL);
  
  // Test 2: Test API connection
  console.log('\n2. Testing API connection...');
  const connectionTest = await PDFService.testConnection();
  console.log('Connection test result:', connectionTest);
  
  // Test 3: Test with a sample file path (you'll need to provide a real file path)
  console.log('\n3. Testing text extraction...');
  console.log('Note: This requires a valid file path in Supabase storage');
  
  // Uncomment the following lines and provide a real file path to test
  /*
  const testFilePath = 'documents/your-case-id/your-file.pdf';
  const extractionResult = await PDFService.extractText(testFilePath);
  console.log('Extraction result:', {
    success: extractionResult.success,
    textLength: extractionResult.text?.length || 0,
    pages: extractionResult.pages,
    confidence: extractionResult.confidence,
    skipped: extractionResult.skipped,
    reason: extractionResult.reason
  });
  */
  
  console.log('\n✅ Test completed!');
}

// Run the test
testPDFExtraction().catch(console.error); 