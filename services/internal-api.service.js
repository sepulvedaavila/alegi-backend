// services/internal-api.service.js
const { createClient } = require('@supabase/supabase-js');

class InternalAPIService {
  constructor() {
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
  }

  async triggerAllAnalysis(caseId) {
    console.log(`Triggering all analysis for case ${caseId}`);
    
    const results = {
      'judge-trends': null,
      'precedents': null,
      'risk-assessment': null,
      errors: []
    };

    try {
      // Trigger judge trends analysis
      try {
        const judgeTrendsResponse = await this.callAnalysisEndpoint(caseId, 'judge-trends');
        results['judge-trends'] = judgeTrendsResponse;
        console.log(`Judge trends analysis completed for case ${caseId}`);
      } catch (error) {
        console.error(`Judge trends analysis failed for case ${caseId}:`, error);
        results.errors.push({ endpoint: 'judge-trends', error: error.message });
      }

      // Trigger precedents analysis
      try {
        const precedentsResponse = await this.callAnalysisEndpoint(caseId, 'precedents');
        results['precedents'] = precedentsResponse;
        console.log(`Precedents analysis completed for case ${caseId}`);
      } catch (error) {
        console.error(`Precedents analysis failed for case ${caseId}:`, error);
        results.errors.push({ endpoint: 'precedents', error: error.message });
      }

      // Trigger risk assessment analysis
      try {
        const riskAssessmentResponse = await this.callAnalysisEndpoint(caseId, 'risk-assessment');
        results['risk-assessment'] = riskAssessmentResponse;
        console.log(`Risk assessment analysis completed for case ${caseId}`);
      } catch (error) {
        console.error(`Risk assessment analysis failed for case ${caseId}:`, error);
        results.errors.push({ endpoint: 'risk-assessment', error: error.message });
      }

    } catch (error) {
      console.error(`All analysis failed for case ${caseId}:`, error);
      results.errors.push({ endpoint: 'all', error: error.message });
    }

    return results;
  }

  async triggerSequentialAnalysis(caseId, delay = 3000) {
    console.log(`Triggering sequential analysis for case ${caseId} with ${delay}ms delay`);
    
    const results = {
      'judge-trends': null,
      'precedents': null,
      'risk-assessment': null,
      errors: []
    };

    try {
      // Trigger judge trends analysis
      try {
        const judgeTrendsResponse = await this.callAnalysisEndpoint(caseId, 'judge-trends');
        results['judge-trends'] = judgeTrendsResponse;
        console.log(`Judge trends analysis completed for case ${caseId}`);
        
        // Wait before next analysis
        if (delay > 0) {
          await this.sleep(delay);
        }
      } catch (error) {
        console.error(`Judge trends analysis failed for case ${caseId}:`, error);
        results.errors.push({ endpoint: 'judge-trends', error: error.message });
      }

      // Trigger precedents analysis
      try {
        const precedentsResponse = await this.callAnalysisEndpoint(caseId, 'precedents');
        results['precedents'] = precedentsResponse;
        console.log(`Precedents analysis completed for case ${caseId}`);
        
        // Wait before next analysis
        if (delay > 0) {
          await this.sleep(delay);
        }
      } catch (error) {
        console.error(`Precedents analysis failed for case ${caseId}:`, error);
        results.errors.push({ endpoint: 'precedents', error: error.message });
      }

      // Trigger risk assessment analysis
      try {
        const riskAssessmentResponse = await this.callAnalysisEndpoint(caseId, 'risk-assessment');
        results['risk-assessment'] = riskAssessmentResponse;
        console.log(`Risk assessment analysis completed for case ${caseId}`);
      } catch (error) {
        console.error(`Risk assessment analysis failed for case ${caseId}:`, error);
        results.errors.push({ endpoint: 'risk-assessment', error: error.message });
      }

    } catch (error) {
      console.error(`Sequential analysis failed for case ${caseId}:`, error);
      results.errors.push({ endpoint: 'sequential', error: error.message });
    }

    return results;
  }

  async callAnalysisEndpoint(caseId, endpoint) {
    // This would typically make an internal HTTP call to the analysis endpoints
    // For now, we'll simulate the call by importing and calling the analysis functions directly
    
    let analysisModule;
    let analysisFunction;
    
    switch (endpoint) {
      case 'judge-trends':
        analysisModule = require(`../api/cases/[id]/judge-trends.js`);
        break;
      case 'precedents':
        analysisModule = require(`../api/cases/[id]/precedents.js`);
        break;
      case 'risk-assessment':
        analysisModule = require(`../api/cases/[id]/risk-assessment.js`);
        break;
      default:
        throw new Error(`Unknown analysis endpoint: ${endpoint}`);
    }

    // Create a mock request and response object
    const mockReq = {
      query: { id: caseId },
      headers: {},
      method: 'GET'
    };

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          if (code >= 400) {
            throw new Error(data.error || 'Analysis failed');
          }
          return data;
        }
      }),
      json: (data) => data
    };

    // Call the analysis function
    return await analysisModule(mockReq, mockRes);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new InternalAPIService(); 