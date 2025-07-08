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
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    // Get case details and existing analyses
    const [caseData, similarCases, judgeData] = await Promise.all([
      getCaseDetails(caseId, user.id),
      getSimilarCasesWithOutcomes(caseId),
      getJudgeStatistics(caseId)
    ]);
    
    // Check cache
    const cached = await getCachedAnalysis(caseId, 'settlement-trial');
    if (cached) return res.json(cached);
    
    // Rate limit check
    await rateLimiter.checkLimit('openai', user.id);
    
    // Prepare comprehensive context
    const analysisContext = {
      case: caseData,
      similarSettlements: similarCases.filter(c => c.outcome === 'settled'),
      similarTrials: similarCases.filter(c => c.outcome === 'trial'),
      judgeStats: judgeData,
      jurisdictionAverages: {
        settlementRate: 65, // Default values - could be enhanced with real data
        trialRate: 35
      }
    };
    
    // AI Analysis with structured output
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `Analyze settlement vs trial outcomes. Consider costs, time, success rates.
          Return JSON with settlement and trial objects containing: estimatedValue (min/max/likely),
          timeToResolve (days), costs, successProbability, plus recommendation and reasoning array.`
        },
        {
          role: "user",
          content: JSON.stringify(analysisContext)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });
    
    const result = JSON.parse(analysis.choices[0].message.content);
    
    // Store and return
    await storeAnalysis(caseId, 'settlement-trial', result);
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'settlement_analysis',
      caseId: req.query.id 
    });
  }
}; 