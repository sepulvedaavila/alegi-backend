import { supabase } from '../../utils/supabase.js';
import { logger } from '../../utils/logger.js';

export async function getCaseStatus(caseId, userId) {
  try {
    logger.info('Getting case status', { caseId, userId });

    const { data, error } = await supabase
      .from('cases')
      .select(`
        id,
        title,
        status,
        created_at,
        updated_at,
        documents (
          id,
          filename,
          status,
          processed_at
        )
      `)
      .eq('id', caseId)
      .eq('user_id', userId)
      .single();

    if (error) {
      logger.error('Error fetching case status', { error: error.message });
      throw error;
    }

    return {
      case: data,
      processingStatus: calculateProcessingStatus(data.documents)
    };
  } catch (error) {
    logger.error('Error in getCaseStatus', { error: error.message });
    throw error;
  }
}

function calculateProcessingStatus(documents) {
  if (!documents || documents.length === 0) {
    return 'no-documents';
  }

  const processed = documents.filter(doc => doc.status === 'processed').length;
  const total = documents.length;

  if (processed === 0) {
    return 'pending';
  } else if (processed === total) {
    return 'completed';
  } else {
    return 'processing';
  }
}

export async function updateCaseStatus(caseId, status) {
  try {
    logger.info('Updating case status', { caseId, status });

    const { error } = await supabase
      .from('cases')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', caseId);

    if (error) {
      logger.error('Error updating case status', { error: error.message });
      throw error;
    }

    return { success: true };
  } catch (error) {
    logger.error('Error in updateCaseStatus', { error: error.message });
    throw error;
  }
} 