const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');

// Initialize services
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    
    return JSON.parse(analysis.choices[0].message.content);
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
    amount: estimates.total.likely * phase.percentage,
    status: getPhaseStatus(phase.phase, currentStage)
  }));
}

module.exports = async (req, res) => {
  try {
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    const { strategy = 'standard' } = req.query; // aggressive, standard, conservative
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Get historical cost data
    const historicalCosts = await getHistoricalCostData({
      caseType: caseData.case_type,
      jurisdiction: caseData.jurisdiction,
      complexity: caseData.complexity_score || 50
    });
    
    // Calculate base estimates
    const baseEstimates = calculateBaseEstimates(historicalCosts, strategy);
    
    // Rate limit check
    await rateLimiter.checkLimit('openai', user.id);
    
    // Adjust for case-specific factors
    const adjustedEstimates = await adjustEstimatesWithAI({
      base: baseEstimates,
      case: caseData,
      strategy: strategy,
      historicalData: historicalCosts
    });
    
    // Generate payment schedule
    const paymentSchedule = generatePaymentSchedule(
      adjustedEstimates,
      caseData.case_stage,
      strategy
    );
    
    const result = {
      strategy: strategy,
      breakdown: adjustedEstimates.breakdown,
      totalEstimate: adjustedEstimates.total,
      paymentSchedule: paymentSchedule,
      confidenceLevel: adjustedEstimates.confidence,
      assumptions: adjustedEstimates.assumptions
    };
    
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'cost_estimate',
      caseId: req.query.id 
    });
  }
}; 