// utils/jwt.utils.js
const jwt = require('jsonwebtoken');

class JWTUtils {
  constructor() {
    this.jwtSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    this.issuer = 'supabase';
    this.audience = 'authenticated';
    
    if (!this.jwtSecret) {
      console.warn('SUPABASE_WEBHOOK_SECRET not configured - JWT minting will fail');
    }
  }

  /**
   * Creates a JWT token compatible with Supabase Auth
   * @param {Object} payload - Token payload
   * @param {string} payload.sub - User ID (subject)
   * @param {string} payload.email - User email
   * @param {string} [payload.role='authenticated'] - User role
   * @param {Object} [payload.app_metadata={}] - App metadata
   * @param {Object} [payload.user_metadata={}] - User metadata
   * @param {string} [expiresIn='1h'] - Token expiration
   * @returns {string} JWT token
   */
  mintToken({
    sub,
    email,
    role = 'authenticated',
    app_metadata = {},
    user_metadata = {},
    ...customClaims
  }, expiresIn = '1h') {
    
    if (!this.jwtSecret) {
      throw new Error('SUPABASE_WEBHOOK_SECRET is required for token minting');
    }

    if (!sub || !email) {
      throw new Error('Both sub (user ID) and email are required');
    }

    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      // Standard claims
      iss: this.issuer,
      aud: this.audience,
      sub: sub,
      iat: now,
      
      // Supabase-specific claims
      email: email,
      role: role,
      app_metadata: app_metadata,
      user_metadata: user_metadata,
      
      // Custom claims
      ...customClaims
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: expiresIn
    });
  }

  /**
   * Creates a service role token for backend operations
   * @param {string} [expiresIn='24h'] - Token expiration
   * @returns {string} Service role JWT token
   */
  mintServiceToken(expiresIn = '24h') {
    if (!this.jwtSecret) {
      throw new Error('SUPABASE_WEBHOOK_SECRET is required for token minting');
    }

    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iss: this.issuer,
      aud: this.audience,
      sub: 'service-role',
      iat: now,
      role: 'service_role',
      email: 'service@alegi.io',
      app_metadata: {
        provider: 'service',
        providers: ['service']
      },
      user_metadata: {}
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: expiresIn
    });
  }

  /**
   * Creates a token for a specific user by ID
   * @param {string} userId - User ID from Supabase
   * @param {string} userEmail - User email
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.role='authenticated'] - User role
   * @param {string} [options.expiresIn='1h'] - Token expiration
   * @param {Object} [options.metadata={}] - Additional metadata
   * @returns {string} JWT token
   */
  mintUserToken(userId, userEmail, options = {}) {
    const {
      role = 'authenticated',
      expiresIn = '1h',
      metadata = {}
    } = options;

    return this.mintToken({
      sub: userId,
      email: userEmail,
      role: role,
      user_metadata: metadata
    }, expiresIn);
  }

  /**
   * Creates a temporary token for webhook or system operations
   * @param {string} purpose - Purpose of the token (e.g., 'webhook', 'system')
   * @param {string} [expiresIn='15m'] - Token expiration
   * @returns {string} JWT token
   */
  mintSystemToken(purpose, expiresIn = '15m') {
    const systemId = `system-${purpose}-${Date.now()}`;
    
    return this.mintToken({
      sub: systemId,
      email: `${purpose}@system.alegi.io`,
      role: 'authenticated',
      app_metadata: {
        system: true,
        purpose: purpose
      }
    }, expiresIn);
  }

  /**
   * Validates a JWT token
   * @param {string} token - JWT token to validate
   * @returns {Object} Decoded token payload
   */
  validateToken(token) {
    if (!this.jwtSecret) {
      throw new Error('SUPABASE_WEBHOOK_SECRET is required for token validation');
    }

    try {
      return jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience
      });
    } catch (error) {
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Decodes a token without verification (for debugging)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded token payload
   */
  decodeToken(token) {
    return jwt.decode(token, { complete: true });
  }

  /**
   * Creates an authorization header value
   * @param {string} token - JWT token
   * @returns {string} Authorization header value
   */
  createAuthHeader(token) {
    return `Bearer ${token}`;
  }
}

module.exports = new JWTUtils();