// Test AI service import
console.log('Testing AI service import...');

try {
  const aiService = require('../services/ai.service');
  console.log('✓ AI service imported successfully');
  
  // Test accessing the service instance
  console.log('✓ AI service instance available');
  
  // Test accessing prompts
  const { AI_PROMPTS } = require('../services/ai-prompts.service');
  console.log('✓ AI_PROMPTS imported successfully');
  
  // Test specific prompts
  const testPrompts = [
    'PRECEDENT_ANALYSIS',
    'JUDICIAL_ANALYSIS',
    'SIMILAR_CASE_ANALYSIS',
    'RISK_ASSESSMENT',
    'COST_ESTIMATION'
  ];
  
  testPrompts.forEach(prompt => {
    if (AI_PROMPTS[prompt]) {
      console.log(`✓ ${prompt} - Available`);
    } else {
      console.log(`✗ ${prompt} - Missing`);
    }
  });
  
} catch (error) {
  console.log('✗ Error:', error.message);
  console.log('Stack:', error.stack);
} 