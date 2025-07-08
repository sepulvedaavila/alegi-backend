const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');

// Initialize services with error checking
let openai;
let supabase;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else {
    console.error('OpenAI API key not configured');
  }
  
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

// Helper functions
async function getPartyDetails(caseId) {
  try {
    const { data, error } = await supabase
      .from('case_parties')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching party details:', error);
    return [];
  }
}

async function getEvidenceSummary(caseId) {
  try {
    const { data, error } = await supabase
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching evidence summary:', error);
    return [];
  }
}

module.exports = async (req, res) => {
  // Handle CORS preflight - Vercel handles the CORS headers
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check service availability
  if (!openai || !supabase) {
    console.error('Required services not available');
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'AI analysis service is not configured. Please try again later.'
    });
  }

  try {
    // Validate authentication
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    
    console.log(`Probability analysis requested for case ${caseId} by user ${user.id}`);
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    // Check case ownership
    const { data: caseData, error } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();
    
    if (error || !caseData) {
      console.error('Case not found or access denied:', error);
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // First check case predictions table for processed data
    const { data: casePredictions } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseId)
      .single();
    
    if (casePredictions) {
      // Case has been processed, return probability data
      console.log('Returning probability data from processed case');
      return res.json({
        successProbability: casePredictions.outcome_prediction_score || 50,
        failureProbability: 100 - (casePredictions.outcome_prediction_score || 50),
        settlementProbability: casePredictions.settlement_probability || 50,
        confidence: casePredictions.prediction_confidence || 'medium',
        factors: {
          jurisdiction: casePredictions.jurisdiction_score || 50,
          caseType: casePredictions.case_type_score || 50,
          precedent: casePredictions.precedent_score || 50,
          proceduralPosture: casePredictions.procedural_score || 50
        },
        riskLevel: casePredictions.risk_level,
        caseStrengthScore: casePredictions.case_strength_score,
        estimatedTimeline: casePredictions.estimated_timeline,
        dataSource: 'linear-pipeline'
      });
    }
    
    // Check if case is being processed
    if (caseData.processing_status === 'processing') {
      console.log(`Case ${caseId} is currently being processed`);
      return res.status(202).json({
        message: 'Case analysis is being processed',
        status: 'processing',
        estimatedTime: '2-5 minutes',
        hint: 'Please refresh in a few minutes'
      });
    }
    
    // Case not processed yet - trigger processing
    console.log(`Case ${caseId} not processed yet, triggering linear pipeline`);
    
    // Update status to processing
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);
    
    // Import and execute linear pipeline
    const LinearPipelineService = require('../../../services/linear-pipeline.service');
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
    
    return res.status(202).json({
      message: 'Case analysis triggered',
      status: 'processing',
      estimatedTime: '2-5 minutes',
      hint: 'Analysis has been initiated. Please refresh in a few minutes.'
    });
    
  } catch (error) {
    console.error('Probability analysis error:', error);
    handleError(error, res, { 
      operation: 'probability_analysis',
      caseId: req.query.id 
    });
  }
}; 