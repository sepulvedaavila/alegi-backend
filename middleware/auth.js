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
    console.error('No authorization header provided');
    throw new UnauthorizedError('No authorization header');
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    console.error('No token in authorization header');
    throw new UnauthorizedError('No token provided');
  }
  
  if (!supabase) {
    console.error('Supabase client not initialized');
    throw new UnauthorizedError('Authentication service not available');
  }
  
  try {
    // Log token info for debugging (remove in production)
    console.log('Validating token:', token.substring(0, 20) + '...');
    
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('Supabase auth error:', error.message);
      throw error;
    }
    
    if (!data.user) {
      console.error('No user data returned from Supabase');
      throw new UnauthorizedError('Invalid token');
    }
    
    console.log('Token validated for user:', data.user.id);
    return data.user;
  } catch (error) {
    console.error('Token validation error:', error);
    throw new UnauthorizedError('Invalid token');
  }
};

// New function for internal service authentication
const validateInternalServiceCall = async (req) => {
  // Check for internal service headers
  const internalServiceHeader = req.headers['x-internal-service'];
  const serviceSecret = req.headers['x-service-secret'];
  
  // Allow internal service calls if proper headers are present
  if (internalServiceHeader === 'alegi-backend' && serviceSecret === process.env.INTERNAL_SERVICE_SECRET) {
    // Create a mock user object for internal service calls
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
  
  // If not an internal service call, fall back to regular token validation
  return await validateSupabaseToken(req);
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

module.exports = {
  validateSupabaseToken,
  validateInternalServiceCall,
  authenticateJWT,
  optionalAuth,
  verifyAdminAuth,
  verifyCaseAccess,
  allowDevBypass
}; 