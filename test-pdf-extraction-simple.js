// test-pdf-extraction-simple.js - Simple test for PDF.co text extraction
require('dotenv').config();
const axios = require('axios');

async function testPDFExtraction() {
  console.log('🧪 Testing PDF.co text extraction with simple approach...');
  
  const apiKey = process.env.PDF_CO_API_KEY;
  const baseURL = 'https://api.pdf.co/v1';
  
  if (!apiKey) {
    console.error('❌ PDF_CO_API_KEY not configured');
    return;
  }
  
  console.log('✅ API Key configured');
  
  try {
    // Test with a simple text file first
    console.log('\n1. Testing file upload...');
    const testBuffer = Buffer.from('This is a test file for PDF.co');
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', testBuffer, {
      filename: 'test.txt',
      contentType: 'text/plain'
    });

    const uploadResponse = await axios.post(`${baseURL}/file/upload`, formData, {
      headers: {
        'x-api-key': apiKey,
        ...formData.getHeaders()
      },
      timeout: 10000
    });

    console.log('✅ File upload successful:', uploadResponse.data.url);
    
    // Now test text extraction with different parameters
    console.log('\n2. Testing text extraction...');
    
    // Try different parameter combinations
    const testParams = [
      {
        url: uploadResponse.data.url,
        inline: true,
        async: false
      },
      {
        url: uploadResponse.data.url,
        inline: true,
        async: false,
        outputFormat: 'text'
      },
      {
        url: uploadResponse.data.url,
        inline: true,
        async: false,
        format: 'text'
      }
    ];
    
    for (let i = 0; i < testParams.length; i++) {
      const params = testParams[i];
      console.log(`\nTrying parameters ${i + 1}:`, params);
      
      try {
        const extractResponse = await axios.post(`${baseURL}/pdf/convert/to/text`, params, {
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        console.log('✅ Text extraction successful with params', i + 1);
        console.log('Response:', {
          status: extractResponse.status,
          hasError: !!extractResponse.data.error,
          hasBody: !!extractResponse.data.body,
          bodyLength: extractResponse.data.body?.length || 0,
          remainingCredits: extractResponse.data.remainingCredits
        });
        
        if (extractResponse.data.body) {
          console.log('Extracted text preview:', extractResponse.data.body.substring(0, 100));
        }
        
        return; // Success, exit
        
      } catch (error) {
        console.error(`❌ Test ${i + 1} failed:`, error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
        }
      }
    }
    
    console.log('\n❌ All text extraction attempts failed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testPDFExtraction(); 