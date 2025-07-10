// test/test-fixes.js
const PDFService = require('../services/pdf.service');
const AIService = require('../services/ai.service');

async function testFixes() {
  console.log('🧪 Testing fixes for file path and timeout issues...\n');

  try {
    // Test 1: File path validation with full URLs
    console.log('1. Testing file path validation with full Supabase URLs...');
    
    const testUrls = [
      'https://zunckttwoeuacolbgpnu.supabase.co/storage/v1/object/public/case-files/documents/2aec5e8d-72ee-4755-9ef2-e010c5c10673/1752127027673_gt6z4cmdiuj.pdf',
      'documents/123/test.pdf',
      'https://invalid-url.com/file.pdf',
      'https://project.supabase.co/storage/v1/object/public/wrong-bucket/documents/test.pdf'
    ];

    testUrls.forEach((url, index) => {
      const validation = PDFService.validateFilePath(url);
      console.log(`   Test ${index + 1}: "${url}"`);
      console.log(`     Valid: ${validation.valid}`);
      if (validation.valid) {
        console.log(`     Relative path: ${validation.relativePath}`);
      } else {
        console.log(`     Error: ${validation.error}`);
      }
    });

    // Test 2: AI service timeout configuration
    console.log('\n2. Testing AI service timeout configuration...');
    
    const aiConfig = require('../services/ai.config');
    
    const timeoutTests = [
      { operation: 'intake', tokens: 5000 },
      { operation: 'document_processing', tokens: 15000 },
      { operation: 'simple', tokens: 1000 },
      { operation: 'default', tokens: 3000 }
    ];

    timeoutTests.forEach(test => {
      const timeout = aiConfig.getTimeoutForOperation(test.operation, test.tokens);
      console.log(`   Operation: ${test.operation}, Tokens: ${test.tokens} -> Timeout: ${timeout}ms`);
    });

    // Test 3: Mock AI call with operation parameter
    console.log('\n3. Testing AI service with operation parameter...');
    
    // Create a mock AI service for testing
    const mockAIService = {
      isMock: true,
      makeOpenAICall: AIService.makeOpenAICall.bind(AIService)
    };

    try {
      const result = await mockAIService.makeOpenAICall('gpt-4o-mini', [{
        role: 'user',
        content: 'Test message'
      }], {
        operation: 'intake',
        temperature: 0.3
      });
      
      console.log('   Mock AI call successful:', result.choices[0].message.content.substring(0, 100) + '...');
    } catch (error) {
      console.log('   Mock AI call error (expected):', error.message);
    }

    console.log('\n✅ All tests completed successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testFixes().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testFixes; 