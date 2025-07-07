const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');
const courtListenerService = require('../../../services/courtlistener.service');
const { mapToCourtListenerCourt } = require('../../../utils/courtMaps');

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

function buildSearchQuery(caseData) {
  const terms = [];
  
  if (caseData.case_type) terms.push(caseData.case_type);
  if (caseData.case_description) terms.push(caseData.case_description.substring(0, 100));
  if (caseData.jurisdiction) terms.push(caseData.jurisdiction);
  
  return terms.join(' ');
}

function getRelevantDateRange(caseData) {
  // Default to last 5 years
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  return fiveYearsAgo.toISOString().split('T')[0];
}

// Using centralized court mapping from utils/courtMaps.js

async function storePrecedents(caseId, precedents) {
  try {
    const precedentsToStore = precedents.map(precedent => ({
      case_id: caseId,
      courtlistener_id: precedent.id,
      title: precedent.caseName,
      court: precedent.court,
      date_filed: precedent.dateFiled,
      similarity_score: precedent.relevanceScore,
      key_points: precedent.keyPoints,
      similarity_factors: precedent.similarityFactors
    }));
    
    await supabase
      .from('similar_cases')
      .upsert(precedentsToStore, { onConflict: 'case_id,courtlistener_id' });
  } catch (error) {
    console.error('Error storing precedents:', error);
  }
}

async function getTotalCount(caseId) {
  try {
    const { count, error } = await supabase
      .from('similar_cases')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId);
    
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting total count:', error);
    return 0;
  }
}

// AI relevance analysis
async function analyzePrecedentRelevance(courtListenerResults, caseData) {
  const batchSize = 5; // Process in batches to avoid token limits
  const analyzed = [];
  
  for (let i = 0; i < courtListenerResults.length; i += batchSize) {
    const batch = courtListenerResults.slice(i, i + batchSize);
    
    try {
      const analysis = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `Score legal precedent relevance (0-100) based on fact similarity,
            legal issues, jurisdiction, and outcome impact. Return array of objects with
            relevanceScore, keyPoints, and similarityFactors for each case.`
          },
          {
            role: "user",
            content: JSON.stringify({
              targetCase: caseData,
              precedentCases: batch
            })
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });
      
      const batchResults = JSON.parse(analysis.choices[0].message.content);
      analyzed.push(...batchResults.cases);
    } catch (error) {
      console.error('Error analyzing precedent batch:', error);
      // Add fallback analysis
      batch.forEach(caseItem => {
        analyzed.push({
          ...caseItem,
          relevanceScore: 50, // Default score
          keyPoints: ['Analysis failed'],
          similarityFactors: ['Default factor']
        });
      });
    }
  }
  
  return analyzed.sort((a, b) => b.relevanceScore - a.relevanceScore);
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
    const user = await validateSupabaseToken(req);
    const { id: caseId } = req.query;
    const { page = 1, limit = 10 } = req.query;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Check for cached precedents
    const { data: cached } = await supabase
      .from('similar_cases')
      .select('*')
      .eq('case_id', caseId)
      .order('similarity_score', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    
    if (cached && cached.length > 0) {
      return res.json({
        precedents: cached,
        pagination: { 
          page: parseInt(page), 
          limit: parseInt(limit), 
          total: await getTotalCount(caseId) 
        }
      });
    }
    
    // Rate limit check
    await rateLimiter.checkLimit('courtlistener', user.id);
    
    // Search CourtListener
    const searchQuery = buildSearchQuery(caseData);
    
    let searchResults = { results: [] };
    try {
      searchResults = await courtListenerService.search({
        q: searchQuery,
        type: 'o', // opinions
        filed_after: getRelevantDateRange(caseData),
        court: mapToCourtListenerCourt(caseData.jurisdiction)
      });
    } catch (error) {
      console.error('CourtListener search failed:', error);
      // Return empty results if CourtListener fails
      return res.json({
        precedents: [],
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 0 }
      });
    }
    
    if (!searchResults.results || searchResults.results.length === 0) {
      return res.json({
        precedents: [],
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 0 }
      });
    }
    
    // Rate limit check for AI analysis
    await rateLimiter.checkLimit('openai', user.id);
    
    // Analyze relevance with AI
    const precedents = await analyzePrecedentRelevance(
      searchResults.results,
      caseData
    );
    
    // Store in database
    await storePrecedents(caseId, precedents);
    
    // Return paginated results
    res.json({
      precedents: precedents.slice((page - 1) * limit, page * limit),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: precedents.length
      }
    });
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'precedent_analysis',
      caseId: req.query.id 
    });
  }
}; 