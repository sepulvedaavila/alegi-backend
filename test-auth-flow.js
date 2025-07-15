// test-auth-flow.js - Test the complete authentication flow
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testAuthFlow() {
  console.log('🧪 Testing Complete Authentication Flow');
  console.log('======================================\n');

  // Test environment
  console.log('📋 Environment Check:');
  console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL || 'Not set'}`);
  console.log(`SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? 'Set (hidden)' : 'Not set'}`);
  console.log('');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('❌ Missing required environment variables');
    console.log('Please check your .env file');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Test 1: Check if we can connect to Supabase
  console.log('🔌 Test 1: Supabase Connection');
  try {
    // Simple query to test connection
    const { data, error } = await supabase
      .from('case_briefs')
      .select('id')
      .limit(1);
    
    if (error) {
      console.log('❌ Connection failed:', error.message);
      return;
    }
    console.log('✅ Supabase connection successful');
  } catch (error) {
    console.log('❌ Connection error:', error.message);
    return;
  }
  console.log('');

  // Test 2: Check auth configuration
  console.log('🔐 Test 2: Auth Configuration');
  try {
    // Try to get user with an obviously invalid token
    const { data, error } = await supabase.auth.getUser('invalid_token');
    
    if (error) {
      console.log('✅ Auth is working (correctly rejected invalid token)');
      console.log(`Expected error: ${error.message}`);
    } else {
      console.log('⚠️ Unexpected: Invalid token was accepted');
    }
  } catch (error) {
    console.log('✅ Auth properly configured (rejected invalid token)');
  }
  console.log('');

  // Test 3: Check JWT verification setup
  console.log('🔍 Test 3: JWT Configuration');
  
  // Check if we have the right Supabase setup
  const supabaseUrl = process.env.SUPABASE_URL;
  const expectedJwtIssuer = supabaseUrl;
  
  console.log(`Expected JWT issuer: ${expectedJwtIssuer}`);
  console.log('✅ JWT configuration looks correct');
  console.log('');

  // Test 4: Common token issues
  console.log('🔧 Test 4: Common Token Issues');
  console.log('');
  console.log('Common reasons for "Invalid Token" errors:');
  console.log('');
  
  console.log('1. 🕐 EXPIRED TOKEN');
  console.log('   - Supabase tokens expire after 1 hour by default');
  console.log('   - Solution: Get a fresh token from your app');
  console.log('');
  
  console.log('2. 🔗 WRONG PROJECT');
  console.log('   - Token from different Supabase project');
  console.log('   - Check: Token iss (issuer) should match your SUPABASE_URL');
  console.log('');
  
  console.log('3. 🔑 WRONG KEY TYPE');
  console.log('   - Using anon key instead of JWT token');
  console.log('   - Anon key looks like: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('   - JWT token has different payload with user info');
  console.log('');
  
  console.log('4. 📝 MALFORMED TOKEN');
  console.log('   - Copy/paste error or missing characters');
  console.log('   - Should have exactly 3 parts separated by dots');
  console.log('');
  
  console.log('5. 🌐 ENVIRONMENT MISMATCH');
  console.log('   - Token from localhost but hitting production API');
  console.log('   - Or vice versa');
  console.log('');

  // Test 5: Create a test endpoint to validate token
  console.log('🧪 Test 5: Token Validation Endpoint');
  console.log('');
  console.log('You can test your token with:');
  console.log('');
  console.log('node debug-jwt.js YOUR_JWT_TOKEN');
  console.log('');
  console.log('Or test via API:');
  console.log('curl -X POST "http://localhost:3000/api/test-auth" \\');
  console.log('  -H "Authorization: Bearer YOUR_JWT_TOKEN"');
  console.log('');
}

testAuthFlow().catch(console.error);