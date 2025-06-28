// routes/webhooks.js
const express = require('express');
const router = express.Router();
const caseProcessingQueue = require('../queues/case-processing.queue');
const { verifySupabaseWebhook } = require('../middleware/webhook-auth');

// Replace Make.com webhook endpoint
router.post('/supabase/case-created', verifySupabaseWebhook, async (req, res) => {
  try {
    const { record } = req.body;
    
    // Add to processing queue
    await caseProcessingQueue.add('process-new-case', {
      caseId: record.id
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    
    res.json({ success: true, message: 'Case processing initiated' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

router.post('/supabase/document-uploaded', verifySupabaseWebhook, async (req, res) => {
  try {
    const { record } = req.body;
    
    await caseProcessingQueue.add('process-document', {
      caseId: record.case_id,
      documentId: record.id
    });
    
    res.json({ success: true, message: 'Document processing initiated' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

module.exports = router;
