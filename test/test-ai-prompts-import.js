// Test file to verify AI prompts import
const { AI_PROMPTS } = require('../services/ai-prompts.service');

console.log('Testing AI_PROMPTS import...');
console.log('Available prompts:', Object.keys(AI_PROMPTS));

// Test specific prompts that are failing
const requiredPrompts = [
  'PRECEDENT_ANALYSIS',
  'JUDICIAL_ANALYSIS', 
  'SIMILAR_CASE_ANALYSIS',
  'RISK_ASSESSMENT',
  'COST_ESTIMATION'
];

console.log('\nChecking required prompts:');
requiredPrompts.forEach(prompt => {
  if (AI_PROMPTS[prompt]) {
    console.log(`✓ ${prompt} - OK`);
  } else {
    console.log(`✗ ${prompt} - MISSING`);
  }
});

// Test accessing a specific prompt
try {
  const precedentPrompt = AI_PROMPTS.PRECEDENT_ANALYSIS;
  console.log('\n✓ PRECEDENT_ANALYSIS prompt structure:', {
    model: precedentPrompt.model,
    temperature: precedentPrompt.temperature,
    hasPrompt: typeof precedentPrompt.prompt === 'function'
  });
} catch (error) {
  console.log('\n✗ Error accessing PRECEDENT_ANALYSIS:', error.message);
} 