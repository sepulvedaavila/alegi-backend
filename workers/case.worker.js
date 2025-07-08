const processingService = require('../services/processing.service');
const notificationService = require('../services/notification.service');
const Sentry = require('@sentry/node');

// Process case jobs - called by the serverless queue service
async function process(jobData) {
  const { caseId, userId, caseData, webhookType } = jobData;
  
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
      tags: { caseId }
    });
    throw error;
  }
}

module.exports = { process };