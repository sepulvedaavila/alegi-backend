const pdfService = require('../services/pdf.service');
const circuitBreaker = require('../services/circuit-breaker.service');

async function testPDFProcessing() {
  console.log('🧪 Testing PDF Processing Integration...\n');

  try {
    // Test 1: Check if service is properly initialized
    console.log('1. Testing Service Initialization...');
    console.log(`   PDF Providers: ${pdfService.services.length}`);
    pdfService.services.forEach((provider, index) => {
      console.log(`   Provider ${index + 1}: ${provider.name}`);
    });

    // Test 2: Test circuit breaker status
    console.log('\n2. Testing Circuit Breakers...');
    const pdfPrimaryBreaker = circuitBreaker.getBreakerStatus('pdf-primary');
    const pdfFallbackBreaker = circuitBreaker.getBreakerStatus('pdf-fallback');
    console.log('   Primary PDF Breaker:', JSON.stringify(pdfPrimaryBreaker, null, 2));
    console.log('   Fallback PDF Breaker:', JSON.stringify(pdfFallbackBreaker, null, 2));

    // Test 3: Test text extraction with mock data
    console.log('\n3. Testing Text Extraction...');
    const mockText = 'This is a test document for PDF processing.';
    const mockBuffer = Buffer.from(mockText, 'utf-8');
    
    const extractionResult = await pdfService.extractText('test.txt', mockBuffer);
    console.log('   Extraction Result:', {
      text: extractionResult.text?.substring(0, 50) + '...',
      pages: extractionResult.pages,
      service: extractionResult.service,
      fallback: extractionResult.fallback || false
    });

    // Test 4: Test URL-based extraction (mock)
    console.log('\n4. Testing URL-based Extraction...');
    try {
      // This will fail since we don't have a real URL, but it tests error handling
      await pdfService.extractTextFromURL('https://invalid-url.com/test.pdf', 'test.pdf');
    } catch (error) {
      console.log('   Error Handling Working:', error.message);
    }

    // Test 5: Test document processing workflow
    console.log('\n5. Testing Document Processing Workflow...');
    const mockCaseId = 'test-case-123';
    const mockDocumentName = 'test-document.pdf';
    
    // Mock the Supabase service to avoid actual database calls
    const originalSupabase = require('../services/supabase.service');
    const mockSupabase = {
      client: {
        from: () => ({
          upsert: async (data) => {
            console.log('   Database Upsert Called:', {
              case_id: data.case_id,
              document_name: data.document_name,
              extraction_status: data.extraction_status
            });
            return { data: null, error: null };
          }
        })
      }
    };
    
    // Temporarily replace the supabase service
    require.cache[require.resolve('../services/supabase.service')].exports = mockSupabase;
    
    const processingResult = await pdfService.processCaseDocument(
      mockCaseId, 
      'https://example.com/test.pdf', 
      mockDocumentName
    );
    
    console.log('   Processing Result:', {
      text: processingResult.text?.substring(0, 50) + '...',
      fallback: processingResult.fallback || false
    });

    // Restore original supabase service
    require.cache[require.resolve('../services/supabase.service')].exports = originalSupabase;

    // Test 6: Test fallback service
    console.log('\n6. Testing Fallback Service...');
    const fallbackService = pdfService.createFallbackService();
    const fallbackResult = await fallbackService.extractText('test.txt', mockBuffer);
    console.log('   Fallback Result:', {
      text: fallbackResult.text?.substring(0, 50) + '...',
      service: fallbackResult.service
    });

    console.log('\n✅ PDF Processing Integration Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ PDF Processing Integration Test Failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testPDFProcessing()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testPDFProcessing }; 