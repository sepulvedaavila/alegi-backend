const { OpenAI } = require('openai');
const { validateInternalServiceCall } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');

// Initialize services with better error checking
let openai;
let supabase;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI client initialized successfully');
  } else {
    console.error('OpenAI API key not configured - AI features will be limited');
  }
  
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    console.log('Supabase client initialized successfully');
  } else {
    console.error('Supabase not configured - database operations will fail');
  }
} catch (error) {
  console.error('Service initialization error:', error);
}

// Helper functions with better error handling
async function getCaseDetails(caseId, userId) {
  console.log(`Fetching case details for caseId: ${caseId}, userId: ${userId}`);
  
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }
  
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Supabase query error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!data) {
      console.error('No case found for caseId:', caseId);
      throw new Error('Case not found');
    }
    
    console.log('Case details retrieved successfully');
    return data;
  } catch (error) {
    console.error('Error in getCaseDetails:', error);
    throw error;
  }
}

async function getHistoricalCostData(params) {
  // This would typically query a database of historical case costs
  // For now, return estimated data based on case type and jurisdiction
  
  const baseCosts = {
    'personal_injury': {
      min: 15000,
      avg: 35000,
      max: 75000
    },
    'contract_dispute': {
      min: 25000,
      avg: 50000,
      max: 100000
    },
    'employment': {
      min: 20000,
      avg: 40000,
      max: 80000
    },
    'intellectual_property': {
      min: 50000,
      avg: 100000,
      max: 200000
    },
    'medical_malpractice': {
      min: 75000,
      avg: 150000,
      max: 300000
    }
  };
  
  const jurisdictionMultipliers = {
    'federal': 1.2,
    'california': 1.3,
    'new-york': 1.4,
    'texas': 1.1
  };
  
  const complexityMultipliers = {
    low: 0.7,
    medium: 1.0,
    high: 1.5
  };
  
  const baseCost = baseCosts[params.caseType] || baseCosts['contract_dispute'];
  const jurisdictionMultiplier = jurisdictionMultipliers[params.jurisdiction] || 1.0;
  const complexityMultiplier = complexityMultipliers[params.complexity > 70 ? 'high' : params.complexity > 30 ? 'medium' : 'low'];
  
  return {
    min: Math.round(baseCost.min * jurisdictionMultiplier * complexityMultiplier),
    avg: Math.round(baseCost.avg * jurisdictionMultiplier * complexityMultiplier),
    max: Math.round(baseCost.max * jurisdictionMultiplier * complexityMultiplier)
  };
}

function calculateBaseEstimates(historicalCosts, strategy) {
  const strategyMultipliers = {
    aggressive: { min: 0.8, avg: 1.2, max: 1.5 },
    standard: { min: 1.0, avg: 1.0, max: 1.0 },
    conservative: { min: 1.2, avg: 0.8, max: 0.7 }
  };
  
  const multiplier = strategyMultipliers[strategy] || strategyMultipliers.standard;
  
  return {
    min: Math.round(historicalCosts.min * multiplier.min),
    avg: Math.round(historicalCosts.avg * multiplier.avg),
    max: Math.round(historicalCosts.max * multiplier.max)
  };
}

async function adjustEstimatesWithAI(params) {
  console.log('Attempting AI adjustment of estimates...');
  
  if (!openai) {
    console.log('OpenAI not available, using base estimates');
    return {
      total: params.base,
      breakdown: {
        filing: params.base.avg * 0.05,
        discovery: params.base.avg * 0.35,
        motion_practice: params.base.avg * 0.20,
        trial_prep: params.base.avg * 0.25,
        trial: params.base.avg * 0.15
      },
      confidence: 'medium',
      assumptions: ['AI analysis not available, using base estimates']
    };
  }
  
  try {
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `Adjust litigation cost estimates based on case-specific factors.
          Consider case complexity, jurisdiction, strategy, and historical data.
          Return JSON with adjusted estimates and confidence level.`
        },
        {
          role: "user",
          content: JSON.stringify(params)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });
    
    const result = JSON.parse(analysis.choices[0].message.content);
    console.log('AI adjustment completed successfully');
    return result;
  } catch (error) {
    console.error('Error adjusting estimates with AI:', error);
    // Return base estimates if AI fails
    return {
      total: params.base,
      breakdown: {
        filing: params.base.avg * 0.05,
        discovery: params.base.avg * 0.35,
        motion_practice: params.base.avg * 0.20,
        trial_prep: params.base.avg * 0.25,
        trial: params.base.avg * 0.15
      },
      confidence: 'medium',
      assumptions: ['AI analysis failed, using base estimates']
    };
  }
}

function generatePaymentSchedule(estimates, currentStage, strategy) {
  const phases = [
    { phase: 'Initial Filing', percentage: 0.15, timing: '0-30 days' },
    { phase: 'Discovery', percentage: 0.35, timing: '30-180 days' },
    { phase: 'Motion Practice', percentage: 0.20, timing: '180-270 days' },
    { phase: 'Trial Preparation', percentage: 0.20, timing: '270-365 days' },
    { phase: 'Trial', percentage: 0.10, timing: '365+ days' }
  ];
  
  // Adjust based on strategy
  if (strategy === 'aggressive') {
    phases[1].percentage = 0.40; // More discovery
    phases[2].percentage = 0.25; // More motions
  } else if (strategy === 'conservative') {
    phases[1].percentage = 0.30; // Less discovery
    phases[4].percentage = 0.05; // Aim to avoid trial
  }
  
  function getPhaseStatus(phaseName, currentStage) {
    const stageOrder = ['filing', 'discovery', 'motion_practice', 'trial_prep', 'trial'];
    const phaseOrder = ['Initial Filing', 'Discovery', 'Motion Practice', 'Trial Preparation', 'Trial'];
    
    const currentIndex = stageOrder.indexOf(currentStage);
    const phaseIndex = phaseOrder.indexOf(phaseName);
    
    if (phaseIndex < currentIndex) return 'completed';
    if (phaseIndex === currentIndex) return 'current';
    return 'pending';
  }
  
  return phases.map(phase => ({
    ...phase,
    amount: estimates.total.avg * phase.percentage,
    status: getPhaseStatus(phase.phase, currentStage)
  }));
}

module.exports = async (req, res) => {
  console.log('Cost estimate endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Validating user token...');
    const user = await validateInternalServiceCall(req);
    console.log('User validated:', user.id);
    
    const { id: caseId } = req.query;
    const { strategy = 'standard' } = req.query; // aggressive, standard, conservative
    
    console.log('Request parameters:', { caseId, strategy });
    
    if (!caseId) {
      console.error('Missing case ID');
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    console.log('Fetching case details...');
    const caseData = await getCaseDetails(caseId, user.id);
    console.log('Case data retrieved:', { 
      id: caseData.id, 
      case_type: caseData.case_type, 
      jurisdiction: caseData.jurisdiction 
    });
    
    // Get historical cost data
    console.log('Calculating historical cost data...');
    const historicalCosts = await getHistoricalCostData({
      caseType: caseData.case_type || 'contract_dispute',
      jurisdiction: caseData.jurisdiction || 'federal',
      complexity: caseData.complexity_score || 50
    });
    console.log('Historical costs calculated:', historicalCosts);
    
    // Calculate base estimates
    console.log('Calculating base estimates...');
    const baseEstimates = calculateBaseEstimates(historicalCosts, strategy);
    console.log('Base estimates calculated:', baseEstimates);
    
    // Rate limit check
    console.log('Checking rate limits...');
    try {
      await rateLimiter.checkLimit('openai', user.id);
      console.log('Rate limit check passed');
    } catch (rateLimitError) {
      console.log('Rate limit exceeded, continuing with base estimates');
      // Continue with base estimates if rate limited
    }
    
    // Adjust for case-specific factors
    console.log('Adjusting estimates with AI...');
    const adjustedEstimates = await adjustEstimatesWithAI({
      base: baseEstimates,
      case: caseData,
      strategy: strategy,
      historicalData: historicalCosts
    });
    console.log('Estimates adjusted:', adjustedEstimates);
    
    // Generate payment schedule
    console.log('Generating payment schedule...');
    const paymentSchedule = generatePaymentSchedule(
      adjustedEstimates,
      caseData.case_stage || 'filing',
      strategy
    );
    console.log('Payment schedule generated');
    
    const result = {
      strategy: strategy,
      breakdown: adjustedEstimates.breakdown,
      totalEstimate: adjustedEstimates.total,
      paymentSchedule: paymentSchedule,
      confidenceLevel: adjustedEstimates.confidence,
      assumptions: adjustedEstimates.assumptions
    };
    
    console.log('Cost estimate completed successfully');
    res.json(result);
    
  } catch (error) {
    console.error('Cost estimate error:', error);
    console.error('Error stack:', error.stack);
    
    // More specific error handling
    if (error.message?.includes('Case not found')) {
      return res.status(404).json({
        error: 'Case not found',
        message: 'The specified case could not be found'
      });
    }
    
    if (error.message?.includes('Database error')) {
      return res.status(503).json({
        error: 'Database service unavailable',
        message: 'Unable to access case data. Please try again later.'
      });
    }
    
    if (error.message?.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.'
      });
    }
    
    // Use the general error handler for other cases
    handleError(error, res, { 
      operation: 'cost_estimate',
      caseId: req.query.id 
    });
  }
}; 