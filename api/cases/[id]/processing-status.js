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
      .select('id, case_name, processing_status, ai_processed, last_ai_update, created_at')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Get detailed processing stages
    const { data: processingStages, error: stagesError } = await supabase
      .from('case_processing_stages')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (stagesError) {
      console.error('Error fetching processing stages:', stagesError);
    }

    // Get document extraction status
    const { data: documentExtractions, error: extractionsError } = await supabase
      .from('case_document_extractions')
      .select('file_name, processing_status, error_message, created_at')
      .eq('case_id', caseId);

    if (extractionsError) {
      console.error('Error fetching document extractions:', extractionsError);
    }

    // Get data fusion status
    const { data: dataFusion, error: fusionError } = await supabase
      .from('case_data_fusion')
      .select('fusion_status, error_message, created_at, updated_at')
      .eq('case_id', caseId)
      .single();

    if (fusionError && fusionError.code !== 'PGRST116') {
      console.error('Error fetching data fusion:', fusionError);
    }

    // Get precedent cases count
    const { count: precedentCount, error: precedentError } = await supabase
      .from('precedent_cases')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId);

    if (precedentError) {
      console.error('Error fetching precedent cases count:', precedentError);
    }

    // Calculate overall progress
    const expectedStages = [
      'extractPDF',
      'executeIntakeAnalysis',
      'insertIntakeData',
      'executeJurisdictionAnalysis',
      'executeCaseEnhancement',
      'insertEnhancementData',
      'searchCourtListener',
      'fetchOpinions',
      'executeCourtOpinionAnalysis',
      'insertOpinionData',
      'executeComplexityScore',
      'executePredictionAnalysis',
      'executeAdditionalAnalysis',
      'insertFinalData'
    ];

    const completedStages = processingStages?.filter(stage => 
      stage.stage_status === 'completed'
    ) || [];

    const failedStages = processingStages?.filter(stage => 
      stage.stage_status === 'failed'
    ) || [];

    const progressPercentage = Math.round((completedStages.length / expectedStages.length) * 100);

    // Determine current stage
    let currentStage = 'pending';
    if (completedStages.length > 0) {
      const lastCompletedStage = completedStages[completedStages.length - 1];
      const stageIndex = expectedStages.indexOf(lastCompletedStage.stage_name);
      if (stageIndex < expectedStages.length - 1) {
        currentStage = expectedStages[stageIndex + 1];
      } else {
        currentStage = 'completed';
      }
    }

    // Build detailed status response
    const status = {
      caseId: caseData.id,
      caseName: caseData.case_name,
      overallStatus: caseData.processing_status,
      aiProcessed: caseData.ai_processed,
      lastUpdate: caseData.last_ai_update,
      createdAt: caseData.created_at,
      progress: {
        percentage: progressPercentage,
        completedStages: completedStages.length,
        totalStages: expectedStages.length,
        currentStage: currentStage
      },
      stages: processingStages?.map(stage => ({
        name: stage.stage_name,
        status: stage.stage_status,
        startedAt: stage.started_at,
        completedAt: stage.completed_at,
        result: stage.stage_result,
        error: stage.error_message
      })) || [],
      documentProcessing: {
        totalDocuments: documentExtractions?.length || 0,
        completed: documentExtractions?.filter(d => d.processing_status === 'completed').length || 0,
        failed: documentExtractions?.filter(d => d.processing_status === 'failed').length || 0,
        extractions: documentExtractions?.map(d => ({
          fileName: d.file_name,
          status: d.processing_status,
          error: d.error_message,
          createdAt: d.created_at
        })) || []
      },
      dataFusion: dataFusion ? {
        status: dataFusion.fusion_status,
        error: dataFusion.error_message,
        createdAt: dataFusion.created_at,
        updatedAt: dataFusion.updated_at
      } : null,
      externalData: {
        precedentCases: precedentCount || 0,
        courtListenerCases: completedStages.find(s => s.name === 'searchCourtListener')?.result?.cases_found || 0
      },
      errors: failedStages.map(stage => ({
        stage: stage.stage_name,
        error: stage.error_message,
        timestamp: stage.completed_at
      }))
    };

    return res.json({
      success: true,
      status
    });

  } catch (error) {
    handleError(error, res, { 
      operation: 'processing_status',
      caseId: req.query.id 
    });
  }
}; 