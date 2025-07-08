const { validateSupabaseToken } = require('../../../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const queueService = require('../../../services/queue.service');
const { handleError } = require('../../../utils/errorHandler');

// Initialize services with error checking
let supabase;

try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  } else {
    console.error('Supabase not configured');
  }
} catch (error) {
  console.error('Service initialization error:', error);
}

async function getCaseDetails(caseId, userId) {
  const { data, error } = await supabase
    .from('case_briefs')
    .select('*')
    .eq('id', caseId)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    throw new Error('Case not found');
  }
  
  return data;
}

async function checkEnhancedProcessingStatus(caseId) {
  const { data, error } = await supabase
    .from('case_briefs')
    .select('processing_type, enhanced_processing_status, processing_status')
    .eq('id', caseId)
    .single();
  
  if (error) throw error;
  return data;
}

module.exports = async (req, res) => {
  // Handle CORS preflight - Vercel handles the CORS headers
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check service availability
  if (!supabase) {
    console.error('Required services not available');
    return res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'Database service is not configured. Please try again later.'
    });
  }

  try {
    const { id: caseId } = req.params;
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`Enhanced processing request for case ${caseId} by user ${user.id}`);

    // Get case details and verify ownership
    const caseData = await getCaseDetails(caseId, user.id);
    
    // Check current processing status
    const processingStatus = await checkEnhancedProcessingStatus(caseId);
    
    // If already processing, return current status
    if (processingStatus.processing_status === 'processing' || 
        processingStatus.enhanced_processing_status === 'document_extraction' ||
        processingStatus.enhanced_processing_status === 'information_fusion' ||
        processingStatus.enhanced_processing_status === 'external_enrichment' ||
        processingStatus.enhanced_processing_status === 'ai_analysis') {
      
      return res.status(200).json({
        message: 'Case is already being processed',
        status: 'processing',
        processingType: processingStatus.processing_type,
        enhancedProcessingStatus: processingStatus.enhanced_processing_status,
        estimatedTime: '3-7 minutes'
      });
    }

    // If already completed with enhanced processing, return success
    if (processingStatus.enhanced_processing_status === 'completed') {
      return res.status(200).json({
        message: 'Case has already been processed with enhanced flow',
        status: 'completed',
        processingType: 'enhanced',
        enhancedProcessingStatus: 'completed'
      });
    }

    // Update case to enhanced processing type
    await supabase
      .from('case_briefs')
      .update({
        processing_type: 'enhanced',
        enhanced_processing_status: 'not_started',
        processing_status: 'pending',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);

    // Add to enhanced processing queue
    await queueService.add('enhanced-case', {
      caseId: caseId,
      userId: user.id,
      caseData: caseData,
      webhookType: 'ENHANCED_MANUAL_TRIGGER',
      table: 'case_briefs',
      source: 'manual_enhanced'
    });

    console.log(`Enhanced processing queued for case ${caseId}`);

    res.status(202).json({
      success: true,
      caseId: caseId,
      message: 'Enhanced processing triggered successfully',
      status: 'queued',
      processingType: 'enhanced',
      estimatedTime: '3-7 minutes',
      stages: [
        'Document Extraction',
        'Information Fusion', 
        'External Enrichment',
        'Staged AI Analysis'
      ]
    });

  } catch (error) {
    console.error('Enhanced processing trigger error:', error);
    
    handleError(error, res, { 
      operation: 'enhanced_processing_trigger',
      caseId: req.params.id 
    });
  }
}; 