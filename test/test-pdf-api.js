// test/test-pdf-api.js - Test PDF.co API integration
require('dotenv').config();

const PDFService = require('../services/pdf.service');
const { createClient } = require('@supabase/supabase-js');

async function testPDFAPI() {
  console.log('🔍 Testing PDF.co API Integration...\n');

  // Test 1: Check API key configuration
  console.log('1️⃣ Checking API key configuration...');
  console.log('PDF_CO_API_KEY:', process.env.PDF_CO_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('PDFService configured:', PDFService.isConfigured() ? '✅ Yes' : '❌ No');
  console.log('');

  // Test 2: Test API connection
  console.log('2️⃣ Testing API connection...');
  try {
    const connectionTest = await PDFService.testConnection();
    if (connectionTest.success) {
      console.log('✅ API connection successful');
      console.log('User info:', connectionTest.userInfo);
    } else {
      console.log('❌ API connection failed:', connectionTest.error);
    }
  } catch (error) {
    console.log('❌ API connection test error:', error.message);
  }
  console.log('');

  // Test 3: Test with a sample PDF file
  console.log('3️⃣ Testing with sample PDF file...');
  try {
    // Create a simple test PDF path (this would be a real file path in production)
    const testFilePath = 'documents/test-case/test-document.pdf';
    
    console.log('Testing extraction from:', testFilePath);
    const result = await PDFService.extractText(testFilePath);
    
    if (result.success) {
      console.log('✅ PDF extraction successful');
      console.log('Pages:', result.pages);
      console.log('Confidence:', result.confidence);
      console.log('Text preview:', result.text.substring(0, 200) + '...');
    } else {
      console.log('❌ PDF extraction failed');
    }
  } catch (error) {
    console.log('❌ PDF extraction test error:', error.message);
    console.log('This is expected if the test file doesn\'t exist');
  }
  console.log('');

  // Test 4: Test Supabase integration
  console.log('4️⃣ Testing Supabase integration...');
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.log('❌ Supabase not configured');
    } else {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      
      // Test Supabase connection
      const { data, error } = await supabase.storage.listBuckets();
      if (error) {
        console.log('❌ Supabase connection failed:', error.message);
      } else {
        console.log('✅ Supabase connection successful');
        console.log('Available buckets:', data.map(b => b.name));
      }
    }
  } catch (error) {
    console.log('❌ Supabase test error:', error.message);
  }
  console.log('');

  // Test 5: Test the complete flow with a real file
  console.log('5️⃣ Testing complete flow...');
  try {
    // This would test with an actual file from your database
    // For now, we'll just test the service methods
    console.log('Testing service methods...');
    
    // Test upload method (this will fail without a real file, but we can see the error)
    try {
      await PDFService.uploadFile('test-file.pdf');
    } catch (error) {
      console.log('Expected upload error (no real file):', error.message);
    }
    
    // Test text extraction method
    try {
      await PDFService.extractTextFromURL('https://example.com/test.pdf');
    } catch (error) {
      console.log('Expected extraction error (invalid URL):', error.message);
    }
    
  } catch (error) {
    console.log('❌ Complete flow test error:', error.message);
  }
  console.log('');

  console.log('🎯 PDF API Test Summary:');
  console.log('- API Key:', process.env.PDF_CO_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('- Service:', PDFService.isConfigured() ? '✅ Ready' : '❌ Not Ready');
  console.log('- Supabase:', (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) ? '✅ Configured' : '❌ Missing');
  console.log('');
  console.log('📝 Next steps:');
  console.log('1. Ensure PDF_CO_API_KEY is set in environment');
  console.log('2. Verify Supabase storage bucket "case-files" exists');
  console.log('3. Test with an actual PDF file from your database');
  console.log('4. Check API rate limits and quotas');
}

// Run the test
if (require.main === module) {
  testPDFAPI()
    .then(() => {
      console.log('✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testPDFAPI }; 