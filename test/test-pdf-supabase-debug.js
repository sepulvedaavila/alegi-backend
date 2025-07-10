// test/test-pdf-supabase-debug.js
const PDFService = require('../services/pdf.service');

async function testPDFSupabaseDebug() {
  console.log('🔍 Testing PDF Service with Supabase Integration...\n');

  try {
    // Test 1: Check environment variables
    console.log('1. Checking Environment Variables...');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const pdfApiKey = process.env.PDF_CO_API_KEY;
    
    console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SUPABASE_SERVICE_KEY: ${supabaseKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PDF_CO_API_KEY: ${pdfApiKey ? '✅ Set' : '❌ Missing'}`);

    // Test 2: Test Supabase connection
    console.log('\n2. Testing Supabase Connection...');
    const supabaseTest = await PDFService.testSupabaseDownload('test-file.pdf');
    console.log('   Supabase Test Result:', supabaseTest);

    // Test 3: Test PDF.co API connection
    console.log('\n3. Testing PDF.co API Connection...');
    const pdfTest = await PDFService.testConnection();
    console.log('   PDF.co Test Result:', pdfTest);

    // Test 4: Test with a real file path (if provided)
    const testFilePath = process.argv[2];
    if (testFilePath) {
      console.log(`\n4. Testing with provided file path: ${testFilePath}`);
      const fileTest = await PDFService.testSupabaseDownload(testFilePath);
      console.log('   File Test Result:', fileTest);
    }

    console.log('\n✅ PDF Supabase Debug Test Completed!');
    return true;

  } catch (error) {
    console.error('\n❌ PDF Supabase Debug Test Failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testPDFSupabaseDebug()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testPDFSupabaseDebug }; 