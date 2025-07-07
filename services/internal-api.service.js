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
        probability: null,
        settlementAnalysis: null,
        precedents: null,
        judgeTrends: null,
        riskAssessment: null,
        costEstimate: null,
        financialPrediction: null,
        timelineEstimate: null,
        findSimilar: null,
        errors: []
      };

      // Define all analysis endpoints in order of priority
      const analysisEndpoints = [
        { name: 'probability', method: 'GET', path: `/api/cases/${caseId}/probability` },
        { name: 'settlementAnalysis', method: 'GET', path: `/api/cases/${caseId}/settlement-analysis` },
        { name: 'precedents', method: 'GET', path: `/api/cases/${caseId}/precedents` },
        { name: 'judgeTrends', method: 'GET', path: `/api/cases/${caseId}/judge-trends` },
        { name: 'riskAssessment', method: 'GET', path: `/api/cases/${caseId}/risk-assessment` },
        { name: 'costEstimate', method: 'GET', path: `/api/cases/${caseId}/cost-estimate` },
        { name: 'financialPrediction', method: 'GET', path: `/api/cases/${caseId}/financial-prediction` },
        { name: 'timelineEstimate', method: 'GET', path: `/api/cases/${caseId}/timeline-estimate` },
        { name: 'findSimilar', method: 'GET', path: `/api/cases/${caseId}/find-similar` }
      ];

      // Process each endpoint sequentially
      for (const endpoint of analysisEndpoints) {
        try {
          console.log(`Triggering ${endpoint.name} for case ${caseId}`);
          const result = await this.makeInternalCall(endpoint.method, endpoint.path);
          results[endpoint.name] = result;
          console.log(`${endpoint.name} completed for case ${caseId}`);
        } catch (error) {
          const errorMsg = error.response?.data?.error || error.message;
          results.errors.push({ type: endpoint.name, error: errorMsg });
          console.error(`${endpoint.name} failed for case ${caseId}:`, errorMsg);
        }

        // Wait before next call (except for the last one)
        if (endpoint !== analysisEndpoints[analysisEndpoints.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      console.log(`Sequential analysis completed for case ${caseId}`, {
        successful: Object.values(results).filter(r => r !== null && !Array.isArray(r)).length,
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