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

module.exports = {
  validateSupabaseToken,
  validateInternalServiceCall,
  authenticateJWT,
  optionalAuth
}; 