// Alternative Node.js/Express Backend for Alegi

// IMPORTANT: Import Sentry as early as possible
require('../instrument.js');

// api/index.js - Main entry point for Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
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

// Direct processing functions
const processingService = require('../services/processing.service');

async function processDocumentDirect(caseId, documentId) {
  try {
    // Process immediately in background
    setImmediate(async () => {
      try {
        await processingService.processDocument({ caseId, documentId });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Background document processing failed:', error);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`Started processing document ${documentId}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start document processing:', error);
  }
}

// Document processing functions moved to processing service

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
    
    // Process document directly
    await processDocumentDirect(caseId, data.id);
    
    res.json({
      success: true,
      document_id: data.id,
      file_url: uploadResult.url,
      message: 'Document uploaded successfully'
    });
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Document upload error:', error);
    
    // Report to Sentry
    const Sentry = require('@sentry/node');
    Sentry.captureException(error, {
      tags: { 
        operation: 'document_upload',
        caseId: req.params.caseId 
      },
      user: { id: req.user?.id }
    });
    
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Updated health check
app.get('/api/health', async (req, res) => {
  try {
    // Basic health check without external dependencies
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'not-set',
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
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

// Document processing now handled by processing service
// This function is kept for backward compatibility but delegates to the service

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
    
    // Report to Sentry
    const Sentry = require('@sentry/node');
    Sentry.captureException(error, {
      tags: { 
        operation: 'case_intake' 
      },
      user: { id: req.user?.id }
    });
    
    res.status(500).json({ error: 'Failed to submit case' });
  }
});

// Sentry error handlers - must be after all routes but before any other error middleware
const Sentry = require('@sentry/node');

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, _next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(`Internal Server Error: ${res.sentry}\n`);
});

// Export for Vercel
module.exports = app;