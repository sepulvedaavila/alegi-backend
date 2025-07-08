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

async function getSimilarCasesWithFinancialOutcomes(caseId) {
  try {
    // Get current case to find similar ones
    const { data: currentCase } = await supabase
      .from('case_briefs')
      .select('case_type, jurisdiction, damages_requested')
      .eq('id', caseId)
      .single();
    
    if (!currentCase) return [];
    
    // Find similar cases with financial outcomes
    const { data, error } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('case_type', currentCase.case_type)
      .eq('jurisdiction', currentCase.jurisdiction)
      .not('settlement_amount', 'is', null)
      .not('verdict_amount', 'is', null)
      .limit(20);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching similar cases:', error);
    return [];
  }
}

async function getMarketDataForDamages(caseId) {
  // This would typically fetch from external market data sources
  // For now, return mock data based on case type
  
  const { data: caseData } = await supabase
    .from('case_briefs')
    .select('case_type, jurisdiction')
    .eq('id', caseId)
    .single();
  
  if (!caseData) return {};
  
  const marketData = {
    'personal_injury': {
      averageSettlement: 75000,
      averageVerdict: 120000,
      inflationRate: 0.03,
      marketTrend: 'increasing'
    },
    'contract_dispute': {
      averageSettlement: 50000,
      averageVerdict: 80000,
      inflationRate: 0.02,
      marketTrend: 'stable'
    },
    'employment': {
      averageSettlement: 45000,
      averageVerdict: 70000,
      inflationRate: 0.025,
      marketTrend: 'increasing'
    },
    'intellectual_property': {
      averageSettlement: 200000,
      averageVerdict: 350000,
      inflationRate: 0.04,
      marketTrend: 'increasing'
    },
    'medical_malpractice': {
      averageSettlement: 300000,
      averageVerdict: 500000,
      inflationRate: 0.035,
      marketTrend: 'decreasing'
    }
  };
  
  return marketData[caseData.case_type] || marketData['contract_dispute'];
}

function calculateConfidenceIntervals(prediction, sampleSize) {
  // Calculate confidence intervals based on sample size and prediction variance
  const confidenceLevel = 0.95;
  const zScore = 1.96; // 95% confidence interval
  
  const settlementVariance = (prediction.settlement.high - prediction.settlement.low) / 4;
  const verdictVariance = (prediction.verdict.high - prediction.verdict.low) / 4;
  
  const settlementMargin = zScore * (settlementVariance / Math.sqrt(sampleSize));
  const verdictMargin = zScore * (verdictVariance / Math.sqrt(sampleSize));
  
  return {
    settlement: {
      low: Math.max(0, prediction.settlement.likely - settlementMargin),
      high: prediction.settlement.likely + settlementMargin,
      confidence: Math.min(0.95, 0.7 + (sampleSize * 0.01))
    },
    verdict: {
      low: Math.max(0, prediction.verdict.likely - verdictMargin),
      high: prediction.verdict.likely + verdictMargin,
      confidence: Math.min(0.95, 0.7 + (sampleSize * 0.01))
    }
  };
}

async function predictFinancialOutcome(data) {
  const prompt = `
    Analyze financial outcomes based on:
    1. Historical similar case outcomes
    2. Current market conditions
    3. Jurisdiction-specific damage caps
    4. Case strength indicators
    
    Provide settlement and verdict predictions with confidence scores.
    Factor in economic vs non-economic damages.
  `;
  
  try {
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(data) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });
    
    return JSON.parse(analysis.choices[0].message.content);
  } catch (error) {
    console.error('Error predicting financial outcome:', error);
    
    // Check if it's a quota exceeded error
    if (error.code === 'insufficient_quota' || error.status === 429) {
      console.warn('OpenAI quota exceeded, using fallback predictions');
      // Return fallback predictions with clear indication
      const baseAmount = data.case.damages_requested || 100000;
      return {
        settlement: {
          low: baseAmount * 0.3,
          likely: baseAmount * 0.6,
          high: baseAmount * 0.9,
          confidence: 0.4
        },
        verdict: {
          low: baseAmount * 0.2,
          likely: baseAmount * 0.8,
          high: baseAmount * 1.5,
          confidence: 0.3
        },
        factors: ['OpenAI quota exceeded, using fallback estimates'],
        methodology: 'quota_exceeded_fallback',
        warning: 'AI analysis unavailable due to quota limits'
      };
    }
    
    // Return fallback predictions for other errors
    const baseAmount = data.case.damages_requested || 100000;
    return {
      settlement: {
        low: baseAmount * 0.3,
        likely: baseAmount * 0.6,
        high: baseAmount * 0.9,
        confidence: 0.6
      },
      verdict: {
        low: baseAmount * 0.2,
        likely: baseAmount * 0.8,
        high: baseAmount * 1.5,
        confidence: 0.5
      },
      factors: ['AI analysis failed, using base estimates'],
      methodology: 'fallback_calculation'
    };
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
    
    // Comprehensive data gathering
    const [caseData, similarCases, marketData] = await Promise.all([
      getCaseDetails(caseId, user.id),
      getSimilarCasesWithFinancialOutcomes(caseId),
      getMarketDataForDamages(caseId)
    ]);
    
    // Rate limit check
    await rateLimiter.checkLimit('openai', user.id);
    
    // AI-powered financial analysis
    const prediction = await predictFinancialOutcome({
      case: caseData,
      historicalOutcomes: similarCases,
      marketFactors: marketData,
      damagesRequested: caseData.damages_requested
    });
    
    // Calculate confidence intervals
    const confidenceIntervals = calculateConfidenceIntervals(
      prediction,
      similarCases.length
    );
    
    const result = {
      settlementRange: {
        low: confidenceIntervals.settlement.low,
        likely: prediction.settlement.likely,
        high: confidenceIntervals.settlement.high,
        confidence: prediction.settlement.confidence
      },
      verdictRange: {
        low: confidenceIntervals.verdict.low,
        likely: prediction.verdict.likely,
        high: confidenceIntervals.verdict.high,
        confidence: prediction.verdict.confidence
      },
      factors: prediction.factors,
      methodology: prediction.methodology,
      comparableCases: similarCases.slice(0, 5) // Top 5 comparables
    };
    
    await storeAnalysis(caseId, 'financial-prediction', result);
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'financial_prediction',
      caseId: req.query.id 
    });
  }
}; 