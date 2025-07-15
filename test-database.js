// test-database.js - Quick test to verify database connectivity and table existence
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testDatabase() {
  console.log('🔍 Testing database connectivity...');
  
  // Check environment variables
  console.log('Has SUPABASE_URL:', !!process.env.SUPABASE_URL);
  console.log('Has SUPABASE_SERVICE_KEY:', !!process.env.SUPABASE_SERVICE_KEY);
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    return;
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  try {
    // Test 1: Check if we can connect to the database
    console.log('\n📊 Test 1: Basic database connection...');
    const { data: testData, error: testError } = await supabase
      .from('case_briefs')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection failed:', testError);
      return;
    } else {
      console.log('✅ Database connection successful');
    }
    
    // Test 2: Check if queue_jobs table exists
    console.log('\n📊 Test 2: Check queue_jobs table existence...');
    const { data: queueData, error: queueError } = await supabase
      .from('queue_jobs')
      .select('*')
      .limit(1);
    
    if (queueError) {
      console.error('❌ queue_jobs table error:', queueError);
      console.error('Error details:', {
        message: queueError.message,
        details: queueError.details,
        hint: queueError.hint,
        code: queueError.code
      });
      
      // Check if it's a "relation does not exist" error
      if (queueError.message && queueError.message.includes('relation') && queueError.message.includes('does not exist')) {
        console.log('\n🔧 The queue_jobs table does not exist. Let me try to create it...');
        await createQueueJobsTable(supabase);
      }
    } else {
      console.log('✅ queue_jobs table exists and accessible');
      console.log('Current queue_jobs count:', queueData?.length || 0);
    }
    
    // Test 3: Try to insert a test job
    console.log('\n📊 Test 3: Try inserting a test job...');
    const testJob = {
      id: `test_job_${Date.now()}`,
      queue_name: 'test-queue',
      data: { test: true },
      status: 'pending',
      priority: 0,
      max_attempts: 3,
      attempts: 0,
      created_at: new Date().toISOString(),
      scheduled_for: new Date().toISOString()
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('queue_jobs')
      .insert(testJob);
    
    if (insertError) {
      console.error('❌ Test job insertion failed:', insertError);
    } else {
      console.log('✅ Test job inserted successfully');
      
      // Clean up test job
      await supabase
        .from('queue_jobs')
        .delete()
        .eq('id', testJob.id);
      console.log('🧹 Test job cleaned up');
    }
    
    // Test 4: Check other required tables
    console.log('\n📊 Test 4: Check other required tables...');
    const tablesToCheck = [
      'case_document_extractions',
      'precedent_cases', 
      'cost_logs'
    ];
    
    for (const tableName of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`❌ ${tableName} table error:`, error.message);
        } else {
          console.log(`✅ ${tableName} table exists and accessible`);
        }
      } catch (err) {
        console.log(`❌ ${tableName} table check failed:`, err.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  }
}

async function createQueueJobsTable(supabase) {
  try {
    console.log('Creating queue_jobs table...');
    
    // Note: This would typically be done via Supabase SQL editor or migrations
    // For now, we'll just report what's needed
    console.log(`
🔧 Need to create queue_jobs table with this SQL:

CREATE TABLE queue_jobs (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  result JSONB
);

CREATE INDEX idx_queue_jobs_status ON queue_jobs(status);
CREATE INDEX idx_queue_jobs_queue_name ON queue_jobs(queue_name);
CREATE INDEX idx_queue_jobs_scheduled_for ON queue_jobs(scheduled_for);
    `);
    
  } catch (error) {
    console.error('Failed to create queue_jobs table:', error);
  }
}

// Run the test
testDatabase().then(() => {
  console.log('\n🏁 Database test completed');
  process.exit(0);
}).catch(error => {
  console.error('Database test failed:', error);
  process.exit(1);
});