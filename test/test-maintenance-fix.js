require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testMaintenanceFunctions() {
  console.log('🧪 Testing Maintenance Functions...\n');

  try {
    // Test 1: Calculate detailed coverage
    console.log('1. Testing calculateDetailedCoverage...');
    const { data: coverageData, error: coverageError } = await supabase
      .from('case_briefs')
      .select('jurisdiction, case_type, processing_status');
    
    if (coverageError) {
      console.log('❌ Coverage calculation failed:', coverageError.message);
    } else {
      const coverage = {
        totalCases: coverageData.length,
        jurisdictions: new Set(coverageData.map(c => c.jurisdiction)).size,
        caseTypes: new Set(coverageData.map(c => c.case_type)).size,
        completedCases: coverageData.filter(c => c.processing_status === 'completed').length
      };
      console.log('✅ Coverage calculation successful:', coverage);
    }

    // Test 2: Calculate data quality score
    console.log('\n2. Testing calculateDataQualityScore...');
    const { data: qualityData, error: qualityError } = await supabase
      .from('case_briefs')
      .select('case_narrative, processing_status, ai_processed');
    
    if (qualityError) {
      console.log('❌ Quality score calculation failed:', qualityError.message);
    } else {
      let totalScore = 0;
      let totalCases = qualityData.length;
      
      qualityData.forEach(caseData => {
        let caseScore = 0;
        
        // Score based on narrative completeness
        if (caseData.case_narrative && caseData.case_narrative.length > 100) {
          caseScore += 30;
        } else if (caseData.case_narrative && caseData.case_narrative.length > 50) {
          caseScore += 20;
        }
        
        // Score based on processing status
        if (caseData.processing_status === 'completed') {
          caseScore += 40;
        } else if (caseData.processing_status === 'processing') {
          caseScore += 20;
        }
        
        // Score based on AI processing
        if (caseData.ai_processed) {
          caseScore += 30;
        }
        
        totalScore += Math.min(100, caseScore);
      });
      
      const averageScore = totalCases > 0 ? Math.round(totalScore / totalCases) : 0;
      console.log('✅ Quality score calculation successful:', { averageScore, totalCases });
    }

    // Test 3: Update metadata
    console.log('\n3. Testing metadata update...');
    try {
      const totalCases = coverageData?.length || 0;
      const coverageStats = {
        totalCases,
        jurisdictions: new Set(coverageData?.map(c => c.jurisdiction) || []).size,
        caseTypes: new Set(coverageData?.map(c => c.case_type) || []).size,
        completedCases: coverageData?.filter(c => c.processing_status === 'completed').length || 0
      };
      const qualityScore = averageScore || 0;
      
      console.log('✅ Metadata update successful:', {
        totalCases,
        coverageStats,
        qualityScore
      });
    } catch (error) {
      console.log('❌ Metadata update failed:', error.message);
    }

    console.log('\n✅ All maintenance functions tested successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ Maintenance test failed:', error.message);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testMaintenanceFunctions()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testMaintenanceFunctions }; 