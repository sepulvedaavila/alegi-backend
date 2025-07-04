// routes/webhooks.js
const express = require('express');
const router = express.Router();
const queueService = require('../services/queue.service');
const Sentry = require('@sentry/node');
const { verifySupabaseWebhook, verifyExternalWebhook } = require('../middleware/webhook-auth');

// Initialize queue processors
require('../workers/case.worker');
require('../workers/document.worker');

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
      // Add to processing queue
      await queueService.add('case-processing', {
        caseId: record.id,
        userId: record.user_id,
        caseData: record,
        webhookType: type,
        source: 'external'
      });
      
      console.log(`Added case ${record.id} to processing queue`);
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
    await queueService.add('case-processing', {
      caseId: record.id,
      userId: record.user_id,
      caseData: record,
      webhookType: 'INSERT',
      source: 'supabase'
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
    
    // Add to document processing queue
    await queueService.add('document-processing', {
      documentId: record.id,
      caseId: record.case_id,
      filePath: record.file_path,
      webhookType: 'new_document'
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
      // Add to processing queue
      await queueService.add('case-processing', {
        caseId: record.id,
        userId: record.user_id,
        caseData: record,
        webhookType: type,
        source: webhookSource
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
