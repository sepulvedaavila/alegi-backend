const { optionalAuth } = require('../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../../utils/errorHandler');
const { applyCorsHeaders } = require('../../utils/cors-helper');

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper functions
function isStale(lastUpdated) {
  if (!lastUpdated) return true;
  
  const lastUpdate = new Date(lastUpdated);
  const now = new Date();
  const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
  
  return hoursSinceUpdate > 24; // Consider stale after 24 hours
}

async function queueMetadataUpdate() {
  // This would trigger a background job to update metadata
  // For now, just log the request
  console.log('Metadata update queued');
}

async function calculateCoverageStats() {
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('jurisdiction, case_type');
    
    if (error) throw error;
    
    const byJurisdiction = aggregateByField(data || [], 'jurisdiction');
    const byCaseType = aggregateByField(data || [], 'case_type');
    
    return { byJurisdiction, byCaseType };
  } catch (error) {
    console.error('Error calculating coverage stats:', error);
    return { byJurisdiction: {}, byCaseType: {} };
  }
}

function aggregateByField(data, field) {
  const aggregation = {};
  
  data.forEach(item => {
    const value = item[field] || 'unknown';
    aggregation[value] = (aggregation[value] || 0) + 1;
  });
  
  return aggregation;
}

async function getTrendingLegalTopics() {
  // This would analyze recent cases to identify trending topics
  // For now, return mock data
  
  return [
    {
      topic: 'Employment Discrimination',
      growth: 15.2,
      caseCount: 1250
    },
    {
      topic: 'Data Privacy',
      growth: 23.8,
      caseCount: 890
    },
    {
      topic: 'Contract Disputes',
      growth: 8.5,
      caseCount: 2100
    },
    {
      topic: 'Intellectual Property',
      growth: 12.1,
      caseCount: 650
    }
  ];
}

async function getRecentlyAnalyzedCases() {
  try {
    const { data, error } = await supabase
      .from('case_briefs')
      .select('id, case_type, jurisdiction, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching recently analyzed cases:', error);
    return [];
  }
}

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

// Background job to update metadata
async function updateAnalyzedCasesMetadata() {
  try {
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
  } catch (error) {
    console.error('Error updating analyzed cases metadata:', error);
  }
}

module.exports = async (req, res) => {
  // Apply CORS headers
  if (applyCorsHeaders(req, res)) {
    return; // Request was handled (OPTIONS)
  }
  
  try {
    // This endpoint can be public or require minimal auth
    const { data: metadata } = await supabase
      .from('analyzed_cases_metadata')
      .select('*')
      .single();
    
    if (!metadata || isStale(metadata.last_updated)) {
      // Trigger background update
      await queueMetadataUpdate();
    }
    
    // Get detailed coverage stats
    const coverageStats = await calculateCoverageStats();
    
    const result = {
      totalCasesAnalyzed: metadata?.total_cases || 0,
      lastUpdated: metadata?.last_updated || new Date(),
      coverageByJurisdiction: coverageStats.byJurisdiction,
      coverageByCaseType: coverageStats.byCaseType,
      dataQualityScore: metadata?.data_quality_score || 0,
      trendingTopics: await getTrendingLegalTopics(),
      recentAdditions: await getRecentlyAnalyzedCases()
    };
    
    res.json(result);
    
  } catch (error) {
    handleError(error, res, { 
      operation: 'case_coverage_analytics'
    });
  }
}; 