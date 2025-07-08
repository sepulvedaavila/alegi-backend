// routes/webhooks.js
const express = require('express');
const router = express.Router();
const LinearPipelineService = require('../services/linear-pipeline.service');
const Sentry = require('@sentry/node');
const { verifySupabaseWebhook, verifyExternalWebhook } = require('../middleware/webhook-auth');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize linear pipeline service
const linearPipeline = new LinearPipelineService();

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
      // Update status to processing immediately
      await supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'processing',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', record.id);
      
      // Execute linear pipeline asynchronously
      setImmediate(async () => {
        try {
          console.log(`Starting linear pipeline for case ${record.id}`);
          await linearPipeline.executeLinearPipeline(record.id);
          console.log(`Linear pipeline completed for case ${record.id}`);
        } catch (error) {
          console.error(`Linear pipeline failed for case ${record.id}:`, error);
          
          // Update case status to failed
          await supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              error_message: error.message
            })
            .eq('id', record.id);
            
          Sentry.captureException(error, {
            tags: { caseId: record.id, webhook: 'external' }
          });
        }
      });
      
      console.log(`Linear pipeline triggered for case ${record.id}`);
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
    
    // Update status to processing immediately
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', record.id);
    
    // Execute linear pipeline asynchronously
    setImmediate(async () => {
      try {
        console.log(`Starting linear pipeline for case ${record.id}`);
        await linearPipeline.executeLinearPipeline(record.id);
        console.log(`Linear pipeline completed for case ${record.id}`);
      } catch (error) {
        console.error(`Linear pipeline failed for case ${record.id}:`, error);
        
        // Update case status to failed
        await supabase
          .from('case_briefs')
          .update({ 
            processing_status: 'failed',
            error_message: error.message
          })
          .eq('id', record.id);
          
        Sentry.captureException(error, {
          tags: { caseId: record.id, webhook: 'supabase' }
        });
      }
    });
    
    res.json({ success: true, message: 'Case processing initiated' });
  } catch (error) {
    console.error('Supabase webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Document upload webhook - triggers re-processing of the case
router.post('/supabase/document-uploaded', verifySupabaseWebhook, async (req, res) => {
  try {
    const { record } = req.body;
    
    console.log('Document uploaded:', {
      documentId: record.id,
      caseId: record.case_id,
      fileName: record.file_name
    });
    
    // When a new document is uploaded, re-run the linear pipeline for the case
    // This ensures all analysis includes the new document
    if (record.case_id) {
      // Update case status to indicate re-processing
      await supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'processing',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', record.case_id);
      
      // Execute linear pipeline asynchronously
      setImmediate(async () => {
        try {
          console.log(`Re-running linear pipeline for case ${record.case_id} after document upload`);
          await linearPipeline.executeLinearPipeline(record.case_id);
          console.log(`Linear pipeline completed for case ${record.case_id}`);
        } catch (error) {
          console.error(`Linear pipeline failed for case ${record.case_id}:`, error);
          
          // Update case status to failed
          await supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              error_message: error.message
            })
            .eq('id', record.case_id);
            
          Sentry.captureException(error, {
            tags: { caseId: record.case_id, webhook: 'document-upload' }
          });
        }
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Document uploaded, case re-processing initiated',
      documentId: record.id,
      caseId: record.case_id
    });
  } catch (error) {
    console.error('Document webhook error:', error);
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
    if (table === 'case_briefs' && (type === 'INSERT' || type === 'UPDATE')) {
      return handleNewCaseBrief(record, res);
    } else if (table === 'case_documents' && type === 'INSERT') {
      return handleNewDocument(record, res);
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
    console.log('Processing new case brief:', caseBrief.id);
    
    // Update status to processing
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseBrief.id);

    // Execute linear pipeline asynchronously
    setImmediate(async () => {
      try {
        console.log(`Starting linear pipeline for case ${caseBrief.id}`);
        await linearPipeline.executeLinearPipeline(caseBrief.id);
        console.log(`Linear pipeline completed for case ${caseBrief.id}`);
      } catch (error) {
        console.error(`Linear pipeline failed for case ${caseBrief.id}:`, error);
        
        // Log detailed error
        await supabase.from('processing_errors').insert({
          case_id: caseBrief.id,
          error_message: error.message,
          error_stack: error.stack,
          created_at: new Date().toISOString()
        });
        
        // Update case status to failed
        await supabase
          .from('case_briefs')
          .update({ 
            processing_status: 'failed',
            error_message: error.message
          })
          .eq('id', caseBrief.id);
          
        Sentry.captureException(error, {
          tags: { caseId: caseBrief.id, webhook: 'universal' }
        });
      }
    });

    console.log(`Linear pipeline triggered for case ${caseBrief.id}`);
    return res.status(200).json({ 
      success: true, 
      caseId: caseBrief.id,
      message: 'Case processing initiated successfully'
    });

  } catch (error) {
    console.error('Case processing error:', error);
    return res.status(500).json({ 
      error: error.message,
      caseId: caseBrief.id 
    });
  }
}

async function handleNewDocument(document, res) {
  try {
    console.log('New document uploaded:', document.id);
    
    // When a new document is uploaded, re-run the linear pipeline for the case
    if (document.case_id) {
      // Update case status to indicate re-processing
      await supabase
        .from('case_briefs')
        .update({ 
          processing_status: 'processing',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', document.case_id);
      
      // Execute linear pipeline asynchronously
      setImmediate(async () => {
        try {
          console.log(`Re-running linear pipeline for case ${document.case_id} after document upload`);
          await linearPipeline.executeLinearPipeline(document.case_id);
          console.log(`Linear pipeline completed for case ${document.case_id}`);
        } catch (error) {
          console.error(`Linear pipeline failed for case ${document.case_id}:`, error);
          
          // Update case status to failed
          await supabase
            .from('case_briefs')
            .update({ 
              processing_status: 'failed',
              error_message: error.message
            })
            .eq('id', document.case_id);
            
          Sentry.captureException(error, {
            tags: { caseId: document.case_id, webhook: 'document-universal' }
          });
        }
      });
      
      return res.status(200).json({ 
        success: true, 
        message: 'Document uploaded, case re-processing initiated',
        documentId: document.id,
        caseId: document.case_id
      });
    } else {
      return res.status(400).json({ 
        error: 'Document missing case_id',
        documentId: document.id 
      });
    }
  } catch (error) {
    console.error('Document processing error:', error);
    return res.status(500).json({ 
      error: error.message,
      documentId: document.id 
    });
  }
}

module.exports = router;
