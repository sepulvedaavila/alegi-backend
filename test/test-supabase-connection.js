// test/test-supabase-connection.js
const { createClient } = require('@supabase/supabase-js');

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Connection...\n');

  try {
    // Check environment variables
    console.log('1. Checking Environment Variables...');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SUPABASE_SERVICE_KEY: ${supabaseKey ? '✅ Set' : '❌ Missing'}`);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables not configured');
    }

    // Create client
    console.log('\n2. Creating Supabase Client...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('   ✅ Supabase client created');

    // Test basic connection
    console.log('\n3. Testing Basic Connection...');
    const { data: profile, error: profileError } = await supabase.auth.getUser();
    
    if (profileError) {
      console.log('   ⚠️  Auth test failed (expected for service key):', profileError.message);
    } else {
      console.log('   ✅ Basic connection successful');
    }

    // Test storage bucket access
    console.log('\n4. Testing Storage Bucket Access...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.log('   ❌ Bucket list error:', bucketError.message);
    } else {
      console.log('   ✅ Storage access successful');
      console.log(`   Available buckets: ${buckets.map(b => b.name).join(', ')}`);
      
      // Check if case-files bucket exists
      const caseFilesBucket = buckets.find(b => b.name === 'case-files');
      if (caseFilesBucket) {
        console.log('   ✅ case-files bucket found');
      } else {
        console.log('   ❌ case-files bucket not found');
        console.log('   Available buckets:', buckets.map(b => b.name));
      }
    }

    // Test file download with a test path
    console.log('\n5. Testing File Download...');
    const testFilePath = 'test-document.pdf';
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('case-files')
      .download(testFilePath);
    
    if (downloadError) {
      console.log('   ⚠️  Test file download failed (expected):', downloadError.message);
      console.log('   Error details:', {
        message: downloadError.message,
        details: downloadError.details,
        hint: downloadError.hint,
        code: downloadError.code
      });
    } else {
      console.log('   ✅ File download successful');
    }

    console.log('\n✅ Supabase Connection Test Completed!');
    return true;

  } catch (error) {
    console.error('\n❌ Supabase Connection Test Failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testSupabaseConnection()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { testSupabaseConnection }; 