// test-services.js - Comprehensive test for all 3rd party services
require('dotenv').config();

const pdfService = require('./services/pdf.service');
const courtListenerService = require('./services/courtlistener.service');
const aiService = require('./services/ai.service');

async function testAllServices() {
  console.log('🧪 Testing all 3rd party services...\n');

  // Test PDF Service
  console.log('📄 Testing PDF Service...');
  
  if (!process.env.PDF_CO_API_KEY) {
    console.log('❌ PDF_CO_API_KEY not configured - skipping PDF tests');
  } else {
    try {
      // Test PDF service configuration
      console.log('✅ PDF API key configured');
      
      // Test connection (this will fail without a real file, but we can test the service setup)
      const testResult = await pdfService.testConnection();
      if (testResult.success) {
        console.log('✅ PDF service connection test successful');
      } else {
        console.log('❌ PDF service connection test failed:', testResult.error);
      }
      
    } catch (error) {
      console.log('❌ PDF service test failed:', error.message);
    }
  }

  // Test CourtListener Service
  console.log('\n⚖️ Testing CourtListener Service...');
  
  if (!process.env.COURTLISTENER_API_KEY) {
    console.log('❌ COURTLISTENER_API_KEY not configured - using mock data');
  } else {
    console.log('✅ CourtListener API key configured');
  }

  try {
    // Test CourtListener search with a simple query
    const searchResults = await courtListenerService.searchCases('contract dispute', {
      page_size: 5
    });
    
    if (searchResults && searchResults.length > 0) {
      console.log(`✅ CourtListener search successful - found ${searchResults.length} results`);
    } else {
      console.log('⚠️ CourtListener search returned no results (this may be normal)');
    }
  } catch (error) {
    console.log('❌ CourtListener service test failed:', error.message);
  }

  // Test OpenAI Service
  console.log('\n🤖 Testing OpenAI Service...');
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY not configured - using mock service');
  } else {
    console.log('✅ OpenAI API key configured');
  }

  try {
    // Test OpenAI with a simple prompt
    const testMessages = [
      {
        role: 'user',
        content: 'Please respond with "OpenAI service is working correctly" in JSON format.'
      }
    ];

    const response = await aiService.makeOpenAICall('gpt-4o-mini', testMessages, {
      temperature: 0.1,
      max_tokens: 50
    });

    if (response && response.choices && response.choices[0]) {
      console.log('✅ OpenAI service test successful');
      console.log('Response:', response.choices[0].message.content.substring(0, 100) + '...');
    } else {
      console.log('❌ OpenAI service returned unexpected response format');
    }
  } catch (error) {
    console.log('❌ OpenAI service test failed:', error.message);
  }

  // Summary
  console.log('\n📊 Service Test Summary:');
  console.log(`PDF Service: ${process.env.PDF_CO_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`CourtListener Service: ${process.env.COURTLISTENER_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`OpenAI Service: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  
  console.log('\n💡 Recommendations:');
  if (!process.env.PDF_CO_API_KEY) {
    console.log('- Add PDF_CO_API_KEY to your .env file for PDF text extraction');
  }
  if (!process.env.COURTLISTENER_API_KEY) {
    console.log('- Add COURTLISTENER_API_KEY to your .env file for legal precedent search');
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log('- Add OPENAI_API_KEY to your .env file for AI analysis');
  }
  
  console.log('\n✅ Service testing completed!');
}

// Run the test
testAllServices().catch(console.error); 