const axios = require('axios');
const Sentry = require('@sentry/node');
const circuitBreaker = require('./circuit-breaker.service');
const { mapToCourtListenerCourt } = require('../utils/courtMaps');

class CourtListenerService {
  constructor() {
    this.apiKey = process.env.COURTLISTENER_API_KEY;
    this.baseURL = process.env.COURTLISTENER_BASE_URL || 'https://www.courtlistener.com/api/rest/v4/';
    this.rateLimiter = {
      lastCall: 0,
      minInterval: 1000 // 1 second between calls
    };
    // Increased timeout for better reliability
    this.requestTimeout = parseInt(process.env.COURTLISTENER_TIMEOUT) || 30000; // 30 seconds
  }

  async makeAPICall(endpoint, params = {}) {
    return await circuitBreaker.callWithCircuitBreaker('courtlistener', async () => {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastCall = now - this.rateLimiter.lastCall;
      if (timeSinceLastCall < this.rateLimiter.minInterval) {
        await new Promise(resolve => 
          setTimeout(resolve, this.rateLimiter.minInterval - timeSinceLastCall)
        );
      }
      this.rateLimiter.lastCall = Date.now();

      const url = new URL(endpoint, this.baseURL);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });

      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Alegi-Legal-Platform/1.0'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Token ${this.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      try {
        const response = await fetch(url.toString(), {
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`CourtListener API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error(`CourtListener API timeout after ${this.requestTimeout}ms`);
        }
        throw error;
      }
    }, { threshold: 5, timeout: 60000 }); // Reduced circuit breaker timeout to 1 minute
  }

  async searchCases(query, filters = {}) {
    try {
      // Add timeout and retry logic for search operations
      const maxRetries = 2;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.makeAPICall('search/', {
            q: query,
            type: 'o', // opinions
            order_by: 'score desc',
            ...filters
          });
          
          return response.results || [];
        } catch (error) {
          lastError = error;
          
          // If it's a timeout and we have retries left, wait and retry
          if (error.message.includes('timeout') && attempt < maxRetries) {
            console.warn(`CourtListener search timeout, retrying (${attempt}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
            continue;
          }
          
          // For other errors or final attempt, break and throw
          break;
        }
      }
      
      throw lastError;
    } catch (error) {
      console.error('CourtListener search error:', error);
      Sentry.captureException(error, {
        tags: { service: 'courtlistener', operation: 'searchCases' },
        extra: { query, filters }
      });
      return [];
    }
  }

  async getCaseDetails(caseId) {
    try {
      return await this.makeAPICall(`opinions/${caseId}/`);
    } catch (error) {
      console.error('CourtListener case details error:', error);
      Sentry.captureException(error, {
        tags: { service: 'courtlistener', operation: 'getCaseDetails' },
        extra: { caseId }
      });
      return null;
    }
  }

  async findSimilarCases(caseData) {
    try {
      // If no API key, return mock data instead of failing
      if (!this.apiKey) {
        console.warn('CourtListener API key not found - returning mock data');
        return this.getMockSimilarCases(caseData);
      }

      const searchParams = {
        q: this.buildSearchQuery(caseData),
        type: 'o', // opinions
        filed_after: this.getDateRange(caseData),
        order_by: 'score desc',
        page_size: 10
      };

      // Use centralized court mapping
      if (caseData.jurisdiction) {
        const courtCodes = mapToCourtListenerCourt(caseData.jurisdiction);
        if (courtCodes) {
          searchParams.court = courtCodes;
        }
      }

      const results = await this.makeAPICall('search/', searchParams);
      return this.processSimilarCases(results);
    } catch (error) {
      console.error('CourtListener search failed:', error);
      
      // Report to Sentry
      Sentry.captureException(error, {
        tags: { service: 'courtlistener', operation: 'findSimilarCases' },
        extra: { caseData }
      });

      // Return fallback data instead of failing
      return this.getMockSimilarCases(caseData);
    }
  }

  buildSearchQuery(caseData) {
    const searchTerms = [
      caseData.case_type,
      caseData.cause_of_action,
      caseData.jurisdiction
    ].filter(Boolean);
    
    return searchTerms.join(' ');
  }

  getDateRange(caseData) {
    // Default to last 5 years if no date available
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    return fiveYearsAgo.toISOString().split('T')[0];
  }

  processSimilarCases(results) {
    return {
      count: results.count || 0,
      results: results.results || [],
      mock: false
    };
  }

  getMockSimilarCases(caseData) {
    return {
      count: 0,
      results: [],
      mock: true,
      message: 'CourtListener service unavailable - using fallback data'
    };
  }
}

module.exports = new CourtListenerService();