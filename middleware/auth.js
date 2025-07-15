const { createClient } = require('@supabase/supabase-js');
const { UnauthorizedError } = require('../utils/errorHandler');

// Initialize Supabase client with error handling
let supabase;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    console.log('Supabase client initialized successfully');
  } else {
    console.error('Missing Supabase configuration - auth will fail');
  }
} catch (error) {
  console.error('Failed to initialize Supabase for auth:', error);
}

const validateSupabaseToken = async (req) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.error('🔐 No authorization header provided');
    throw new UnauthorizedError('Missing authorization header. Please provide: Authorization: Bearer YOUR_JWT_TOKEN');
  }

  if (!authHeader.startsWith('Bearer ')) {
    console.error('🔐 Invalid authorization header format');
    throw new UnauthorizedError('Authorization header must start with "Bearer ". Format: Authorization: Bearer YOUR_JWT_TOKEN');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!token) {
    console.error('🔐 No token in authorization header');
    throw new UnauthorizedError('No token provided after "Bearer ". Please provide a valid JWT token.');
  }

  // Basic token format check
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    console.error('🔐 Invalid JWT format - should have 3 parts separated by dots');
    throw new UnauthorizedError('Invalid JWT token format. Token should have 3 parts separated by dots.');
  }
  
  if (!supabase) {
    console.error('🔐 Supabase client not initialized');
    throw new UnauthorizedError('Authentication service not available');
  }
  
  try {
    // Log token info for debugging
    console.log('🔐 Validating token:', token.substring(0, 20) + '... (length: ' + token.length + ')');
    
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('🔐 Supabase auth error:', {
        message: error.message,
        status: error.status,
        code: error.code
      });
      
      // Provide specific error messages based on Supabase error
      if (error.message?.includes('Invalid JWT')) {
        throw new UnauthorizedError('Invalid JWT token. This could be because: 1) Token is expired, 2) Token is from wrong Supabase project, 3) Token is malformed. Please get a fresh token.');
      } else if (error.message?.includes('expired')) {
        throw new UnauthorizedError('JWT token has expired. Please log in again to get a fresh token.');
      } else if (error.message?.includes('signature')) {
        throw new UnauthorizedError('JWT signature verification failed. Token may be from wrong project or corrupted.');
      } else {
        throw new UnauthorizedError(`Token validation failed: ${error.message}`);
      }
    }
    
    if (!data.user) {
      console.error('🔐 No user data returned from Supabase');
      throw new UnauthorizedError('Token is valid but no user data found. Token may be expired.');
    }
    
    console.log('✅ Token validated for user:', data.user.email, '(' + data.user.id + ')');
    return data.user;
  } catch (error) {
    console.error('🔐 Token validation error:', error);
    
    // If it's already an UnauthorizedError, re-throw it
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    
    // For any other error, wrap it
    throw new UnauthorizedError(`Authentication failed: ${error.message}`);
  }
};

// Enhanced function for multiple authentication methods
const validateInternalServiceCall = async (req) => {
  // Method 1: Check for Supabase Service Key authentication
  const serviceKeyAuth = req.headers['x-supabase-service-key'];
  if (serviceKeyAuth && serviceKeyAuth === process.env.SUPABASE_SERVICE_KEY) {
    console.log('✅ Authenticated via Supabase Service Key');
    return {
      id: 'service-key-user',
      email: 'service@alegi.io',
      role: 'service_role',
      app_metadata: {
        provider: 'supabase_service_key',
        providers: ['supabase_service_key']
      }
    };
  }

  // Method 2: Check for Webhook Secret authentication
  const webhookSecret = req.headers['x-webhook-secret'];
  if (webhookSecret && webhookSecret === process.env.SUPABASE_WEBHOOK_SECRET) {
    console.log('✅ Authenticated via Webhook Secret');
    return {
      id: 'webhook-user',
      email: 'webhook@alegi.io',
      role: 'service_role',
      app_metadata: {
        provider: 'webhook_secret',
        providers: ['webhook_secret']
      }
    };
  }

  // Method 3: Check for Internal Service Secret (existing)
  const internalServiceHeader = req.headers['x-internal-service'];
  const serviceSecret = req.headers['x-service-secret'];
  if (internalServiceHeader === 'alegi-backend' && serviceSecret === process.env.INTERNAL_SERVICE_SECRET) {
    console.log('✅ Authenticated via Internal Service Secret');
    return {
      id: 'internal-service',
      email: 'service@alegi.io',
      role: 'service_role',
      app_metadata: {
        provider: 'internal',
        providers: ['internal']
      }
    };
  }

  // Method 4: Check for API Key authentication (simple)
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    // Check against multiple possible API keys
    const validApiKeys = [
      process.env.SUPABASE_SERVICE_KEY,
      process.env.SUPABASE_WEBHOOK_SECRET,
      process.env.INTERNAL_SERVICE_SECRET
    ].filter(Boolean); // Remove undefined values

    if (validApiKeys.includes(apiKey)) {
      console.log('✅ Authenticated via API Key');
      return {
        id: 'api-key-user',
        email: 'api@alegi.io',
        role: 'service_role',
        app_metadata: {
          provider: 'api_key',
          providers: ['api_key']
        }
      };
    }
  }

  // Method 5: Check for Authorization Bearer with service key
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    // Check if it's actually a service key instead of JWT
    const validServiceKeys = [
      process.env.SUPABASE_SERVICE_KEY,
      process.env.SUPABASE_WEBHOOK_SECRET
    ].filter(Boolean);

    if (validServiceKeys.includes(token)) {
      console.log('✅ Authenticated via Bearer Service Key');
      return {
        id: 'bearer-service-user',
        email: 'bearer-service@alegi.io',
        role: 'service_role',
        app_metadata: {
          provider: 'bearer_service_key',
          providers: ['bearer_service_key']
        }
      };
    }
  }
  
  // Method 6: Check for development bypass
  if (process.env.NODE_ENV === 'development' && req.headers['x-dev-bypass'] === 'true') {
    console.log('✅ Authenticated via Development Bypass');
    return {
      id: 'dev-user',
      email: 'dev@alegi.io',
      role: 'admin',
      app_metadata: { role: 'admin', provider: 'dev_bypass' }
    };
  }

  // Method 7: Fall back to regular JWT token validation
  try {
    const user = await validateSupabaseToken(req);
    console.log('✅ Authenticated via JWT Token');
    return user;
  } catch (error) {
    console.error('🔐 All authentication methods failed');
    throw error;
  }
};

const authenticateJWT = async (req, res, next) => {
  try {
    const user = await validateInternalServiceCall(req);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await validateInternalServiceCall(req);
    req.user = user;
  } catch (error) {
    // Don't fail, just don't set user
    req.user = null;
  }
  next();
};

// Verify admin access
const verifyAdminAuth = async (req, res, next) => {
  try {
    const user = await validateInternalServiceCall(req);
    req.user = user;
    
    // Check if user has admin role
    const isAdmin = user.role === 'admin' || 
                   user.role === 'service_role' ||
                   user.app_metadata?.role === 'admin' ||
                   user.email?.includes('@alegi.io'); // Adjust this logic as needed

    if (!isAdmin) {
      console.warn(`🚫 Non-admin user attempted admin access: ${user.email}`);
      return res.status(403).json({ 
        error: 'Admin access required',
        message: 'You do not have permission to access this resource'
      });
    }

    console.log(`👑 Admin access granted: ${user.email}`);
    next();

  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(403).json({ 
      error: 'Admin authentication failed',
      message: error.message
    });
  }
};

// Verify case ownership or admin access
const verifyCaseAccess = async (req, res, next) => {
  try {
    const user = await validateInternalServiceCall(req);
    req.user = user;
    
    const caseId = req.query.id || req.params.id;
    
    if (!caseId) {
      return res.status(400).json({ 
        error: 'Case ID required' 
      });
    }

    // Service role can access all cases
    if (user.role === 'service_role') {
      console.log(`🔧 Service access granted: ${user.email} -> ${caseId}`);
      return next();
    }

    // Check if user owns this case or is an admin
    const { data: caseData, error } = await supabase
      .from('case_briefs')
      .select('user_id')
      .eq('id', caseId)
      .single();

    if (error) {
      return res.status(404).json({ 
        error: 'Case not found',
        caseId 
      });
    }

    const isOwner = caseData.user_id === user.id;
    const isAdmin = user.role === 'admin' || 
                   user.app_metadata?.role === 'admin' ||
                   user.email?.includes('@alegi.io');

    if (!isOwner && !isAdmin) {
      console.warn(`🚫 Unauthorized case access attempt: ${user.email} -> ${caseId}`);
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only access your own cases'
      });
    }

    console.log(`✅ Case access granted: ${user.email} -> ${caseId} (${isOwner ? 'owner' : 'admin'})`);
    next();

  } catch (error) {
    console.error('Case access verification error:', error);
    return res.status(403).json({ 
      error: 'Access verification failed',
      message: error.message
    });
  }
};

// Dev/testing bypass (only in development)
const allowDevBypass = (req, res, next) => {
  if (process.env.NODE_ENV === 'development' && req.headers['x-dev-bypass'] === 'true') {
    console.warn('⚠️ DEV BYPASS: Skipping authentication in development mode');
    req.user = {
      id: 'dev-user',
      email: 'dev@alegi.io',
      role: 'admin',
      app_metadata: { role: 'admin' }
    };
    return next();
  }
  
  // Continue with normal auth flow
  next();
};

// Enhanced bypass that works with validateInternalServiceCall
const validateWithDevBypass = async (req) => {
  // Check for dev bypass first
  if (process.env.NODE_ENV === 'development' && req.headers['x-dev-bypass'] === 'true') {
    console.warn('⚠️ DEV BYPASS: Skipping authentication in development mode');
    return {
      id: 'dev-user',
      email: 'dev@alegi.io',
      role: 'admin',
      app_metadata: { role: 'admin', provider: 'dev_bypass' }
    };
  }
  
  // Otherwise use normal validation
  return await validateInternalServiceCall(req);
};

module.exports = {
  validateSupabaseToken,
  validateInternalServiceCall,
  validateWithDevBypass,
  authenticateJWT,
  optionalAuth,
  verifyAdminAuth,
  verifyCaseAccess,
  allowDevBypass
}; 