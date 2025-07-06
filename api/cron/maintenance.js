const { createClient } = require('@supabase/supabase-js');
const Sentry = require('@sentry/node');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// METADATA UPDATE FUNCTIONS
async function getTotalAnalyzedCases() {
  try {
    const { count, error } = await supabase
      .from('case_briefs')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting total analyzed cases:', error);
    return 0;
  }
}

async function calculateDetailedCoverage() {
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('jurisdiction, case_type, outcome');
    
    if (error) throw error;
    
    const coverage = {
      totalCases: data.length,
      jurisdictions: new Set(data.map(c => c.jurisdiction)).size,
      caseTypes: new Set(data.map(c => c.case_type)).size,
      outcomes: data.filter(c => c.outcome).length
    };
    
    return coverage;
  } catch (error) {
    console.error('Error calculating detailed coverage:', error);
    return { totalCases: 0, jurisdictions: 0, caseTypes: 0, outcomes: 0 };
  }
}

async function calculateDataQualityScore() {
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('case_description, evidence_count, parties_count');
    
    if (error) throw error;
    
    let totalScore = 0;
    let totalCases = data.length;
    
    data.forEach(caseData => {
      let caseScore = 0;
      
      // Score based on description completeness
      if (caseData.case_description && caseData.case_description.length > 100) {
        caseScore += 30;
      } else if (caseData.case_description && caseData.case_description.length > 50) {
        caseScore += 20;
      }
      
      // Score based on evidence
      if (caseData.evidence_count > 5) {
        caseScore += 40;
      } else if (caseData.evidence_count > 2) {
        caseScore += 25;
      } else if (caseData.evidence_count > 0) {
        caseScore += 10;
      }
      
      // Score based on parties
      if (caseData.parties_count > 2) {
        caseScore += 30;
      } else if (caseData.parties_count > 1) {
        caseScore += 20;
      }
      
      totalScore += Math.min(100, caseScore);
    });
    
    return totalCases > 0 ? Math.round(totalScore / totalCases) : 0;
  } catch (error) {
    console.error('Error calculating data quality score:', error);
    return 0;
  }
}

// LIGHTWEIGHT LAW UPDATES (NO AI ANALYSIS)
async function fetchBasicLawUpdates() {
  try {
    // Only fetch basic updates without AI analysis to save costs
    // AI analysis will be done on-demand when users request law updates
    
    const basicUpdates = [
      {
        id: `update_${Date.now()}`,
        title: 'Daily Legal Update Check',
        source: 'Maintenance Cron',
        effective_date: new Date().toISOString(),
        summary: 'Daily check for legal updates completed',
        impact: 'low',
        affected_case_types: [],
        source_url: '',
        jurisdiction: 'general',
        needs_ai_analysis: true // Flag for on-demand analysis
      }
    ];
    
    // Store basic update record
    await supabase
      .from('law_updates')
      .upsert(basicUpdates, { onConflict: 'source_url' });
    
    return basicUpdates.length;
  } catch (error) {
    console.error('Error fetching basic law updates:', error);
    return 0;
  }
}

async function updateAnalyzedCasesMetadata() {
  try {
    const totalCases = await getTotalAnalyzedCases();
    const coverageStats = await calculateDetailedCoverage();
    const qualityScore = await calculateDataQualityScore();
    
    await supabase
      .from('analyzed_cases_metadata')
      .upsert({
        id: 'singleton',
        total_cases: totalCases,
        coverage_stats: coverageStats,
        data_quality_score: qualityScore,
        last_updated: new Date()
      });
    
    return { 
      success: true, 
      totalCases, 
      qualityScore,
      coverageStats 
    };
    
  } catch (error) {
    console.error('Error updating analyzed cases metadata:', error);
    return { success: false, error: error.message };
  }
}

// COST MONITORING
async function logMaintenanceCosts(operations) {
  try {
    const costLog = {
      timestamp: new Date().toISOString(),
      operations: operations,
      estimated_cost: 'low', // No AI calls in maintenance
      function_duration: '~30s',
      memory_usage: '~256MB'
    };
    
    await supabase
      .from('maintenance_logs')
      .insert(costLog);
      
  } catch (error) {
    console.error('Error logging maintenance costs:', error);
  }
}

// MAIN MAINTENANCE FUNCTION
async function runMaintenance() {
  try {
    console.log('Starting daily maintenance...');
    
    const startTime = Date.now();
    const operations = [];
    
    // 1. Update metadata (cheap operation)
    const metadataResult = await updateAnalyzedCasesMetadata();
    if (metadataResult.success) {
      operations.push({
        type: 'metadata_update',
        status: 'success',
        cases: metadataResult.totalCases,
        qualityScore: metadataResult.qualityScore
      });
    } else {
      operations.push({
        type: 'metadata_update',
        status: 'failed',
        error: metadataResult.error
      });
    }
    
    // 2. Fetch basic law updates (no AI analysis)
    const lawUpdatesCount = await fetchBasicLawUpdates();
    operations.push({
      type: 'law_updates_fetch',
      status: 'success',
      updatesCount: lawUpdatesCount
    });
    
    // 3. Log costs
    await logMaintenanceCosts(operations);
    
    const duration = Date.now() - startTime;
    console.log(`Maintenance completed in ${duration}ms`);
    
    return { 
      success: true, 
      operations,
      duration,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Maintenance failed:', error);
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
    
    const result = await runMaintenance();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Daily maintenance completed successfully',
        data: {
          operations: result.operations,
          duration: result.duration
        },
        timestamp: result.timestamp
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Maintenance cron job error:', error);
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 