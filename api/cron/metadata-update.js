const { createClient } = require('@supabase/supabase-js');
const Sentry = require('@sentry/node');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

async function updateAnalyzedCasesMetadata() {
  try {
    console.log('Starting metadata update...');
    
    const totalCases = await getTotalAnalyzedCases();
    const coverageStats = await calculateDetailedCoverage();
    const qualityScore = await calculateDataQualityScore();
    
    await supabase
      .from('analyzed_cases_metadata')
      .upsert({
        id: 'singleton', // Single row
        total_cases: totalCases,
        coverage_stats: coverageStats,
        data_quality_score: qualityScore,
        last_updated: new Date()
      });
    
    console.log(`Updated metadata: ${totalCases} cases, quality score: ${qualityScore}`);
    
    return { 
      success: true, 
      totalCases, 
      qualityScore,
      coverageStats 
    };
    
  } catch (error) {
    console.error('Error updating analyzed cases metadata:', error);
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
    
    const result = await updateAnalyzedCasesMetadata();
    
    if (result.success) {
      res.json({
        success: true,
        message: `Updated metadata for ${result.totalCases} cases`,
        data: {
          totalCases: result.totalCases,
          qualityScore: result.qualityScore,
          coverageStats: result.coverageStats
        },
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
    console.error('Metadata update cron job error:', error);
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 