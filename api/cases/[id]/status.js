// api/cases/[id]/status.js - Get case processing status
const { createClient } = require('@supabase/supabase-js');
const caseProcessingWorker = require('../../../services/case-processing.worker');
const queueService = require('../../../services/queueService');
const { verifyCaseAccess, allowDevBypass } = require('../../../middleware/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply authentication middleware
  await new Promise((resolve, reject) => {
    verifyCaseAccess(req, res, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });

  const { id: caseId } = req.query;

  try {
    console.log(`📊 Getting processing status for case ${caseId}`);

    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('id, case_name, processing_status, last_ai_update, processing_error, ai_processed')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) {
      return res.status(404).json({ 
        error: 'Case not found',
        caseId 
      });
    }

    // Get queue job status
    const queueStatus = await caseProcessingWorker.getCaseProcessingStatus(caseId);
    
    // Get queue statistics
    const queueStats = await queueService.getQueueStatus('case-processing');

    // Check for existing analysis results
    const { data: analysisResults } = await supabase
      .from('case_analysis')
      .select('analysis_type, created_at, confidence_score')
      .eq('case_id', caseId);

    const { data: predictions } = await supabase
      .from('case_predictions')
      .select('outcome_prediction_score, confidence_prediction_percentage, updated_at')
      .eq('case_id', caseId)
      .single();

    // Determine overall status
    let overallStatus = 'unknown';
    let canRetrigger = true;
    let statusMessage = '';

    if (caseData.processing_status === 'processing') {
      overallStatus = 'processing';
      canRetrigger = false;
      statusMessage = 'Case is currently being processed';
    } else if (caseData.processing_status === 'completed' && caseData.ai_processed) {
      overallStatus = 'completed';
      statusMessage = 'Case processing completed successfully';
    } else if (caseData.processing_status === 'failed') {
      overallStatus = 'failed';
      statusMessage = `Processing failed: ${caseData.processing_error || 'Unknown error'}`;
    } else if (queueStatus.status === 'pending') {
      overallStatus = 'queued';
      canRetrigger = false;
      statusMessage = 'Case is queued for processing';
    } else if (analysisResults && analysisResults.length > 0) {
      overallStatus = 'partially_completed';
      statusMessage = `Partially processed: ${analysisResults.length} analysis types completed`;
    } else {
      overallStatus = 'not_processed';
      statusMessage = 'Case has not been processed yet';
    }

    res.json({
      caseId,
      caseName: caseData.case_name,
      overallStatus,
      statusMessage,
      canRetrigger,
      lastUpdate: caseData.last_ai_update,
      processingError: caseData.processing_error,
      database: {
        status: caseData.processing_status,
        aiProcessed: caseData.ai_processed,
        lastUpdate: caseData.last_ai_update
      },
      queue: queueStatus,
      queueStats,
      analysis: {
        completedTypes: analysisResults?.length || 0,
        types: analysisResults?.map(r => r.analysis_type) || [],
        lastAnalysis: analysisResults?.length > 0 ? 
          Math.max(...analysisResults.map(r => new Date(r.created_at).getTime())) : null
      },
      predictions: predictions ? {
        hasOutcomeScore: predictions.outcome_prediction_score !== null,
        hasConfidence: predictions.confidence_prediction_percentage !== null,
        lastUpdate: predictions.updated_at
      } : null,
      actions: {
        canProcess: canRetrigger,
        canForceProcess: true,
        canViewResults: analysisResults?.length > 0 || predictions !== null
      }
    });

  } catch (error) {
    console.error(`❌ Failed to get status for case ${caseId}:`, error);
    
    res.status(500).json({
      error: 'Failed to get case status',
      caseId,
      details: error.message
    });
  }
}

module.exports = handler;
export default handler;