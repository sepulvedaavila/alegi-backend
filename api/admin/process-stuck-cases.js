// api/admin/process-stuck-cases.js - Bulk processing for stuck cases
const { createClient } = require('@supabase/supabase-js');
const caseProcessingWorker = require('../../services/case-processing.worker');
const { verifyAdminAuth, allowDevBypass } = require('../../middleware/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply admin authentication middleware
  await new Promise((resolve, reject) => {
    allowDevBypass(req, res, (error) => {
      if (error) return reject(error);
      verifyAdminAuth(req, res, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  });

  const { 
    maxCases = 10,
    stuckThresholdHours = 24,
    forceReprocess = false,
    dryRun = false
  } = req.body;

  try {
    console.log(`🔍 Finding stuck cases (threshold: ${stuckThresholdHours} hours)`);

    // Calculate threshold timestamp
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - stuckThresholdHours);

    // Find stuck cases using multiple criteria
    const stuckCasesQuery = supabase
      .from('case_briefs')
      .select('id, user_id, case_name, processing_status, last_ai_update, created_at, ai_processed')
      .limit(maxCases);

    if (forceReprocess) {
      // Include all cases that might need reprocessing
      stuckCasesQuery.or(`processing_status.eq.pending,processing_status.eq.failed,processing_status.is.null,ai_processed.eq.false,ai_processed.is.null`);
    } else {
      // Only truly stuck cases
      stuckCasesQuery
        .or(`processing_status.eq.pending,processing_status.eq.failed,processing_status.is.null`)
        .or(`last_ai_update.lt.${thresholdTime.toISOString()},last_ai_update.is.null`);
    }

    const { data: stuckCases, error } = await stuckCasesQuery;

    if (error) {
      throw new Error(`Failed to query stuck cases: ${error.message}`);
    }

    if (!stuckCases || stuckCases.length === 0) {
      return res.json({
        success: true,
        message: 'No stuck cases found',
        processed: 0,
        skipped: 0,
        errors: []
      });
    }

    console.log(`📋 Found ${stuckCases.length} potentially stuck cases`);

    const results = {
      processed: 0,
      skipped: 0,
      errors: [],
      cases: []
    };

    if (dryRun) {
      // Just return what would be processed
      results.cases = stuckCases.map(c => ({
        caseId: c.id,
        caseName: c.case_name,
        status: c.processing_status,
        lastUpdate: c.last_ai_update,
        action: 'would_process'
      }));

      return res.json({
        success: true,
        message: `Dry run: Found ${stuckCases.length} cases that would be processed`,
        dryRun: true,
        ...results
      });
    }

    // Process each stuck case
    for (const caseData of stuckCases) {
      try {
        console.log(`🔄 Processing stuck case: ${caseData.id} (${caseData.case_name})`);

        // Update case status
        await supabase
          .from('case_briefs')
          .update({ 
            processing_status: 'queued',
            last_ai_update: new Date().toISOString(),
            processing_error: null
          })
          .eq('id', caseData.id);

        // Add to processing queue with high priority
        const job = await caseProcessingWorker.addCaseToQueue(caseData.id, caseData.user_id, {
          source: 'admin_bulk_process',
          trigger: 'stuck_case_recovery',
          priority: 3, // High priority
          forced: true
        });

        results.processed++;
        results.cases.push({
          caseId: caseData.id,
          caseName: caseData.case_name,
          jobId: job.id,
          status: 'queued',
          action: 'processed'
        });

        console.log(`✅ Queued stuck case ${caseData.id} (job: ${job.id})`);

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Failed to process stuck case ${caseData.id}:`, error);
        
        results.errors.push({
          caseId: caseData.id,
          caseName: caseData.case_name,
          error: error.message
        });
        results.skipped++;
      }
    }

    console.log(`✅ Bulk processing completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors.length} errors`);

    res.json({
      success: true,
      message: `Bulk processing initiated for ${results.processed} stuck cases`,
      ...results
    });

  } catch (error) {
    console.error(`❌ Bulk processing failed:`, error);
    
    res.status(500).json({
      error: 'Bulk processing failed',
      details: error.message
    });
  }
}

module.exports = handler;
export default handler;