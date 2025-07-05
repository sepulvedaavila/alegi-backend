require('dotenv').config();

// Test to verify the rate limiting issue
const aiService = require('../services/ai.service');

console.log('Current AI Service Configuration:');
console.log('Environment:', process.env.NODE_ENV);
console.log('Is Mock:', aiService.isMock);

if (!aiService.isMock) {
  const status = aiService.getRateLimitStatus();
  console.log('\nRate Limit Status:');
  console.log('Requests this minute:', status.requestsThisMinute);
  console.log('Tokens this minute:', status.tokensThisMinute);
  console.log('Limits:', status.limits);
  
  console.log('\nIssue Identified:');
  console.log('- Case processing makes 5 OpenAI API calls');
  console.log('- Rate limit is', status.limits.rpm.default, 'requests per minute');
  console.log('- This causes cases to get stuck waiting for rate limits');
  
  console.log('\nRecommended Solutions:');
  console.log('1. Increase rate limits in production environment');
  console.log('2. Batch API calls or reduce the number of calls');
  console.log('3. Implement better queuing with delays between cases');
  console.log('4. Use a different model with higher rate limits');
}

process.exit(0);