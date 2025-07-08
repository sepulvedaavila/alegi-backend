const https = require('https');

// Test CORS configuration for the judge-trends endpoint
const testCORS = () => {
  const options = {
    hostname: 'alegi-backend.vercel.app',
    port: 443,
    path: '/api/cases/fed83c5b-3037-4d75-a620-1abcc04fdde1/judge-trends',
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://alegi-frontend.vercel.app',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization, Content-Type'
    }
  };

  console.log('🔍 Testing CORS preflight request...');
  console.log(`URL: https://${options.hostname}${options.path}`);
  console.log(`Origin: ${options.headers.Origin}`);
  console.log('');

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:');
    
    const corsHeaders = [
      'access-control-allow-origin',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'access-control-allow-credentials'
    ];
    
    corsHeaders.forEach(header => {
      const value = res.headers[header];
      if (value) {
        console.log(`  ${header}: ${value}`);
      } else {
        console.log(`  ${header}: NOT SET`);
      }
    });
    
    console.log('');
    
    if (res.statusCode === 200) {
      console.log('✅ CORS preflight successful!');
      console.log('✅ Frontend should be able to make requests');
    } else {
      console.log('❌ CORS preflight failed');
      console.log('❌ Frontend will be blocked by CORS policy');
    }
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
  });

  req.end();
};

// Run the test
testCORS(); 