const fs = require('fs');
const path = require('path');

// Test configuration
const ANALYSIS_ENDPOINTS = [
  'probability.js',
  'settlement-analysis.js',
  'precedents.js',
  'judge-trends.js',
  'risk-assessment.js',
  'cost-estimate.js',
  'financial-prediction.js',
  'timeline-estimate.js',
  'find-similar.js'
];

function testCORSFixes() {
  console.log('🔍 Testing CORS fixes in analysis endpoints...\n');
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  ANALYSIS_ENDPOINTS.forEach(endpoint => {
    try {
      const filePath = path.join(__dirname, '..', 'api', 'cases', '[id]', endpoint);
      
      if (!fs.existsSync(filePath)) {
        results.failed++;
        results.errors.push(`${endpoint}: File not found`);
        console.log(`❌ ${endpoint}: File not found`);
        return;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for CORS handling (simplified - just OPTIONS handling since Vercel handles headers)
      const hasCORSHandling = content.includes('req.method === \'OPTIONS\'') &&
                             content.includes('return res.status(200).end()');
      
      if (hasCORSHandling) {
        results.passed++;
        console.log(`✅ ${endpoint}: CORS handling found`);
      } else {
        results.failed++;
        results.errors.push(`${endpoint}: Missing CORS handling`);
        console.log(`❌ ${endpoint}: Missing CORS handling`);
      }
      
    } catch (error) {
      results.failed++;
      results.errors.push(`${endpoint}: ${error.message}`);
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  });
  
  console.log('\n📊 Test Summary:');
  console.log(`- Total endpoints: ${ANALYSIS_ENDPOINTS.length}`);
  console.log(`- Passed: ${results.passed}`);
  console.log(`- Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors found:');
    results.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (results.failed === 0) {
    console.log('\n🎉 All CORS fixes are in place!');
    console.log('✅ Frontend should no longer see CORS errors');
  } else {
    console.log('\n⚠️  Some endpoints still need CORS fixes');
  }
  
  return results.failed === 0;
}

// Test the main API index file for CORS configuration
function testMainAPICORS() {
  console.log('\n🔍 Testing main API CORS configuration...\n');
  
  try {
    const filePath = path.join(__dirname, '..', 'api', 'index.js');
    const content = fs.readFileSync(filePath, 'utf8');
    
    const checks = {
      'CORS middleware configured': content.includes('app.use(cors('),
      'CORS origins configured': content.includes('alegi-frontend.vercel.app') || content.includes('localhost'),
      'CORS credentials enabled': content.includes('credentials: true'),
      'Trigger analysis endpoint exists': content.includes('/api/cases/:caseId/trigger-analysis')
    };
    
    let passed = 0;
    Object.entries(checks).forEach(([check, result]) => {
      if (result) {
        passed++;
        console.log(`✅ ${check}`);
      } else {
        console.log(`❌ ${check}`);
      }
    });
    
    console.log(`\n📊 Main API CORS: ${passed}/${Object.keys(checks).length} checks passed`);
    return passed === Object.keys(checks).length;
    
  } catch (error) {
    console.log(`❌ Error testing main API: ${error.message}`);
    return false;
  }
}

// Test vercel.json configuration
function testVercelConfig() {
  console.log('\n🔍 Testing Vercel configuration...\n');
  
  try {
    const filePath = path.join(__dirname, '..', 'vercel.json');
    const content = fs.readFileSync(filePath, 'utf8');
    
    const checks = {
      'CORS headers configured': content.includes('Access-Control-Allow-Origin'),
      'Analysis endpoints mapped': content.includes('/api/cases/:id/probability'),
      'All endpoints have rewrites': ANALYSIS_ENDPOINTS.every(endpoint => {
        const endpointName = endpoint.replace('.js', '').replace('-', '.');
        return content.includes(`/api/cases/:id/${endpointName.replace('.', '-')}`);
      })
    };
    
    let passed = 0;
    Object.entries(checks).forEach(([check, result]) => {
      if (result) {
        passed++;
        console.log(`✅ ${check}`);
      } else {
        console.log(`❌ ${check}`);
      }
    });
    
    console.log(`\n📊 Vercel config: ${passed}/${Object.keys(checks).length} checks passed`);
    return passed === Object.keys(checks).length;
    
  } catch (error) {
    console.log(`❌ Error testing Vercel config: ${error.message}`);
    return false;
  }
}

// Main test function
function runAllTests() {
  console.log('🚀 Starting CORS Fix Verification...\n');
  
  const corsFixes = testCORSFixes();
  const mainAPI = testMainAPICORS();
  const vercelConfig = testVercelConfig();
  
  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));
  
  console.log(`CORS Fixes: ${corsFixes ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Main API CORS: ${mainAPI ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Vercel Config: ${vercelConfig ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allPassed = corsFixes && mainAPI && vercelConfig;
  
  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ CORS issues should be resolved');
    console.log('✅ Frontend should be able to access all endpoints');
    console.log('✅ Webhook flow should work properly');
  } else {
    console.log('\n⚠️  Some tests failed');
    console.log('🔧 Please review the issues above');
  }
  
  return allPassed;
}

// Run tests if this file is executed directly
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runAllTests, testCORSFixes, testMainAPICORS, testVercelConfig }; 