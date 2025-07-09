require('dotenv').config();

console.log('Checking webhook routes loading...\n');

try {
  console.log('1. Attempting to load webhook routes...');
  const webhookRoutes = require('../routes/webhooks');
  console.log('✅ Webhook routes loaded successfully!');
  console.log('✅ This means workers should be initialized!');
} catch (error) {
  console.log('❌ Failed to load webhook routes!');
  console.log('Error:', error.message);
  console.log('Stack:', error.stack);
  console.log('\nThis is why workers are not being initialized!');
}

console.log('\n2. Checking if workers are processing...');
const queueService = require('../services/queueService');

// Check if there are any jobs in the queue
console.log('\n3. Checking queue state...');
console.log('Case processing queue:', queueService.queues.get('case-processing')?.length || 0, 'jobs');
console.log('Document processing queue:', queueService.queues.get('document-processing')?.length || 0, 'jobs');

process.exit(0);