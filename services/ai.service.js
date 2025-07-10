// services/ai.service.js
const OpenAI = require('openai');
const Sentry = require('@sentry/node');
const courtListenerService = require('./courtlistener.service');
const { AI_PROMPTS } = require('./ai.prompts');
const aiConfig = require('./ai.config');

class AIService {
  constructor() {
    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not found - creating mock AI service');
      this.openai = null;
      this.isMock = true;
      return;
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.isMock = false;
    
    // OpenAI Rate Limiting Configuration
    // Based on OpenAI's rate limits: https://platform.openai.com/docs/guides/rate-limits
    const limits = aiConfig.getLimitsForEnvironment();
    this.rateLimiter = {
      // RPM (Requests Per Minute) - conservative limits
      rpm: limits.rpm,
      // TPM (Tokens Per Minute) - conservative limits
      tpm: limits.tpm,
      // Track usage
      usage: {
        requests: new Map(), // Track requests per minute
        tokens: new Map(),   // Track tokens per minute
        lastReset: Date.now()
      }
    };
    
    // Initialize usage tracking
    this.resetUsageTracking();
  }

  // Reset usage tracking every minute
  resetUsageTracking() {
    const now = Date.now();
    const minuteAgo = now - 60000; // 1 minute ago
    
    // Clean up old entries
    for (const [timestamp, _] of this.rateLimiter.usage.requests) {
      if (timestamp < minuteAgo) {
        this.rateLimiter.usage.requests.delete(timestamp);
      }
    }
    
    for (const [timestamp, _] of this.rateLimiter.usage.tokens) {
      if (timestamp < minuteAgo) {
        this.rateLimiter.usage.tokens.delete(timestamp);
      }
    }
    
    // Schedule next reset
    setTimeout(() => this.resetUsageTracking(), 60000);
  }

  // Check if we can make a request based on rate limits
  async checkRateLimit(model, estimatedTokens = 1000) {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000;
    
    // Get limits for this model
    const rpmLimit = this.rateLimiter.rpm[model] || this.rateLimiter.rpm.default;
    const tpmLimit = this.rateLimiter.tpm[model] || this.rateLimiter.tpm.default;
    
    // Count requests in current minute
    const requestsThisMinute = this.rateLimiter.usage.requests.get(currentMinute) || 0;
    const tokensThisMinute = this.rateLimiter.usage.tokens.get(currentMinute) || 0;
    
    // Check if we're at the limit
    if (requestsThisMinute >= rpmLimit) {
      const waitTime = 60000 - (now - currentMinute);
      console.log(`Rate limit hit for requests (${requestsThisMinute}/${rpmLimit}). Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit(model, estimatedTokens); // Recursive call after waiting
    }
    
    if (tokensThisMinute + estimatedTokens > tpmLimit) {
      const waitTime = 60000 - (now - currentMinute);
      console.log(`Rate limit hit for tokens (${tokensThisMinute + estimatedTokens}/${tpmLimit}). Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit(model, estimatedTokens); // Recursive call after waiting
    }
    
    // Update usage tracking
    this.rateLimiter.usage.requests.set(currentMinute, requestsThisMinute + 1);
    this.rateLimiter.usage.tokens.set(currentMinute, tokensThisMinute + estimatedTokens);
    
    return true;
  }

  // Estimate token count for a request (rough approximation)
  estimateTokens(text) {
    // Rough estimation based on configuration
    return Math.ceil(text.length / aiConfig.tokenEstimation.charactersPerToken);
  }

  // Rate-limited OpenAI API call wrapper
  async makeOpenAICall(model, messages, options = {}) {
    // If using mock service, return mock response
    if (this.isMock) {
      console.log('Mock AI service - returning mock response');
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              case_summary: 'Mock AI analysis - OpenAI not configured',
              key_facts: ['Mock fact 1', 'Mock fact 2'],
              legal_issues: ['Mock legal issue'],
              parties: { plaintiffs: ['Mock Plaintiff'], defendants: ['Mock Defendant'] },
              claims: ['Mock claim'],
              relief_sought: 'Mock relief',
              case_strength_indicators: ['Mock indicator'],
              potential_challenges: ['Mock challenge']
            })
          }
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        model: 'mock-model'
      };
    }

    // Estimate tokens for rate limiting
    const messageText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.estimateTokens(messageText);
    
    // Check rate limits before making call
    await this.checkRateLimit(model, estimatedTokens);
    
    // Add delay between calls to be extra safe
    const delayBetweenCalls = aiConfig.delayBetweenCalls;
    await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages,
        signal: controller.signal,
        ...options
      });
      
      clearTimeout(timeoutId);
      
      // Log actual usage for monitoring
      if (response.usage) {
        console.log(`OpenAI API call completed:`, {
          model,
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        });
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle specific OpenAI errors
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] || 60;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        throw new Error(`Rate limited, retry after ${retryAfter}s`);
      }
      
      if (error.status >= 500) {
        throw new Error(`OpenAI server error: ${error.message}`);
      }
      
      if (error.name === 'AbortError') {
        throw new Error('OpenAI API timeout');
      }
      
      throw error;
    }
  }

  // Step 1: Legal Case Intake Analysis
  async executeIntakeAnalysis(caseData, evidenceData, documentContent) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.INTAKE_ANALYSIS;
      
      console.log(`Making OpenAI API call for case intake analysis: ${caseData.id}`);
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, evidenceData, documentContent)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      console.log(`OpenAI API response received for case ${caseData.id}:`, {
        usage: response.usage,
        model: response.model
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      console.log('Case intake analysis completed:', { caseId: caseData.id });
      
      return result;
    } catch (error) {
      console.error('Case intake analysis error:', error.message);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeIntakeAnalysis' },
        extra: { caseId: caseData.id }
      });
      
      // Return fallback response if OpenAI fails
      return {
        case_metadata: {
          case_type: ['Unknown'],
          case_stage: 'Unknown',
          date_filed: null,
          applicable_law: ['Unknown'],
          issue: ['Unknown']
        },
        case_evidence: {
          ai_extracted_text: 'AI analysis temporarily unavailable - manual review required'
        },
        case_documents: {
          ai_extracted_text: 'AI analysis temporarily unavailable - manual review required'
        },
        error: error.message
      };
    }
  }

  // Step 2: Jurisdiction Analysis
  async executeJurisdictionAnalysis(caseData, intakeResults) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.JURISDICTION_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, intakeResults)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Jurisdiction analysis completed:', result);
      
      return result;
    } catch (error) {
      console.error('Jurisdiction analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeJurisdictionAnalysis' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 3: Case Enhancement with CourtListener data
  async executeCaseEnhancement(caseData, intakeResults, jurisdiction, documentContent) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.CASE_ENHANCEMENT;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, intakeResults, jurisdiction, documentContent)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Case enhancement completed:', { 
        caseId: caseData.id,
        enhancedType: result.enhanced_case_type 
      });
      
      return result;
    } catch (error) {
      console.error('Case enhancement error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeCaseEnhancement' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 4: Case Complexity Scoring
  async executeComplexityScore(caseData, enhancement, precedentSummary) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.COMPLEXITY_SCORE;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, enhancement, precedentSummary)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Complexity calculation completed:', result.case_complexity_score);
      
      return result.case_complexity_score;
    } catch (error) {
      console.error('Complexity calculation error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeComplexityScore' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 5: Court Opinion Analysis
  async executeCourtOpinionAnalysis(opinionText) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.COURT_OPINION_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(opinionText)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Court opinion analysis completed');
      
      return result;
    } catch (error) {
      console.error('Court opinion analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeCourtOpinionAnalysis' }
      });
      throw error;
    }
  }

  // Step 6: Legal Prediction
  async executePredictionAnalysis(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.PREDICTION_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Legal prediction generated:', { 
        outcomeScore: result.outcome_prediction_score 
      });
      
      return result;
    } catch (error) {
      console.error('Legal prediction error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executePredictionAnalysis' }
      });
      throw error;
    }
  }

  // Document structure extraction
  async extractDocumentStructure(text, fileName) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.DOCUMENT_STRUCTURE_EXTRACTION;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(text, fileName)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Document structure extraction completed');
      
      return result;
    } catch (error) {
      console.error('Document structure extraction error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'extractDocumentStructure' },
        extra: { fileName }
      });
      
      // Return fallback structure
      return {
        document_type: 'document',
        parties: { plaintiffs: [], defendants: [] },
        key_dates: {},
        legal_claims: [],
        damages_sought: '',
        key_terms: [],
        jurisdiction: '',
        case_number: '',
        error: error.message
      };
    }
  }

  // Case information fusion
  async fuseCaseInformation(userProvided, documentExtracted) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.CASE_INFORMATION_FUSION;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(userProvided, documentExtracted)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Case information fusion completed');
      
      return result;
    } catch (error) {
      console.error('Case information fusion error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'fuseCaseInformation' }
      });
      
      // Return fallback fused result
      return {
        parties: {
          plaintiffs: userProvided.case_narrative ? this.extractParties(userProvided.case_narrative, 'plaintiff') : [],
          defendants: userProvided.case_narrative ? this.extractParties(userProvided.case_narrative, 'defendant') : []
        },
        legal_claims: userProvided.case_narrative ? this.extractClaims(userProvided.case_narrative) : [],
        damages_sought: userProvided.expected_outcome || '',
        key_dates: {},
        jurisdiction: '',
        case_number: '',
        confidence_score: 0.5,
        error: error.message
      };
    }
  }

  // Enhanced ALEGI Pipeline Methods

  // Precedent Analysis - Feature #3
  async executePrecedentAnalysis(caseData, precedents, intakeAnalysis) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.PRECEDENT_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, precedents, intakeAnalysis)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Precedent analysis completed:', { caseId: caseData.id });
      
      return result;
    } catch (error) {
      console.error('Precedent analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executePrecedentAnalysis' },
        extra: { caseId: caseData.id }
      });
      
      return {
        keyDecisions: [],
        influenceScore: 0,
        relevanceScore: 0,
        summary: 'Precedent analysis temporarily unavailable',
        error: error.message
      };
    }
  }

  // Judicial Analysis - Feature #4
  async executeJudicialAnalysis(caseData, judgeTrends, intakeAnalysis) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.JUDICIAL_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, judgeTrends, intakeAnalysis)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Judicial analysis completed:', { caseId: caseData.id });
      
      return result;
    } catch (error) {
      console.error('Judicial analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeJudicialAnalysis' },
        extra: { caseId: caseData.id }
      });
      
      return {
        summaryJudgmentRate: 0,
        averageTimeline: 0,
        successRate: 0,
        rulingPatterns: [],
        recommendations: [],
        error: error.message
      };
    }
  }

  // Similar Case Analysis - Feature #10
  async executeSimilarCaseAnalysis(caseData, similarCases, intakeAnalysis) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.SIMILAR_CASE_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(caseData, similarCases, intakeAnalysis)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Similar case analysis completed:', { caseId: caseData.id });
      
      return result;
    } catch (error) {
      console.error('Similar case analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeSimilarCaseAnalysis' },
        extra: { caseId: caseData.id }
      });
      
      return {
        closestMatches: [],
        outcomePatterns: [],
        similarityScores: [],
        error: error.message
      };
    }
  }

  // Risk Assessment - Feature #5
  async executeRiskAssessment(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.RISK_ASSESSMENT;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Risk assessment completed:', { caseId: data.caseData.id });
      
      return result;
    } catch (error) {
      console.error('Risk assessment error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeRiskAssessment' },
        extra: { caseId: data.caseData.id }
      });
      
      return {
        overallRiskScore: 50,
        riskLevel: 'medium',
        weaknesses: [],
        strengths: [],
        recommendations: [],
        riskFactors: [],
        error: error.message
      };
    }
  }

  // Cost Estimation - Feature #6
  async executeCostEstimation(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.COST_ESTIMATION;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Cost estimation completed:', { caseId: data.caseData.id });
      
      return result;
    } catch (error) {
      console.error('Cost estimation error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeCostEstimation' },
        extra: { caseId: data.caseData.id }
      });
      
      return {
        totalEstimatedCost: 0,
        breakdown: {},
        attorneyFees: 0,
        courtCosts: 0,
        expertWitnessFees: 0,
        otherExpenses: 0,
        costRange: { low: 0, high: 0 },
        confidence: 'medium',
        error: error.message
      };
    }
  }

  // Financial Prediction - Feature #7
  async executeFinancialPrediction(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.FINANCIAL_PREDICTION;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Financial prediction completed:', { caseId: data.caseData.id });
      
      return result;
    } catch (error) {
      console.error('Financial prediction error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeFinancialPrediction' },
        extra: { caseId: data.caseData.id }
      });
      
      return {
        settlementRange: { low: 0, likely: 0, high: 0 },
        verdictRange: { low: 0, likely: 0, high: 0 },
        confidence: 'medium',
        factors: [],
        methodology: '',
        comparableCases: [],
        error: error.message
      };
    }
  }

  // Settlement Analysis - Feature #2
  async executeSettlementAnalysis(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.SETTLEMENT_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Settlement analysis completed:', { caseId: data.caseData.id });
      
      return result;
    } catch (error) {
      console.error('Settlement analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeSettlementAnalysis' },
        extra: { caseId: data.caseData.id }
      });
      
      return {
        recommendation: 'neutral',
        settlementProbability: 50,
        trialProbability: 50,
        settlementAdvantages: [],
        trialAdvantages: [],
        costComparison: {},
        timelineComparison: {},
        riskComparison: {},
        error: error.message
      };
    }
  }

  // Outcome Probability - Feature #1
  async executeOutcomeProbability(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.OUTCOME_PROBABILITY;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Outcome probability completed:', { caseId: data.caseData.id });
      
      return result;
    } catch (error) {
      console.error('Outcome probability error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeOutcomeProbability' },
        extra: { caseId: data.caseData.id }
      });
      
      return {
        successProbability: 50,
        failureProbability: 50,
        settlementProbability: 50,
        confidence: 'medium',
        factors: {},
        methodology: '',
        riskLevel: 'medium',
        caseStrengthScore: 50,
        error: error.message
      };
    }
  }

  // Timeline Estimation - Feature #8
  async executeTimelineEstimation(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.TIMELINE_ESTIMATION;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Timeline estimation completed:', { caseId: data.caseData.id });
      
      return result;
    } catch (error) {
      console.error('Timeline estimation error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeTimelineEstimation' },
        extra: { caseId: data.caseData.id }
      });
      
      return {
        estimatedDuration: 0,
        durationRange: { min: 0, max: 0 },
        keyMilestones: [],
        potentialDelays: [],
        confidence: 'medium',
        methodology: '',
        error: error.message
      };
    }
  }

  // Comprehensive Analysis - Final Integration
  async executeComprehensiveAnalysis(data) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.COMPREHENSIVE_ANALYSIS;
      
      const response = await this.makeOpenAICall(model, [{
        role: 'user',
        content: prompt(data)
      }], {
        temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Comprehensive analysis completed:', { caseId: data.caseId });
      
      return result;
    } catch (error) {
      console.error('Comprehensive analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'executeComprehensiveAnalysis' },
        extra: { caseId: data.caseId }
      });
      
      return {
        summary: 'Comprehensive analysis temporarily unavailable',
        recommendations: [],
        nextSteps: [],
        error: error.message
      };
    }
  }

  // Helper method to extract parties from text
  extractParties(text, partyType) {
    // Simple extraction - in production, use more sophisticated NLP
    const words = text.split(' ');
    const parties = [];
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].toLowerCase().includes(partyType)) {
        if (words[i + 1] && words[i + 1].length > 2) {
          parties.push(words[i + 1]);
        }
      }
    }
    return parties.slice(0, 5); // Limit to 5 parties
  }

  // Helper method to extract claims from text
  extractClaims(text) {
    const claims = [];
    const claimKeywords = ['breach', 'negligence', 'discrimination', 'harassment', 'contract', 'tort'];
    
    claimKeywords.forEach(keyword => {
      if (text.toLowerCase().includes(keyword)) {
        claims.push(keyword);
      }
    });
    
    return claims;
  }

  // Complete case processing flow matching Make scenario
  async processCaseComplete(caseData, evidence, documentContent) {
    const results = {
      intakeAnalysis: null,
      jurisdiction: null,
      enhancement: null,
      complexity: null,
      prediction: null,
      courtListenerCases: null,
      errors: []
    };

    try {
      // Step 1: Intake Analysis
      console.log(`Starting AI processing for case ${caseData.id}`);
      results.intakeAnalysis = await this.analyzeCaseIntake(caseData, evidence, documentContent);
      
      // Step 2: Jurisdiction Analysis
      results.jurisdiction = await this.analyzeJurisdiction(
        caseData, 
        results.intakeAnalysis
      );
      
      // Step 3: CourtListener Enrichment
      results.courtListenerCases = await courtListenerService.findSimilarCases({
        ...caseData,
        ...results.jurisdiction
      });
      
      // Step 4: Case Enhancement with CourtListener data
      results.enhancement = await this.enhanceCaseDetails(
        caseData,
        results.intakeAnalysis,
        results.jurisdiction,
        results.courtListenerCases
      );
      
      // Merge jurisdiction info into enhancement
      results.enhancement = {
        ...results.enhancement,
        ...results.jurisdiction
      };
      
      // Step 5: Complexity Calculation
      results.complexity = await this.calculateComplexity(
        caseData,
        results.enhancement,
        evidence
      );
      
      // Step 6: Legal Prediction with all enriched data
      results.prediction = await this.generateLegalPrediction(
        results.enhancement,
        caseData,
        results.complexity,
        results.courtListenerCases
      );
      
      console.log(`AI processing completed for case ${caseData.id}`);
      return results;
      
    } catch (error) {
      console.error(`AI processing failed for case ${caseData.id}:`, error);
      Sentry.captureException(error);
      results.errors.push({
        step: 'overall',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      // Return partial results even if some steps failed
      return results;
    }
  }

  // Retry logic for failed AI calls with rate limiting
  async retryAICall(fn, maxRetries = null, delay = null) {
    const config = aiConfig.retry;
    maxRetries = maxRetries || config.maxRetries;
    delay = delay || config.baseDelay;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        console.log(`AI call failed, retrying... (${i + 1}/${maxRetries})`);
        // Exponential backoff with rate limiting consideration
        const backoffDelay = Math.min(delay * Math.pow(2, i), config.maxDelay);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  // Get current rate limit status for monitoring
  getRateLimitStatus() {
    if (this.isMock) {
      return {
        status: 'mock',
        message: 'Mock AI service - no rate limiting',
        currentMinute: new Date().toISOString(),
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        limits: {
          rpm: 'N/A',
          tpm: 'N/A'
        }
      };
    }

    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000;
    
    const requestsThisMinute = this.rateLimiter.usage.requests.get(currentMinute) || 0;
    const tokensThisMinute = this.rateLimiter.usage.tokens.get(currentMinute) || 0;
    
    return {
      currentMinute: new Date(currentMinute).toISOString(),
      requestsThisMinute,
      tokensThisMinute,
      limits: {
        rpm: this.rateLimiter.rpm,
        tpm: this.rateLimiter.tpm
      }
    };
  }
}

module.exports = new AIService();