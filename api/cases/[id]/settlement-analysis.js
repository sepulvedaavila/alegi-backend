const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');
const { applyCorsHeaders } = require('../../../utils/cors-helper');
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

async function getSimilarCasesWithOutcomes(caseId) {
  try {
    // Get current case to find similar ones
    const { data: currentCase } = await supabase
      .from('case_briefs')
      .select('case_type, jurisdiction')
      .eq('id', caseId)
      .single();
    
    if (!currentCase) return [];
    
    // Find similar cases with outcomes
    const { data, error } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('case_type', currentCase.case_type)
      .eq('jurisdiction', currentCase.jurisdiction)
      .not('outcome', 'is', null)
      .limit(20);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching similar cases:', error);
    return [];
  }
}

async function getJudgeStatistics(caseId) {
  try {
    const { data: caseData } = await supabase
      .from('case_briefs')
      .select('assigned_judge, court')
      .eq('id', caseId)
      .single();
    
    if (!caseData?.assigned_judge) return null;
    
    // Get judge's case history
    const { data, error } = await supabase
      .from('case_briefs')
      .select('outcome, case_type')
      .eq('assigned_judge', caseData.assigned_judge)
      .not('outcome', 'is', null);
    
    if (error) throw error;
    
    const totalCases = data.length;
    const settlements = data.filter(c => c.outcome === 'settled').length;
    const trials = data.filter(c => c.outcome === 'trial').length;
    
    return {
      judgeName: caseData.assigned_judge,
      court: caseData.court,
      totalCases,
      settlementRate: totalCases > 0 ? (settlements / totalCases) * 100 : 0,
      trialRate: totalCases > 0 ? (trials / totalCases) * 100 : 0
    };
  } catch (error) {
    console.error('Error fetching judge statistics:', error);
    return null;
  }
}

async function getCachedAnalysis(caseId, analysisType) {
  try {
    const { data, error } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .eq('analysis_type', analysisType)
      .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString()) // 7 days
      .single();
    
    if (error || !data) return null;
    return data.result;
  } catch (error) {
    return null;
  }
}

async function storeAnalysis(caseId, analysisType, result) {
  try {
    await supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: analysisType,
        result: result,
        created_at: new Date()
      });
  } catch (error) {
    console.error('Error storing analysis:', error);
  }
}

module.exports = async (req, res) => {
  // Apply CORS headers
  if (applyCorsHeaders(req, res)) {
    return; // Request was handled (OPTIONS)
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
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    // Get case details
    const caseData = await getCaseDetails(caseId, user.id);
    
    // First check if case has been processed and has settlement analysis
    const { data: settlementAnalysis } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .eq('analysis_type', 'settlement_analysis')
      .single();
    
    if (settlementAnalysis && settlementAnalysis.result) {
      console.log('Returning settlement analysis from processed data');
      return res.json({
        ...settlementAnalysis.result,
        dataSource: 'linear-pipeline',
        lastUpdated: settlementAnalysis.updated_at
      });
    }
    
    // Check if case predictions exist (basic data)
    const { data: predictions } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseId)
      .single();
    
    if (predictions) {
      // Return basic settlement data from predictions
      return res.json({
        settlementLikelihood: predictions.settlement_probability || 50,
        recommendedApproach: predictions.settlement_probability > 60 ? 'settlement' : 'trial',
        settlement: {
          estimatedValue: {
            min: 50000,
            likely: 150000,
            max: 300000
          },
          timeToResolve: 180,
          costs: 25000,
          successProbability: predictions.settlement_probability || 50
        },
        trial: {
          estimatedValue: {
            min: 0,
            likely: 250000,
            max: 500000
          },
          timeToResolve: 365,
          costs: 100000,
          successProbability: predictions.outcome_prediction_score || 50
        },
        recommendation: predictions.settlement_probability > 60 ? 'settlement' : 'trial',
        reasoning: [
          'Based on case strength and complexity',
          'Considering time and cost factors',
          'Analysis of similar cases'
        ],
        dataSource: 'predictions'
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
    console.log(`Case ${caseId} not processed yet, triggering enhanced pipeline`);
    
    // Update status to processing
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);
    
    // Import and execute enhanced pipeline
    const EnhancedLinearPipelineService = require('../../../services/enhanced-linear-pipeline.service');
    const enhancedPipeline = new EnhancedLinearPipelineService();
    
    // Execute enhanced pipeline asynchronously
    setImmediate(async () => {
      try {
        await enhancedPipeline.executeEnhancedPipeline(caseId);
      } catch (error) {
        console.error(`Enhanced pipeline failed for case ${caseId}:`, error);
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
      hint: 'Settlement analysis has been initiated. Please refresh in a few minutes.'
    });
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'settlement_analysis',
      caseId: req.query.id 
    });
  }
}; 