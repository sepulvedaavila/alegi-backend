// routes/webhooks.js
const express = require('express');
const router = express.Router();
const caseProcessingQueue = require('../queues/case-processing.queue');
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
      // Add to processing queue with full record data
      await caseProcessingQueue.add('process-new-case', {
        caseId: record.id,
        userId: record.user_id,
        caseData: record,
        webhookType: type,
        table: table,
        source: 'external'
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });
      
      console.log(`Queued case ${record.id} for processing`);
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
    
    // Add to processing queue
    await caseProcessingQueue.add('process-new-case', {
      caseId: record.id,
      userId: record.user_id,
      caseData: record,
      webhookType: 'INSERT',
      table: 'case_briefs',
      source: 'supabase'
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
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
      await caseProcessingQueue.add('process-new-case', {
        caseId: record.id,
        userId: record.user_id,
        caseData: record,
        webhookType: type,
        table: table,
        source: webhookSource
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
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
