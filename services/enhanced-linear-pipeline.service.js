// services/enhanced-linear-pipeline.service.js
// Comprehensive ALEGI processing pipeline implementing all 11 features
const { createClient } = require('@supabase/supabase-js');
const AIService = require('./ai.service');
const PDFService = require('./pdf.service');
const CourtListenerService = require('./courtlistener.service');
const ErrorTrackingService = require('./error-tracking.service');
const Sentry = require('@sentry/node');

class EnhancedLinearPipelineService {
  constructor() {
    // Initialize Supabase client
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
    
    // Initialize services
    this.aiService = new AIService();
    this.pdfService = new PDFService();
    this.courtListenerService = new CourtListenerService();
    this.errorTrackingService = new ErrorTrackingService();
  }

  async executeEnhancedPipeline(caseId) {
    console.log(`🚀 Starting Enhanced ALEGI Pipeline for case ${caseId}`);
    
    const pipelineSteps = [
      { name: 'extractDocuments', fn: this.extractDocumentContent.bind(this) },
      { name: 'caseIntakeAnalysis', fn: this.performCaseIntakeAnalysis.bind(this) },
      { name: 'precedentAnalysis', fn: this.performPrecedentAnalysis.bind(this) },
      { name: 'judgeCourtTrends', fn: this.analyzeJudgeCourtTrends.bind(this) },
      { name: 'similarCaseFinder', fn: this.findSimilarCases.bind(this) },
      { name: 'riskAssessment', fn: this.performRiskAssessment.bind(this) },
      { name: 'costEstimator', fn: this.estimateLitigationCosts.bind(this) },
      { name: 'financialPrediction', fn: this.predictFinancialOutcomes.bind(this) },
      { name: 'settlementAnalysis', fn: this.analyzeSettlementVsTrial.bind(this) },
      { name: 'outcomeProbability', fn: this.calculateOutcomeProbability.bind(this) },
      { name: 'timelineEstimate', fn: this.estimateResolutionTimeline.bind(this) },
      { name: 'lawUpdates', fn: this.checkRealTimeLawUpdates.bind(this) },
      { name: 'finalIntegration', fn: this.integrateAllAnalysis.bind(this) }
    ];

    const context = { 
      caseId, 
      data: {},
      features: {
        outcomeProbability: null,
        settlementAnalysis: null,
        precedentAnalysis: null,
        judgeTrends: null,
        riskAssessment: null,
        costEstimator: null,
        financialPrediction: null,
        timelineEstimate: null,
        similarCases: null,
        lawUpdates: null
      }
    };
    
    console.log(`📋 Enhanced Pipeline configured with ${pipelineSteps.length} steps`);
    
    // Update case status to processing
    await this.updateCaseStatus(caseId, 'processing');
    
    for (let i = 0; i < pipelineSteps.length; i++) {
      const step = pipelineSteps[i];
      const stepNumber = i + 1;
      
      try {
        console.log(`\n🔄 Step ${stepNumber}/${pipelineSteps.length}: Executing ${step.name} for case ${caseId}`);
        
        const stepStartTime = Date.now();
        await step.fn(context);
        const stepDuration = Date.now() - stepStartTime;
        
        console.log(`✅ Step ${stepNumber}/${pipelineSteps.length}: Completed ${step.name} for case ${caseId} (${stepDuration}ms)`);
        
        // Update processing progress
        await this.updateProcessingProgress(caseId, stepNumber, pipelineSteps.length, step.name);
        
      } catch (error) {
        console.error(`❌ Step ${stepNumber}/${pipelineSteps.length}: Failed ${step.name} for case ${caseId}:`, error);
        
        // Log error to tracking service
        await this.errorTrackingService.logProcessingError(caseId, error, {
          step: step.name,
          stepNumber: stepNumber,
          context: context.data
        });
        
        // Update case status to failed
        await this.updateCaseStatus(caseId, 'failed', error.message);
        
        throw new Error(`Enhanced pipeline failed at step ${stepNumber} (${step.name}): ${error.message}`);
      }
    }
    
    console.log(`\n🎯 All Enhanced Pipeline steps completed successfully for case ${caseId}`);
    
    // Mark as completed
    await this.updateCaseStatus(caseId, 'completed');
    
    console.log(`🎉 Enhanced ALEGI Pipeline execution completed successfully for case ${caseId}`);
    return context.features;
  }

  // Step 1: Extract and process all case documents
  async extractDocumentContent(context) {
    const { caseId } = context;
    
    console.log(`📄 Extracting document content for case ${caseId}`);
    
    // Get all case documents
    const { data: documents, error } = await this.supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    
    let extractedContent = '';
    const documentAnalysis = [];
    
    for (const document of documents || []) {
      if (document.file_path && !document.ai_extracted_text) {
        try {
          console.log(`Processing document: ${document.file_name}`);
          
          // Extract text from PDF
          const extractedText = await this.pdfService.extractText(document.file_path);
          
          // Update document with extracted text
          await this.supabase
            .from('case_documents')
            .update({ 
              ai_extracted_text: extractedText.text,
              processed_at: new Date().toISOString()
            })
            .eq('id', document.id);
          
          extractedContent += `\n\n--- ${document.file_name} ---\n${extractedText.text}`;
          
          documentAnalysis.push({
            documentId: document.id,
            fileName: document.file_name,
            extractedText: extractedText.text,
            pages: extractedText.pages,
            confidence: extractedText.confidence
          });
          
        } catch (error) {
          console.error(`Failed to process document ${document.file_name}:`, error);
          // Continue with other documents
        }
      } else if (document.ai_extracted_text) {
        extractedContent += `\n\n--- ${document.file_name} ---\n${document.ai_extracted_text}`;
      }
    }
    
    context.data.extractedContent = extractedContent;
    context.data.documentAnalysis = documentAnalysis;
    
    console.log(`✅ Document extraction completed for case ${caseId}`);
  }

  // Step 2: Perform comprehensive case intake analysis
  async performCaseIntakeAnalysis(context) {
    const { caseId } = context;
    
    console.log(`🔍 Performing comprehensive case intake analysis for case ${caseId}`);
    
    // Get case data
    const { data: caseData, error } = await this.supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (error) throw error;
    
    // Get case evidence
    const { data: evidence } = await this.supabase
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId);
    
    // Perform AI-powered intake analysis
    const intakeAnalysis = await this.aiService.executeIntakeAnalysis(
      caseData,
      evidence || [],
      context.data.extractedContent
    );
    
    // Store intake analysis results
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'intake',
        analysis_data: intakeAnalysis,
        created_at: new Date().toISOString()
      });
    
    context.data.caseData = caseData;
    context.data.evidence = evidence || [];
    context.data.intakeAnalysis = intakeAnalysis;
    
    console.log(`✅ Case intake analysis completed for case ${caseId}`);
  }

  // Step 3: Precedent Analysis - Feature #3
  async performPrecedentAnalysis(context) {
    const { caseId } = context;
    
    console.log(`⚖️ Performing precedent analysis for case ${caseId}`);
    
    const { caseData, intakeAnalysis } = context.data;
    
    // Search for relevant precedents using CourtListener
    const precedentResults = await this.courtListenerService.findSimilarCases({
      ...caseData,
      legal_issues: intakeAnalysis.case_metadata?.issue || [],
      case_type: intakeAnalysis.case_metadata?.case_type || []
    });
    
    // AI analysis of precedents
    const precedentAnalysis = await this.aiService.executePrecedentAnalysis(
      caseData,
      precedentResults.results || [],
      intakeAnalysis
    );
    
    // Store precedent analysis
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'precedent',
        analysis_data: {
          precedents: precedentResults.results || [],
          analysis: precedentAnalysis,
          total_found: precedentResults.count || 0
        },
        created_at: new Date().toISOString()
      });
    
    context.features.precedentAnalysis = {
      precedents: precedentResults.results || [],
      analysis: precedentAnalysis,
      totalFound: precedentResults.count || 0,
      keyDecisions: precedentAnalysis.keyDecisions || [],
      influenceScore: precedentAnalysis.influenceScore || 0
    };
    
    console.log(`✅ Precedent analysis completed for case ${caseId}`);
  }

  // Step 4: Judge & Court Trends - Feature #4
  async analyzeJudgeCourtTrends(context) {
    const { caseId } = context;
    
    console.log(`👨‍⚖️ Analyzing judge and court trends for case ${caseId}`);
    
    const { caseData, intakeAnalysis } = context.data;
    
    // Get judge information from case data
    const judgeName = caseData.judge_name || caseData.assigned_judge;
    const courtName = caseData.court_name || caseData.jurisdiction;
    
    // Search for judge-specific cases
    const judgeTrends = await this.courtListenerService.searchJudgeTrends(
      judgeName,
      courtName,
      caseData.case_type
    );
    
    // AI analysis of judicial behavior
    const judicialAnalysis = await this.aiService.executeJudicialAnalysis(
      caseData,
      judgeTrends,
      intakeAnalysis
    );
    
    // Store judge trends analysis
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'judge_trends',
        analysis_data: {
          judgeName,
          courtName,
          trends: judgeTrends,
          analysis: judicialAnalysis
        },
        created_at: new Date().toISOString()
      });
    
    context.features.judgeTrends = {
      judgeName,
      courtName,
      summaryJudgmentRate: judicialAnalysis.summaryJudgmentRate || 0,
      averageTimeline: judicialAnalysis.averageTimeline || 0,
      successRate: judicialAnalysis.successRate || 0,
      rulingPatterns: judicialAnalysis.rulingPatterns || [],
      recommendations: judicialAnalysis.recommendations || []
    };
    
    console.log(`✅ Judge and court trends analysis completed for case ${caseId}`);
  }

  // Step 5: Similar Case Finder - Feature #10
  async findSimilarCases(context) {
    const { caseId } = context;
    
    console.log(`🔍 Finding similar cases for case ${caseId}`);
    
    const { caseData, intakeAnalysis } = context.data;
    
    // Multi-source similar case search
    const [courtListenerCases, internalCases] = await Promise.all([
      this.courtListenerService.searchSimilarCases(caseData, intakeAnalysis),
      this.searchInternalSimilarCases(caseData, intakeAnalysis)
    ]);
    
    // AI analysis of similar cases
    const similarCaseAnalysis = await this.aiService.executeSimilarCaseAnalysis(
      caseData,
      [...courtListenerCases.results || [], ...internalCases],
      intakeAnalysis
    );
    
    // Store similar cases analysis
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'similar_cases',
        analysis_data: {
          courtListenerCases: courtListenerCases.results || [],
          internalCases,
          analysis: similarCaseAnalysis
        },
        created_at: new Date().toISOString()
      });
    
    context.features.similarCases = {
      totalFound: (courtListenerCases.results || []).length + internalCases.length,
      courtListenerCases: courtListenerCases.results || [],
      internalCases,
      analysis: similarCaseAnalysis,
      closestMatches: similarCaseAnalysis.closestMatches || [],
      outcomePatterns: similarCaseAnalysis.outcomePatterns || []
    };
    
    console.log(`✅ Similar case finder completed for case ${caseId}`);
  }

  // Step 6: Risk Assessment - Feature #5
  async performRiskAssessment(context) {
    const { caseId } = context;
    
    console.log(`⚠️ Performing risk assessment for case ${caseId}`);
    
    const { caseData, intakeAnalysis, features } = context.data;
    
    // Comprehensive risk analysis using all available data
    const riskAnalysis = await this.aiService.executeRiskAssessment({
      caseData,
      intakeAnalysis,
      precedentAnalysis: features.precedentAnalysis,
      judgeTrends: features.judgeTrends,
      similarCases: features.similarCases
    });
    
    // Store risk assessment
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'risk_assessment',
        analysis_data: riskAnalysis,
        created_at: new Date().toISOString()
      });
    
    context.features.riskAssessment = {
      overallRiskScore: riskAnalysis.overallRiskScore || 0,
      riskLevel: riskAnalysis.riskLevel || 'medium',
      weaknesses: riskAnalysis.weaknesses || [],
      strengths: riskAnalysis.strengths || [],
      recommendations: riskAnalysis.recommendations || [],
      riskFactors: riskAnalysis.riskFactors || []
    };
    
    console.log(`✅ Risk assessment completed for case ${caseId}`);
  }

  // Step 7: Litigation Cost Estimator - Feature #6
  async estimateLitigationCosts(context) {
    const { caseId } = context;
    
    console.log(`💰 Estimating litigation costs for case ${caseId}`);
    
    const { caseData, intakeAnalysis, features } = context.data;
    
    // Cost estimation using historical data and case characteristics
    const costEstimate = await this.aiService.executeCostEstimation({
      caseData,
      intakeAnalysis,
      riskAssessment: features.riskAssessment,
      similarCases: features.similarCases,
      judgeTrends: features.judgeTrends
    });
    
    // Store cost estimate
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'cost_estimate',
        analysis_data: costEstimate,
        created_at: new Date().toISOString()
      });
    
    context.features.costEstimator = {
      totalEstimatedCost: costEstimate.totalEstimatedCost || 0,
      breakdown: costEstimate.breakdown || {},
      attorneyFees: costEstimate.attorneyFees || 0,
      courtCosts: costEstimate.courtCosts || 0,
      expertWitnessFees: costEstimate.expertWitnessFees || 0,
      otherExpenses: costEstimate.otherExpenses || 0,
      costRange: costEstimate.costRange || { low: 0, high: 0 },
      confidence: costEstimate.confidence || 'medium'
    };
    
    console.log(`✅ Litigation cost estimation completed for case ${caseId}`);
  }

  // Step 8: Financial Outcome Prediction - Feature #7
  async predictFinancialOutcomes(context) {
    const { caseId } = context;
    
    console.log(`💵 Predicting financial outcomes for case ${caseId}`);
    
    const { caseData, intakeAnalysis, features } = context.data;
    
    // Financial prediction using all available data
    const financialPrediction = await this.aiService.executeFinancialPrediction({
      caseData,
      intakeAnalysis,
      similarCases: features.similarCases,
      judgeTrends: features.judgeTrends,
      riskAssessment: features.riskAssessment
    });
    
    // Store financial prediction
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'financial_prediction',
        analysis_data: financialPrediction,
        created_at: new Date().toISOString()
      });
    
    context.features.financialPrediction = {
      settlementRange: financialPrediction.settlementRange || { low: 0, likely: 0, high: 0 },
      verdictRange: financialPrediction.verdictRange || { low: 0, likely: 0, high: 0 },
      confidence: financialPrediction.confidence || 'medium',
      factors: financialPrediction.factors || [],
      methodology: financialPrediction.methodology || '',
      comparableCases: financialPrediction.comparableCases || []
    };
    
    console.log(`✅ Financial outcome prediction completed for case ${caseId}`);
  }

  // Step 9: Settlement vs Trial Analysis - Feature #2
  async analyzeSettlementVsTrial(context) {
    const { caseId } = context;
    
    console.log(`⚖️ Analyzing settlement vs trial options for case ${caseId}`);
    
    const { caseData, intakeAnalysis, features } = context.data;
    
    // Comprehensive settlement vs trial analysis
    const settlementAnalysis = await this.aiService.executeSettlementAnalysis({
      caseData,
      intakeAnalysis,
      financialPrediction: features.financialPrediction,
      costEstimator: features.costEstimator,
      riskAssessment: features.riskAssessment,
      judgeTrends: features.judgeTrends,
      similarCases: features.similarCases
    });
    
    // Store settlement analysis
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'settlement_analysis',
        analysis_data: settlementAnalysis,
        created_at: new Date().toISOString()
      });
    
    context.features.settlementAnalysis = {
      settlementRecommendation: settlementAnalysis.recommendation || 'neutral',
      settlementProbability: settlementAnalysis.settlementProbability || 0,
      trialProbability: settlementAnalysis.trialProbability || 0,
      settlementAdvantages: settlementAnalysis.settlementAdvantages || [],
      trialAdvantages: settlementAnalysis.trialAdvantages || [],
      costComparison: settlementAnalysis.costComparison || {},
      timelineComparison: settlementAnalysis.timelineComparison || {},
      riskComparison: settlementAnalysis.riskComparison || {}
    };
    
    console.log(`✅ Settlement vs trial analysis completed for case ${caseId}`);
  }

  // Step 10: Outcome Probability Score - Feature #1
  async calculateOutcomeProbability(context) {
    const { caseId } = context;
    
    console.log(`📊 Calculating outcome probability score for case ${caseId}`);
    
    const { caseData, intakeAnalysis, features } = context.data;
    
    // Calculate comprehensive outcome probability
    const outcomeProbability = await this.aiService.executeOutcomeProbability({
      caseData,
      intakeAnalysis,
      precedentAnalysis: features.precedentAnalysis,
      judgeTrends: features.judgeTrends,
      riskAssessment: features.riskAssessment,
      similarCases: features.similarCases,
      settlementAnalysis: features.settlementAnalysis
    });
    
    // Store outcome probability
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'outcome_probability',
        analysis_data: outcomeProbability,
        created_at: new Date().toISOString()
      });
    
    context.features.outcomeProbability = {
      successProbability: outcomeProbability.successProbability || 0,
      failureProbability: outcomeProbability.failureProbability || 0,
      settlementProbability: outcomeProbability.settlementProbability || 0,
      confidence: outcomeProbability.confidence || 'medium',
      factors: outcomeProbability.factors || {},
      methodology: outcomeProbability.methodology || '',
      riskLevel: outcomeProbability.riskLevel || 'medium',
      caseStrengthScore: outcomeProbability.caseStrengthScore || 0
    };
    
    console.log(`✅ Outcome probability calculation completed for case ${caseId}`);
  }

  // Step 11: Timeline Estimate - Feature #8
  async estimateResolutionTimeline(context) {
    const { caseId } = context;
    
    console.log(`⏰ Estimating resolution timeline for case ${caseId}`);
    
    const { caseData, intakeAnalysis, features } = context.data;
    
    // Timeline estimation using all available data
    const timelineEstimate = await this.aiService.executeTimelineEstimation({
      caseData,
      intakeAnalysis,
      judgeTrends: features.judgeTrends,
      similarCases: features.similarCases,
      riskAssessment: features.riskAssessment,
      settlementAnalysis: features.settlementAnalysis
    });
    
    // Store timeline estimate
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'timeline_estimate',
        analysis_data: timelineEstimate,
        created_at: new Date().toISOString()
      });
    
    context.features.timelineEstimate = {
      estimatedDuration: timelineEstimate.estimatedDuration || 0,
      durationRange: timelineEstimate.durationRange || { min: 0, max: 0 },
      keyMilestones: timelineEstimate.keyMilestones || [],
      potentialDelays: timelineEstimate.potentialDelays || [],
      confidence: timelineEstimate.confidence || 'medium',
      methodology: timelineEstimate.methodology || ''
    };
    
    console.log(`✅ Timeline estimation completed for case ${caseId}`);
  }

  // Step 12: Real-time Law Updates - Feature #11
  async checkRealTimeLawUpdates(context) {
    const { caseId } = context;
    
    console.log(`📰 Checking real-time law updates for case ${caseId}`);
    
    const { caseData, intakeAnalysis } = context.data;
    
    // Check for recent law changes and updates
    const lawUpdates = await this.checkRecentLawChanges({
      jurisdiction: caseData.jurisdiction,
      caseType: intakeAnalysis.case_metadata?.case_type || [],
      applicableLaw: intakeAnalysis.case_metadata?.applicable_law || []
    });
    
    // Store law updates
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'law_updates',
        analysis_data: lawUpdates,
        created_at: new Date().toISOString()
      });
    
    context.features.lawUpdates = {
      recentChanges: lawUpdates.recentChanges || [],
      relevantUpdates: lawUpdates.relevantUpdates || [],
      impactAssessment: lawUpdates.impactAssessment || {},
      recommendations: lawUpdates.recommendations || [],
      lastChecked: new Date().toISOString()
    };
    
    console.log(`✅ Real-time law updates check completed for case ${caseId}`);
  }

  // Step 13: Final Integration - Combine all features
  async integrateAllAnalysis(context) {
    const { caseId } = context;
    
    console.log(`🔗 Integrating all analysis for case ${caseId}`);
    
    // Create comprehensive case summary
    const comprehensiveAnalysis = await this.aiService.executeComprehensiveAnalysis({
      caseId,
      features: context.features,
      caseData: context.data.caseData,
      intakeAnalysis: context.data.intakeAnalysis
    });
    
    // Store comprehensive analysis
    await this.supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'comprehensive',
        analysis_data: {
          features: context.features,
          summary: comprehensiveAnalysis.summary,
          recommendations: comprehensiveAnalysis.recommendations,
          nextSteps: comprehensiveAnalysis.nextSteps
        },
        created_at: new Date().toISOString()
      });
    
    // Update case with processing completion
    await this.supabase
      .from('case_briefs')
      .update({
        processing_status: 'completed',
        ai_processed: true,
        last_ai_update: new Date().toISOString(),
        analysis_summary: comprehensiveAnalysis.summary
      })
      .eq('id', caseId);
    
    console.log(`✅ All analysis integrated for case ${caseId}`);
  }

  // Helper methods
  async updateCaseStatus(caseId, status, errorMessage = null) {
    if (!this.supabase) return;
    
    const updateData = {
      processing_status: status,
      last_ai_update: new Date().toISOString()
    };
    
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }
    
    await this.supabase
      .from('case_briefs')
      .update(updateData)
      .eq('id', caseId);
  }

  async updateProcessingProgress(caseId, currentStep, totalSteps, stepName) {
    if (!this.supabase) return;
    
    await this.supabase
      .from('case_processing_progress')
      .upsert({
        case_id: caseId,
        current_step: currentStep,
        total_steps: totalSteps,
        current_step_name: stepName,
        progress_percentage: Math.round((currentStep / totalSteps) * 100),
        updated_at: new Date().toISOString()
      });
  }

  async searchInternalSimilarCases(caseData, intakeAnalysis) {
    // Search internal database for similar cases
    const { data: similarCases } = await this.supabase
      .from('case_briefs')
      .select('*')
      .eq('case_type', caseData.case_type)
      .eq('jurisdiction', caseData.jurisdiction)
      .limit(10);
    
    return similarCases || [];
  }

  async checkRecentLawChanges(params) {
    // Placeholder for law update checking
    // This would integrate with legal databases or RSS feeds
    return {
      recentChanges: [],
      relevantUpdates: [],
      impactAssessment: {},
      recommendations: []
    };
  }
}

module.exports = EnhancedLinearPipelineService; 