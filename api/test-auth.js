// api/test-auth.js - Test endpoint for debugging authentication
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function handler(req, res) {
  console.log('🧪 Auth Test Endpoint Called');
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  const response = {
    timestamp: new Date().toISOString(),
    method: req.method,
    headers: {
      authorization: authHeader ? `${authHeader.substring(0, 20)}...` : 'missing',
      'x-supabase-service-key': req.headers['x-supabase-service-key'] ? 'present' : 'missing',
      'x-webhook-secret': req.headers['x-webhook-secret'] ? 'present' : 'missing',
      'x-api-key': req.headers['x-api-key'] ? 'present' : 'missing',
      'x-internal-service': req.headers['x-internal-service'] || 'missing',
      'x-service-secret': req.headers['x-service-secret'] ? 'present' : 'missing',
      'x-dev-bypass': req.headers['x-dev-bypass'] || 'missing',
      userAgent: req.headers['user-agent'] || 'unknown'
    },
    availableAuthMethods: [
      'JWT Token (Authorization: Bearer YOUR_JWT_TOKEN)',
      'Supabase Service Key (X-Supabase-Service-Key: YOUR_SERVICE_KEY)',
      'Webhook Secret (X-Webhook-Secret: YOUR_WEBHOOK_SECRET)',
      'API Key (X-API-Key: YOUR_SERVICE_KEY)',
      'Internal Service (X-Internal-Service: alegi-backend + X-Service-Secret)',
      'Bearer Service Key (Authorization: Bearer YOUR_SERVICE_KEY)',
      'Development Bypass (X-Dev-Bypass: true)'
    ],
    tests: {}
  };

  console.log('📋 Request details:', {
    method: req.method,
    hasAuth: !!authHeader,
    authPreview: authHeader ? authHeader.substring(0, 50) + '...' : 'none'
  });

  // Test 1: Check if authorization header exists
  response.tests.hasAuthHeader = !!authHeader;
  
  if (!authHeader) {
    response.error = 'No authorization header provided';
    response.help = 'Add header: Authorization: Bearer YOUR_JWT_TOKEN';
    return res.status(401).json(response);
  }

  // Test 2: Check if it's Bearer format
  const isBearerFormat = authHeader.startsWith('Bearer ');
  response.tests.isBearerFormat = isBearerFormat;
  
  if (!isBearerFormat) {
    response.error = 'Authorization header must start with "Bearer "';
    response.help = 'Format: Authorization: Bearer YOUR_JWT_TOKEN';
    return res.status(401).json(response);
  }

  const token = authHeader.substring(7);
  response.token = {
    length: token.length,
    preview: token.substring(0, 50) + '...'
  };

  // Test 3: Try to decode JWT (without verification)
  try {
    const decoded = jwt.decode(token, { complete: true });
    response.tests.canDecodeJWT = !!decoded;
    
    if (decoded) {
      response.tokenInfo = {
        header: decoded.header,
        payload: {
          iss: decoded.payload.iss,
          sub: decoded.payload.sub,
          aud: decoded.payload.aud,
          exp: decoded.payload.exp,
          iat: decoded.payload.iat,
          email: decoded.payload.email,
          role: decoded.payload.role
        }
      };

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      const exp = decoded.payload.exp;
      response.tests.isExpired = exp ? (exp < now) : null;
      
      if (exp) {
        response.tokenInfo.expiresAt = new Date(exp * 1000).toISOString();
        response.tokenInfo.timeUntilExpiry = exp - now;
      }
    }
  } catch (error) {
    response.tests.canDecodeJWT = false;
    response.decodeError = error.message;
  }

  // Test 4: Test with Supabase
  try {
    console.log('🔍 Testing token with Supabase...');
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    
    response.tests.supabaseValidation = !authError;
    
    if (authError) {
      response.supabaseError = {
        message: authError.message,
        status: authError.status,
        details: authError
      };
      console.log('❌ Supabase validation failed:', authError.message);
    } else if (authData.user) {
      response.supabaseUser = {
        id: authData.user.id,
        email: authData.user.email,
        role: authData.user.role,
        createdAt: authData.user.created_at,
        lastSignIn: authData.user.last_sign_in_at
      };
      console.log('✅ Supabase validation successful for user:', authData.user.email);
    }
  } catch (error) {
    response.tests.supabaseValidation = false;
    response.supabaseError = {
      message: error.message,
      stack: error.stack
    };
    console.log('❌ Supabase test error:', error.message);
  }

  // Test 5: Test with our auth middleware
  try {
    console.log('🔍 Testing with auth middleware...');
    const { validateInternalServiceCall } = require('../middleware/auth');
    
    const mockReq = {
      headers: { authorization: authHeader }
    };
    
    const user = await validateInternalServiceCall(mockReq);
    response.tests.middlewareValidation = true;
    response.middlewareUser = {
      id: user.id,
      email: user.email,
      role: user.role
    };
    console.log('✅ Middleware validation successful');
  } catch (error) {
    response.tests.middlewareValidation = false;
    response.middlewareError = error.message;
    console.log('❌ Middleware validation failed:', error.message);
  }

  // Determine overall status
  const allTestsPassed = Object.values(response.tests).every(test => test === true);
  response.overall = {
    status: allTestsPassed ? 'success' : 'failed',
    allTestsPassed
  };

  // Return appropriate status code
  const statusCode = allTestsPassed ? 200 : 401;
  
  console.log(`📊 Test result: ${response.overall.status} (${statusCode})`);
  
  res.status(statusCode).json(response);
}

module.exports = handler;
export default handler;