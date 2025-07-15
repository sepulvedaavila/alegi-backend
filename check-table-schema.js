// check-table-schema.js - Check the current schema of queue_jobs table
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkTableSchema() {
  console.log('🔍 Checking queue_jobs table schema...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  try {
    // Use RPC to get table schema information
    const { data: columns, error } = await supabase.rpc('get_table_columns', {
      table_name: 'queue_jobs'
    });
    
    if (error) {
      console.log('RPC failed, trying alternative approach...');
      
      // Alternative: Try to get all data from the table to see current structure
      const { data: allJobs, error: selectError } = await supabase
        .from('queue_jobs')
        .select('*')
        .limit(1);
      
      if (selectError) {
        console.error('❌ Cannot access queue_jobs table:', selectError);
        return;
      }
      
      console.log('✅ Current queue_jobs table is accessible');
      console.log('Current row count:', allJobs?.length || 0);
      
      if (allJobs && allJobs.length > 0) {
        console.log('Sample row structure:', Object.keys(allJobs[0]));
      } else {
        console.log('📝 Table is empty, cannot determine current schema from data');
      }
      
      // Try inserting with minimal required fields first
      console.log('\n🧪 Testing minimal job insertion...');
      const minimalJob = {
        id: `minimal_test_${Date.now()}`,
        queue_name: 'test',
        data: { test: true },
        status: 'pending'
      };
      
      const { data: minimalInsert, error: minimalError } = await supabase
        .from('queue_jobs')
        .insert(minimalJob);
      
      if (minimalError) {
        console.error('❌ Minimal job insertion failed:', minimalError);
        console.log('\n🔧 This suggests the table schema needs these columns:');
        console.log('- attempts (INTEGER)');
        console.log('- max_attempts (INTEGER)'); 
        console.log('- priority (INTEGER)');
        console.log('- created_at (TIMESTAMPTZ)');
        console.log('- scheduled_for (TIMESTAMPTZ)');
      } else {
        console.log('✅ Minimal job insertion succeeded');
        
        // Clean up
        await supabase
          .from('queue_jobs')
          .delete()
          .eq('id', minimalJob.id);
        console.log('🧹 Minimal test job cleaned up');
      }
      
    } else {
      console.log('✅ Table schema retrieved:', columns);
    }
    
  } catch (error) {
    console.error('❌ Schema check failed:', error);
  }
}

// Run the check
checkTableSchema().then(() => {
  console.log('\n🏁 Schema check completed');
  process.exit(0);
}).catch(error => {
  console.error('Schema check failed:', error);
  process.exit(1);
});