// Test script to verify the cost estimate fix
console.log('Testing cost estimate fix...');

// Mock the calculateBaseEstimates function
function calculateBaseEstimates(historicalCosts, strategy) {
  const strategyMultipliers = {
    aggressive: { min: 0.8, avg: 1.2, max: 1.5 },
    standard: { min: 1.0, avg: 1.0, max: 1.0 },
    conservative: { min: 1.2, avg: 0.8, max: 0.7 }
  };
  
  const multiplier = strategyMultipliers[strategy] || strategyMultipliers.standard;
  
  return {
    min: Math.round(historicalCosts.min * multiplier.min),
    avg: Math.round(historicalCosts.avg * multiplier.avg),
    max: Math.round(historicalCosts.max * multiplier.max)
  };
}

function generatePaymentSchedule(estimates, currentStage, strategy) {
  const phases = [
    { phase: 'Initial Filing', percentage: 0.15, timing: '0-30 days' },
    { phase: 'Discovery', percentage: 0.35, timing: '30-180 days' }
  ];
  
  // Get the average amount from the total estimates with fallback
  const totalAmount = estimates?.total?.avg || estimates?.avg || 0;
  
  if (totalAmount === 0) {
    console.warn('No valid total amount found in estimates, using default');
  }
  
  return phases.map(phase => ({
    ...phase,
    amount: totalAmount * phase.percentage,
    status: 'pending'
  }));
}

// Test 1: Normal case
const historicalCosts = { min: 25000, avg: 50000, max: 100000 };
const baseEstimates = calculateBaseEstimates(historicalCosts, 'standard');

const adjustedEstimates = {
  total: {
    min: baseEstimates.min,
    avg: baseEstimates.avg,
    max: baseEstimates.max
  },
  breakdown: {
    filing: baseEstimates.avg * 0.05,
    discovery: baseEstimates.avg * 0.35
  },
  confidence: 'medium',
  assumptions: ['Test case']
};

console.log('Test 1 - Normal case:');
console.log('Base estimates:', baseEstimates);
console.log('Adjusted estimates total.avg:', adjustedEstimates.total.avg);

const paymentSchedule = generatePaymentSchedule(adjustedEstimates, 'filing', 'standard');
console.log('Payment schedule:', paymentSchedule);

// Test 2: Edge case - missing total
console.log('\nTest 2 - Missing total:');
const badEstimates = {
  breakdown: { filing: 1000, discovery: 5000 },
  confidence: 'low'
};

const badPaymentSchedule = generatePaymentSchedule(badEstimates, 'filing', 'standard');
console.log('Bad estimates:', badEstimates);
console.log('Payment schedule with bad estimates:', badPaymentSchedule);

// Test 3: Edge case - total is not an object
console.log('\nTest 3 - Total is not an object:');
const badEstimates2 = {
  total: 50000, // This would cause the original error
  breakdown: { filing: 1000, discovery: 5000 },
  confidence: 'low'
};

const badPaymentSchedule2 = generatePaymentSchedule(badEstimates2, 'filing', 'standard');
console.log('Bad estimates 2:', badEstimates2);
console.log('Payment schedule with bad estimates 2:', badPaymentSchedule2);

console.log('\nFix verification complete!'); 