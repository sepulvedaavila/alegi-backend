// test/test-pdf-fix.js
const PDFService = require('../services/pdf.service');

async function testPDFFix() {
  console.log('🧪 Testing PDF Service Fix...\n');

  try {
    // Check if service is configured
    console.log('1. Checking PDF Service Configuration...');
    const isConfigured = PDFService.isConfigured();
    console.log(`   PDF Service configured: ${isConfigured ? '✅ Yes' : '❌ No'}`);
    
    if (!isConfigured) {
      console.log('   ⚠️  PDF service not configured, skipping API tests');
    }

    // Test Supabase connection
    console.log('\n2. Testing Supabase Connection...');
    const supabaseTest = await PDFService.testSupabaseDownload('test-file.pdf');
    console.log(`   Supabase test: ${supabaseTest.success ? '✅ Success' : '❌ Failed'}`);
    if (!supabaseTest.success) {
      console.log(`   Error: ${supabaseTest.error}`);
    }

    // Test PDF.co API connection
    console.log('\n3. Testing PDF.co API Connection...');
    const pdfTest = await PDFService.testConnection();
    console.log(`   PDF.co API test: ${pdfTest.success ? '✅ Success' : '❌ Failed'}`);
    if (!pdfTest.success) {
      console.log(`   Error: ${pdfTest.error}`);
    }

    // Test file path validation
    console.log('\n4. Testing File Path Validation...');
    const testUrl = 'https://zunckttwoeuacolbgpnu.supabase.co/storage/v1/object/public/case-files/documents/19429679-e515-4d5b-9c0d-c5d0e373c612/1752127846755_m9ur37e4aia.pdf';
    const validation = PDFService.validateFilePath(testUrl);
    console.log(`   URL validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);
    if (validation.valid) {
      console.log(`   Relative path: ${validation.relativePath}`);
    } else {
      console.log(`   Error: ${validation.error}`);
    }

    // Test with a real file path (if available)
    console.log('\n5. Testing with Real File Path...');
    const testFilePath = 'documents/19429679-e515-4d5b-9c0d-c5d0e373c612/1752127846755_m9ur37e4aia.pdf';
    const fileTest = await PDFService.testSupabaseDownload(testFilePath);
    console.log(`   File test: ${fileTest.success ? '✅ Success' : '❌ Failed'}`);
    if (!fileTest.success) {
      console.log(`   Error: ${fileTest.error}`);
    }

    // Test the actual extraction (this will test the fix)
    if (isConfigured && fileTest.success) {
      console.log('\n6. Testing PDF Text Extraction (This tests the fix)...');
      try {
        const extractionResult = await PDFService.extractText(testFilePath);
        console.log(`   Extraction: ✅ Success`);
        console.log(`   Pages: ${extractionResult.pages}`);
        console.log(`   Text length: ${extractionResult.text?.length || 0} characters`);
        console.log(`   Confidence: ${extractionResult.confidence}`);
      } catch (error) {
        console.log(`   Extraction: ❌ Failed`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Stack: ${error.stack}`);
      }
    } else {
      console.log('\n6. Skipping extraction test (service not configured or file not available)');
    }

    console.log('\n✅ PDF Service Fix Test Completed!');
    return true;

  } catch (error) {
    console.error('\n❌ PDF Service Fix Test Failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testPDFFix()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testPDFFix }; 