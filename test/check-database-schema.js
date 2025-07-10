require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkDatabaseSchema() {
  console.log('🔍 CHECKING DATABASE SCHEMA\n');
  
  try {
    // Check case_briefs table structure
    console.log('1. Checking case_briefs table...');
    const { data: caseBriefsColumns, error: caseBriefsError } = await supabase
      .from('case_briefs')
      .select('*')
      .limit(1);
    
    if (caseBriefsError) {
      console.log('❌ Error accessing case_briefs table:', caseBriefsError.message);
    } else {
      console.log('✅ case_briefs table accessible');
      console.log('   Columns:', Object.keys(caseBriefsColumns[0] || {}));
    }

    // Check if error_message column exists
    console.log('\n2. Checking for error_message column...');
    try {
      const { data: testQuery, error: testError } = await supabase
        .from('case_briefs')
        .select('error_message')
        .limit(1);
      
      if (testError) {
        console.log('❌ error_message column does not exist');
        console.log('   Error:', testError.message);
      } else {
        console.log('✅ error_message column exists');
      }
    } catch (error) {
      console.log('❌ error_message column does not exist');
    }

    // Check processing_errors table
    console.log('\n3. Checking processing_errors table...');
    try {
      const { data: processingErrors, error: processingErrorsError } = await supabase
        .from('processing_errors')
        .select('*')
        .limit(1);
      
      if (processingErrorsError) {
        console.log('❌ processing_errors table error:', processingErrorsError.message);
      } else {
        console.log('✅ processing_errors table accessible');
        console.log('   Columns:', Object.keys(processingErrors[0] || {}));
      }
    } catch (error) {
      console.log('❌ processing_errors table does not exist');
    }

    // Check case_documents table
    console.log('\n4. Checking case_documents table...');
    try {
      const { data: caseDocuments, error: caseDocumentsError } = await supabase
        .from('case_documents')
        .select('*')
        .limit(1);
      
      if (caseDocumentsError) {
        console.log('❌ case_documents table error:', caseDocumentsError.message);
      } else {
        console.log('✅ case_documents table accessible');
        console.log('   Columns:', Object.keys(caseDocuments[0] || {}));
      }
    } catch (error) {
      console.log('❌ case_documents table does not exist');
    }

    // Check case_analysis table
    console.log('\n5. Checking case_analysis table...');
    try {
      const { data: caseAnalysis, error: caseAnalysisError } = await supabase
        .from('case_analysis')
        .select('*')
        .limit(1);
      
      if (caseAnalysisError) {
        console.log('❌ case_analysis table error:', caseAnalysisError.message);
      } else {
        console.log('✅ case_analysis table accessible');
        console.log('   Columns:', Object.keys(caseAnalysis[0] || {}));
      }
    } catch (error) {
      console.log('❌ case_analysis table does not exist');
    }

    // Check case_processing_progress table
    console.log('\n6. Checking case_processing_progress table...');
    try {
      const { data: processingProgress, error: processingProgressError } = await supabase
        .from('case_processing_progress')
        .select('*')
        .limit(1);
      
      if (processingProgressError) {
        console.log('❌ case_processing_progress table error:', processingProgressError.message);
      } else {
        console.log('✅ case_processing_progress table accessible');
        console.log('   Columns:', Object.keys(processingProgress[0] || {}));
      }
    } catch (error) {
      console.log('❌ case_processing_progress table does not exist');
    }

    // Test creating a case with all required fields
    console.log('\n7. Testing case creation...');
    const testCaseId = 'schema-test-' + Date.now();
    try {
      const { data: testCase, error: createError } = await supabase
        .from('case_briefs')
        .insert({
          id: testCaseId,
          user_id: 'schema-test-user',
          case_name: 'Schema Test Case',
          case_type: 'Employment',
          case_stage: 'Assessing filing',
          processing_status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        console.log('❌ Failed to create test case:', createError.message);
      } else {
        console.log('✅ Test case created successfully');
        
        // Clean up test case
        await supabase
          .from('case_briefs')
          .delete()
          .eq('id', testCaseId);
        console.log('✅ Test case cleaned up');
      }
    } catch (error) {
      console.log('❌ Case creation test failed:', error.message);
    }

  } catch (error) {
    console.error('Schema check failed:', error);
  }
}

checkDatabaseSchema().catch(error => {
  console.error('Database schema check failed:', error);
  process.exit(1);
}); 