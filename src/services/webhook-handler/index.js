import { logger } from '../../utils/logger.js';
import { addToQueue } from '../../queues/document.queue.js';

export async function processWebhookEvent(event) {
  try {
    logger.info('Processing webhook event', { eventType: event.type, table: event.table });

    switch (event.type) {
      case 'INSERT':
        if (event.table === 'cases') {
          await handleCaseCreated(event);
        } else if (event.table === 'documents') {
          await handleDocumentUploaded(event);
        }
        break;
      
      case 'UPDATE':
        if (event.table === 'cases') {
          await handleCaseUpdated(event);
        }
        break;
      
      default:
        logger.warn('Unhandled webhook event type', { type: event.type });
    }

    return { success: true, processed: true };
  } catch (error) {
    logger.error('Error processing webhook event', { error: error.message });
    throw error;
  }
}

async function handleCaseCreated(event) {
  logger.info('Handling case created event', { caseId: event.record.id });
  // Add case to processing queue
  await addToQueue('case-processing', {
    caseId: event.record.id,
    action: 'process-new-case'
  });
}

async function handleDocumentUploaded(event) {
  logger.info('Handling document uploaded event', { 
    caseId: event.record.case_id,
    documentId: event.record.id 
  });
  
  // Add document to processing queue
  await addToQueue('document-processing', {
    caseId: event.record.case_id,
    documentId: event.record.id,
    action: 'process-document'
  });
}

async function handleCaseUpdated(event) {
  logger.info('Handling case updated event', { caseId: event.record.id });
  // Handle case updates if needed
} 