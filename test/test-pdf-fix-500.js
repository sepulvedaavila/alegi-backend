// test/test-pdf-fix-500.js - Test PDF.co API fix for 500 error
require('dotenv').config();

const PDFService = require('../services/pdf.service');

async function testPDFFix500() {
  console.log('🔍 Testing PDF.co API Fix for 500 Error...\n');

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

  // Test 3: Test with the exact URL from the error
  console.log('3️⃣ Testing with the problematic URL:');
  try {
    const testUrl = 'https://pdf-temp-files.s3.us-west-2.amazonaws.com/L5OWE7E7WIZRUTN6DMGCD772MTVGNWQH/test.pdf?X-Amz-Expires=3600&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIZJDPLX6D7EHVCKA/20250714/us-west-2/s3/aws4_request&X-Amz-Date=20250714T014640Z&X-Amz-SignedHeaders=host&X-Amz-Signature=a4faee4cdd4dab16c4b5ad4d0db4fde33c625de4a356f2a4979c970c54169024';
    
    console.log('Testing text extraction from URL...');
    const result = await PDFService.extractTextFromURL(testUrl);
    console.log('✅ Success!');
    console.log('Text length:', result.text ? result.text.length : 0);
    console.log('Pages:', result.pages);
    console.log('Remaining credits:', result.remainingCredits);
    console.log('Credits used:', result.credits);
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    console.log('Error details:', error);
  }
  console.log('');

  // Test 4: Test with a sample PDF URL (if the above fails)
  console.log('4️⃣ Testing with sample PDF URL:');
  try {
    const sampleUrl = 'https://pdfco-test-files.s3.us-west-2.amazonaws.com/pdf-to-text/sample.pdf';
    
    console.log('Testing text extraction from sample URL...');
    const result = await PDFService.extractTextFromURL(sampleUrl);
    console.log('✅ Success!');
    console.log('Text length:', result.text ? result.text.length : 0);
    console.log('Pages:', result.pages);
    console.log('Remaining credits:', result.remainingCredits);
    console.log('Credits used:', result.credits);
  } catch (error) {
    console.log('❌ Sample test failed:', error.message);
  }
  console.log('');

  console.log('✅ PDF Fix Test completed');
}

if (require.main === module) {
  testPDFFix500()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testPDFFix500 }; 