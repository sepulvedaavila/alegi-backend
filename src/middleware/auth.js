import { getUserFromToken } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export async function authenticateUser(req) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const user = await getUserFromToken(token);
    
    if (!user) {
      return null;
    }

    // Add user to request object
    req.user = user;
    
    logger.info('User authenticated', { userId: user.id });
    return user;
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    return null;
  }
}

export function requireAuth(handler) {
  return async (req, res) => {
    const user = await authenticateUser(req);
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid authentication token required'
      });
    }

    return handler(req, res);
  };
}

export function optionalAuth(handler) {
  return async (req, res) => {
    await authenticateUser(req); // Don't fail if no auth
    return handler(req, res);
  };
}

// Rate limiting middleware
export function rateLimiter(limit = 100, windowMs = 15 * 60 * 1000) {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(key)) {
      requests.set(key, requests.get(key).filter(timestamp => timestamp > windowStart));
    } else {
      requests.set(key, []);
    }

    const userRequests = requests.get(key);
    
    if (userRequests.length >= limit) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded'
      });
    }

    userRequests.push(now);
    next();
  };
} 