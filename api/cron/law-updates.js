const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const Sentry = require('@sentry/node');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function fetchLawUpdates() {
  try {
    console.log('Starting law updates fetch...');
    
    // Fetch from multiple sources
    const [courtListenerUpdates, rssUpdates, apiUpdates] = await Promise.all([
      fetchCourtListenerRecentOpinions(),
      fetchLegalRSSFeeds(),
      fetchGovernmentAPIUpdates()
    ]);
    
    console.log(`Fetched updates: CourtListener=${courtListenerUpdates.length}, RSS=${rssUpdates.length}, API=${apiUpdates.length}`);
    
    // Process and normalize
    const allUpdates = normalizeUpdates([
      ...courtListenerUpdates,
      ...rssUpdates,
      ...apiUpdates
    ]);
    
    // Analyze impact with AI
    for (const update of allUpdates) {
      const impact = await analyzeLawUpdateImpact(update);
      update.impact = impact.level;
      update.summary = impact.summary;
      update.affected_case_types = impact.affectedCaseTypes;
    }
    
    // Store in database
    await supabase
      .from('law_updates')
      .upsert(allUpdates, { onConflict: 'source_url' });
    
    console.log(`Stored ${allUpdates.length} law updates`);
    
    // Notify affected users
    await notifyAffectedUsers(allUpdates);
    
    return { success: true, updatesProcessed: allUpdates.length };
    
  } catch (error) {
    console.error('Law update fetch failed:', error);
    Sentry.captureException(error);
    return { success: false, error: error.message };
  }
}

module.exports = async (req, res) => {
  try {
    // Verify this is a cron job request
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const result = await fetchLawUpdates();
    
    if (result.success) {
      res.json({
        success: true,
        message: `Processed ${result.updatesProcessed} law updates`,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Cron job error:', error);
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 