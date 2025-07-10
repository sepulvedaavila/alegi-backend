const axios = require('axios');
const Sentry = require('@sentry/node');
const { mapToCourtListenerCourt } = require('../utils/courtMaps');

class CourtListenerService {
  constructor() {
    this.baseURL = 'https://www.courtlistener.com/api/rest/v4/';
    this.requestTimeout = 60000; // Increased from 30000 to 60000ms (60 seconds)
    this.rateLimiter = {
      lastCall: 0,
      minInterval: 1000 // 1 second between calls
    };
  }

  // Get API key dynamically to ensure environment variables are loaded
  get apiKey() {
    return process.env.COURTLISTENER_API_KEY;
  }

  async makeAPICall(endpoint, params = {}, retryCount = 0) {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds base delay
    
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
    } else {
      console.warn('CourtListener API key not found - making unauthenticated request');
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
      
      // If it's a timeout or network error and we have retries left, retry with exponential backoff
      if ((error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('network')) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.warn(`CourtListener API call failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeAPICall(endpoint, params, retryCount + 1);
      }
      
      if (error.name === 'AbortError') {
        throw new Error(`CourtListener API timeout after ${this.requestTimeout}ms`);
      }
      throw error;
    }
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

  async fetchCaseOpinions(caseId) {
    try {
      // If no API key, return mock data
      if (!this.apiKey) {
        console.warn('CourtListener API key not found - returning mock opinions');
        return this.getMockOpinions(caseId);
      }

      const response = await this.makeAPICall(`opinions/`, {
        cluster: caseId,
        page_size: 20
      });

      return response.results || [];
    } catch (error) {
      console.error('CourtListener fetch opinions error:', error);
      Sentry.captureException(error, {
        tags: { service: 'courtlistener', operation: 'fetchCaseOpinions' },
        extra: { caseId }
      });
      
      // Return mock data on error
      return this.getMockOpinions(caseId);
    }
  }

  // Search for judge-specific trends
  async searchJudgeTrends(judgeName, courtName, caseType) {
    try {
      if (!this.apiKey) {
        console.warn('CourtListener API key not found - returning mock judge trends');
        return this.getMockJudgeTrends(judgeName, courtName, caseType);
      }

      const searchParams = {
        q: `judge:"${judgeName}" AND court:"${courtName}"`,
        type: 'o', // opinions
        order_by: 'dateFiled desc',
        page_size: 20
      };

      if (caseType) {
        searchParams.q += ` AND "${caseType}"`;
      }

      const results = await this.makeAPICall('search/', searchParams);
      return this.processJudgeTrends(results, judgeName);
    } catch (error) {
      console.error('Judge trends search failed:', error);
      
      Sentry.captureException(error, {
        tags: { service: 'courtlistener', operation: 'searchJudgeTrends' },
        extra: { judgeName, courtName, caseType }
      });

      return this.getMockJudgeTrends(judgeName, courtName, caseType);
    }
  }

  processJudgeTrends(results, judgeName) {
    const cases = results.results || [];
    
    // Calculate trends
    const totalCases = cases.length;
    const summaryJudgmentCases = cases.filter(c => 
      c.caseName?.toLowerCase().includes('summary judgment') ||
      c.description?.toLowerCase().includes('summary judgment')
    ).length;
    
    const successfulCases = cases.filter(c => 
      c.description?.toLowerCase().includes('granted') ||
      c.description?.toLowerCase().includes('favorable')
    ).length;
    
    // Calculate average timeline (simplified)
    const timelines = cases.map(c => {
      if (c.dateFiled && c.dateTerminated) {
        const filed = new Date(c.dateFiled);
        const terminated = new Date(c.dateTerminated);
        return Math.floor((terminated - filed) / (1000 * 60 * 60 * 24)); // days
      }
      return null;
    }).filter(t => t !== null);
    
    const averageTimeline = timelines.length > 0 
      ? Math.floor(timelines.reduce((a, b) => a + b, 0) / timelines.length)
      : 365; // default to 1 year
    
    return {
      judgeName,
      totalCases,
      summaryJudgmentRate: totalCases > 0 ? Math.round((summaryJudgmentCases / totalCases) * 100) : 0,
      successRate: totalCases > 0 ? Math.round((successfulCases / totalCases) * 100) : 0,
      averageTimeline,
      recentCases: cases.slice(0, 5),
      rulingPatterns: this.identifyRulingPatterns(cases)
    };
  }

  identifyRulingPatterns(cases) {
    const patterns = [];
    
    // Analyze common ruling patterns
    const rulingKeywords = {
      'summary_judgment': ['summary judgment', 'motion for summary judgment'],
      'dismissal': ['dismissed', 'dismissal', 'motion to dismiss'],
      'settlement': ['settlement', 'settled', 'agreement'],
      'trial': ['trial', 'verdict', 'jury'],
      'appeal': ['appeal', 'appellate', 'reversed', 'affirmed']
    };
    
    Object.entries(rulingKeywords).forEach(([pattern, keywords]) => {
      const matchingCases = cases.filter(c => 
        keywords.some(keyword => 
          c.description?.toLowerCase().includes(keyword) ||
          c.caseName?.toLowerCase().includes(keyword)
        )
      );
      
      if (matchingCases.length > 0) {
        patterns.push({
          pattern_type: pattern,
          frequency: Math.round((matchingCases.length / cases.length) * 100),
          description: `${pattern.replace('_', ' ')} pattern`,
          cases: matchingCases.length
        });
      }
    });
    
    return patterns;
  }

  getMockJudgeTrends(judgeName, courtName, caseType) {
    return {
      judgeName,
      totalCases: 15,
      summaryJudgmentRate: 25,
      successRate: 60,
      averageTimeline: 420,
      recentCases: [],
      rulingPatterns: [
        {
          pattern_type: 'summary_judgment',
          frequency: 25,
          description: 'summary judgment pattern',
          cases: 4
        },
        {
          pattern_type: 'settlement',
          frequency: 40,
          description: 'settlement pattern',
          cases: 6
        }
      ],
      mock: true,
      message: 'CourtListener service unavailable - using mock judge trends'
    };
  }

  // Enhanced search for similar cases with more parameters
  async searchSimilarCases(caseData, intakeAnalysis, options = {}) {
    try {
      if (!this.apiKey) {
        console.warn('CourtListener API key not found - returning mock similar cases');
        return this.getMockSimilarCases(caseData);
      }

      // Build enhanced search query
      let searchQuery = this.buildEnhancedSearchQuery(caseData, intakeAnalysis);
      
      const searchParams = {
        q: searchQuery,
        type: 'o', // opinions
        filed_after: this.getDateRange(caseData),
        order_by: 'score desc',
        page_size: options.enhanced ? 25 : 15
      };

      // Use centralized court mapping
      if (caseData.jurisdiction) {
        const courtCodes = mapToCourtListenerCourt(caseData.jurisdiction);
        if (courtCodes) {
          searchParams.court = courtCodes;
        }
      }

      // Add filters based on intake analysis
      if (intakeAnalysis?.case_metadata?.case_type) {
        searchParams.q += ' ' + intakeAnalysis.case_metadata.case_type.join(' ');
      }

      if (intakeAnalysis?.case_metadata?.issue) {
        searchParams.q += ' ' + intakeAnalysis.case_metadata.issue.join(' ');
      }

      const results = await this.makeAPICall('search/', searchParams);
      return this.processSimilarCases(results);
    } catch (error) {
      console.error('Enhanced similar cases search failed:', error);
      
      Sentry.captureException(error, {
        tags: { service: 'courtlistener', operation: 'searchSimilarCases' },
        extra: { caseData, intakeAnalysis, options }
      });

      return this.getMockSimilarCases(caseData);
    }
  }

  buildEnhancedSearchQuery(caseData, intakeAnalysis) {
    const searchTerms = [
      caseData.case_type,
      caseData.cause_of_action,
      caseData.jurisdiction
    ].filter(Boolean);
    
    // Add intake analysis terms
    if (intakeAnalysis?.case_metadata?.issue) {
      searchTerms.push(...intakeAnalysis.case_metadata.issue);
    }
    
    if (intakeAnalysis?.case_metadata?.case_type) {
      searchTerms.push(...intakeAnalysis.case_metadata.case_type);
    }
    
    // Add parties if available
    if (intakeAnalysis?.parties?.plaintiffs) {
      searchTerms.push(...intakeAnalysis.parties.plaintiffs);
    }
    
    if (intakeAnalysis?.parties?.defendants) {
      searchTerms.push(...intakeAnalysis.parties.defendants);
    }
    
    return searchTerms.join(' ');
  }

  getMockOpinions(caseId) {
    return [
      {
        id: `mock-opinion-${caseId}-1`,
        opinion: 'Mock opinion text for testing purposes',
        date_filed: new Date().toISOString(),
        judge: 'Mock Judge',
        court: 'Mock Court',
        type: 'majority'
      }
    ];
  }
}

module.exports = new CourtListenerService();