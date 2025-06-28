// services/external-api.service.js
const axios = require('axios');

class ExternalAPIService {
  constructor() {
    this.courtListenerBaseUrl = 'https://www.courtlistener.com/api/rest/v3';
    this.courtListenerApiKey = process.env.COURTLISTENER_API_KEY;
  }

  async searchPrecedents(caseType, jurisdiction, keywords) {
    try {
      const response = await axios.get(
        `${this.courtListenerBaseUrl}/search/`,
        {
          params: {
            q: keywords.join(' '),
            type: 'o', // opinions
            court: jurisdiction,
            order_by: 'score desc',
            stat_Precedential: 'on'
          },
          headers: {
            'Authorization': `Token ${this.courtListenerApiKey}`
          }
        }
      );

      return response.data.results.slice(0, 10); // Top 10 precedents
    } catch (error) {
      console.error('CourtListener API error:', error);
      return [];
    }
  }

  async getCaseDetails(caseId) {
    try {
      const response = await axios.get(
        `${this.courtListenerBaseUrl}/opinions/${caseId}/`,
        {
          headers: {
            'Authorization': `Token ${this.courtListenerApiKey}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching case details:', error);
      return null;
    }
  }
}

module.exports = new ExternalAPIService();
