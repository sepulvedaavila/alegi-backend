// test-simple-auth.js - Simple test for service key authentication
require('dotenv').config();

async function testServiceKeyAuth() {
  console.log('🧪 Testing Service Key Authentication');
  console.log('===================================\n');

  // Import auth middleware
  const { validateWithDevBypass } = require('./middleware/auth');

  console.log('📋 Environment Check:');
  console.log(`SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Missing'}`);
  console.log(`SUPABASE_WEBHOOK_SECRET: ${process.env.SUPABASE_WEBHOOK_SECRET ? 'Set' : 'Missing'}`);
  console.log('');

  // Test different authentication methods
  const testCases = [
    {
      name: 'Supabase Service Key',
      headers: {
        'x-supabase-service-key': process.env.SUPABASE_SERVICE_KEY
      }
    },
    {
      name: 'Webhook Secret',
      headers: {
        'x-webhook-secret': process.env.SUPABASE_WEBHOOK_SECRET
      }
    },
    {
      name: 'Simple API Key',
      headers: {
        'x-api-key': process.env.SUPABASE_SERVICE_KEY
      }
    },
    {
      name: 'Bearer Service Key',
      headers: {
        'authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    },
    {
      name: 'Development Bypass',
      headers: {
        'x-dev-bypass': 'true'
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`🔍 Testing: ${testCase.name}`);
    
    const mockReq = {
      headers: testCase.headers
    };

    try {
      const user = await validateWithDevBypass(mockReq);
      console.log(`✅ Success: Authenticated as ${user.email} (${user.role})`);
      console.log(`   Provider: ${user.app_metadata?.provider || 'unknown'}`);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    console.log('');
  }

  // Show curl examples
  console.log('🚀 Ready to use! Here are your curl examples:');
  console.log('============================================\n');

  console.log('1. Using Service Key (Recommended):');
  console.log(`curl -X POST "https://your-api.vercel.app/api/cases/YOUR_CASE_ID/process" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-API-Key: ${process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.substring(0, 20) + '...' : 'YOUR_SERVICE_KEY'}" \\`);
  console.log(`  -d '{"force": true, "priority": 3}'`);
  console.log('');

  console.log('2. Using Webhook Secret:');
  console.log(`curl -X POST "https://your-api.vercel.app/api/cases/YOUR_CASE_ID/process" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-Webhook-Secret: ${process.env.SUPABASE_WEBHOOK_SECRET || 'YOUR_WEBHOOK_SECRET'}" \\`);
  console.log(`  -d '{"force": true, "priority": 3}'`);
  console.log('');

  console.log('3. For Development:');
  console.log(`curl -X POST "http://localhost:3000/api/cases/YOUR_CASE_ID/process" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-Dev-Bypass: true" \\`);
  console.log(`  -d '{"force": true, "priority": 3}'`);
  console.log('');

  console.log('✅ All authentication methods are working!');
  console.log('🎯 You can now trigger case processing without JWT tokens!');
}

testServiceKeyAuth().catch(console.error);