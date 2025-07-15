// api/cases/[id]/process.js - Manual case processing trigger endpoint
const { createClient } = require('@supabase/supabase-js');
const caseProcessingWorker = require('../../../services/case-processing.worker');
const { verifyCaseAccess, allowDevBypass } = require('../../../middleware/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply authentication middleware
  await new Promise((resolve, reject) => {
    allowDevBypass(req, res, (error) => {
      if (error) return reject(error);
      verifyCaseAccess(req, res, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  });

  const { id: caseId } = req.query;
  const { force = false, priority = 1 } = req.body;

  try {
    console.log(`🔄 Manual processing trigger for case ${caseId}`);

    // Verify case exists
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('id, user_id, case_name, processing_status')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) {
      return res.status(404).json({ 
        error: 'Case not found',
        caseId 
      });
    }

    // Check if case is already processing (unless forced)
    if (!force && caseData.processing_status === 'processing') {
      return res.status(409).json({
        error: 'Case is already being processed',
        caseId,
        currentStatus: caseData.processing_status,
        message: 'Use force=true to restart processing'
      });
    }

    // Update case status to indicate manual trigger
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'queued',
        last_ai_update: new Date().toISOString(),
        processing_error: null
      })
      .eq('id', caseId);

    // Add to processing queue
    const job = await caseProcessingWorker.addCaseToQueue(caseData.id, caseData.user_id, {
      source: 'manual_trigger',
      trigger: 'api_endpoint',
      priority: force ? 3 : priority, // Higher priority if forced
      forced: force
    });

    console.log(`✅ Case ${caseId} added to processing queue manually`);

    res.json({
      success: true,
      message: 'Case processing initiated',
      caseId,
      caseName: caseData.case_name,
      jobId: job.id,
      priority: job.priority || priority,
      forced: force,
      estimatedStartTime: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Failed to trigger processing for case ${caseId}:`, error);
    
    res.status(500).json({
      error: 'Failed to trigger case processing',
      caseId,
      details: error.message
    });
  }
}

module.exports = handler;
export default handler;