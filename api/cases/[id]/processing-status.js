// api/cases/[id]/processing-status.js
const { createClient } = require('@supabase/supabase-js');
const { validateSupabaseToken } = require('../../../middleware/auth');
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

  // Check service availability
  if (!supabase) {
    console.error('Required services not available');
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'Database service is not configured. Please try again later.'
    });
  }

  try {
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.params;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    console.log(`Processing status request for case ${caseId} by user ${user.id}`);

    // Get case details and verify ownership
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();
    
    if (caseError || !caseData) {
      return res.status(404).json({ error: 'Case not found or access denied' });
    }

    // Get processing progress
    const { data: progressData } = await supabase
      .from('case_processing_progress')
      .select('*')
      .eq('case_id', caseId)
      .single();

    // Get all analysis results
    const { data: analysisResults } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    // Determine processing status
    const processingStatus = determineProcessingStatus(caseData, progressData, analysisResults);
    
    // Get feature completion status
    const featureStatus = getFeatureCompletionStatus(analysisResults);
    
    // Calculate overall progress
    const overallProgress = calculateOverallProgress(progressData, featureStatus);
    
    // Get estimated time remaining
    const estimatedTimeRemaining = calculateEstimatedTimeRemaining(progressData, caseData);

    const response = {
      caseId: caseId,
      caseName: caseData.case_name,
      processingStatus: processingStatus.status,
      overallProgress: overallProgress,
      currentStep: progressData?.current_step_name || 'Not started',
      totalSteps: progressData?.total_steps || 13,
      currentStepNumber: progressData?.current_step || 0,
      features: featureStatus,
      estimatedTimeRemaining: estimatedTimeRemaining,
      lastUpdated: caseData.last_ai_update,
      errorMessage: caseData.error_message,
      processingType: caseData.processing_type || 'enhanced',
      pipeline: 'enhanced-alegi',
      timestamp: new Date().toISOString()
    };

    // Add detailed progress if available
    if (progressData) {
      response.progressDetails = {
        currentStep: progressData.current_step_name,
        progressPercentage: progressData.progress_percentage,
        lastUpdated: progressData.updated_at
      };
    }

    // Add analysis summary if completed
    if (processingStatus.status === 'completed') {
      response.analysisSummary = {
        totalAnalyses: analysisResults?.length || 0,
        completedFeatures: Object.values(featureStatus).filter(f => f.completed).length,
        totalFeatures: Object.keys(featureStatus).length
      };
    }

    console.log(`Processing status retrieved for case ${caseId}:`, {
      status: processingStatus.status,
      progress: overallProgress,
      featuresCompleted: Object.values(featureStatus).filter(f => f.completed).length
    });

    return res.status(200).json(response);

  } catch (error) {
    console.error('Processing status error:', error);
    
    // Handle specific error types
    if (error.message.includes('Unauthorized')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token'
      });
    }
    
    if (error.message.includes('Case not found')) {
      return res.status(404).json({ 
        error: 'Case not found',
        message: 'The specified case could not be found'
      });
    }
    
    return res.status(500).json({
      error: 'Failed to retrieve processing status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

function determineProcessingStatus(caseData, progressData, analysisResults) {
  // Check for failed status
  if (caseData.processing_status === 'failed') {
    return {
      status: 'failed',
      message: caseData.error_message || 'Processing failed',
      canRetry: true
    };
  }

  // Check for completed status
  if (caseData.processing_status === 'completed') {
    return {
      status: 'completed',
      message: 'Processing completed successfully',
      canRetry: false
    };
  }

  // Check for processing status
  if (caseData.processing_status === 'processing') {
    if (progressData) {
      return {
        status: 'processing',
        message: `Processing in progress - Step ${progressData.current_step}/${progressData.total_steps}`,
        canRetry: false
      };
    } else {
      return {
        status: 'processing',
        message: 'Processing in progress',
        canRetry: false
      };
    }
  }

  // Check for pending status
  if (caseData.processing_status === 'pending') {
    return {
      status: 'pending',
      message: 'Processing queued',
      canRetry: false
    };
  }

  // Default to not started
  return {
    status: 'not_started',
    message: 'Processing not started',
    canRetry: true
  };
}

function getFeatureCompletionStatus(analysisResults) {
  const features = {
    outcomeProbability: { completed: false, analysisType: 'outcome_probability' },
    settlementAnalysis: { completed: false, analysisType: 'settlement_analysis' },
    precedentAnalysis: { completed: false, analysisType: 'precedent' },
    judgeTrends: { completed: false, analysisType: 'judge_trends' },
    riskAssessment: { completed: false, analysisType: 'risk_assessment' },
    costEstimator: { completed: false, analysisType: 'cost_estimate' },
    financialPrediction: { completed: false, analysisType: 'financial_prediction' },
    timelineEstimate: { completed: false, analysisType: 'timeline_estimate' },
    similarCases: { completed: false, analysisType: 'similar_cases' },
    lawUpdates: { completed: false, analysisType: 'law_updates' },
    comprehensive: { completed: false, analysisType: 'comprehensive' }
  };

  if (analysisResults) {
    analysisResults.forEach(analysis => {
      Object.values(features).forEach(feature => {
        if (feature.analysisType === analysis.analysis_type) {
          feature.completed = true;
          feature.lastUpdated = analysis.created_at;
          feature.dataAvailable = true;
        }
      });
    });
  }

  return features;
}

function calculateOverallProgress(progressData, featureStatus) {
  if (progressData) {
    return progressData.progress_percentage || 0;
  }

  // Calculate based on completed features
  const completedFeatures = Object.values(featureStatus).filter(f => f.completed).length;
  const totalFeatures = Object.keys(featureStatus).length;
  
  return Math.round((completedFeatures / totalFeatures) * 100);
}

function calculateEstimatedTimeRemaining(progressData, caseData) {
  if (!progressData || caseData.processing_status === 'completed') {
    return null;
  }

  const totalSteps = progressData.total_steps || 13;
  const currentStep = progressData.current_step || 0;
  const remainingSteps = totalSteps - currentStep;
  
  // Estimate 30-60 seconds per step
  const averageTimePerStep = 45; // seconds
  const estimatedSeconds = remainingSteps * averageTimePerStep;
  
  if (estimatedSeconds < 60) {
    return `${estimatedSeconds} seconds`;
  } else if (estimatedSeconds < 3600) {
    const minutes = Math.ceil(estimatedSeconds / 60);
    return `${minutes} minutes`;
  } else {
    const hours = Math.ceil(estimatedSeconds / 3600);
    return `${hours} hours`;
  }
} 