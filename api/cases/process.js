// api/cases/process.js
const { createClient } = require('@supabase/supabase-js');
const LinearPipelineService = require('../../services/linear-pipeline.service');

// Initialize Supabase client
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : {
      from: (table) => ({
        update: (data) => ({
          eq: (field, value) => Promise.resolve({ data: null, error: null })
        })
      })
    };

// Initialize the linear pipeline service
const linearPipelineService = new LinearPipelineService();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { caseId } = req.body;
  
  if (!caseId) {
    return res.status(400).json({ error: 'caseId is required' });
  }

  try {
    console.log(`Starting linear pipeline processing for case ${caseId}`);
    
    // Set processing status immediately
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);

    // Execute linear pipeline
    const result = await linearPipelineService.executeLinearPipeline(caseId);
    
    console.log(`Linear pipeline completed successfully for case ${caseId}`);
    
    return res.status(200).json({
      success: true,
      caseId,
      result
    });
    
  } catch (error) {
    console.error(`Linear pipeline failed for case ${caseId}:`, error);
    
    // Update status to failed
    try {
      await supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'failed',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);
    } catch (dbError) {
      console.error('Failed to update case status to failed:', dbError);
    }
      
    return res.status(500).json({
      success: false,
      error: error.message,
      caseId
    });
  }
} 