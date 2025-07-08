// test/test-pdf-simple.js - Simple PDF.co API test
require('dotenv').config();

const PDFService = require('../services/pdf.service');

async function testPDFSimple() {
  console.log('🔍 Simple PDF.co API Test...\n');

  // Test 1: Check configuration
  console.log('1️⃣ Configuration Check:');
  console.log('API Key:', process.env.PDF_CO_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('Service Ready:', PDFService.isConfigured() ? '✅ Yes' : '❌ No');
  console.log('');

  // Test 2: Test API connection
  console.log('2️⃣ API Connection Test:');
  try {
    const connectionTest = await PDFService.testConnection();
    console.log('Result:', connectionTest);
  } catch (error) {
    console.log('Connection failed:', error.message);
  }
  console.log('');

  // Test 3: Test with a simple PDF (if we have one)
  console.log('3️⃣ PDF Processing Test:');
  try {
    // Create a simple test PDF buffer (this is just a test)
    const testBuffer = Buffer.from('This is a test PDF content');
    
    console.log('Testing direct extraction with buffer...');
    const result = await PDFService.extractTextDirect(testBuffer, 'test.pdf');
    console.log('Result:', result);
  } catch (error) {
    console.log('PDF processing failed (expected):', error.message);
  }
  console.log('');

  console.log('✅ Simple test completed');
}

if (require.main === module) {
  testPDFSimple()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testPDFSimple }; 