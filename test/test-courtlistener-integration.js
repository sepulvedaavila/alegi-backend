// Load environment variables
require('dotenv').config();

const courtListenerService = require('../services/courtlistener.service');
// Circuit breaker service removed - using direct calls

async function testCourtListenerIntegration() {
  console.log('🧪 Testing CourtListener Integration...\n');

  try {
    // Test 1: Check if service is properly initialized
    console.log('1. Testing Service Initialization...');
    console.log(`   API Key: ${process.env.COURTLISTENER_API_KEY ? 'Configured' : 'Not Configured'}`);
    console.log(`   Base URL: ${courtListenerService.baseURL}`);

    // Test 2: Circuit breaker removed - service uses direct calls
    console.log('\n2. Circuit Breaker Status: Removed - using direct calls');

    // Test 3: Test search functionality
    console.log('\n3. Testing Search Functionality...');
    const searchResults = await courtListenerService.searchCases('contract dispute', {
      page_size: 2
    });
    console.log(`   Search Results: ${searchResults.length} cases found`);
    
    if (searchResults.length > 0) {
      console.log('   Sample Result:', {
        id: searchResults[0].id,
        case_name: searchResults[0].case_name,
        court: searchResults[0].court
      });
    }

    // Test 4: Test find similar cases
    console.log('\n4. Testing Find Similar Cases...');
    const mockCaseData = {
      case_type: 'contract',
      cause_of_action: 'breach of contract',
      jurisdiction: 'federal',
      court_abbreviation: 'ca9'
    };
    
    const similarCases = await courtListenerService.findSimilarCases(mockCaseData);
    console.log(`   Similar Cases: ${similarCases.count} found`);
    console.log(`   Mock Mode: ${similarCases.mock || false}`);
    
    if (similarCases.message) {
      console.log(`   Message: ${similarCases.message}`);
    }

    // Test 5: Test error handling with invalid query
    console.log('\n5. Testing Error Handling...');
    try {
      await courtListenerService.searchCases('', { invalid_param: 'test' });
    } catch (error) {
      console.log('   Error Handling Working:', error.message);
    }

    // Test 6: Test rate limiting
    console.log('\n6. Testing Rate Limiting...');
    const startTime = Date.now();
    await courtListenerService.searchCases('test', { page_size: 1 });
    const endTime = Date.now();
    console.log(`   Rate Limiting: ${endTime - startTime}ms between calls`);

    console.log('\n✅ CourtListener Integration Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ CourtListener Integration Test Failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCourtListenerIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testCourtListenerIntegration }; 