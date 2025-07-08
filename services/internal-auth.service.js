// services/internal-auth.service.js - Internal service authentication

const jwt = require('jsonwebtoken');

class InternalAuthService {
  constructor() {
    this.secret = process.env.SUPABASE_WEBHOOK_SECRET || 'fallback-secret';
  }

  createTestUser() {
    const user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      app_metadata: {
        provider: 'test',
        providers: ['test']
      }
    };

    const token = jwt.sign(user, this.secret, { expiresIn: '1h' });
    
    return {
      user,
      token,
      authHeader: `Bearer ${token}`
    };
  }

  getServiceToken(expiresIn = '1h') {
    const serviceUser = {
      id: 'internal-service',
      email: 'service@alegi.io',
      role: 'service_role',
      app_metadata: {
        provider: 'internal',
        providers: ['internal']
      }
    };

    return jwt.sign(serviceUser, this.secret, { expiresIn });
  }

  validateToken(token) {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  createAuthHeader(token) {
    return `Bearer ${token}`;
  }
}

module.exports = new InternalAuthService(); 