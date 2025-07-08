const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');
const { getAnalysisData, triggerLinearPipeline } = require('../../../utils/analysis-endpoint-helper');

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

async function getCaseEvidence(caseId) {
  try {
    const { data, error } = await supabase
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching case evidence:', error);
    return [];
  }
}

async function getCachedPrecedents(caseId) {
  try {
    const { data, error } = await supabase
      .from('similar_cases')
      .select('*')
      .eq('case_id', caseId)
      .order('similarity_score', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching cached precedents:', error);
    return [];
  }
}

async function getCachedJudgeAnalysis(caseId) {
  try {
    const { data, error } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .eq('analysis_type', 'judge-trends')
      .single();
    
    if (error || !data) return null;
    return data.result;
  } catch (error) {
    console.error('Error fetching judge analysis:', error);
    return null;
  }
}

function evaluateEvidenceStrength(evidence) {
  if (!evidence || evidence.length === 0) {
    return { score: 0, factors: ['No evidence provided'] };
  }
  
  const scores = evidence.map(item => {
    let score = 50; // Base score
    
    // Adjust based on evidence type
    if (item.type === 'document') score += 20;
    if (item.type === 'witness') score += 15;
    if (item.type === 'expert') score += 25;
    if (item.type === 'physical') score += 30;
    
    // Adjust based on reliability
    if (item.reliability === 'high') score += 20;
    if (item.reliability === 'medium') score += 10;
    if (item.reliability === 'low') score -= 10;
    
    return Math.min(100, Math.max(0, score));
  });
  
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  return {
    score: Math.round(avgScore),
    factors: evidence.map(item => `${item.type}: ${item.description}`)
  };
}

function evaluatePrecedentAlignment(precedents) {
  if (!precedents || precedents.length === 0) {
    return { score: 50, factors: ['No precedents available'] };
  }
  
  const favorablePrecedents = precedents.filter(p => p.similarity_score > 70);
  const unfavorablePrecedents = precedents.filter(p => p.similarity_score < 30);
  
  const score = favorablePrecedents.length > unfavorablePrecedents.length ? 70 : 30;
  
  return {
    score,
    factors: [
      `${favorablePrecedents.length} favorable precedents`,
      `${unfavorablePrecedents.length} unfavorable precedents`
    ]
  };
}

function evaluateJurisdiction(jurisdiction) {
  const jurisdictionRisks = {
    'federal': { score: 60, factors: ['Federal court complexity'] },
    'california': { score: 70, factors: ['Plaintiff-friendly jurisdiction'] },
    'new-york': { score: 65, factors: ['Complex procedural rules'] },
    'texas': { score: 55, factors: ['Defendant-friendly jurisdiction'] }
  };
  
  return jurisdictionRisks[jurisdiction?.toLowerCase()] || 
         { score: 50, factors: ['Unknown jurisdiction'] };
}

function evaluateProceduralRisks(caseStage) {
  const stageRisks = {
    'filing': { score: 40, factors: ['Early stage - limited risk'] },
    'discovery': { score: 60, factors: ['Discovery disputes possible'] },
    'motion_practice': { score: 70, factors: ['Motion practice complexity'] },
    'trial_prep': { score: 80, factors: ['High trial preparation costs'] },
    'trial': { score: 90, factors: ['Maximum risk and cost'] }
  };
  
  return stageRisks[caseStage?.toLowerCase()] || 
         { score: 50, factors: ['Unknown case stage'] };
}

function evaluateJudgeRisks(judgeData) {
  if (!judgeData) {
    return { score: 50, factors: ['No judge data available'] };
  }
  
  const stats = judgeData.statistics || {};
  let score = 50;
  const factors = [];
  
  if (stats.plaintiffWinRate > 60) {
    score += 20;
    factors.push('Judge favors plaintiffs');
  } else if (stats.plaintiffWinRate < 40) {
    score -= 20;
    factors.push('Judge favors defendants');
  }
  
  if (stats.summaryJudgmentRate > 30) {
    score -= 15;
    factors.push('High summary judgment rate');
  }
  
  return {
    score: Math.min(100, Math.max(0, score)),
    factors
  };
}

function evaluateTimelineRisks(caseData) {
  const risks = [];
  let score = 50;
  
  // Check if case is getting old
  if (caseData.filing_date) {
    const filingDate = new Date(caseData.filing_date);
    const daysSinceFiling = Math.floor((new Date() - filingDate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceFiling > 365) {
      score += 20;
      risks.push('Case over 1 year old');
    }
  }
  
  // Check complexity
  if (caseData.complexity_score > 70) {
    score += 15;
    risks.push('High complexity case');
  }
  
  return {
    score: Math.min(100, Math.max(0, score)),
    factors: risks
  };
}

async function analyzeRiskFactors(data) {
  return {
    evidenceStrength: evaluateEvidenceStrength(data.evidence),
    precedentAlignment: evaluatePrecedentAlignment(data.precedents),
    jurisdictionalFactors: evaluateJurisdiction(data.case.jurisdiction),
    proceduralStatus: evaluateProceduralRisks(data.case.case_stage),
    judgeFactors: evaluateJudgeRisks(data.judge),
    timeline: evaluateTimelineRisks(data.case)
  };
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
    
    // Function to generate fallback risk data from predictions
    const generateFallbackRiskData = (predictions) => {
      const riskLevel = predictions.risk_level || 'medium';
      const complexityScore = predictions.case_complexity_score || 50;
      
      return {
        overallRisk: riskLevel,
        riskScore: riskLevel === 'high' ? 75 : riskLevel === 'low' ? 25 : 50,
        riskFactors: [
          {
            factor: 'Case Complexity',
            level: complexityScore > 70 ? 'high' : complexityScore > 40 ? 'medium' : 'low',
            impact: complexityScore / 100,
            description: 'Based on case complexity analysis'
          },
          {
            factor: 'Outcome Uncertainty',
            level: predictions.prediction_confidence === 'high' ? 'low' : 'medium',
            impact: 0.3,
            description: 'Based on prediction confidence'
          },
          {
            factor: 'Settlement Probability',
            level: predictions.settlement_probability > 60 ? 'low' : 'high',
            impact: 0.4,
            description: 'Settlement likelihood affects risk profile'
          }
        ],
        strengths: [
          'Case has been thoroughly analyzed',
          'Predictions available for strategy planning'
        ],
        weaknesses: [
          'Detailed risk assessment pending full analysis'
        ],
        recommendations: [
          'Consider settlement negotiations if settlement probability is high',
          'Gather additional evidence to strengthen weak areas',
          'Consult with subject matter experts for complex issues'
        ]
      };
    };
    
    // Use the helper to get analysis data
    const result = await getAnalysisData(caseId, 'risk_assessment', generateFallbackRiskData);
    
    if (result.success) {
      return res.json(result.data);
    }
    
    if (result.processing) {
      return res.status(202).json(result);
    }
    
    if (result.needsProcessing) {
      // Trigger linear pipeline
      await triggerLinearPipeline(caseId);
      
      return res.status(202).json({
        message: 'Case analysis triggered',
        status: 'processing',
        estimatedTime: '2-5 minutes',
        hint: 'Risk assessment has been initiated. Please refresh in a few minutes.'
      });
    }
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'risk_assessment',
      caseId: req.query.id 
    });
  }
}; 