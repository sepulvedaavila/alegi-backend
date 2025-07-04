// IMPORTANT: Import Sentry as early as possible
try {
  require('../instrument.js');
} catch (error) {
  console.warn('Failed to load Sentry instrumentation:', error.message);
}

// api/index.js - Main entry point for Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// Add startup logging
console.log('Starting Alegi API server...');
console.log('Environment:', process.env.NODE_ENV || 'not-set');
console.log('Has Supabase URL:', !!process.env.SUPABASE_URL);
console.log('Has Supabase Key:', !!process.env.SUPABASE_SERVICE_KEY);

// IMPORTANT: Trust proxy headers when running behind Vercel
// This must be set before any middleware that depends on client IP
// Trust only specific proxy configurations to avoid rate limiting bypass issues
if (process.env.NODE_ENV === 'production') {
  // In production (Vercel), trust only the first proxy
  app.set('trust proxy', 1);
} else {
  // In development, trust local proxies
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
}

// Middleware setup
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://alegi-frontend.vercel.app/', 'https://app.alegi.io']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  // Use a more specific key generator to handle proxy scenarios
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if available, otherwise use IP
    return req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.connection.remoteAddress;
  },
  // Skip rate limiting for certain paths if needed
  skip: (req) => {
    // Skip health check endpoints
    return req.path === '/' || req.path === '/api';
  }
});
app.use('/api/', limiter);

// Basic test endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Alegi API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'not-set'
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    message: 'Alegi API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'not-set'
  });
});

// Initialize services with error handling
let supabase;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
} catch (error) {
  console.error('Failed to initialize Supabase:', error.message);
  // Create a mock supabase object to prevent crashes
  supabase = {
    from: () => ({
      select: () => ({ single: () => Promise.reject(new Error('Supabase not configured')) }),
      insert: () => Promise.reject(new Error('Supabase not configured')),
      update: () => Promise.reject(new Error('Supabase not configured')),
      upsert: () => Promise.reject(new Error('Supabase not configured'))
    }),
    storage: {
      from: () => ({
        upload: () => Promise.reject(new Error('Supabase storage not configured')),
        download: () => Promise.reject(new Error('Supabase storage not configured')),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        listBuckets: () => Promise.reject(new Error('Supabase storage not configured'))
      })
    },
    auth: {
      getUser: () => Promise.reject(new Error('Supabase auth not configured'))
    }
  };
}



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
let processingService;
try {
  const { processingService: procService } = require('../services');
  processingService = procService;
} catch (error) {
  console.error('Failed to load processing service:', error.message);
  // Provide fallback
  processingService = {
    processDocument: async () => {
      throw new Error('Processing service not available');
    }
  };
}

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
    const hasRequiredEnvVars = {
      supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      pdfco: !!process.env.PDF_CO_API_KEY || !!process.env.PDFCO_API_KEY
    };

    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      services: hasRequiredEnvVars
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  } 
});

// OpenAI rate limit monitoring endpoint
app.get('/api/openai/rate-limits', async (req, res) => {
  try {
    const { aiService } = require('../services');
    
    if (!aiService || typeof aiService.getRateLimitStatus !== 'function') {
      return res.status(503).json({
        status: 'error',
        message: 'AI service not available'
      });
    }

    const rateLimitStatus = aiService.getRateLimitStatus();
    
    res.status(200).json({
      status: 'success',
      timestamp: new Date().toISOString(),
      rateLimits: rateLimitStatus
    });
  } catch (error) {
    console.error('OpenAI rate limit monitoring error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// JWT test endpoints (for development/testing)
if (process.env.NODE_ENV !== 'production') {
  const jwtUtils = require('../utils/jwt.utils');
  const { internalAuthService } = require('../services');

  app.get('/api/test/jwt', (req, res) => {
    try {
      if (!process.env.SUPABASE_WEBHOOK_SECRET) {
        return res.status(500).json({
          error: 'SUPABASE_WEBHOOK_SECRET not configured'
        });
      }

      const testUser = internalAuthService.createTestUser();
      const serviceToken = internalAuthService.getServiceToken('1h');

      res.json({
        message: 'JWT tokens generated successfully',
        tokens: {
          userToken: {
            token: testUser.token,
            authHeader: testUser.authHeader,
            user: testUser.user
          },
          serviceToken: {
            token: serviceToken,
            authHeader: jwtUtils.createAuthHeader(serviceToken)
          }
        },
        usage: {
          userTokenExample: `curl -H "Authorization: ${testUser.authHeader}" https://your-api.com/api/cases/intake`,
          serviceTokenExample: `curl -H "Authorization: ${jwtUtils.createAuthHeader(serviceToken)}" https://your-api.com/api/test/storage`
        }
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to generate tokens',
        message: error.message
      });
    }
  });

  app.get('/api/test/validate-token', (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(400).json({ error: 'No authorization header provided' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwtUtils.validateToken(token);

      res.json({
        message: 'Token is valid',
        decoded: decoded,
        tokenInfo: {
          userId: decoded.sub,
          email: decoded.email,
          role: decoded.role,
          expiresAt: new Date(decoded.exp * 1000).toISOString()
        }
      });
    } catch (error) {
      res.status(401).json({
        error: 'Token validation failed',
        message: error.message
      });
    }
  });
}

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
try {
  const webhookRoutes = require('../routes/webhooks');
  app.use('/api/webhooks', webhookRoutes);
} catch (error) {
  console.error('Failed to load webhook routes:', error.message);
  // Continue without webhook routes in case of failure
}

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

// Sentry error handlers - only in production
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    
    // The request handler must be the first middleware on the app
    app.use(Sentry.Handlers.requestHandler());
    
    // The error handler must be registered before any other error middleware and after all controllers
    app.use(Sentry.Handlers.errorHandler());
  } catch (error) {
    console.warn('Failed to setup Sentry handlers:', error.message);
  }
}

// Optional fallthrough error handler
app.use(function onError(err, req, res, _next) {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Export for Vercel
module.exports = app;

// For testing in local environment
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}