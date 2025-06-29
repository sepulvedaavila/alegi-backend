// services/internal-auth.service.js
const jwtUtils = require('../utils/jwt.utils');
const axios = require('axios');

class InternalAuthService {
  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Creates an authenticated HTTP client for internal requests
   * @param {Object} options - Authentication options
   * @param {string} [options.userId] - Specific user ID to authenticate as
   * @param {string} [options.userEmail] - User email (required if userId provided)
   * @param {string} [options.tokenType='service'] - Type of token ('service', 'user', 'system')
   * @param {string} [options.purpose] - Purpose for system tokens
   * @returns {Object} Axios instance with auth header
   */
  createAuthenticatedClient(options = {}) {
    const {
      userId,
      userEmail,
      tokenType = 'service',
      purpose = 'internal',
      expiresIn = '1h'
    } = options;

    let token;

    switch (tokenType) {
      case 'service':
        token = jwtUtils.mintServiceToken(expiresIn);
        break;
      
      case 'user':
        if (!userId || !userEmail) {
          throw new Error('userId and userEmail are required for user tokens');
        }
        token = jwtUtils.mintUserToken(userId, userEmail, { expiresIn });
        break;
      
      case 'system':
        token = jwtUtils.mintSystemToken(purpose, expiresIn);
        break;
      
      default:
        throw new Error(`Unknown token type: ${tokenType}`);
    }

    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': jwtUtils.createAuthHeader(token),
        'Content-Type': 'application/json',
        'User-Agent': 'Alegi-Internal-Service/1.0'
      }
    });
  }

  /**
   * Makes an authenticated request to the API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} authOptions - Authentication options
   * @returns {Promise<Object>} API response
   */
  async makeAuthenticatedRequest(method, endpoint, data = null, authOptions = {}) {
    const client = this.createAuthenticatedClient(authOptions);
    
    try {
      const response = await client.request({
        method,
        url: endpoint,
        data
      });
      
      return response.data;
    } catch (error) {
      console.error(`Internal API request failed: ${method} ${endpoint}`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Submits a case on behalf of a user
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @param {Object} caseData - Case information
   * @returns {Promise<Object>} API response
   */
  async submitCase(userId, userEmail, caseData) {
    return this.makeAuthenticatedRequest(
      'POST',
      '/api/cases/intake',
      caseData,
      { tokenType: 'user', userId, userEmail }
    );
  }

  /**
   * Uploads a document for a case
   * @param {string} caseId - Case ID
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - File name
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} API response
   */
  async uploadDocument(caseId, userId, userEmail, fileBuffer, fileName, mimeType) {
    const client = this.createAuthenticatedClient({
      tokenType: 'user',
      userId,
      userEmail
    });

    const FormData = require('form-data');
    const form = new FormData();
    form.append('document', fileBuffer, {
      filename: fileName,
      contentType: mimeType
    });

    try {
      const response = await client.post(`/api/cases/${caseId}/documents`, form, {
        headers: {
          ...form.getHeaders()
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Document upload failed for case ${caseId}`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Gets service token for external API calls
   * @param {string} [expiresIn='24h'] - Token expiration
   * @returns {string} Service token
   */
  getServiceToken(expiresIn = '24h') {
    return jwtUtils.mintServiceToken(expiresIn);
  }

  /**
   * Creates a token for a specific user
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @param {Object} [options={}] - Token options
   * @returns {string} User token
   */
  getUserToken(userId, userEmail, options = {}) {
    return jwtUtils.mintUserToken(userId, userEmail, options);
  }

  /**
   * Validates if the current environment can mint tokens
   * @returns {boolean} True if JWT secret is configured
   */
  canMintTokens() {
    return !!process.env.SUPABASE_WEBHOOK_SECRET;
  }

  /**
   * Creates a sample user for testing
   * @returns {Object} Sample user data and token
   */
  createTestUser() {
    if (!this.canMintTokens()) {
      throw new Error('Cannot create test user - SUPABASE_WEBHOOK_SECRET not configured');
    }

    const testUser = {
      id: 'test-user-' + Date.now(),
      email: 'test@alegi.io',
      role: 'authenticated'
    };

    const token = this.getUserToken(testUser.id, testUser.email);

    return {
      user: testUser,
      token: token,
      authHeader: jwtUtils.createAuthHeader(token)
    };
  }
}

module.exports = new InternalAuthService();