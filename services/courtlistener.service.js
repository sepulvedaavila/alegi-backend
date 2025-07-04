const axios = require('axios');
const Sentry = require('@sentry/node');

class CourtListenerService {
  constructor() {
    this.apiKey = process.env.COURTLISTENER_API_KEY;
    this.baseURL = process.env.COURTLISTENER_BASE_URL || 'https://www.courtlistener.com/api/rest/v3';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async searchCases(query, filters = {}) {
    try {
      const response = await this.client.get('/search/', {
        params: {
          q: query,
          type: 'o', // opinions
          order_by: 'score desc',
          ...filters
        }
      });
      
      return response.data.results || [];
    } catch (error) {
      console.error('CourtListener search error:', error);
      Sentry.captureException(error);
      return [];
    }
  }

  async getCaseDetails(caseId) {
    try {
      const response = await this.client.get(`/opinions/${caseId}/`);
      return response.data;
    } catch (error) {
      console.error('CourtListener case details error:', error);
      return null;
    }
  }

  async findSimilarCases(caseData, limit = 10) {
    const searchTerms = [
      caseData.case_type,
      caseData.cause_of_action,
      caseData.jurisdiction
    ].filter(Boolean).join(' ');
    
    return this.searchCases(searchTerms, {
      court: caseData.court_abbreviation,
      filed_after: '2020-01-01',
      stat_Precedential: 'on',
      per_page: limit
    });
  }
}

module.exports = new CourtListenerService();