// services/ai.service.js
const OpenAI = require('openai');
const Sentry = require('@sentry/node');
const courtListenerService = require('./courtlistener.service');
const { AI_PROMPTS } = require('./ai.prompts');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // Step 1: Legal Case Intake Analysis
  async analyzeCaseIntake(caseData, evidence, documentContent) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.INTAKE_ANALYSIS;
      
      const response = await this.openai.chat.completions.create({
        model,
        temperature,
        messages: [{
          role: 'user',
          content: prompt(caseData, evidence, documentContent)
        }],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Case intake analysis completed:', { caseId: caseData.id });
      
      return result;
    } catch (error) {
      console.error('Case intake analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'analyzeCaseIntake' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 2: Jurisdiction Analysis
  async analyzeJurisdiction(caseData, intakeAnalysis) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.JURISDICTION_ANALYSIS;
      
      const response = await this.openai.chat.completions.create({
        model,
        temperature,
        messages: [{
          role: 'user',
          content: prompt(caseData, intakeAnalysis)
        }],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Jurisdiction analysis completed:', result);
      
      return result;
    } catch (error) {
      console.error('Jurisdiction analysis error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'analyzeJurisdiction' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 3: Case Enhancement with CourtListener data
  async enhanceCaseDetails(caseData, intakeAnalysis, jurisdiction, courtListenerCases) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.CASE_ENHANCEMENT;
      
      const response = await this.openai.chat.completions.create({
        model,
        temperature,
        messages: [{
          role: 'user',
          content: prompt(caseData, intakeAnalysis, jurisdiction, courtListenerCases)
        }],
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
        tags: { service: 'ai', operation: 'enhanceCase' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 4: Case Complexity Scoring
  async calculateComplexity(caseData, enhancement, evidence) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.COMPLEXITY_CALCULATION;
      
      const response = await this.openai.chat.completions.create({
        model,
        temperature,
        messages: [{
          role: 'user',
          content: prompt(caseData, enhancement, evidence)
        }],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Complexity calculation completed:', result);
      
      return result.case_complexity_score;
    } catch (error) {
      console.error('Complexity calculation error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'calculateComplexity' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
  }

  // Step 5: Legal Prediction
  async generateLegalPrediction(enhancement, caseData, complexityScore, courtListenerCases) {
    try {
      const { model, temperature, prompt } = AI_PROMPTS.LEGAL_PREDICTION;
      
      const response = await this.openai.chat.completions.create({
        model,
        temperature,
        messages: [{
          role: 'user',
          content: prompt(enhancement, caseData, complexityScore, courtListenerCases)
        }],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log('Legal prediction generated:', { 
        caseId: caseData.id,
        outcomeScore: result.outcome_prediction_score 
      });
      
      return result;
    } catch (error) {
      console.error('Legal prediction error:', error);
      Sentry.captureException(error, {
        tags: { service: 'ai', operation: 'generateLegalPrediction' },
        extra: { caseId: caseData.id }
      });
      throw error;
    }
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

  // Retry logic for failed AI calls
  async retryAICall(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        console.log(`AI call failed, retrying... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
}

module.exports = new AIService();