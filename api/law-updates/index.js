const { OpenAI } = require('openai');
const { validateSupabaseToken } = require('../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const rateLimiter = require('../../services/rateLimiter');
const { handleError } = require('../../utils/errorHandler');
const { applyCorsHeaders } = require('../../utils/cors-helper');

// Initialize services
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper functions
async function getUserActiveCases(userId) {
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('id, case_type, jurisdiction, case_stage')
      .eq('user_id', userId)
      .in('case_stage', ['filing', 'discovery', 'motion_practice', 'trial_prep', 'trial']);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user active cases:', error);
    return [];
  }
}

async function enrichUpdatesWithRelevance(updates, userCases) {
  if (!userCases || userCases.length === 0) {
    return updates.map(update => ({
      ...update,
      relevance: 'general',
      affectedCases: []
    }));
  }
  
  try {
    // Use AI to analyze relevance
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `Analyze law updates for relevance to user's active cases.
          Return JSON with relevance score (0-100) and affected case IDs for each update.`
        },
        {
          role: "user",
          content: JSON.stringify({ updates, userCases })
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });
    
    const relevanceAnalysis = JSON.parse(analysis.choices[0].message.content);
    
    return updates.map((update, index) => ({
      ...update,
      relevance: relevanceAnalysis.updates[index]?.relevance || 'general',
      affectedCases: relevanceAnalysis.updates[index]?.affectedCases || []
    }));
  } catch (error) {
    console.error('Error enriching updates with relevance:', error);
    return updates.map(update => ({
      ...update,
      relevance: 'general',
      affectedCases: []
    }));
  }
}

async function fetchCourtListenerRecentOpinions() {
  // This would fetch from CourtListener API
  // For now, return mock data
  return [
    {
      id: 'cl_opinion_1',
      title: 'Recent Employment Law Decision',
      court: 'ca9',
      dateFiled: new Date().toISOString(),
      summary: 'Important ruling on workplace discrimination',
      impact: 'high',
      affectedCaseTypes: ['employment']
    }
  ];
}

async function fetchLegalRSSFeeds() {
  // This would fetch from legal RSS feeds
  // For now, return mock data
  return [
    {
      id: 'rss_1',
      title: 'New Data Privacy Regulations',
      source: 'Legal News Feed',
      datePublished: new Date().toISOString(),
      summary: 'New regulations affecting data privacy cases',
      impact: 'medium',
      affectedCaseTypes: ['intellectual_property', 'contract_dispute']
    }
  ];
}

async function fetchGovernmentAPIUpdates() {
  // This would fetch from government APIs
  // For now, return mock data
  return [
    {
      id: 'gov_1',
      title: 'Federal Court Rule Changes',
      source: 'Federal Courts',
      datePublished: new Date().toISOString(),
      summary: 'Changes to federal court procedures',
      impact: 'high',
      affectedCaseTypes: ['federal_cases']
    }
  ];
}

function normalizeUpdates(allUpdates) {
  return allUpdates.map(update => ({
    id: update.id,
    title: update.title,
    source: update.source || 'CourtListener',
    effective_date: update.dateFiled || update.datePublished,
    summary: update.summary,
    impact: update.impact || 'medium',
    affected_case_types: update.affectedCaseTypes || [],
    source_url: update.url || '',
    jurisdiction: update.court || 'federal'
  }));
}

async function analyzeLawUpdateImpact(update) {
  try {
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `Analyze law update impact. Determine impact level (low/medium/high),
          provide summary, and identify affected case types.`
        },
        {
          role: "user",
          content: JSON.stringify(update)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });
    
    return JSON.parse(analysis.choices[0].message.content);
  } catch (error) {
    console.error('Error analyzing law update impact:', error);
    return {
      level: 'medium',
      summary: update.summary || 'Impact analysis failed',
      affectedCaseTypes: []
    };
  }
}

async function notifyAffectedUsers(updates) {
  // This would send notifications to users affected by law updates
  // For now, just log the notification
  console.log('Would notify users about law updates:', updates.length);
}

// Background job to fetch law updates (optimized for cost)
async function fetchLawUpdates() {
  try {
    // Fetch from multiple sources
    const [courtListenerUpdates, rssUpdates, apiUpdates] = await Promise.all([
      fetchCourtListenerRecentOpinions(),
      fetchLegalRSSFeeds(),
      fetchGovernmentAPIUpdates()
    ]);
    
    // Process and normalize
    const allUpdates = normalizeUpdates([
      ...courtListenerUpdates,
      ...rssUpdates,
      ...apiUpdates
    ]);
    
    // Store updates with flag for on-demand AI analysis
    for (const update of allUpdates) {
      update.needs_ai_analysis = true; // Flag for on-demand analysis
    }
    
    await supabase
      .from('law_updates')
      .upsert(allUpdates, { onConflict: 'source_url' });
    
    console.log(`Stored ${allUpdates.length} law updates (pending AI analysis)`);
    
  } catch (error) {
    console.error('Law update fetch failed:', error);
  }
}

// On-demand AI analysis for law updates
async function analyzePendingUpdates() {
  try {
    // Get updates that need AI analysis
    const { data: pendingUpdates, error } = await supabase
      .from('law_updates')
      .select('*')
      .eq('needs_ai_analysis', true)
      .limit(10); // Process in batches to control costs
    
    if (error) throw error;
    
    console.log(`Analyzing ${pendingUpdates.length} pending updates...`);
    
    for (const update of pendingUpdates) {
      try {
        const impact = await analyzeLawUpdateImpact(update);
        update.impact = impact.level;
        update.summary = impact.summary;
        update.affected_case_types = impact.affectedCaseTypes;
        update.needs_ai_analysis = false;
        update.analyzed_at = new Date().toISOString();
        
        await supabase
          .from('law_updates')
          .update(update)
          .eq('id', update.id);
          
      } catch (error) {
        console.error(`Error analyzing update ${update.id}:`, error);
        // Continue with other updates
      }
    }
    
    return { success: true, analyzed: pendingUpdates.length };
    
  } catch (error) {
    console.error('Error analyzing pending updates:', error);
    return { success: false, error: error.message };
  }
}

module.exports = async (req, res) => {
  // Apply CORS headers
  if (applyCorsHeaders(req, res)) {
    return; // Request was handled (OPTIONS)
  }
  
  try {
    const user = await validateSupabaseToken(req);
    const {
      jurisdiction,
      caseTypes,
      impact,
      since,
      page = 1,
      limit = 20,
      analyze = false // New parameter to trigger AI analysis
    } = req.query;
    
    // Trigger AI analysis if requested (cost optimization)
    if (analyze === 'true') {
      await analyzePendingUpdates();
    }
    
    // Build query
    let query = supabase
      .from('law_updates')
      .select('*', { count: 'exact' });
    
    if (jurisdiction) {
      query = query.eq('jurisdiction', jurisdiction);
    }
    
    if (impact) {
      query = query.eq('impact', impact);
    }
    
    if (since) {
      query = query.gte('effective_date', since);
    }
    
    // Get user's active cases for relevance filtering
    const userCases = await getUserActiveCases(user.id);
    
    // Execute query
    const { data: updates, count } = await query
      .order('effective_date', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    
    // Analyze relevance to user's cases
    const enrichedUpdates = await enrichUpdatesWithRelevance(
      updates || [],
      userCases
    );
    
    res.json({
      updates: enrichedUpdates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        hasMore: page * limit < (count || 0)
      },
      filters: {
        jurisdiction,
        impact,
        since
      },
      costOptimization: {
        aiAnalysisTriggered: analyze === 'true',
        pendingAnalysis: await getPendingAnalysisCount()
      }
    });
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'law_updates'
    });
  }
};

// Helper function to get pending analysis count
async function getPendingAnalysisCount() {
  try {
    const { count, error } = await supabase
      .from('law_updates')
      .select('*', { count: 'exact', head: true })
      .eq('needs_ai_analysis', true);
    
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting pending analysis count:', error);
    return 0;
  }
}

// Schedule updates (this would be handled by Vercel cron jobs)
// setInterval(fetchLawUpdates, 6 * 60 * 60 * 1000); // Every 6 hours 