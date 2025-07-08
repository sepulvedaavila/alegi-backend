const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');
const courtListenerService = require('../../../services/courtlistener.service');
const { mapToCourtListenerCourt } = require('../../../utils/courtMaps');

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

function getDateYearsAgo(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().split('T')[0];
}

function deriveCourtFromJurisdiction(jurisdiction) {
  // Using centralized court mapping from utils/courtMaps.js
  return mapToCourtListenerCourt(jurisdiction) || 'federal';
}

async function getJudgeAppointmentInfo(judgeName) {
  // This would typically come from a judicial database
  // For now, return mock data
  return {
    appointedBy: 'Unknown',
    appointmentDate: 'Unknown',
    term: 'Unknown'
  };
}

function groupOpinionsByOutcome(opinions) {
  return {
    plaintiffWins: opinions.filter(o => o.outcome === 'plaintiff'),
    defendantWins: opinions.filter(o => o.outcome === 'defendant'),
    settlements: opinions.filter(o => o.outcome === 'settlement'),
    dismissals: opinions.filter(o => o.outcome === 'dismissal')
  };
}

function calculateWinRate(wins, total) {
  return total > 0 ? (wins / total) * 100 : 0;
}

function calculateAvgRulingTime(opinions) {
  if (opinions.length === 0) return 0;
  
  const totalDays = opinions.reduce((sum, opinion) => {
    if (opinion.dateFiled && opinion.dateDecided) {
      const filed = new Date(opinion.dateFiled);
      const decided = new Date(opinion.dateDecided);
      return sum + Math.floor((decided - filed) / (1000 * 60 * 60 * 24));
    }
    return sum;
  }, 0);
  
  return Math.round(totalDays / opinions.length);
}

function calculateSummaryJudgmentRate(opinions) {
  const summaryJudgments = opinions.filter(o => 
    o.opinionType === 'summary_judgment' || 
    o.description?.toLowerCase().includes('summary judgment')
  );
  
  return opinions.length > 0 ? (summaryJudgments.length / opinions.length) * 100 : 0;
}

async function calculateAppealRate(opinions) {
  // This would require additional data about appeals
  // For now, return a default value
  return 15; // 15% default appeal rate
}

async function identifyRulingPatterns(opinions, caseType) {
  try {
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `Analyze judicial ruling patterns. Identify trends in how this judge rules on ${caseType} cases.
          Return JSON with patterns array containing ruling tendencies, procedural preferences, and notable trends.`
        },
        {
          role: "user",
          content: JSON.stringify({ opinions, caseType })
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });
    
    return JSON.parse(analysis.choices[0].message.content);
  } catch (error) {
    console.error('Error identifying ruling patterns:', error);
    
    // Check if it's a quota exceeded error
    if (error.code === 'insufficient_quota' || error.status === 429) {
      console.warn('OpenAI quota exceeded for judge pattern analysis');
      return { 
        patterns: ['AI analysis unavailable due to quota limits'],
        warning: 'Pattern analysis limited due to OpenAI quota'
      };
    }
    
    return { patterns: ['Analysis failed'] };
  }
}

async function analyzeSimilarCaseOutcomes(judgeOpinions, caseData) {
  const similarCases = judgeOpinions.filter(opinion => 
    opinion.caseType === caseData.case_type ||
    opinion.description?.toLowerCase().includes(caseData.case_type?.toLowerCase())
  );
  
  if (similarCases.length === 0) {
    return {
      totalSimilar: 0,
      outcomes: [],
      averageAward: 0
    };
  }
  
  const outcomes = groupOpinionsByOutcome(similarCases);
  
  return {
    totalSimilar: similarCases.length,
    outcomes: {
      plaintiffWins: outcomes.plaintiffWins.length,
      defendantWins: outcomes.defendantWins.length,
      settlements: outcomes.settlements.length
    },
    averageAward: 0 // Would need financial data
  };
}

async function cacheAnalysis(caseId, analysisType, result, days = 7) {
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

async function analyzeJudicialPatterns(opinions, caseType) {
  // Group opinions by outcome
  const outcomes = groupOpinionsByOutcome(opinions);
  
  // Calculate statistics
  const statistics = {
    totalCases: opinions.length,
    plaintiffWinRate: calculateWinRate(outcomes.plaintiffWins.length, opinions.length),
    avgTimeToRuling: calculateAvgRulingTime(opinions),
    summaryJudgmentRate: calculateSummaryJudgmentRate(opinions),
    appealOverturnRate: await calculateAppealRate(opinions)
  };
  
  // Use AI to identify patterns
  const patterns = await identifyRulingPatterns(opinions, caseType);
  
  return { statistics, patterns };
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
    
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Get judge info from case or user input
    const judgeName = caseData.assigned_judge || req.query.judge;
    const court = caseData.court || deriveCourtFromJurisdiction(caseData.jurisdiction);
    
    if (!judgeName) {
      return res.status(400).json({ error: 'Judge information required' });
    }
    
    // Rate limit check
    await rateLimiter.checkLimit('courtlistener', user.id);
    
    // Search CourtListener for judge's cases
    let judgeOpinions = [];
    try {
      const searchQuery = `judge:"${judgeName}"`;
      const searchResults = await courtListenerService.searchCases(searchQuery, {
        court: court,
        filed_after: getDateYearsAgo(5) // Last 5 years
      });
      
      judgeOpinions = searchResults || [];
    } catch (error) {
      console.error('Error fetching judge opinions:', error);
      // Continue with empty results
    }
    
    // Analyze patterns
    const analysis = await analyzeJudicialPatterns(
      judgeOpinions,
      caseData.case_type
    );
    
    // Get similar case outcomes
    const similarCaseOutcomes = await analyzeSimilarCaseOutcomes(
      judgeOpinions,
      caseData
    );
    
    const result = {
      judge: {
        name: judgeName,
        court: court,
        appointedBy: await getJudgeAppointmentInfo(judgeName)
      },
      statistics: analysis.statistics,
      similarCaseOutcomes: similarCaseOutcomes,
      rulingPatterns: analysis.patterns
    };
    
    // Cache results
    await cacheAnalysis(caseId, 'judge-trends', result, 7); // 7 day cache
    
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'judge_trends',
      caseId: req.query.id 
    });
  }
}; 