const axios = require('axios');

class InternalAPIService {
  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    this.internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET;
    
    if (!this.internalServiceSecret) {
      console.warn('INTERNAL_SERVICE_SECRET not configured - internal API calls may fail');
    }
  }

  /**
   * Creates an authenticated client for internal API calls
   * @returns {Object} Axios instance with internal service headers
   */
  createInternalClient() {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Internal-Service': 'alegi-backend',
        'X-Service-Secret': this.internalServiceSecret,
        'Content-Type': 'application/json',
        'User-Agent': 'Alegi-Internal-Service/1.0'
      }
    });
  }

  /**
   * Makes an internal API call
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise<Object>} API response
   */
  async makeInternalCall(method, endpoint, data = null) {
    const client = this.createInternalClient();
    
    try {
      const response = await client.request({
        method,
        url: endpoint,
        data
      });
      
      return response.data;
    } catch (error) {
      console.error(`Internal API call failed: ${method} ${endpoint}`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Triggers judge trends analysis for a case
   * @param {string} caseId - Case ID
   * @returns {Promise<Object>} Judge trends analysis result
   */
  async triggerJudgeTrends(caseId) {
    return this.makeInternalCall('GET', `/api/cases/${caseId}/judge-trends`);
  }

  /**
   * Triggers precedents analysis for a case
   * @param {string} caseId - Case ID
   * @returns {Promise<Object>} Precedents analysis result
   */
  async triggerPrecedents(caseId) {
    return this.makeInternalCall('GET', `/api/cases/${caseId}/precedents`);
  }

  /**
   * Triggers risk assessment for a case
   * @param {string} caseId - Case ID
   * @returns {Promise<Object>} Risk assessment result
   */
  async triggerRiskAssessment(caseId) {
    return this.makeInternalCall('GET', `/api/cases/${caseId}/risk-assessment`);
  }

  /**
   * Triggers all analysis endpoints for a case
   * @param {string} caseId - Case ID
   * @returns {Promise<Object>} Combined analysis results
   */
  async triggerAllAnalysis(caseId) {
    try {
      console.log(`Triggering all analysis for case ${caseId}`);
      
      // Run all analyses in parallel
      const [judgeTrends, precedents, riskAssessment] = await Promise.allSettled([
        this.triggerJudgeTrends(caseId),
        this.triggerPrecedents(caseId),
        this.triggerRiskAssessment(caseId)
      ]);

      const results = {
        judgeTrends: judgeTrends.status === 'fulfilled' ? judgeTrends.value : null,
        precedents: precedents.status === 'fulfilled' ? precedents.value : null,
        riskAssessment: riskAssessment.status === 'fulfilled' ? riskAssessment.value : null,
        errors: []
      };

      // Collect any errors
      if (judgeTrends.status === 'rejected') {
        results.errors.push({ type: 'judge-trends', error: judgeTrends.reason.message });
      }
      if (precedents.status === 'rejected') {
        results.errors.push({ type: 'precedents', error: precedents.reason.message });
      }
      if (riskAssessment.status === 'rejected') {
        results.errors.push({ type: 'risk-assessment', error: riskAssessment.reason.message });
      }

      console.log(`Analysis completed for case ${caseId}`, {
        successful: Object.values(results).filter(r => r !== null).length,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      console.error(`Failed to trigger analysis for case ${caseId}:`, error);
      throw error;
    }
  }

  /**
   * Triggers analysis endpoints sequentially to avoid overwhelming the system
   * @param {string} caseId - Case ID
   * @param {number} delayMs - Delay between calls in milliseconds
   * @returns {Promise<Object>} Combined analysis results
   */
  async triggerSequentialAnalysis(caseId, delayMs = 2000) {
    try {
      console.log(`Triggering sequential analysis for case ${caseId}`);
      
      const results = {
        judgeTrends: null,
        precedents: null,
        riskAssessment: null,
        errors: []
      };

      // Trigger judge trends first
      try {
        results.judgeTrends = await this.triggerJudgeTrends(caseId);
        console.log(`Judge trends completed for case ${caseId}`);
      } catch (error) {
        results.errors.push({ type: 'judge-trends', error: error.message });
        console.error(`Judge trends failed for case ${caseId}:`, error.message);
      }

      // Wait before next call
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Trigger precedents
      try {
        results.precedents = await this.triggerPrecedents(caseId);
        console.log(`Precedents completed for case ${caseId}`);
      } catch (error) {
        results.errors.push({ type: 'precedents', error: error.message });
        console.error(`Precedents failed for case ${caseId}:`, error.message);
      }

      // Wait before next call
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Trigger risk assessment
      try {
        results.riskAssessment = await this.triggerRiskAssessment(caseId);
        console.log(`Risk assessment completed for case ${caseId}`);
      } catch (error) {
        results.errors.push({ type: 'risk-assessment', error: error.message });
        console.error(`Risk assessment failed for case ${caseId}:`, error.message);
      }

      console.log(`Sequential analysis completed for case ${caseId}`, {
        successful: Object.values(results).filter(r => r !== null).length,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      console.error(`Failed to trigger sequential analysis for case ${caseId}:`, error);
      throw error;
    }
  }
}

module.exports = new InternalAPIService(); 