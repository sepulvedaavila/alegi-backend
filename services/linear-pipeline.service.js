// services/linear-pipeline.service.js
const { createClient } = require('@supabase/supabase-js');
const AIService = require('./ai.service');
const PDFService = require('./pdf.service');
const CourtListenerService = require('./courtlistener.service');
const ErrorTrackingService = require('./error-tracking.service');

class LinearPipelineService {
  constructor() {
    // Initialize Supabase client
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : {
          from: (table) => ({
            select: () => ({
              eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
              single: () => Promise.resolve({ data: null, error: null })
            }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            insert: () => Promise.resolve({ data: null, error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
            delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
          })
        };
    
    // Initialize services
    this.aiService = AIService;
    this.pdfService = PDFService;
    this.courtListenerService = CourtListenerService;
    this.errorTrackingService = ErrorTrackingService;
  }

  async executeLinearPipeline(caseId) {
    const steps = [
      { name: 'extractPDF', fn: this.extractPDFContent.bind(this) },
      { name: 'intakeAnalysis', fn: this.executeIntakeAnalysis.bind(this) },
      { name: 'dbInsert1', fn: this.insertIntakeData.bind(this) },
      { name: 'jurisdictionAnalysis', fn: this.executeJurisdictionAnalysis.bind(this) },
      { name: 'caseEnhancement', fn: this.executeCaseEnhancement.bind(this) },
      { name: 'dbInsert2', fn: this.insertEnhancementData.bind(this) },
      { name: 'courtListenerSearch', fn: this.searchCourtListener.bind(this) },
      { name: 'courtListenerOpinions', fn: this.fetchOpinions.bind(this) },
      { name: 'courtOpinionAnalysis', fn: this.executeCourtOpinionAnalysis.bind(this) },
      { name: 'dbInsert3', fn: this.insertOpinionData.bind(this) },
      { name: 'complexityScore', fn: this.executeComplexityScore.bind(this) },
      { name: 'predictionAnalysis', fn: this.executePredictionAnalysis.bind(this) },
      { name: 'finalDbInsert', fn: this.insertFinalData.bind(this) }
    ];

    const context = { caseId, data: {} };
    
    for (const step of steps) {
      try {
        console.log(`Executing step: ${step.name} for case ${caseId}`);
        await step.fn(context);
        console.log(`Completed step: ${step.name} for case ${caseId}`);
      } catch (error) {
        console.error(`Failed step: ${step.name} for case ${caseId}:`, error);
        
        // Log error to tracking service
        await this.errorTrackingService.logProcessingError(caseId, error, {
          step: step.name,
          context: context.data
        });
        
        throw new Error(`Pipeline failed at step: ${step.name} - ${error.message}`);
      }
    }
    
    // Mark as completed
    await this.supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'completed',
        ai_processed: true,
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);
      
    return context.data;
  }

  // Step 1: Extract PDF content
  async extractPDFContent(context) {
    const { caseId } = context;
    
    // Get case documents
    const { data: documents, error } = await this.supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    
    let extractedContent = '';
    
    for (const document of documents || []) {
      if (document.file_path && !document.ai_extracted_text) {
        try {
          const extractedText = await this.pdfService.extractText(document.file_path);
          
          // Update document with extracted text
          await this.supabase
            .from('case_documents')
            .update({ ai_extracted_text: extractedText })
            .eq('id', document.id);
          
          extractedContent += extractedText + '\n\n';
        } catch (error) {
          console.warn(`Failed to extract text from document ${document.id}:`, error);
        }
      } else if (document.ai_extracted_text) {
        extractedContent += document.ai_extracted_text + '\n\n';
      }
    }
    
    context.data.extractedContent = extractedContent;
    context.data.documents = documents || [];
  }

  // Step 2: Execute intake analysis
  async executeIntakeAnalysis(context) {
    const { caseId, data } = context;
    
    // Get case data
    const { data: caseData, error } = await this.supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (error) throw error;
    
    // Get case evidence
    const { data: evidence, error: evidenceError } = await this.supabase
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId);
    
    if (evidenceError) throw evidenceError;
    
    // Execute intake analysis
    const intakeAnalysis = await this.aiService.executeIntakeAnalysis(
      caseData,
      evidence || [],
      data.extractedContent
    );
    
    context.data.intakeAnalysis = intakeAnalysis;
    context.data.caseData = caseData;
    context.data.evidence = evidence || [];
  }

  // Step 3: Insert intake data
  async insertIntakeData(context) {
    const { caseId, data } = context;
    
    // Update case with intake analysis results
    await this.supabase
      .from('case_briefs')
      .update({
        case_type: data.intakeAnalysis.case_metadata.case_type,
        case_stage: data.intakeAnalysis.case_metadata.case_stage,
        date_filed: data.intakeAnalysis.case_metadata.date_filed,
        applicable_law: data.intakeAnalysis.case_metadata.applicable_law,
        legal_issues: data.intakeAnalysis.case_metadata.issue,
        updated_at: new Date().toISOString()
      })
      .eq('id', caseId);
  }

  // Step 4: Execute jurisdiction analysis
  async executeJurisdictionAnalysis(context) {
    const { data } = context;
    
    const jurisdictionAnalysis = await this.aiService.executeJurisdictionAnalysis(
      data.caseData,
      data.intakeAnalysis
    );
    
    context.data.jurisdictionAnalysis = jurisdictionAnalysis;
  }

  // Step 5: Execute case enhancement
  async executeCaseEnhancement(context) {
    const { data } = context;
    
    // Get CourtListener cases for enhancement
    const courtListenerCases = await this.courtListenerService.searchSimilarCases(
      data.caseData,
      data.intakeAnalysis
    );
    
    const caseEnhancement = await this.aiService.executeCaseEnhancement(
      data.caseData,
      data.intakeAnalysis,
      data.jurisdictionAnalysis,
      data.extractedContent
    );
    
    context.data.caseEnhancement = caseEnhancement;
    context.data.courtListenerCases = courtListenerCases;
  }

  // Step 6: Insert enhancement data
  async insertEnhancementData(context) {
    const { caseId, data } = context;
    
    // Update case AI enrichment
    await this.supabase
      .from('case_ai_enrichment')
      .upsert({
        case_id: caseId,
        cause_of_action: data.caseEnhancement.cause_of_action,
        applicable_statute: data.caseEnhancement.applicable_statute?.join(', '),
        applicable_case_law: data.caseEnhancement.applicable_case_law?.join(', '),
        enhanced_case_type: data.caseEnhancement.enhanced_case_type,
        jurisdiction_enriched: data.caseEnhancement.jurisdiction_enriched,
        court_abbreviation: data.caseEnhancement.court_abbreviation,
        raw_gpt_response: {
          intake: data.intakeAnalysis,
          jurisdiction: data.jurisdictionAnalysis,
          enhancement: data.caseEnhancement
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
  }

  // Step 7: Search CourtListener
  async searchCourtListener(context) {
    const { data } = context;
    
    // This step was already done in case enhancement, but we can enhance it further
    const enhancedSearch = await this.courtListenerService.searchSimilarCases(
      data.caseData,
      data.intakeAnalysis,
      { enhanced: true }
    );
    
    context.data.enhancedCourtListenerCases = enhancedSearch;
  }

  // Step 8: Fetch opinions
  async fetchOpinions(context) {
    const { data } = context;
    
    const opinions = [];
    
    // Fetch opinions for CourtListener cases
    for (const courtCase of data.courtListenerCases || []) {
      try {
        const caseOpinions = await this.courtListenerService.fetchCaseOpinions(courtCase.id);
        opinions.push(...caseOpinions);
      } catch (error) {
        console.warn(`Failed to fetch opinions for case ${courtCase.id}:`, error);
      }
    }
    
    context.data.opinions = opinions;
  }

  // Step 9: Execute court opinion analysis
  async executeCourtOpinionAnalysis(context) {
    const { data } = context;
    
    // Analyze opinions for legal insights
    const opinionAnalysis = await this.aiService.executeCourtOpinionAnalysis(
      data.opinions.map(op => op.opinion).join('\n\n')
    );
    
    context.data.opinionAnalysis = opinionAnalysis;
  }

  // Step 10: Insert opinion data
  async insertOpinionData(context) {
    const { caseId, data } = context;
    
    // Save similar cases
    if (data.courtListenerCases?.length > 0) {
      // Delete existing similar cases
      await this.supabase
        .from('similar_cases')
        .delete()
        .eq('case_id', caseId);
      
      // Insert new similar cases
      const similarCasesData = data.courtListenerCases.map(courtCase => ({
        case_id: caseId,
        similar_case_id: courtCase.id,
        case_name: courtCase.case_name,
        court: courtCase.court,
        decision_date: courtCase.decision_date,
        relevance_score: courtCase.relevance_score || 0.5,
        created_at: new Date().toISOString()
      }));
      
      await this.supabase
        .from('similar_cases')
        .insert(similarCasesData);
    }
    
    // Update AI enrichment with opinion analysis
    await this.supabase
      .from('case_ai_enrichment')
      .update({
        opinion_analysis: data.opinionAnalysis,
        updated_at: new Date().toISOString()
      })
      .eq('case_id', caseId);
  }

  // Step 11: Execute complexity score
  async executeComplexityScore(context) {
    const { data } = context;
    
    // Create precedent summary from CourtListener cases
    const precedentSummary = data.courtListenerCases?.map(courtCase => 
      `${courtCase.case_name}: ${courtCase.decision_summary || 'No summary available'}`
    ).join('; ') || 'No precedent cases found';
    
    const complexityScore = await this.aiService.executeComplexityScore(
      data.caseData,
      data.caseEnhancement,
      precedentSummary
    );
    
    context.data.complexityScore = complexityScore;
  }

  // Step 12: Execute prediction analysis
  async executePredictionAnalysis(context) {
    const { data } = context;
    
    // Prepare data for prediction analysis
    const predictionData = {
      enhanced_case_type: data.caseEnhancement.enhanced_case_type,
      cause_of_action: data.caseEnhancement.cause_of_action,
      jurisdiction_enriched: data.jurisdictionAnalysis.jurisdiction_enriched,
      applicable_statute: data.caseEnhancement.applicable_statute,
      applicable_case_law: data.caseEnhancement.applicable_case_law,
      precedent_case_comparison: data.courtListenerCases?.map(c => c.case_name).join(', ') || 'None',
      case_complexity_score: data.complexityScore,
      case_narrative: data.caseData.case_narrative,
      history_narrative: data.caseData.history_narrative || 'None',
      case_stage: data.caseData.case_stage,
      date_filed: data.caseData.date_filed,
      evidence_summary: data.evidence?.map(e => e.description).join('; ') || 'None'
    };
    
    const predictionAnalysis = await this.aiService.executePredictionAnalysis(predictionData);
    
    context.data.predictionAnalysis = predictionAnalysis;
  }

  // Step 13: Insert final data
  async insertFinalData(context) {
    const { caseId, data } = context;
    
    // Update case predictions
    await this.supabase
      .from('case_predictions')
      .upsert({
        case_id: caseId,
        ...data.predictionAnalysis,
        case_complexity_score: data.complexityScore,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    // Update case with final processing status
    await this.supabase
      .from('case_briefs')
      .update({
        case_strength_score: data.predictionAnalysis.case_strength_score,
        settlement_probability: data.predictionAnalysis.settlement_probability,
        estimated_timeline: data.predictionAnalysis.estimated_timeline,
        risk_level: data.predictionAnalysis.risk_level,
        updated_at: new Date().toISOString()
      })
      .eq('id', caseId);
  }
}

module.exports = LinearPipelineService; 