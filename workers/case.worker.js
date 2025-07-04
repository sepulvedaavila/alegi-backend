const queueService = require('../services/queue.service');
const processingService = require('../services/processing.service');
const notificationService = require('../services/notification.service');
const Sentry = require('@sentry/node');

// Process case jobs
queueService.process('case-processing', async (job) => {
  const { caseId, userId, caseData, webhookType } = job.data;
  
  try {
    console.log(`Processing case ${caseId}`);
    
    // Notify frontend that processing has started
    await notificationService.notifyCaseProcessingStarted(caseId, userId, caseData);
    
    // Use the existing processing service
    const result = await processingService.processNewCase({
      caseId,
      userId,
      caseData,
      webhookType,
      table: 'case_briefs',
      source: 'webhook'
    });
    
    console.log(`Case ${caseId} processed successfully`);
    
    // Notify frontend that processing has completed
    await notificationService.notifyCaseProcessingCompleted(caseId, userId, caseData, result);
    
    return result;
  } catch (error) {
    console.error(`Case processing failed for ${caseId}:`, error);
    
    // Notify frontend that processing has failed
    await notificationService.notifyCaseProcessingFailed(caseId, userId, caseData, error);
    
    Sentry.captureException(error, {
      tags: { caseId, jobId: job.id }
    });
    throw error;
  }
});