const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../../../utils/errorHandler');
const { applyCorsHeaders } = require('../../../utils/cors-helper');

// Initialize Supabase client
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

module.exports = async (req, res) => {
  // Apply CORS headers
  if (applyCorsHeaders(req, res)) {
    return; // Request was handled (OPTIONS)
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    // Get case basic information
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Get fused case data
    const { data: fusedData, error: fusedError } = await supabase
      .from('case_data_fusion')
      .select('*')
      .eq('case_id', caseId)
      .single();

    if (fusedError && fusedError.code !== 'PGRST116') {
      console.error('Error fetching fused data:', fusedError);
    }

    // Get document extractions with structured data
    const { data: documentExtractions, error: extractionsError } = await supabase
      .from('case_document_extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (extractionsError) {
      console.error('Error fetching document extractions:', extractionsError);
    }

    // Get precedent cases
    const { data: precedentCases, error: precedentError } = await supabase
      .from('precedent_cases')
      .select('*')
      .eq('case_id', caseId)
      .order('similarity_score', { ascending: false })
      .limit(10);

    if (precedentError) {
      console.error('Error fetching precedent cases:', precedentError);
    }

    // Get AI enrichment data
    const { data: aiEnrichment, error: enrichmentError } = await supabase
      .from('case_ai_enrichment')
      .select('*')
      .eq('case_id', caseId)
      .single();

    if (enrichmentError && enrichmentError.code !== 'PGRST116') {
      console.error('Error fetching AI enrichment:', enrichmentError);
    }

    // Get case predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseId)
      .single();

    if (predictionsError && predictionsError.code !== 'PGRST116') {
      console.error('Error fetching predictions:', predictionsError);
    }

    // Get case analysis data
    const { data: caseAnalysis, error: analysisError } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId);

    if (analysisError) {
      console.error('Error fetching case analysis:', analysisError);
    }

    // Build enhanced case data response
    const enhancedData = {
      caseId: caseData.id,
      caseName: caseData.case_name,
      basicInfo: {
        caseType: caseData.case_type,
        caseStage: caseData.case_stage,
        jurisdiction: caseData.jurisdiction,
        dateFiled: caseData.date_filed,
        processingStatus: caseData.processing_status,
        aiProcessed: caseData.ai_processed,
        lastUpdate: caseData.last_ai_update
      },
      userProvided: {
        caseNarrative: caseData.case_narrative,
        historyNarrative: caseData.history_narrative,
        applicableLaw: caseData.applicable_law,
        expectedOutcome: caseData.expected_outcome,
        additionalNotes: caseData.additional_notes,
        attorneysOfRecord: caseData.attorneys_of_record
      },
      fusedData: fusedData ? {
        status: fusedData.fusion_status,
        confidence: fusedData.fused_result?.confidence_score,
        parties: fusedData.fused_result?.parties,
        legalClaims: fusedData.fused_result?.legal_claims,
        damagesSought: fusedData.fused_result?.damages_sought,
        keyDates: fusedData.fused_result?.key_dates,
        conflicts: fusedData.fused_result?.conflicts,
        additionalInsights: fusedData.fused_result?.additional_insights,
        fusionTimestamp: fusedData.fusion_metadata?.fusion_timestamp
      } : null,
      documentAnalysis: {
        totalDocuments: documentExtractions?.length || 0,
        documents: documentExtractions?.map(doc => ({
          fileName: doc.file_name,
          documentType: doc.structured_data?.document_type,
          parties: doc.structured_data?.parties,
          legalClaims: doc.structured_data?.legal_claims,
          damagesSought: doc.structured_data?.damages_sought,
          keyDates: doc.structured_data?.key_dates,
          jurisdiction: doc.structured_data?.jurisdiction,
          caseNumber: doc.structured_data?.case_number,
          processingStatus: doc.processing_status,
          extractionTimestamp: doc.extraction_metadata?.extraction_timestamp,
          confidence: doc.extraction_metadata?.confidence
        })) || []
      },
      aiEnrichment: aiEnrichment ? {
        causeOfAction: aiEnrichment.cause_of_action,
        applicableStatute: aiEnrichment.applicable_statute,
        applicableCaseLaw: aiEnrichment.applicable_case_law,
        enhancedCaseType: aiEnrichment.enhanced_case_type,
        jurisdictionEnriched: aiEnrichment.jurisdiction_enriched,
        courtAbbreviation: aiEnrichment.court_abbreviation,
        processingType: aiEnrichment.processing_type,
        enhancedData: aiEnrichment.enhanced_data,
        lastUpdated: aiEnrichment.updated_at
      } : null,
      precedentAnalysis: {
        totalPrecedents: precedentCases?.length || 0,
        precedents: precedentCases?.map(precedent => ({
          caseName: precedent.case_name,
          citation: precedent.citation,
          court: precedent.court,
          jurisdiction: precedent.jurisdiction,
          judgeName: precedent.judge_name,
          legalIssues: precedent.legal_issues,
          applicableStatutes: precedent.applicable_statutes,
          strategyUsed: precedent.strategy_used,
          outcome: precedent.outcome,
          decisionSummary: precedent.decision_summary,
          similarityScore: precedent.similarity_score,
          fullTextUrl: precedent.full_text_url
        })) || []
      },
      predictions: predictions ? {
        outcomePredictionScore: predictions.outcome_prediction_score,
        confidencePredictionPercentage: predictions.confidence_prediction_percentage,
        estimatedFinancialOutcome: predictions.estimated_financial_outcome,
        financialOutcomeRange: predictions.financial_outcome_range,
        litigationCostEstimate: predictions.litigation_cost_estimate,
        litigationCostRange: predictions.litigation_cost_range,
        settlementSuccessRate: predictions.settlement_success_rate,
        plaintiffSuccess: predictions.plaintiff_success,
        appealAfterTrial: predictions.appeal_after_trial,
        caseComplexityScore: predictions.case_complexity_score,
        riskScore: predictions.risk_score,
        witnessScore: predictions.witness_score,
        judgeAnalysis: predictions.judge_analysis,
        lawyerAnalysis: predictions.lawyer_analysis,
        settlementTrialAnalysis: predictions.settlement_trial_analysis,
        recommendedSettlementWindow: predictions.recommended_settlement_window,
        primaryStrategy: predictions.primary_strategy,
        alternativeApproach: predictions.alternative_approach,
        additionalFactsRecommendations: predictions.additional_facts_recommendations,
        averageTimeResolution: predictions.average_time_resolution,
        resolutionTimeRange: predictions.resolution_time_range
      } : null,
      analysisResults: caseAnalysis?.reduce((acc, analysis) => {
        acc[analysis.analysis_type] = {
          result: analysis.result,
          confidenceScore: analysis.confidence_score,
          factors: analysis.factors,
          createdAt: analysis.created_at,
          updatedAt: analysis.updated_at
        };
        return acc;
      }, {}) || {},
      dataQuality: {
        hasFusedData: !!fusedData,
        hasDocumentExtractions: (documentExtractions?.length || 0) > 0,
        hasPrecedentCases: (precedentCases?.length || 0) > 0,
        hasAIEnrichment: !!aiEnrichment,
        hasPredictions: !!predictions,
        hasAnalysisResults: (caseAnalysis?.length || 0) > 0,
        fusionConfidence: fusedData?.fused_result?.confidence_score || 0,
        averageExtractionConfidence: documentExtractions?.length > 0 
          ? documentExtractions.reduce((sum, doc) => sum + (doc.extraction_metadata?.confidence || 0), 0) / documentExtractions.length
          : 0
      }
    };

    return res.json({
      success: true,
      enhancedData
    });

  } catch (error) {
    handleError(error, res, { 
      operation: 'enhanced_data',
      caseId: req.query.id 
    });
  }
}; 