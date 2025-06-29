// Alternative Node.js/Express Backend for Alegi

// IMPORTANT: Import Sentry as early as possible
require("../instrument.js");

// api/index.js - Main entry point for Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const Redis = require('ioredis');
const path = require('path');

const app = express();

// Middleware setup
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://alegi.io', 'https://app.alegi.io']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const redis = new Redis(process.env.REDIS_URL);

// Updated file upload function
async function uploadToSupabaseStorage(file, caseId) {
  try {
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}${fileExt}`;
    const filePath = `documents/${caseId}/${fileName}`;
    
    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('case-files')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        duplex: false
      });
    
    if (error) throw error;
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('case-files')
      .getPublicUrl(filePath);
    
    return {
      path: filePath,
      url: urlData.publicUrl,
      fileName
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Supabase storage upload error:', error);
    throw error;
  }
}

// Authentication middleware
const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    
    req.user = data.user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Queue processing functions
async function queueDocumentProcessing(caseId, documentId) {
  try {
    await redis.lpush('document-processing-queue', JSON.stringify({ caseId, documentId }));
    // eslint-disable-next-line no-console
    console.log(`Queued document ${documentId} for processing`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to queue document processing:', error);
  }
}

// Document processing functions
async function extractTextFromDocument(documentBuffer) {
  // Placeholder for document text extraction
  // In production, use a service like PDF.co, AWS Textract, or similar
  return 'Extracted text from document...';
}

async function enrichWithAI(caseId, documentText) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a legal AI assistant. Analyze the provided legal document and extract key insights, predictions, and strategic recommendations.'
        },
        {
          role: 'user',
          content: `Analyze this legal document for case ${caseId}: ${documentText}`
        }
      ],
      max_tokens: 1000
    });

    return {
      predictions: completion.choices[0].message.content,
      confidence: 0.85,
      strategies: ['Strategy 1', 'Strategy 2'],
      rawResponse: completion.choices[0].message.content
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('AI enrichment failed:', error);
    return {
      predictions: 'Analysis failed',
      confidence: 0,
      strategies: [],
      rawResponse: error.message
    };
  }
}

// Updated document upload endpoint
app.post('/api/cases/:caseId/documents', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    const file = req.files?.document;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    // Upload to Supabase Storage instead of S3
    const uploadResult = await uploadToSupabaseStorage(file, caseId);
    
    // Save to database
    const { data, error } = await supabase
      .from('case_evidence')
      .insert({
        case_id: caseId,
        file_name: file.originalname,
        file_path: uploadResult.path,
        file_url: uploadResult.url,
        file_size: file.size,
        type: 'document',
        description: `Uploaded document: ${file.originalname}`,
        uploaded_by: req.user.id
      })
      .select()
      .single();
      
    if (error) throw error;
    
    // Queue for processing
    await queueDocumentProcessing(caseId, data.id);
    
    res.json({
      success: true,
      document_id: data.id,
      file_url: uploadResult.url,
      message: 'Document uploaded successfully'
    });
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Updated health check
app.get('/api/health', async (req, res) => {
  try {
    const checks = {
      database: 'healthy',
      redis: redis.status,
      storage: 'healthy'
    };
    
    // Check database connection
    const { error: dbError } = await supabase.from('cases').select('count').limit(1);
    if (dbError) checks.database = 'unhealthy';
    
    // Check Supabase storage
    try {
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      if (storageError || !buckets.find(b => b.name === 'case-files')) {
        checks.storage = 'unhealthy';
      }
    } catch (e) {
      checks.storage = 'unhealthy';
    }
    
    const healthy = Object.values(checks).every(check => check === 'healthy');
    
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      services: checks
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Adding this test endpoint temporarily
app.get('/api/test/storage', authenticateJWT, async (req, res) => {
  try {
    // Test bucket access
    const { data: buckets } = await supabase.storage.listBuckets();
    
    // Test file listing
    const { data: files } = await supabase.storage
      .from('case-files')
      .list('documents', {
        limit: 10,
        sortBy: { column: 'created_at', order: 'desc' }
      });
    
    res.json({
      success: true,
      buckets: buckets?.map(b => b.name),
      recentFiles: files?.length || 0,
      message: 'Supabase Storage is working correctly'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Updated document processing function
async function processDocumentBackground(caseId, documentId) {
  try {
    // Get document details
    const { data: document } = await supabase
      .from('case_evidence')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (!document) throw new Error('Document not found');
    
    // Download document from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('case-files')
      .download(document.file_path);
    
    if (downloadError) throw downloadError;
    
    // Convert blob to buffer for processing
    const arrayBuffer = await fileData.arrayBuffer();
    const documentBuffer = Buffer.from(arrayBuffer);
    
    // Process with PDF.co or similar service
    const extractedText = await extractTextFromDocument(documentBuffer);
    
    // AI enrichment
    const aiAnalysis = await enrichWithAI(caseId, extractedText);
    
    // Update database
    await supabase
      .from('case_evidence')
      .update({
        processed: true,
        ai_extracted_text: extractedText,
        processing_completed_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    // Store AI enrichment
    await supabase
      .from('case_ai_enrichment')
      .upsert({
        case_id: caseId,
        predictions: aiAnalysis.predictions,
        confidence_score: aiAnalysis.confidence,
        strategy_recommendations: aiAnalysis.strategies,
        raw_gpt_response: aiAnalysis.rawResponse
      });
    
    // eslint-disable-next-line no-console
    console.log(`Document ${documentId} processed successfully`);
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Document processing failed for ${documentId}:`, error);
    
    // Log error to database
    await supabase
      .from('processing_errors')
      .insert({
        case_id: caseId,
        document_id: documentId,
        error_message: error.message,
        error_stack: error.stack
      });
  }
}

// Webhook routes
const webhookRoutes = require('../routes/webhooks');
app.use('/api/webhooks', webhookRoutes);

// Case intake endpoint
app.post('/api/cases/intake', authenticateJWT, async (req, res) => {
  try {
    const { case_name, case_description, case_type, jurisdiction } = req.body;
    
    // Validate input
    if (!case_name || !case_description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create case in database
    const { data, error } = await supabase
      .from('cases')
      .insert({
        case_name,
        case_description,
        case_type,
        jurisdiction,
        user_id: req.user.id,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) throw error;
    
    res.json({
      success: true,
      case_id: data.id,
      message: 'Case submitted successfully'
    });
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Case intake error:', error);
    res.status(500).json({ error: 'Failed to submit case' });
  }
});

// Sentry error handlers - must be after all routes but before any other error middleware
const Sentry = require("@sentry/node");

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(`Internal Server Error: ${res.sentry}\n`);
});

// Export for Vercel
module.exports = app;