// Alternative Node.js/Express Backend for Alegi
// Since you're comfortable with MERN stack, here's a Node.js alternative

// api/index.js - Main entry point for Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const AWS = require('aws-sdk');
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

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const redis = new Redis(process.env.REDIS_URL);

// Routes

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    const { error } = await supabase.from('cases').select('count').limit(1);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      services: {
        database: error ? 'unhealthy' : 'healthy',
        redis: redis.status,
        s3: 'healthy' // Basic assumption, could add actual check
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

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
    
    // Queue for processing
    await queueCaseProcessing(data.id);
    
    res.json({
      success: true,
      case_id: data.id,
      message: 'Case submitted successfully'
    });
    
  } catch (error) {
    console.error('Case intake error:', error);
    res.status(500).json({ error: 'Failed to submit case' });
  }
});

// Document upload endpoint
app.post('/api/cases/:caseId/documents', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    const file = req.files?.document; // Assuming multer middleware
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    // Upload to S3
    const key = `documents/${caseId}/${Date.now()}-${file.originalname}`;
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    };
    
    const uploadResult = await s3.upload(uploadParams).promise();
    
    // Save to database
    const { data, error } = await supabase
      .from('case_documents')
      .insert({
        case_id: caseId,
        file_name: file.originalname,
        file_url: uploadResult.Location,
        file_size: file.size,
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
      message: 'Document uploaded successfully'
    });
    
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Case status endpoint
app.get('/api/cases/:caseId/status', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const { data, error } = await supabase
      .from('cases')
      .select(`
        *,
        case_documents (*),
        case_ai_enrichment (*)
      `)
      .eq('id', caseId)
      .eq('user_id', req.user.id)
      .single();
      
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.json({
      success: true,
      case: data,
      processing_status: await getProcessingStatus(caseId)
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get case status' });
  }
});

// AI predictions endpoint
app.get('/api/cases/:caseId/predictions', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const { data, error } = await supabase
      .from('case_ai_enrichment')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    if (error) throw error;
    
    res.json({
      success: true,
      predictions: data
    });
    
  } catch (error) {
    console.error('Predictions error:', error);
    res.status(404).json({ error: 'No predictions available' });
  }
});

// Webhook handlers
app.post('/api/webhooks/supabase/case-created', async (req, res) => {
  try {
    const { type, table, record } = req.body;
    
    if (type === 'INSERT' && table === 'cases') {
      await initializeCaseProcessing(record.id);
      res.json({ status: 'processing_initiated' });
    } else {
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/api/webhooks/supabase/document-uploaded', async (req, res) => {
  try {
    const { type, table, record } = req.body;
    
    if (type === 'INSERT' && table === 'case_documents') {
      await processDocumentBackground(record.case_id, record.id);
      res.json({ status: 'document_processing_initiated' });
    } else {
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  } catch (error) {
    console.error('Document webhook error:', error);
    res.status(500).json({ error: 'Document webhook processing failed' });
  }
});

// Helper functions

async function queueCaseProcessing(caseId) {
  const task = {
    type: 'case_processing',
    case_id: caseId,
    created_at: new Date().toISOString()
  };
  
  await redis.lpush('case_processing_queue', JSON.stringify(task));
  await redis.setex(`task:${caseId}`, 3600, JSON.stringify(task));
}

async function queueDocumentProcessing(caseId, documentId) {
  const task = {
    type: 'document_processing',
    case_id: caseId,
    document_id: documentId,
    created_at: new Date().toISOString()
  };
  
  await redis.lpush('document_processing_queue', JSON.stringify(task));
  await redis.setex(`doc_task:${documentId}`, 3600, JSON.stringify(task));
}

async function processDocumentBackground(caseId, documentId) {
  try {
    // Get document details
    const { data: document } = await supabase
      .from('case_documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (!document) throw new Error('Document not found');
    
    // Download document from S3
    const getObjectParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: document.file_url.split('/').pop()
    };
    
    const documentData = await s3.getObject(getObjectParams).promise();
    
    // Process with PDF.co or similar service
    const extractedText = await extractTextFromDocument(documentData.Body);
    
    // AI enrichment
    const aiAnalysis = await enrichWithAI(caseId, extractedText);
    
    // Update database
    await supabase
      .from('case_documents')
      .update({
        processed: true,
        extracted_text: extractedText,
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
    
    console.log(`Document ${documentId} processed successfully`);
    
  } catch (error) {
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

async function extractTextFromDocument(documentBuffer) {
  // Implement PDF.co integration or similar
  // For now, return placeholder
  return "Extracted text from document...";
}

async function enrichWithAI(caseId, documentText) {
  try {
    const prompt = `
    Analyze this legal document and provide structured analysis:
    
    ${documentText.substring(0, 4000)}
    
    Provide response in JSON format with:
    - predictions (success_probability, estimated_duration_months, likely_outcome)
    - confidence_score (0-1)
    - strategy_recommendations (array)
    - risk_level (low/medium/high)
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: "You are a legal AI assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });
    
    const rawResponse = response.choices[0].message.content;
    
    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (e) {
      // Fallback if JSON parsing fails
      parsedResponse = {
        predictions: { success_probability: 0.5 },
        confidence_score: 0.5,
        strategy_recommendations: ["Review with legal counsel"],
        risk_level: "medium"
      };
    }
    
    return {
      predictions: parsedResponse.predictions,
      confidence: parsedResponse.confidence_score,
      strategies: parsedResponse.strategy_recommendations,
      riskLevel: parsedResponse.risk_level,
      rawResponse
    };
    
  } catch (error) {
    console.error('AI enrichment error:', error);
    return {
      predictions: { success_probability: 0.5 },
      confidence: 0.0,
      strategies: [],
      error: error.message,
      rawResponse: ''
    };
  }
}

async function getProcessingStatus(caseId) {
  const taskData = await redis.get(`task:${caseId}`);
  if (taskData) {
    return JSON.parse(taskData);
  }
  return { status: 'completed' };
}

async function initializeCaseProcessing(caseId) {
  // Initialize any required setup for new cases
  await queueCaseProcessing(caseId);
}

// Export for Vercel
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}