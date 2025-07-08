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
    
    // Check for existing analysis
    const { data: existing } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .eq('analysis_type', 'probability')
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .single();
    
    if (existing) {
      console.log('Returning cached probability analysis');
      return res.json(existing.result);
    }
    
    // Check if case has been processed
    const { data: casePredictions } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseId)
      .single();
    
    if (!casePredictions) {
      console.log(`Case ${caseId} not processed yet, returning pending status`);
      return res.status(202).json({
        message: 'Case analysis is being processed',
        status: 'processing',
        estimatedTime: '2-5 minutes',
        hint: 'Please refresh in a few minutes'
      });
    }
    
    // Rate limit check
    try {
      await rateLimiter.checkLimit('openai', user.id);
    } catch (rateLimitError) {
      console.error('Rate limit exceeded:', rateLimitError);
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Too many analysis requests. Please try again later.'
      });
    }
    
    // Prepare context for AI analysis
    const [parties, evidence] = await Promise.all([
      getPartyDetails(caseId),
      getEvidenceSummary(caseId)
    ]);
    
    const context = {
      caseType: caseData.case_type,
      jurisdiction: caseData.jurisdiction,
      description: caseData.case_description || caseData.case_narrative,
      stage: caseData.case_stage,
      parties: parties,
      evidence: evidence,
      // Add any available predictions data
      existingPredictions: casePredictions
    };
    
    console.log('Calling OpenAI for probability analysis');
    
    // AI Analysis with timeout
    const analysisPromise = openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a legal analyst. Analyze the case and provide probability scores.
          Return JSON with: successProbability, failureProbability, settlementProbability (all 0-100),
          confidence (high/medium/low), and factors object with scores for jurisdiction, caseType, precedent, proceduralPosture.`
        },
        {
          role: "user",
          content: JSON.stringify(context)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000
    });
    
    // Add timeout to OpenAI call
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('OpenAI timeout')), 30000)
    );
    
    const completion = await Promise.race([analysisPromise, timeoutPromise]);
    const analysis = JSON.parse(completion.choices[0].message.content);
    
    // Validate AI response
    if (!analysis.successProbability || !analysis.confidence) {
      throw new Error('Invalid AI response format');
    }
    
    // Store analysis
    await supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'probability',
        result: analysis,
        confidence_score: analysis.confidence === 'high' ? 0.9 : 
                         analysis.confidence === 'medium' ? 0.7 : 0.5,
        factors: analysis.factors,
        created_at: new Date().toISOString()
      });
    
    // Update case brief
    await supabase
      .from('case_briefs')
      .update({
        success_probability: analysis.successProbability,
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);
    
    console.log('Probability analysis completed successfully');
    res.json(analysis);
    
  } catch (error) {
    console.error('Probability analysis error:', error);
    handleError(error, res, { 
      operation: 'probability_analysis',
      caseId: req.query.id 
    });
  }
}; 