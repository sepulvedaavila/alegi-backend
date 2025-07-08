#!/usr/bin/env node

// scripts/fix-processing-service.js - Fix processing service issues

const fs = require('fs');
const path = require('path');

console.log('=== Processing Service Fix Script ===\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
const envLocalPath = path.join(__dirname, '..', '.env.local');

console.log('1. Checking environment files...');

if (fs.existsSync(envPath)) {
  console.log('✅ .env file exists');
} else {
  console.log('❌ .env file missing');
}

if (fs.existsSync(envLocalPath)) {
  console.log('✅ .env.local file exists');
} else {
  console.log('❌ .env.local file missing');
}

// Check environment variables
console.log('\n2. Checking environment variables...');

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'OPENAI_API_KEY'
];

const missingVars = [];

for (const envVar of requiredVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar} is set`);
  } else {
    console.log(`❌ ${envVar} is missing`);
    missingVars.push(envVar);
  }
}

if (missingVars.length > 0) {
  console.log(`\n⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.log('\nTo fix this issue:');
  console.log('1. Check your .env or .env.local file');
  console.log('2. Ensure all required variables are set');
  console.log('3. For production, check your Vercel environment variables');
  console.log('4. Restart your application after setting variables');
} else {
  console.log('\n✅ All required environment variables are set');
}

// Test processing service
console.log('\n3. Testing processing service...');

try {
  const { processingService } = require('../services');
  
  if (processingService) {
    console.log('✅ Processing service loaded successfully');
    
    // Test if methods exist
    if (typeof processingService.triggerAnalysisForExistingCase === 'function') {
      console.log('✅ triggerAnalysisForExistingCase method exists');
    } else {
      console.log('❌ triggerAnalysisForExistingCase method missing');
    }
    
    if (typeof processingService.processDocument === 'function') {
      console.log('✅ processDocument method exists');
    } else {
      console.log('❌ processDocument method missing');
    }
    
    // Test Supabase connection
    if (processingService.supabase) {
      console.log('✅ Supabase client exists');
    } else {
      console.log('❌ Supabase client not initialized');
    }
    
  } else {
    console.log('❌ Processing service failed to load');
  }
} catch (error) {
  console.log(`❌ Error loading processing service: ${error.message}`);
}

// Production deployment check
console.log('\n4. Production deployment check...');

if (process.env.VERCEL) {
  console.log('✅ Running on Vercel');
  console.log('Environment:', process.env.NODE_ENV || 'unknown');
  
  // Check if environment variables are set in Vercel
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    console.log('✅ Vercel environment variables are set');
  } else {
    console.log('❌ Vercel environment variables missing');
    console.log('\nTo fix Vercel deployment:');
    console.log('1. Go to your Vercel dashboard');
    console.log('2. Navigate to your project settings');
    console.log('3. Go to Environment Variables section');
    console.log('4. Add SUPABASE_URL and SUPABASE_SERVICE_KEY');
    console.log('5. Redeploy your application');
  }
} else {
  console.log('ℹ️  Running locally (not on Vercel)');
}

console.log('\n=== Fix Script Complete ===');

// Provide next steps
console.log('\nNext steps:');
console.log('1. If environment variables are missing, set them in your .env file');
console.log('2. For production, set them in your Vercel dashboard');
console.log('3. Restart your application');
console.log('4. Test the trigger analysis endpoint again');
console.log('5. Check the logs for any remaining errors'); 