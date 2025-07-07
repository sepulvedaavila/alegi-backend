const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const internalAPIService = require('../../../services/internal-api.service');
const { handleError } = require('../../../utils/errorHandler');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  try {
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    const { mode = 'sequential', delay = 3000 } = req.query;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    // Verify case exists and user has access
    const caseData = await getCaseDetails(caseId, user.id);
    
    console.log(`Manual analysis trigger for case ${caseId} by user ${user.id}`);
    
    let results;
    
    if (mode === 'parallel') {
      console.log('Triggering parallel analysis...');
      results = await internalAPIService.triggerAllAnalysis(caseId);
    } else {
      console.log('Triggering sequential analysis...');
      results = await internalAPIService.triggerSequentialAnalysis(caseId, parseInt(delay));
    }
    
    // Update case status to indicate analysis was triggered
    await supabase
      .from('case_briefs')
      .update({ 
        last_analysis_trigger: new Date().toISOString(),
        analysis_status: 'triggered'
      })
      .eq('id', caseId);
    
    const response = {
      success: true,
      caseId: caseId,
      mode: mode,
      delay: parseInt(delay),
      results: {
        successful: Object.values(results).filter(r => r !== null).length,
        total: 3, // judge-trends, precedents, risk-assessment
        errors: results.errors.length,
        errorDetails: results.errors
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`Analysis trigger completed for case ${caseId}:`, response.results);
    
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