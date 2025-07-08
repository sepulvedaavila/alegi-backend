const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../../../utils/errorHandler');

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

async function getHistoricalTimelines(params) {
  // This would typically query a database of historical case timelines
  // For now, return estimated data based on case type and jurisdiction
  
  const baseTimelines = {
    'personal_injury': {
      phases: {
        'Filing to Service': { min: 20, avg: 30, max: 45 },
        'Service to Answer': { min: 20, avg: 30, max: 45 },
        'Discovery Period': { min: 120, avg: 180, max: 270 },
        'Motion Practice': { min: 60, avg: 90, max: 150 },
        'Trial Preparation': { min: 45, avg: 60, max: 90 },
        'Trial': { min: 7, avg: 14, max: 21 },
        'Post-Trial': { min: 20, avg: 30, max: 45 }
      }
    },
    'contract_dispute': {
      phases: {
        'Filing to Service': { min: 25, avg: 35, max: 50 },
        'Service to Answer': { min: 25, avg: 35, max: 50 },
        'Discovery Period': { min: 150, avg: 210, max: 300 },
        'Motion Practice': { min: 75, avg: 105, max: 180 },
        'Trial Preparation': { min: 60, avg: 75, max: 105 },
        'Trial': { min: 10, avg: 18, max: 25 },
        'Post-Trial': { min: 25, avg: 35, max: 50 }
      }
    },
    'employment': {
      phases: {
        'Filing to Service': { min: 20, avg: 30, max: 40 },
        'Service to Answer': { min: 20, avg: 30, max: 40 },
        'Discovery Period': { min: 90, avg: 150, max: 240 },
        'Motion Practice': { min: 60, avg: 90, max: 150 },
        'Trial Preparation': { min: 45, avg: 60, max: 90 },
        'Trial': { min: 7, avg: 12, max: 18 },
        'Post-Trial': { min: 20, avg: 30, max: 45 }
      }
    }
  };
  
  const jurisdictionMultipliers = {
    'federal': 1.3,
    'california': 1.2,
    'new-york': 1.4,
    'texas': 1.1
  };
  
  const complexityMultipliers = {
    low: 0.8,
    medium: 1.0,
    high: 1.4
  };
  
  const baseTimeline = baseTimelines[params.caseType] || baseTimelines['contract_dispute'];
  const jurisdictionMultiplier = jurisdictionMultipliers[params.jurisdiction] || 1.0;
  const complexityMultiplier = complexityMultipliers[params.complexity > 70 ? 'high' : params.complexity > 30 ? 'medium' : 'low'];
  
  const adjustedPhases = {};
  for (const [phase, times] of Object.entries(baseTimeline.phases)) {
    adjustedPhases[phase] = {
      min: Math.round(times.min * jurisdictionMultiplier * complexityMultiplier),
      avg: Math.round(times.avg * jurisdictionMultiplier * complexityMultiplier),
      max: Math.round(times.max * jurisdictionMultiplier * complexityMultiplier)
    };
  }
  
  return { phases: adjustedPhases };
}

async function getCourtBacklogData(court) {
  // This would typically fetch from court system APIs
  // For now, return estimated backlog data
  
  const backlogData = {
    'federal': {
      delayPercentage: 15,
      impact: 'moderate',
      estimatedWait: 30
    },
    'california': {
      delayPercentage: 25,
      impact: 'high',
      estimatedWait: 45
    },
    'new-york': {
      delayPercentage: 30,
      impact: 'high',
      estimatedWait: 60
    },
    'texas': {
      delayPercentage: 10,
      impact: 'low',
      estimatedWait: 20
    }
  };
  
  return backlogData[court] || backlogData['federal'];
}

function calculatePhaseDurations(historicalData, currentStage, backlog) {
  const standardPhases = [
    { name: 'Filing to Service', base: 30 },
    { name: 'Service to Answer', base: 30 },
    { name: 'Discovery Period', base: 180 },
    { name: 'Motion Practice', base: 90 },
    { name: 'Trial Preparation', base: 60 },
    { name: 'Trial', base: 14 },
    { name: 'Post-Trial', base: 30 }
  ];
  
  return standardPhases.map(phase => {
    const historical = historicalData.phases?.[phase.name] || {};
    const backlogMultiplier = 1 + (backlog.delayPercentage / 100);
    
    return {
      name: phase.name,
      minDuration: Math.round((historical.min || phase.base * 0.7) * backlogMultiplier),
      avgDuration: Math.round((historical.avg || phase.base) * backlogMultiplier),
      maxDuration: Math.round((historical.max || phase.base * 1.5) * backlogMultiplier),
      status: getPhaseStatus(phase.name, currentStage),
      startDate: calculatePhaseStartDate(phase.name, currentStage),
      endDate: calculatePhaseEndDate(phase.name, currentStage)
    };
  });
}

function getPhaseStatus(phaseName, currentStage) {
  const stageOrder = ['filing', 'discovery', 'motion_practice', 'trial_prep', 'trial'];
  const phaseOrder = ['Filing to Service', 'Discovery Period', 'Motion Practice', 'Trial Preparation', 'Trial'];
  
  const currentIndex = stageOrder.indexOf(currentStage);
  const phaseIndex = phaseOrder.indexOf(phaseName);
  
  if (phaseIndex < currentIndex) return 'completed';
  if (phaseIndex === currentIndex) return 'current';
  return 'pending';
}

function calculatePhaseStartDate(phaseName, currentStage) {
  // This would calculate based on case filing date and current stage
  // For now, return estimated dates
  const now = new Date();
  const phaseOrder = ['Filing to Service', 'Discovery Period', 'Motion Practice', 'Trial Preparation', 'Trial'];
  const phaseIndex = phaseOrder.indexOf(phaseName);
  
  if (phaseIndex === -1) return null;
  
  // Estimate start date based on phase
  const estimatedDays = phaseIndex * 90; // Rough estimate
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + estimatedDays);
  
  return startDate.toISOString().split('T')[0];
}

function calculatePhaseEndDate(phaseName, currentStage) {
  const startDate = calculatePhaseStartDate(phaseName, currentStage);
  if (!startDate) return null;
  
  const phaseDurations = {
    'Filing to Service': 30,
    'Discovery Period': 180,
    'Motion Practice': 90,
    'Trial Preparation': 60,
    'Trial': 14,
    'Post-Trial': 30
  };
  
  const duration = phaseDurations[phaseName] || 30;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + duration);
  
  return endDate.toISOString().split('T')[0];
}

async function identifyDelayFactors(caseData, courtBacklog) {
  const factors = [];
  
  // Court backlog
  if (courtBacklog.impact === 'high') {
    factors.push(`High court backlog: ${courtBacklog.delayPercentage}% delay expected`);
  }
  
  // Case complexity
  if (caseData.complexity_score > 70) {
    factors.push('High case complexity may extend timeline');
  }
  
  // Multiple parties
  if (caseData.number_of_parties > 3) {
    factors.push('Multiple parties may slow proceedings');
  }
  
  // Jurisdiction factors
  if (caseData.jurisdiction === 'new-york') {
    factors.push('New York courts typically have longer timelines');
  }
  
  return factors;
}

async function cacheAnalysis(caseId, analysisType, result, days = 3) {
  try {
    await supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: analysisType,
        result: result,
        created_at: new Date(),
        expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      });
  } catch (error) {
    console.error('Error caching analysis:', error);
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Get historical timeline data
    const timelineData = await getHistoricalTimelines({
      caseType: caseData.case_type,
      jurisdiction: caseData.jurisdiction,
      court: caseData.court,
      complexity: caseData.complexity_score
    });
    
    // Factor in current court backlog
    const courtBacklog = await getCourtBacklogData(caseData.court);
    
    // Calculate phase durations
    const phases = calculatePhaseDurations(
      timelineData,
      caseData.case_stage,
      courtBacklog
    );
    
    // Identify delay factors
    const delayFactors = await identifyDelayFactors(caseData, courtBacklog);
    
    const result = {
      estimatedDays: {
        min: phases.reduce((sum, p) => sum + p.minDuration, 0),
        average: phases.reduce((sum, p) => sum + p.avgDuration, 0),
        max: phases.reduce((sum, p) => sum + p.maxDuration, 0)
      },
      phases: phases,
      factors: delayFactors,
      courtBacklogImpact: courtBacklog.impact,
      lastUpdated: new Date()
    };
    
    await cacheAnalysis(caseId, 'timeline-estimate', result, 3); // 3 day cache
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'timeline_estimate',
      caseId: req.query.id 
    });
  }
}; 