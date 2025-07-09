const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const internalAPIService = require('../../../services/internal-api.service');
const { handleError } = require('../../../utils/errorHandler');
const { applyCorsHeaders } = require('../../../utils/cors-helper');
// Initialize services with error checking
let supabase;

try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  } else {
    console.error('Supabase not configured');
  }
} catch (error) {
  console.error('Service initialization error:', error);
}

async function getCaseDetails(caseId, userId) {
  const { data, error } = await supabase
    .from('case_briefs')
    .select('*')
    .eq('id', caseId)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    throw new Error('Case not found');
  }
  
  return data;
}

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
    const { id: caseId } = req.query;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    // Verify case exists and user has access
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Check if case is still processing
    if (caseData.processing_status === 'processing') {
      return res.status(409).json({ 
        error: 'Case is still being processed',
        message: 'Analysis will be triggered automatically once processing is complete. Please wait.',
        processing_status: caseData.processing_status
      });
    }
    
    // Check if analysis has already been triggered
    if (caseData.analysis_status === 'completed' || caseData.analysis_status === 'triggered') {
      return res.status(409).json({ 
        error: 'Analysis already completed',
        message: 'Analysis has already been triggered and completed for this case.',
        analysis_status: caseData.analysis_status,
        last_analysis_trigger: caseData.last_analysis_trigger
      });
    }
    
    console.log(`Manual analysis trigger requested for case ${caseId} by user ${user.id}`);
    
    // Return information about the linear pipeline process
    const response = {
      success: true,
      caseId: caseId,
      message: 'Analysis is integrated into the linear pipeline process',
      note: 'This endpoint is deprecated. Analysis is now automatically triggered as part of the case processing pipeline when a case is uploaded via webhook.',
      processing_status: caseData.processing_status,
      analysis_status: caseData.analysis_status,
      recommendation: 'Upload your case documents and the analysis will be triggered automatically through the webhook system.',
      timestamp: new Date().toISOString()
    };
    
    console.log(`Analysis trigger info provided for case ${caseId}`);
    
    res.json(response);
    
  } catch (error) {
    console.error(`Analysis trigger failed for case ${req.query.id}:`, error);
    
    // Update case status to indicate failure
    if (req.query.id) {
      try {
        await supabase
          .from('case_briefs')
          .update({ 
            analysis_status: 'failed',
            last_analysis_error: error.message
          })
          .eq('id', req.query.id);
      } catch (updateError) {
        console.error('Failed to update case status:', updateError);
      }
    }
    
    handleError(error, res, { 
      operation: 'trigger_analysis',
      caseId: req.query.id 
    });
  }
}; 