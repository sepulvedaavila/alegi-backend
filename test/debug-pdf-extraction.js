// test/debug-pdf-extraction.js
const PDFService = require('../services/pdf.service');

async function debugPDFExtraction() {
  console.log('🔍 Debugging PDF Extraction Issues...\n');

  try {
    // Test 1: Environment variables
    console.log('1. Checking Environment Variables...');
    const envVars = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Missing',
      PDF_CO_API_KEY: process.env.PDF_CO_API_KEY ? 'Set' : 'Missing'
    };
    
    console.log('   Environment Variables:', envVars);

    // Test 2: PDF Service configuration
    console.log('\n2. Testing PDF Service Configuration...');
    const isConfigured = PDFService.isConfigured();
    console.log(`   PDF Service Configured: ${isConfigured}`);

    // Test 3: Supabase connection
    console.log('\n3. Testing Supabase Connection...');
    const supabaseTest = await PDFService.testSupabaseDownload('test-file.pdf');
    console.log('   Supabase Test Result:', supabaseTest);

    // Test 4: PDF.co API connection
    console.log('\n4. Testing PDF.co API Connection...');
    const pdfTest = await PDFService.testConnection();
    console.log('   PDF.co Test Result:', pdfTest);

    // Test 5: File path validation
    console.log('\n5. Testing File Path Validation...');
    const testPaths = [
      'documents/123/test.pdf',
      'invalid/path.pdf',
      'documents/123/',
      null,
      ''
    ];

    testPaths.forEach(path => {
      const validation = PDFService.validateFilePath(path);
      console.log(`   Path: "${path}" -> ${validation.valid ? 'Valid' : 'Invalid'}`);
      if (!validation.valid) {
        console.log(`     Error: ${validation.error}`);
      }
    });

    // Test 6: Test with a real file path (if provided)
    const testFilePath = process.argv[2];
    if (testFilePath) {
      console.log(`\n6. Testing with provided file path: ${testFilePath}`);
      
      // Validate path
      const validation = PDFService.validateFilePath(testFilePath);
      console.log(`   Path validation: ${validation.valid ? 'Valid' : 'Invalid'}`);
      if (!validation.valid) {
        console.log(`   Validation error: ${validation.error}`);
      }

      // Test download
      const fileTest = await PDFService.testSupabaseDownload(testFilePath);
      console.log('   File download test:', fileTest);

      // Test full extraction (if download succeeds)
      if (fileTest.success) {
        console.log('\n7. Testing full PDF extraction...');
        try {
          const extractionResult = await PDFService.extractText(testFilePath);
          console.log('   Extraction successful:', {
            textLength: extractionResult.text?.length || 0,
            pages: extractionResult.pages,
            confidence: extractionResult.confidence
          });
        } catch (extractionError) {
          console.log('   Extraction failed:', extractionError.message);
        }
      }
    }

    console.log('\n✅ PDF Extraction Debug Test Completed!');
    return true;

  } catch (error) {
    console.error('\n❌ PDF Extraction Debug Test Failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  debugPDFExtraction()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { debugPDFExtraction }; 