const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');
const Sentry = require('@sentry/node');

// Initialize services
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  try {
    // Auth validation
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    
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
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Check for existing analysis within 24 hours
    const { data: existing } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .eq('analysis_type', 'probability')
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .single();
    
    if (existing) {
      return res.json(existing.result);
    }
    
    // Check if case has been processed at all
    const { data: casePredictions } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseId)
      .single();
    
    if (!casePredictions) {
      // Case hasn't been processed yet, trigger processing
      console.log(`Case ${caseId} not processed yet, triggering analysis`);
      
      try {
        const processingService = require('../../../services/processing.service');
        await processingService.triggerAnalysisForExistingCase(caseId, user.id);
        
        // Return a response indicating processing has been triggered
        return res.status(202).json({
          message: 'Analysis triggered',
          status: 'processing',
          estimatedTime: '2-5 minutes'
        });
      } catch (processingError) {
        console.error('Failed to trigger processing:', processingError);
        return res.status(500).json({
          error: 'Failed to trigger analysis',
          message: 'Please try again in a few minutes'
        });
      }
    }
    
    // Rate limit check
    await rateLimiter.checkLimit('openai', user.id);
    
    // Prepare case context
    const [parties, evidence] = await Promise.all([
      getPartyDetails(caseId),
      getEvidenceSummary(caseId)
    ]);
    
    const context = {
      caseType: caseData.case_type,
      jurisdiction: caseData.jurisdiction,
      description: caseData.case_description,
      stage: caseData.case_stage,
      parties: parties,
      evidence: evidence
    };
    
    // AI Analysis
    const completion = await openai.chat.completions.create({
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
      temperature: 0.3
    });
    
    const analysis = JSON.parse(completion.choices[0].message.content);
    
    // Store analysis
    await supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'probability',
        result: analysis,
        confidence_score: analysis.confidence === 'high' ? 0.9 : 
                         analysis.confidence === 'medium' ? 0.7 : 0.5,
        factors: analysis.factors
      });
    
    // Update case brief
    await supabase
      .from('case_briefs')
      .update({
        success_probability: analysis.successProbability,
        last_ai_update: new Date()
      })
      .eq('id', caseId);
    
    res.json(analysis);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'probability_analysis',
      caseId: req.query.id 
    });
  }
}; 