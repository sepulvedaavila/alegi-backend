// debug-jwt.js - Debug JWT token validation issues
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function debugJWT() {
  console.log('🔍 JWT Token Debugging Tool');
  console.log('=============================\n');

  // Check environment
  console.log('📋 Environment Check:');
  console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log('');

  // Get token from command line argument
  const token = process.argv[2];
  
  if (!token) {
    console.log('❌ No token provided!');
    console.log('Usage: node debug-jwt.js YOUR_JWT_TOKEN');
    console.log('');
    console.log('Example:');
    console.log('node debug-jwt.js eyJhbGciOiJIUzI1NiIs...');
    console.log('');
    console.log('💡 To get your token:');
    console.log('1. Login to your app');
    console.log('2. Open browser dev tools');
    console.log('3. Run: (await supabase.auth.getSession()).data.session.access_token');
    return;
  }

  console.log('🔍 Analyzing Token:');
  console.log(`Token length: ${token.length} characters`);
  console.log(`Token preview: ${token.substring(0, 50)}...`);
  console.log('');

  try {
    // Decode JWT without verification to see payload
    console.log('📋 Token Payload (without verification):');
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      console.log('❌ Failed to decode token - invalid JWT format');
      return;
    }

    console.log('Header:', JSON.stringify(decoded.header, null, 2));
    console.log('Payload:', JSON.stringify(decoded.payload, null, 2));
    console.log('');

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    const exp = decoded.payload.exp;
    
    if (exp) {
      const timeUntilExpiry = exp - now;
      console.log(`⏰ Token Expiration:`);
      console.log(`Expires at: ${new Date(exp * 1000).toISOString()}`);
      console.log(`Current time: ${new Date(now * 1000).toISOString()}`);
      console.log(`Time until expiry: ${timeUntilExpiry} seconds`);
      
      if (timeUntilExpiry <= 0) {
        console.log('❌ TOKEN IS EXPIRED!');
        console.log('💡 Get a fresh token from your app');
        return;
      } else {
        console.log('✅ Token is not expired');
      }
    }
    console.log('');

  } catch (error) {
    console.log('❌ Failed to decode token:', error.message);
    return;
  }

  // Test token with Supabase
  console.log('🧪 Testing with Supabase:');
  try {
    console.log('Calling supabase.auth.getUser()...');
    
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.log('❌ Supabase authentication error:');
      console.log(`Error code: ${error.status || 'unknown'}`);
      console.log(`Error message: ${error.message}`);
      console.log(`Error details:`, error);
      
      // Common error analysis
      if (error.message.includes('Invalid JWT')) {
        console.log('');
        console.log('💡 Possible causes:');
        console.log('1. Token is from wrong Supabase project');
        console.log('2. Token was signed with different JWT secret');
        console.log('3. Token format is corrupted');
        console.log('4. Using anon key instead of JWT token');
      }
      
      if (error.message.includes('expired')) {
        console.log('');
        console.log('💡 Token has expired - get a fresh one');
      }
      
      return;
    }

    if (!data.user) {
      console.log('❌ No user data returned');
      return;
    }

    console.log('✅ Token validation successful!');
    console.log('User data:');
    console.log(`- ID: ${data.user.id}`);
    console.log(`- Email: ${data.user.email}`);
    console.log(`- Role: ${data.user.role || 'not set'}`);
    console.log(`- Created: ${data.user.created_at}`);
    console.log(`- Last sign in: ${data.user.last_sign_in_at}`);
    console.log('');

    // Test with our auth middleware
    console.log('🧪 Testing with our auth middleware:');
    
    const mockReq = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const { validateInternalServiceCall } = require('./middleware/auth');
    
    try {
      const user = await validateInternalServiceCall(mockReq);
      console.log('✅ Auth middleware validation successful!');
      console.log('Middleware user data:', {
        id: user.id,
        email: user.email,
        role: user.role
      });
    } catch (authError) {
      console.log('❌ Auth middleware validation failed:');
      console.log(authError.message);
    }

  } catch (error) {
    console.log('❌ Supabase test failed:');
    console.log(error.message);
    console.log('Stack:', error.stack);
  }
}

// Additional utility functions
function generateTestToken() {
  console.log('🧪 How to get a valid JWT token:');
  console.log('');
  console.log('Method 1 - From your frontend app:');
  console.log('```javascript');
  console.log('const { data } = await supabase.auth.getSession();');
  console.log('const token = data.session?.access_token;');
  console.log('console.log("Token:", token);');
  console.log('```');
  console.log('');
  console.log('Method 2 - From browser console:');
  console.log('1. Login to your app');
  console.log('2. Open browser dev tools console');
  console.log('3. Run: (await supabase.auth.getSession()).data.session.access_token');
  console.log('');
  console.log('Method 3 - From API call:');
  console.log('```bash');
  console.log('curl -X POST "YOUR_SUPABASE_URL/auth/v1/token?grant_type=password" \\');
  console.log('  -H "apikey: YOUR_ANON_KEY" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"email": "user@example.com", "password": "password"}\'');
  console.log('```');
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  generateTestToken();
} else {
  debugJWT().catch(console.error);
}