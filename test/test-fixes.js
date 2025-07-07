const courtListenerService = require('../services/courtlistener.service');
const { OpenAI } = require('openai');

// Test CourtListener service methods
async function testCourtListenerService() {
  console.log('Testing CourtListener service...');
  
  try {
    // Test searchCases method
    const searchResults = await courtListenerService.searchCases('contract dispute', {
      filed_after: '2020-01-01'
    });
    
    console.log('✅ searchCases method works:', typeof searchResults);
    console.log('   Results type:', Array.isArray(searchResults) ? 'Array' : typeof searchResults);
    
    // Test findSimilarCases method
    const similarCases = await courtListenerService.findSimilarCases({
      case_type: 'contract_dispute',
      jurisdiction: 'federal'
    });
    
    console.log('✅ findSimilarCases method works:', typeof similarCases);
    console.log('   Results structure:', Object.keys(similarCases));
    
  } catch (error) {
    console.error('❌ CourtListener service test failed:', error.message);
  }
}

// Test OpenAI quota error handling
async function testOpenAIQuotaHandling() {
  console.log('\nTesting OpenAI quota error handling...');
  
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  try {
    // This should work normally
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10
    });
    
    console.log('✅ OpenAI API call works normally');
    
  } catch (error) {
    console.log('OpenAI API call failed:', error.code, error.status);
    
    // Test quota error detection
    if (error.code === 'insufficient_quota' || error.status === 429) {
      console.log('✅ Quota error correctly detected');
    } else {
      console.log('❌ Unexpected error type:', error.code);
    }
  }
}

// Test service exports
function testServiceExports() {
  console.log('\nTesting service exports...');
  
  try {
    const services = require('../services/index.js');
    
    if (services.courtlistenerService) {
      console.log('✅ courtlistenerService exported correctly');
    } else {
      console.log('❌ courtlistenerService not found in exports');
    }
    
    if (services.CourtListenerService) {
      console.log('✅ CourtListenerService exported correctly');
    } else {
      console.log('❌ CourtListenerService not found in exports');
    }
    
  } catch (error) {
    console.error('❌ Service exports test failed:', error.message);
  }
}

async function runTests() {
  console.log('Running fixes verification tests...\n');
  
  testServiceExports();
  await testCourtListenerService();
  await testOpenAIQuotaHandling();
  
  console.log('\n✅ All tests completed');
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 