import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import Bull from 'bull';
import { logger } from '../../utils/logger.js';
import { metrics } from '../../utils/metrics.js';

class AIEnrichmentService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.setupQueueProcessing();
  }

  /**
   * Setup queue processing
   */
  setupQueueProcessing() {
    const aiQueue = new Bull('ai-enrichment', {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD
      }
    });

    // Process AI enrichment jobs with concurrency of 5
    aiQueue.process('enrich-case', 5, async (job) => {
      return await this.enrichCase(job.data);
    });

    aiQueue.on('completed', (job, result) => {
      logger.info(`AI enrichment completed for case ${job.data.caseId}`);
      metrics.recordProcessingTime('AIEnrichment', Date.now() - job.timestamp);
    });

    aiQueue.on('failed', (job, err) => {
      logger.error(`AI enrichment failed for case ${job.data.caseId}:`, err);
      metrics.recordError('AIEnrichment', err);
      this.handleEnrichmentError(job.data.caseId, err);
    });

    this.aiQueue = aiQueue;
  }

  /**
   * Main enrichment function
   */
  async enrichCase(data) {
    const { caseId, caseData, updateType } = data;
    const startTime = Date.now();
    
    try {
      logger.info('Starting AI enrichment', { 
        caseId, 
        updateType,
        hasDocuments: !!caseData.documents?.length 
      });

      // Fetch processed documents if available
      const documents = await this.fetchProcessedDocuments(caseId);
      
      // Prepare context for AI
      const context = this.prepareAIContext({
        caseData,
        documents,
        updateType
      });
      
      // Generate AI predictions in parallel
      const [
        predictions,
        riskAssessment,
        recommendations,
        precedents
      ] = await Promise.all([
        this.generatePredictions(context),
        this.generateRiskAssessment(context),
        this.generateRecommendations(context),
        this.findRelevantPrecedents(context)
      ]);
      
      // Combine all AI results
      const enrichmentResults = {
        predictions,
        risk_assessment: riskAssessment,
        recommendations,
        precedents,
        confidence_score: this.calculateConfidenceScore({
          predictions,
          documentsCount: documents.length,
          evidenceCount: caseData.case_evidence?.length || 0
        }),
        processing_time: Date.now() - startTime,
        model_version: 'gpt-4-turbo',
        generated_at: new Date().toISOString()
      };
      
      // Store AI enrichment results
      await this.storeEnrichmentResults(caseId, enrichmentResults);
      
      // Update case with key metrics
      await this.updateCaseWithAIInsights(caseId, enrichmentResults);
      
      // Send notifications if needed
      await this.sendNotifications(caseId, enrichmentResults);
      
      logger.info('AI enrichment completed successfully', {
        caseId,
        processingTime: Date.now() - startTime,
        confidenceScore: enrichmentResults.confidence_score
      });
      
      return { success: true, caseId, results: enrichmentResults };
      
    } catch (error) {
      logger.error('AI enrichment error:', error);
      await this.handleEnrichmentError(caseId, error);
      throw error;
    }
  }

  // ... rest of the methods remain the same, just change require to import
}

export default new AIEnrichmentService();