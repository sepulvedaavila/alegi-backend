const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../../services/rateLimiter');
const { handleError } = require('../../../utils/errorHandler');
const { applyCorsHeaders } = require('../../../utils/cors-helper');const courtListenerService = require('../../../services/courtlistener.service');
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

async function getCachedSimilarCases(caseId, filters) {
  try {
    let query = supabase
      .from('similar_cases')
      .select('*')
      .eq('case_id', caseId);
    
    // Apply filters if provided
    if (filters.jurisdiction) {
      query = query.eq('jurisdiction', filters.jurisdiction);
    }
    
    if (filters.caseType) {
      query = query.eq('case_type', filters.caseType);
    }
    
    if (filters.minSimilarity) {
      query = query.gte('similarity_score', filters.minSimilarity);
    }
    
    const { data, error } = await query
      .order('similarity_score', { ascending: false })
      .limit(filters.limit || 20);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching cached similar cases:', error);
    return [];
  }
}

async function searchCourtListenerSimilarCases(caseData, filters) {
  try {
    const searchQuery = buildSearchQuery(caseData);
    
    const searchResults = await courtListenerService.searchCases(searchQuery, {
      filed_after: getRelevantDateRange(caseData),
      court: mapToCourtListenerCourt(caseData.jurisdiction)
    });
    
    return searchResults || [];
  } catch (error) {
    console.error('Error searching CourtListener:', error);
    return [];
  }
}

async function searchInternalSimilarCases(caseData, filters) {
  try {
    let query = supabase
      .from('case_briefs')
      .select('*')
      .eq('case_type', caseData.case_type)
      .eq('jurisdiction', caseData.jurisdiction)
      .neq('id', caseData.id);
    
    // Apply additional filters
    if (filters.outcome) {
      query = query.eq('outcome', filters.outcome);
    }
    
    const { data, error } = await query.limit(50);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error searching internal cases:', error);
    return [];
  }
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

function deduplicateCases(allCases) {
  const seen = new Set();
  const unique = [];
  
  allCases.forEach(caseItem => {
    const key = caseItem.id || caseItem.courtlistener_id;
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(caseItem);
    }
  });
  
  return unique;
}

async function scoreCaseSimilarity(targetCase, candidateCases) {
  // Process in batches for efficiency
  const batchSize = 10;
  const scored = [];
  
  for (let i = 0; i < candidateCases.length; i += batchSize) {
    const batch = candidateCases.slice(i, i + batchSize);
    
    try {
      const analysis = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `Score case similarity (0-100) based on:
            1. Fact pattern similarity (40%)
            2. Legal issues alignment (30%)
            3. Jurisdiction and court (15%)
            4. Parties and stakes (15%)
            
            Return array with similarity score and matching factors for each case.`
          },
          {
            role: "user",
            content: JSON.stringify({ target: targetCase, candidates: batch })
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });
      
      const batchScores = JSON.parse(analysis.choices[0].message.content);
      scored.push(...batchScores.cases);
    } catch (error) {
      console.error('Error scoring case similarity batch:', error);
      
      // Check if it's a quota exceeded error
      if (error.code === 'insufficient_quota' || error.status === 429) {
        console.warn('OpenAI quota exceeded for case similarity scoring');
        batch.forEach(caseItem => {
          scored.push({
            ...caseItem,
            similarity: 50, // Default score
            matchingFactors: ['AI analysis unavailable due to quota limits'],
            warning: 'Similarity scoring limited due to OpenAI quota'
          });
        });
      } else {
        // Add fallback scores for other errors
        batch.forEach(caseItem => {
          scored.push({
            ...caseItem,
            similarity: 50, // Default score
            matchingFactors: ['Analysis failed']
          });
        });
      }
    }
  }
  
  return scored;
}

async function enrichSimilarCases(cases) {
  // Add additional data to cases
  return cases.map(caseItem => ({
    ...caseItem,
    enriched: true,
    lastUpdated: new Date()
  }));
}

async function cacheSimilarCases(caseId, filters, result) {
  try {
    await supabase
      .from('case_analysis')
      .upsert({
        case_id: caseId,
        analysis_type: 'similar-cases',
        result: {
          filters: filters,
          cases: result.cases,
          totalFound: result.totalFound
        },
        created_at: new Date()
      });
  } catch (error) {
    console.error('Error caching similar cases:', error);
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
    const { 
      limit = 20, 
      filters = {},
      refreshCache = false 
    } = req.body;
    
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }
    
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Check cache unless refresh requested
    if (!refreshCache) {
      const cached = await getCachedSimilarCases(caseId, filters);
      if (cached && cached.length > 0) {
        return res.json({
          query: { caseId, filters },
          totalFound: cached.length,
          cases: cached,
          searchSources: ['cache']
        });
      }
    }
    
    // Rate limit check
    await rateLimiter.checkLimit('courtlistener', user.id);
    
    // Multi-source search
    const [courtListenerResults, internalResults] = await Promise.all([
      searchCourtListenerSimilarCases(caseData, filters),
      searchInternalSimilarCases(caseData, filters)
    ]);
    
    // Combine and deduplicate
    const allCases = deduplicateCases([
      ...courtListenerResults,
      ...internalResults
    ]);
    
    if (allCases.length === 0) {
      return res.json({
        query: { caseId, filters },
        totalFound: 0,
        cases: [],
        searchSources: ['courtlistener', 'internal_database']
      });
    }
    
    // Rate limit check for AI analysis
    await rateLimiter.checkLimit('openai', user.id);
    
    // AI similarity scoring
    const scoredCases = await scoreCaseSimilarity(caseData, allCases);
    
    // Sort by similarity and apply limit
    const topCases = scoredCases
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    // Enrich with additional data
    const enrichedCases = await enrichSimilarCases(topCases);
    
    const result = {
      query: {
        caseId: caseId,
        filters: filters
      },
      totalFound: allCases.length,
      cases: enrichedCases,
      searchSources: ['courtlistener', 'internal_database']
    };
    
    // Cache results
    await cacheSimilarCases(caseId, filters, result);
    
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'find_similar_cases',
      caseId: req.query.id 
    });
  }
}; 