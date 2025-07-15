#!/usr/bin/env node
// scripts/trigger-case-processing.js - Command line utility to trigger case processing

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const caseProcessingWorker = require('../services/case-processing.worker');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function triggerCaseProcessing() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🔧 Case Processing Trigger Utility

Usage:
  node scripts/trigger-case-processing.js <command> [options]

Commands:
  single <caseId>                    - Process a specific case
  bulk [limit]                       - Process multiple stuck cases 
  status <caseId>                    - Check case processing status
  queue                             - Show queue status
  list-stuck [hours]                - List stuck cases

Examples:
  node scripts/trigger-case-processing.js single abc-123-def
  node scripts/trigger-case-processing.js bulk 5
  node scripts/trigger-case-processing.js status abc-123-def
  node scripts/trigger-case-processing.js list-stuck 48
    `);
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'single':
        await processSingleCase(args[1]);
        break;
      case 'bulk':
        await processBulkCases(parseInt(args[1]) || 10);
        break;
      case 'status':
        await checkCaseStatus(args[1]);
        break;
      case 'queue':
        await showQueueStatus();
        break;
      case 'list-stuck':
        await listStuckCases(parseInt(args[1]) || 24);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Command failed:`, error.message);
    process.exit(1);
  }
}

async function processSingleCase(caseId) {
  if (!caseId) {
    console.error('❌ Case ID is required');
    process.exit(1);
  }

  console.log(`🔄 Processing case: ${caseId}`);

  // Get case data
  const { data: caseData, error } = await supabase
    .from('case_briefs')
    .select('id, user_id, case_name, processing_status')
    .eq('id', caseId)
    .single();

  if (error || !caseData) {
    console.error(`❌ Case not found: ${caseId}`);
    process.exit(1);
  }

  console.log(`📋 Found case: ${caseData.case_name}`);
  console.log(`📊 Current status: ${caseData.processing_status || 'unknown'}`);

  // Update status and queue for processing
  await supabase
    .from('case_briefs')
    .update({ 
      processing_status: 'queued',
      last_ai_update: new Date().toISOString(),
      processing_error: null
    })
    .eq('id', caseId);

  const job = await caseProcessingWorker.addCaseToQueue(caseData.id, caseData.user_id, {
    source: 'script_trigger',
    trigger: 'manual',
    priority: 3
  });

  console.log(`✅ Case ${caseId} queued for processing (job: ${job.id})`);
  console.log(`⏳ Processing should start within a few seconds...`);
}

async function processBulkCases(limit) {
  console.log(`🔍 Finding up to ${limit} stuck cases...`);

  const { data: stuckCases, error } = await supabase
    .from('case_briefs')
    .select('id, user_id, case_name, processing_status, last_ai_update')
    .or('processing_status.eq.pending,processing_status.eq.failed,processing_status.is.null,ai_processed.eq.false')
    .limit(limit);

  if (error) {
    throw new Error(`Failed to query cases: ${error.message}`);
  }

  if (!stuckCases || stuckCases.length === 0) {
    console.log('✅ No stuck cases found');
    return;
  }

  console.log(`📋 Found ${stuckCases.length} stuck cases`);

  for (const caseData of stuckCases) {
    try {
      console.log(`🔄 Processing: ${caseData.case_name} (${caseData.id})`);

      await supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'queued',
          last_ai_update: new Date().toISOString(),
          processing_error: null
        })
        .eq('id', caseData.id);

      const job = await caseProcessingWorker.addCaseToQueue(caseData.id, caseData.user_id, {
        source: 'script_bulk',
        trigger: 'bulk_recovery',
        priority: 2
      });

      console.log(`  ✅ Queued (job: ${job.id})`);
      
      // Small delay between cases
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`);
    }
  }

  console.log(`🎯 Bulk processing initiated for ${stuckCases.length} cases`);
}

async function checkCaseStatus(caseId) {
  if (!caseId) {
    console.error('❌ Case ID is required');
    process.exit(1);
  }

  const { data: caseData, error } = await supabase
    .from('case_briefs')
    .select('*')
    .eq('id', caseId)
    .single();

  if (error || !caseData) {
    console.error(`❌ Case not found: ${caseId}`);
    process.exit(1);
  }

  console.log(`📋 Case: ${caseData.case_name}`);
  console.log(`📊 Status: ${caseData.processing_status || 'unknown'}`);
  console.log(`🤖 AI Processed: ${caseData.ai_processed || false}`);
  console.log(`⏰ Last Update: ${caseData.last_ai_update || 'never'}`);
  console.log(`❌ Error: ${caseData.processing_error || 'none'}`);

  // Check for analysis results
  const { data: analysis } = await supabase
    .from('case_analysis')
    .select('analysis_type, created_at')
    .eq('case_id', caseId);

  if (analysis && analysis.length > 0) {
    console.log(`📊 Analysis Types Completed: ${analysis.map(a => a.analysis_type).join(', ')}`);
  } else {
    console.log(`📊 Analysis: No analysis found`);
  }

  // Check queue status
  const queueStatus = await caseProcessingWorker.getCaseProcessingStatus(caseId);
  console.log(`🔄 Queue Status: ${queueStatus.status || 'not in queue'}`);
}

async function showQueueStatus() {
  const queueService = require('../services/queueService');
  const stats = await queueService.getQueueStatus('case-processing');
  
  console.log(`📊 Queue Statistics:`);
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  Processing: ${stats.processing}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Total: ${stats.total}`);
  console.log(`  Is Processing: ${stats.isProcessing}`);
  console.log(`  Has Processor: ${stats.hasProcessor}`);
}

async function listStuckCases(hours) {
  const thresholdTime = new Date();
  thresholdTime.setHours(thresholdTime.getHours() - hours);

  const { data: stuckCases, error } = await supabase
    .from('case_briefs')
    .select('id, case_name, processing_status, last_ai_update, created_at, ai_processed')
    .or(`processing_status.eq.pending,processing_status.eq.failed,processing_status.is.null,ai_processed.eq.false`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to query cases: ${error.message}`);
  }

  if (!stuckCases || stuckCases.length === 0) {
    console.log('✅ No stuck cases found');
    return;
  }

  console.log(`📋 Found ${stuckCases.length} potentially stuck cases:`);
  console.log('');

  stuckCases.forEach(c => {
    const age = Math.round((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60));
    console.log(`  ${c.id}`);
    console.log(`    Name: ${c.case_name}`);
    console.log(`    Status: ${c.processing_status || 'unknown'}`);
    console.log(`    AI Processed: ${c.ai_processed || false}`);
    console.log(`    Age: ${age} hours`);
    console.log(`    Last Update: ${c.last_ai_update || 'never'}`);
    console.log('');
  });
}

// Run the script
triggerCaseProcessing().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});