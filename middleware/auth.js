const { createClient } = require('@supabase/supabase-js');
const { UnauthorizedError } = require('../utils/errorHandler');

// Initialize Supabase client
let supabase;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  } else {
    console.warn('Supabase not configured - authentication will fail');
  }
} catch (error) {
  console.error('Failed to initialize Supabase for auth:', error);
}

const validateSupabaseToken = async (req) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    throw new UnauthorizedError('No authorization header');
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    throw new UnauthorizedError('No token provided');
  }
  
  if (!supabase) {
    throw new UnauthorizedError('Authentication service not available');
  }
  
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    
    if (!data.user) {
      throw new UnauthorizedError('Invalid token');
    }
    
    return data.user;
  } catch (error) {
    console.error('Token validation error:', error);
    throw new UnauthorizedError('Invalid token');
  }
};

const authenticateJWT = async (req, res, next) => {
  try {
    const user = await validateSupabaseToken(req);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await validateSupabaseToken(req);
    req.user = user;
  } catch (error) {
    // Don't fail, just don't set user
    req.user = null;
  }
  next();
};

module.exports = {
  validateSupabaseToken,
  authenticateJWT,
  optionalAuth
}; 