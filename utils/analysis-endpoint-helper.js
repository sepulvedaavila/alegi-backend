// utils/analysis-endpoint-helper.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Helper function for analysis endpoints to retrieve data from the linear pipeline
 * @param {string} caseId - The case ID
 * @param {string} analysisType - The type of analysis (e.g., 'risk_assessment', 'timeline_estimate')
 * @param {Function} fallbackDataGenerator - Function to generate fallback data from predictions
 * @returns {Object} The analysis data or triggers processing
 */
async function getAnalysisData(caseId, analysisType, fallbackDataGenerator) {
  // First check if case has been processed and has the specific analysis
  const { data: analysis } = await supabase
    .from('case_analysis')
    .select('*')
    .eq('case_id', caseId)
    .eq('analysis_type', analysisType)
    .single();
  
  if (analysis && analysis.result) {
    console.log(`Returning ${analysisType} from processed data`);
    return {
      success: true,
      data: {
        ...analysis.result,
        dataSource: 'linear-pipeline',
        lastUpdated: analysis.updated_at
      }
    };
  }
  
  // Check if case predictions exist (basic data)
  const { data: predictions } = await supabase
    .from('case_predictions')
    .select('*')
    .eq('case_id', caseId)
    .single();
  
  if (predictions && fallbackDataGenerator) {
    // Return basic data generated from predictions
    return {
      success: true,
      data: {
        ...fallbackDataGenerator(predictions),
        dataSource: 'predictions-fallback'
      }
    };
  }
  
  // Check case processing status
  const { data: caseData } = await supabase
    .from('case_briefs')
    .select('processing_status')
    .eq('id', caseId)
    .single();
  
  if (caseData?.processing_status === 'processing') {
    return {
      success: false,
      processing: true,
      message: 'Case analysis is being processed',
      status: 'processing',
      estimatedTime: '2-5 minutes',
      hint: 'Please refresh in a few minutes'
    };
  }
  
  // Case not processed yet - need to trigger processing
  return {
    success: false,
    needsProcessing: true,
    caseId: caseId
  };
}

/**
 * Trigger the linear pipeline for a case
 * @param {string} caseId - The case ID
 */
async function triggerLinearPipeline(caseId) {
  // Update status to processing
  await supabase
    .from('case_briefs')
    .update({ 
      processing_status: 'processing',
      last_ai_update: new Date().toISOString()
    })
    .eq('id', caseId);
  
  // Import and execute linear pipeline
  const LinearPipelineService = require('../services/linear-pipeline.service');
  const linearPipeline = new LinearPipelineService();
  
  // Execute linear pipeline asynchronously
  setImmediate(async () => {
    try {
      await linearPipeline.executeLinearPipeline(caseId);
    } catch (error) {
      console.error(`Linear pipeline failed for case ${caseId}:`, error);
      await supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'failed',
          error_message: error.message
        })
        .eq('id', caseId);
    }
  });
}

module.exports = {
  getAnalysisData,
  triggerLinearPipeline
};