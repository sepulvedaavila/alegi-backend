// routes/webhooks.js
const express = require('express');
const router = express.Router();
// Load processing service with error handling
let processingService;
try {
  processingService = require('../services/processing.service');
} catch (error) {
  console.error('Failed to load processing service:', error.message);
  processingService = {
    processNewCase: () => Promise.resolve({ success: false, reason: 'Processing service not available' }),
    processDocument: () => Promise.resolve({ success: false, reason: 'Processing service not available' })
  };
}
const { verifySupabaseWebhook, verifyExternalWebhook } = require('../middleware/webhook-auth');

// External webhook endpoint for case_briefs table
router.post('/external/case-briefs', verifyExternalWebhook, async (req, res) => {
  try {
    const { type, table, record, schema, old_record } = req.body;
    
    console.log(`Received ${type} webhook for ${table} table:`, {
      recordId: record.id,
      userId: record.user_id,
      caseName: record.case_name,
      caseStage: record.case_stage
    });
    
    // Only process INSERT and UPDATE operations
    if (type === 'INSERT' || type === 'UPDATE') {
      // Process directly without queuing
      setImmediate(async () => {
        try {
          await processingService.processNewCase({
            caseId: record.id,
            userId: record.user_id,
            caseData: record,
            webhookType: type,
            table: table,
            source: 'external'
          });
        } catch (error) {
          console.error(`Background processing failed for case ${record.id}:`, error);
        }
      });
      
      console.log(`Started processing case ${record.id}`);
    }
    
    res.json({ 
      success: true, 
      message: `Case ${type.toLowerCase()} processing initiated`,
      caseId: record.id,
      webhookType: type
    });
  } catch (error) {
    console.error('External webhook error:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  }
});

// Supabase webhook endpoint for case_briefs table (legacy support)
router.post('/supabase/case-created', verifySupabaseWebhook, async (req, res) => {
  try {
    const { record } = req.body;
    
    console.log('Received Supabase webhook for case:', {
      recordId: record.id,
      userId: record.user_id
    });
    
    // Process directly without queuing
    setImmediate(async () => {
      try {
        await processingService.processNewCase({
          caseId: record.id,
          userId: record.user_id,
          caseData: record,
          webhookType: 'INSERT',
          table: 'case_briefs',
          source: 'supabase'
        });
      } catch (error) {
        console.error(`Background processing failed for case ${record.id}:`, error);
      }
    });
    
    res.json({ success: true, message: 'Case processing initiated' });
  } catch (error) {
    console.error('Supabase webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Document upload webhook (for future use)
router.post('/supabase/document-uploaded', verifySupabaseWebhook, async (req, res) => {
  try {
    const { record } = req.body;
    
    setImmediate(async () => {
      try {
        await processingService.processDocument({
          caseId: record.case_id,
          documentId: record.id
        });
      } catch (error) {
        console.error(`Background document processing failed for ${record.id}:`, error);
      }
    });
    
    res.json({ success: true, message: 'Document processing initiated' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Universal webhook endpoint that can handle multiple formats
router.post('/universal', async (req, res) => {
  try {
    const { type, table, record, schema, old_record } = req.body;
    
    // Determine webhook source based on headers and structure
    const userAgent = req.headers['user-agent'];
    const host = req.headers['host'];
    const supabaseSignature = req.headers['x-supabase-signature'];
    const externalSignature = req.headers['x-webhook-signature'];
    
    let webhookSource = 'unknown';
    if (supabaseSignature) {
      webhookSource = 'supabase';
    } else if (externalSignature || (userAgent && userAgent.includes('pg_net'))) {
      webhookSource = 'external';
    } else if (host && host.includes('hook.')) {
      webhookSource = 'external';
    }
    
    console.log(`Received ${webhookSource} webhook:`, {
      type,
      table,
      recordId: record?.id,
      userId: record?.user_id
    });
    
    // Validate the webhook payload
    if (!type || !table || !record) {
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }
    
    if (table === 'case_briefs' && (type === 'INSERT' || type === 'UPDATE')) {
      setImmediate(async () => {
        try {
          await processingService.processNewCase({
            caseId: record.id,
            userId: record.user_id,
            caseData: record,
            webhookType: type,
            table: table,
            source: webhookSource
          });
        } catch (error) {
          console.error(`Background processing failed for case ${record.id}:`, error);
        }
      });
      
      res.json({ 
        success: true, 
        message: `Case ${type.toLowerCase()} processing initiated`,
        caseId: record.id,
        source: webhookSource
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Webhook received but no processing required',
        table,
        type
      });
    }
  } catch (error) {
    console.error('Universal webhook error:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  }
});

module.exports = router;
