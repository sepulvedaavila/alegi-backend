// routes/webhooks.js
const express = require('express');
const router = express.Router();
const queueService = require('../services/queue.service');
const Sentry = require('@sentry/node');
const { verifySupabaseWebhook, verifyExternalWebhook } = require('../middleware/webhook-auth');
const { createClient } = require('@supabase/supabase-js');
const aiService = require('../services/ai.service');
const pdfcoService = require('../services/pdfco.service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    
    // Route based on table and event type
    if (table === 'case_briefs' && type === 'INSERT') {
      return handleNewCaseBrief(record, res);
    } else if (table === 'case_documents' && type === 'INSERT') {
      return handleNewDocument(record, res);
    } else if (table === 'case_briefs' && (type === 'INSERT' || type === 'UPDATE')) {
      // Legacy queue processing for backward compatibility
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

async function handleNewCaseBrief(caseBrief, res) {
  try {
    console.log('Queuing new case brief for processing:', caseBrief.id);

    // Update status to processing
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseBrief.id);

    // Add to case processing queue instead of direct processing
    await queueService.add('case-processing', {
      caseId: caseBrief.id,
      userId: caseBrief.user_id,
      caseData: caseBrief,
      webhookType: 'INSERT',
      source: 'webhook'
    });

    console.log('Successfully queued case brief for processing:', caseBrief.id);
    return res.status(200).json({ 
      success: true, 
      caseId: caseBrief.id,
      message: 'Case processed successfully'
    });

  } catch (error) {
    console.error('Case processing error:', error);
    
    // Log detailed error
    await supabase.from('processing_errors').insert({
      case_id: caseBrief.id,
      error_message: error.message,
      error_stack: error.stack,
      created_at: new Date().toISOString()
    });

    // Update case status
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'failed',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseBrief.id);

    return res.status(500).json({ 
      error: error.message,
      caseId: caseBrief.id 
    });
  }
}

async function handleNewDocument(document, res) {
  // Handle document upload events if needed
  console.log('New document uploaded:', document.id);
  // You can trigger reprocessing of the case here if needed
  return res.status(200).json({ success: true });
}

module.exports = router;
