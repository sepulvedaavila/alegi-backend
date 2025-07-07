const { 
  mapToCourtListenerCourt, 
  getCourtCodes, 
  getCourtName, 
  getAvailableJurisdictions,
  isValidCourtCode 
} = require('../utils/courtMaps');

console.log('🧪 Testing Court Mapping Utility\n');

// Test basic jurisdiction mapping
console.log('📋 Testing Basic Jurisdiction Mapping:');
const testJurisdictions = [
  'federal',
  'california', 
  'new york',
  'texas',
  'florida',
  'illinois',
  'ohio',
  'pennsylvania',
  'georgia',
  'north carolina'
];

testJurisdictions.forEach(jurisdiction => {
  const codes = mapToCourtListenerCourt(jurisdiction);
  console.log(`  ${jurisdiction}: ${codes}`);
});

// Test court type filtering
console.log('\n🏛️ Testing Court Type Filtering:');
const testJurisdiction = 'california';
console.log(`  ${testJurisdiction} - All courts: ${mapToCourtListenerCourt(testJurisdiction)}`);
console.log(`  ${testJurisdiction} - District only: ${mapToCourtListenerCourt(testJurisdiction, 'district')}`);
console.log(`  ${testJurisdiction} - Bankruptcy only: ${mapToCourtListenerCourt(testJurisdiction, 'bankruptcy')}`);
console.log(`  ${testJurisdiction} - Circuit only: ${mapToCourtListenerCourt(testJurisdiction, 'circuit')}`);

// Test court code validation
console.log('\n✅ Testing Court Code Validation:');
const testCodes = ['ca9', 'cand', 'canb', 'invalid', 'txed', 'flnd'];
testCodes.forEach(code => {
  console.log(`  ${code}: ${isValidCourtCode(code) ? 'Valid' : 'Invalid'}`);
});

// Test court name lookup
console.log('\n📖 Testing Court Name Lookup:');
const testCourtCodes = ['ca9', 'cand', 'txed', 'flnd'];
testCourtCodes.forEach(code => {
  const name = getCourtName(code);
  console.log(`  ${code}: ${name || 'Not found'}`);
});

// Test getCourtCodes function
console.log('\n🔍 Testing getCourtCodes Function:');
const testJurisdiction2 = 'new york';
const codes = getCourtCodes(testJurisdiction2);
console.log(`  ${testJurisdiction2}: [${codes.join(', ')}]`);

// Test available jurisdictions
console.log('\n🗺️ Available Jurisdictions (first 10):');
const jurisdictions = getAvailableJurisdictions();
console.log(`  Total: ${jurisdictions.length}`);
console.log(`  Sample: ${jurisdictions.slice(0, 10).join(', ')}`);

// Test edge cases
console.log('\n⚠️ Testing Edge Cases:');
console.log(`  Empty jurisdiction: "${mapToCourtListenerCourt('')}"`);
console.log(`  Null jurisdiction: "${mapToCourtListenerCourt(null)}"`);
console.log(`  Undefined jurisdiction: "${mapToCourtListenerCourt(undefined)}"`);
console.log(`  Unknown jurisdiction: "${mapToCourtListenerCourt('unknown')}"`);

// Test state abbreviations
console.log('\n🏷️ Testing State Abbreviations:');
const stateAbbrevs = ['ca', 'ny', 'tx', 'fl', 'il', 'oh', 'pa'];
stateAbbrevs.forEach(abbrev => {
  const codes = mapToCourtListenerCourt(abbrev);
  console.log(`  ${abbrev}: ${codes}`);
});

console.log('\n✅ Court mapping tests completed!'); 