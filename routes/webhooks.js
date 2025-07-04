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
    console.log('Processing new case brief:', caseBrief.id);

    // Update status to processing
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseBrief.id);

    // Check if API keys are configured
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Get any existing documents
    const { data: documents, error: docError } = await supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseBrief.id);

    if (docError) {
      console.error('Error fetching documents:', docError);
    }

    // Extract text from documents
    let extractedText = '';
    if (documents && documents.length > 0) {
      console.log(`Found ${documents.length} documents for case ${caseBrief.id}`);
      
      for (const doc of documents) {
        if (doc.file_url && !doc.processed) {
          try {
            // Check if PDF.co is configured
            if (!process.env.PDF_CO_API_KEY && !process.env.PDFCO_API_KEY) {
              console.warn('PDF.co API key not configured, skipping document extraction');
              continue;
            }

            console.log('Extracting text from:', doc.file_name);
            const text = await pdfcoService.extractText(doc.file_url);
            extractedText += `\n\n--- Document: ${doc.file_name} ---\n${text}`;
            
            // Update document
            await supabase
              .from('case_documents')
              .update({ 
                ai_extracted_text: text,
                processed: true,
                processed_at: new Date().toISOString()
              })
              .eq('id', doc.id);
          } catch (error) {
            console.error(`Failed to extract text from ${doc.file_name}:`, error.message);
          }
        } else if (doc.ai_extracted_text) {
          extractedText += `\n\n--- Document: ${doc.file_name} ---\n${doc.ai_extracted_text}`;
        }
      }
    }

    // Prepare case data
    const caseData = {
      id: caseBrief.id,
      case_title: caseBrief.case_name,
      case_type: caseBrief.case_type,
      case_narrative: caseBrief.case_narrative,
      jurisdiction: caseBrief.jurisdiction,
      case_stage: caseBrief.case_stage,
      history_narrative: caseBrief.history_narrative,
      applicable_law: caseBrief.applicable_law,
      expected_outcome: caseBrief.expected_outcome,
      attorneys_of_record: caseBrief.attorneys_of_record
    };

    console.log('Analyzing case with AI...');
    const aiAnalysis = await aiService.analyzeCaseIntake(
      caseData,
      documents || [],
      extractedText
    );

    console.log('AI analysis complete, storing results...');

    // Store AI enrichment
    const { error: enrichmentError } = await supabase
      .from('case_ai_enrichment')
      .insert({
        case_id: caseBrief.id,
        predictions: aiAnalysis.predictions || {},
        confidence_score: aiAnalysis.confidence || 0,
        similar_cases: aiAnalysis.similarCases || [],
        key_insights: aiAnalysis.keyInsights || [],
        recommended_actions: aiAnalysis.recommendedActions || [],
        created_at: new Date().toISOString()
      });

    if (enrichmentError) {
      console.error('Failed to store AI enrichment:', enrichmentError);
      throw enrichmentError;
    }

    // Update case brief with success
    const { error: updateError } = await supabase
      .from('case_briefs')
      .update({
        processing_status: 'completed',
        ai_processed: true,
        success_probability: Math.round((aiAnalysis.predictions?.successRate || 0) * 100),
        risk_level: aiAnalysis.predictions?.riskLevel || 'medium',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseBrief.id);

    if (updateError) {
      console.error('Failed to update case brief:', updateError);
    }

    console.log('Successfully processed case brief:', caseBrief.id);
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
