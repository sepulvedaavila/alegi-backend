import { supabase } from '../../utils/supabase.js';
import { logger } from '../../utils/logger.js';
import { uploadToS3, processDocument } from '../../utils/aws.js';

export async function getCaseDocuments(caseId, userId) {
  try {
    logger.info('Getting case documents', { caseId, userId });

    // Verify user has access to case
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', userId)
      .single();

    if (caseError || !caseData) {
      throw new Error('Case not found or access denied');
    }

    // Get documents for case
    const { data: documents, error } = await supabase
      .from('documents')
      .select(`
        id,
        filename,
        file_size,
        file_type,
        status,
        created_at,
        processed_at,
        s3_key
      `)
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching documents', { error: error.message });
      throw error;
    }

    return documents || [];
  } catch (error) {
    logger.error('Error in getCaseDocuments', { error: error.message });
    throw error;
  }
}

export async function uploadDocument(caseId, documentData, userId) {
  try {
    logger.info('Uploading document', { caseId, filename: documentData.filename });

    // Verify user has access to case
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', userId)
      .single();

    if (caseError || !caseData) {
      throw new Error('Case not found or access denied');
    }

    // Upload file to S3
    const s3Key = `cases/${caseId}/documents/${Date.now()}-${documentData.filename}`;
    const uploadResult = await uploadToS3(documentData.file, s3Key);

    // Create document record in database
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        case_id: caseId,
        filename: documentData.filename,
        file_size: documentData.fileSize,
        file_type: documentData.fileType,
        s3_key: s3Key,
        status: 'uploaded',
        uploaded_by: userId
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating document record', { error: error.message });
      throw error;
    }

    // Trigger document processing
    await processDocument(document.id, s3Key);

    return {
      document,
      uploadResult
    };
  } catch (error) {
    logger.error('Error in uploadDocument', { error: error.message });
    throw error;
  }
}

export async function processDocumentById(documentId) {
  try {
    logger.info('Processing document by ID', { documentId });

    // Get document details
    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      throw new Error('Document not found');
    }

    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Process the document
    const processingResult = await processDocument(documentId, document.s3_key);

    // Update status to processed
    await supabase
      .from('documents')
      .update({ 
        status: 'processed',
        processed_at: new Date().toISOString(),
        processing_results: processingResult
      })
      .eq('id', documentId);

    return {
      success: true,
      documentId,
      processingResult
    };
  } catch (error) {
    logger.error('Error in processDocumentById', { error: error.message });
    
    // Update status to failed
    await supabase
      .from('documents')
      .update({ 
        status: 'failed',
        error_message: error.message
      })
      .eq('id', documentId);

    throw error;
  }
} 