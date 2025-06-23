import { jest } from '@jest/globals';
import request from 'supertest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

describe('API Integration Tests', () => {
  let app;

  beforeAll(async () => {
    // Import the app after setting up environment
    const { default: handler } = await import('../../api/health.js');
    app = handler;
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
    });

    it('should reject non-GET requests', async () => {
      await request(app)
        .post('/api/health')
        .expect(405);
    });
  });

  describe('Authentication', () => {
    it('should require authentication for protected endpoints', async () => {
      // This would test endpoints that require auth
      // Mock the auth middleware for testing
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });
  });
}); 