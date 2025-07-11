// Load environment variables first
require('dotenv').config();

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

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? ['https://alegi-frontend.vercel.app', 'https://app.alegi.io']
      : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type', 
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

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
    environment: process.env.NODE_ENV || 'not-set',
    version: '1.0.0',
    features: {
      realtime: process.env.NODE_ENV !== 'production',
      polling: true,
      authentication: true
    }
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    message: 'Alegi API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'not-set',
    version: '1.0.0',
    features: {
      realtime: process.env.NODE_ENV !== 'production',
      polling: true,
      authentication: true
    }
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
    // Provide fallback with better error messages
    processingService = {
      processDocument: async () => {
        throw new Error('Processing service not available - failed to load processing service module');
      },
      triggerAnalysisForExistingCase: async () => {
        throw new Error('Processing service not available - failed to load processing service module');
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
    
    // Add to document processing queue instead of direct processing
    const queueService = require('../services/queue.service');
    await queueService.add('document-processing', {
      documentId: data.id,
      caseId: caseId,
      filePath: uploadResult.path,
      webhookType: 'new_document'
    });
    
    res.json({
      success: true,
      document_id: data.id,
      file_url: uploadResult.url,
      message: 'Document uploaded successfully and queued for processing'
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

// Health check endpoint is handled by /api/health.js via Vercel rewrite
// This endpoint is removed to avoid conflicts with the comprehensive health check

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

// Basic case data endpoint
app.get('/api/cases/:caseId', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (caseError) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.status(200).json(caseData);
    
  } catch (error) {
    console.error('Case data fetch error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Comprehensive case view endpoint - Frontend should use this for CaseView
app.get('/api/cases/:caseId/view', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    // Fetch all case data in parallel for better performance
    const [
      caseResult,
      plaintiffsResult,
      defendantsResult,
      attorneysResult,
      legalIssuesResult,
      evidenceResult,
      documentsResult,
      enrichmentResult,
      predictionsResult,
      analysisResult,
      fusedDataResult,
      documentExtractionsResult,
      precedentCasesResult
    ] = await Promise.allSettled([
      // Basic case data
      supabase.from('case_briefs').select('*').eq('id', caseId).single(),
      // Related parties
      supabase.from('case_plaintiffs').select('*').eq('case_id', caseId),
      supabase.from('case_defendants').select('*').eq('case_id', caseId),
      supabase.from('case_attorneys').select('*').eq('case_id', caseId),
      supabase.from('case_legal_issues').select('*').eq('case_id', caseId),
      // Case files
      supabase.from('case_evidence').select('*').eq('case_id', caseId),
      supabase.from('case_documents').select('*').eq('case_id', caseId),
      // AI results (if available)
      supabase.from('case_ai_enrichment').select('*').eq('case_id', caseId).single(),
      supabase.from('case_predictions').select('*').eq('case_id', caseId).single(),
      supabase.from('case_analysis').select('*').eq('case_id', caseId),
      // Enhanced data
      supabase.from('case_data_fusion').select('*').eq('case_id', caseId).single(),
      supabase.from('case_document_extractions').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
      supabase.from('precedent_cases').select('*').eq('case_id', caseId).order('similarity_score', { ascending: false }).limit(10)
    ]);
    
    // Check if case exists
    if (caseResult.status === 'rejected' || !caseResult.value.data) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    const caseData = caseResult.value.data;
    
    // Extract enhanced data
    const fusedData = fusedDataResult.status === 'fulfilled' ? fusedDataResult.value.data : null;
    const documentExtractions = documentExtractionsResult.status === 'fulfilled' ? documentExtractionsResult.value.data || [] : [];
    const precedentCases = precedentCasesResult.status === 'fulfilled' ? precedentCasesResult.value.data || [] : [];
    
    // Organize analysis results by type
    const analysisMap = {};
    if (analysisResult.status === 'fulfilled' && analysisResult.value.data) {
      analysisResult.value.data.forEach(result => {
        analysisMap[result.analysis_type] = {
          result: result.result,
          confidenceScore: result.confidence_score,
          factors: result.factors,
          createdAt: result.created_at,
          updatedAt: result.updated_at
        };
      });
    }
    
    // Build comprehensive response
    const response = {
      // Basic case information
      case: caseData,
      
      // Related parties
      plaintiffs: plaintiffsResult.status === 'fulfilled' ? plaintiffsResult.value.data || [] : [],
      defendants: defendantsResult.status === 'fulfilled' ? defendantsResult.value.data || [] : [],
      attorneys: attorneysResult.status === 'fulfilled' ? attorneysResult.value.data || [] : [],
      legalIssues: legalIssuesResult.status === 'fulfilled' ? legalIssuesResult.value.data || [] : [],
      
      // Case files
      evidence: evidenceResult.status === 'fulfilled' ? evidenceResult.value.data || [] : [],
      documents: documentsResult.status === 'fulfilled' ? documentsResult.value.data || [] : [],
      
      // Enhanced data
      enhancedData: {
        fusedData: fusedData ? {
          status: fusedData.fusion_status,
          confidence: fusedData.fused_result?.confidence_score,
          parties: fusedData.fused_result?.parties,
          legalClaims: fusedData.fused_result?.legal_claims,
          damagesSought: fusedData.fused_result?.damages_sought,
          keyDates: fusedData.fused_result?.key_dates,
          conflicts: fusedData.fused_result?.conflicts,
          additionalInsights: fusedData.fused_result?.additional_insights,
          fusionTimestamp: fusedData.fusion_metadata?.fusion_timestamp
        } : null,
        documentAnalysis: {
          totalDocuments: documentExtractions?.length || 0,
          documents: documentExtractions?.map(doc => ({
            fileName: doc.file_name,
            documentType: doc.structured_data?.document_type,
            parties: doc.structured_data?.parties,
            legalClaims: doc.structured_data?.legal_claims,
            damagesSought: doc.structured_data?.damages_sought,
            keyDates: doc.structured_data?.key_dates,
            jurisdiction: doc.structured_data?.jurisdiction,
            caseNumber: doc.structured_data?.case_number,
            processingStatus: doc.processing_status,
            extractionTimestamp: doc.extraction_metadata?.extraction_timestamp,
            confidence: doc.extraction_metadata?.confidence
          })) || []
        },
        precedentAnalysis: {
          totalPrecedents: precedentCases?.length || 0,
          precedents: precedentCases?.map(precedent => ({
            caseName: precedent.case_name,
            citation: precedent.citation,
            court: precedent.court,
            jurisdiction: precedent.jurisdiction,
            judgeName: precedent.judge_name,
            legalIssues: precedent.legal_issues,
            applicableStatutes: precedent.applicable_statutes,
            strategyUsed: precedent.strategy_used,
            outcome: precedent.outcome,
            decisionSummary: precedent.decision_summary,
            similarityScore: precedent.similarity_score,
            fullTextUrl: precedent.full_text_url
          })) || []
        }
      },
      
      // AI analysis (if available)
      aiData: {
        enrichment: enrichmentResult.status === 'fulfilled' ? enrichmentResult.value.data : null,
        predictions: predictionsResult.status === 'fulfilled' ? predictionsResult.value.data : null,
        analysis: analysisMap
      },
      
      // Processing status
      status: {
        processingStatus: caseData.processing_status || 'not_started',
        aiProcessed: caseData.ai_processed || false,
        lastAiUpdate: caseData.last_ai_update,
        hasAiData: !!(
          (enrichmentResult.status === 'fulfilled' && enrichmentResult.value.data) ||
          (predictionsResult.status === 'fulfilled' && predictionsResult.value.data) ||
          Object.keys(analysisMap).length > 0
        ),
        hasEnhancedData: !!(fusedData || documentExtractions.length > 0 || precedentCases.length > 0)
      },
      
      // Data quality metrics
      dataQuality: {
        hasFusedData: !!fusedData,
        hasDocumentExtractions: (documentExtractions?.length || 0) > 0,
        hasPrecedentCases: (precedentCases?.length || 0) > 0,
        hasAIEnrichment: !!(enrichmentResult.status === 'fulfilled' && enrichmentResult.value.data),
        hasPredictions: !!(predictionsResult.status === 'fulfilled' && predictionsResult.value.data),
        hasAnalysisResults: Object.keys(analysisMap).length > 0,
        fusionConfidence: fusedData?.fused_result?.confidence_score || 0,
        averageExtractionConfidence: documentExtractions?.length > 0 
          ? documentExtractions.reduce((sum, doc) => sum + (doc.extraction_metadata?.confidence || 0), 0) / documentExtractions.length
          : 0
      },
      
      // Metadata
      metadata: {
        caseId: caseId,
        fetchedAt: new Date().toISOString()
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Case view data fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch case view data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Comprehensive case data endpoint - Frontend should use this
app.get('/api/cases/:caseId/data', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    // Get basic case data
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (caseError) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Fetch all enhanced data in parallel for better performance
    const [
      enrichmentResult,
      predictionsResult,
      analysisResultsResult,
      fusedDataResult,
      documentExtractionsResult,
      precedentCasesResult
    ] = await Promise.allSettled([
      // AI enrichment
      supabase.from('case_ai_enrichment').select('*').eq('case_id', caseId).single(),
      // Predictions
      supabase.from('case_predictions').select('*').eq('case_id', caseId).single(),
      // Analysis results
      supabase.from('case_analysis').select('*').eq('case_id', caseId),
      // Fused case data
      supabase.from('case_data_fusion').select('*').eq('case_id', caseId).single(),
      // Document extractions
      supabase.from('case_document_extractions').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
      // Precedent cases
      supabase.from('precedent_cases').select('*').eq('case_id', caseId).order('similarity_score', { ascending: false }).limit(10)
    ]);
    
    // Extract data from results
    const enrichment = enrichmentResult.status === 'fulfilled' ? enrichmentResult.value.data : null;
    const predictions = predictionsResult.status === 'fulfilled' ? predictionsResult.value.data : null;
    const analysisResults = analysisResultsResult.status === 'fulfilled' ? analysisResultsResult.value.data || [] : [];
    const fusedData = fusedDataResult.status === 'fulfilled' ? fusedDataResult.value.data : null;
    const documentExtractions = documentExtractionsResult.status === 'fulfilled' ? documentExtractionsResult.value.data || [] : [];
    const precedentCases = precedentCasesResult.status === 'fulfilled' ? precedentCasesResult.value.data || [] : [];
    
    // Organize analysis results by type
    const analysis = {};
    if (analysisResults) {
      analysisResults.forEach(result => {
        analysis[result.analysis_type] = {
          result: result.result,
          confidenceScore: result.confidence_score,
          factors: result.factors,
          createdAt: result.created_at,
          updatedAt: result.updated_at
        };
      });
    }
    
    // Build enhanced data structure
    const enhancedData = {
      caseId: caseData.id,
      caseName: caseData.case_name,
      basicInfo: {
        caseType: caseData.case_type,
        caseStage: caseData.case_stage,
        jurisdiction: caseData.jurisdiction,
        dateFiled: caseData.date_filed,
        processingStatus: caseData.processing_status,
        aiProcessed: caseData.ai_processed,
        lastUpdate: caseData.last_ai_update
      },
      userProvided: {
        caseNarrative: caseData.case_narrative,
        historyNarrative: caseData.history_narrative,
        applicableLaw: caseData.applicable_law,
        expectedOutcome: caseData.expected_outcome,
        additionalNotes: caseData.additional_notes,
        attorneysOfRecord: caseData.attorneys_of_record
      },
      fusedData: fusedData ? {
        status: fusedData.fusion_status,
        confidence: fusedData.fused_result?.confidence_score,
        parties: fusedData.fused_result?.parties,
        legalClaims: fusedData.fused_result?.legal_claims,
        damagesSought: fusedData.fused_result?.damages_sought,
        keyDates: fusedData.fused_result?.key_dates,
        conflicts: fusedData.fused_result?.conflicts,
        additionalInsights: fusedData.fused_result?.additional_insights,
        fusionTimestamp: fusedData.fusion_metadata?.fusion_timestamp
      } : null,
      documentAnalysis: {
        totalDocuments: documentExtractions?.length || 0,
        documents: documentExtractions?.map(doc => ({
          fileName: doc.file_name,
          documentType: doc.structured_data?.document_type,
          parties: doc.structured_data?.parties,
          legalClaims: doc.structured_data?.legal_claims,
          damagesSought: doc.structured_data?.damages_sought,
          keyDates: doc.structured_data?.key_dates,
          jurisdiction: doc.structured_data?.jurisdiction,
          caseNumber: doc.structured_data?.case_number,
          processingStatus: doc.processing_status,
          extractionTimestamp: doc.extraction_metadata?.extraction_timestamp,
          confidence: doc.extraction_metadata?.confidence
        })) || []
      },
      aiEnrichment: enrichment ? {
        causeOfAction: enrichment.cause_of_action,
        applicableStatute: enrichment.applicable_statute,
        applicableCaseLaw: enrichment.applicable_case_law,
        enhancedCaseType: enrichment.enhanced_case_type,
        jurisdictionEnriched: enrichment.jurisdiction_enriched,
        courtAbbreviation: enrichment.court_abbreviation,
        processingType: enrichment.processing_type,
        enhancedData: enrichment.enhanced_data,
        lastUpdated: enrichment.updated_at
      } : null,
      precedentAnalysis: {
        totalPrecedents: precedentCases?.length || 0,
        precedents: precedentCases?.map(precedent => ({
          caseName: precedent.case_name,
          citation: precedent.citation,
          court: precedent.court,
          jurisdiction: precedent.jurisdiction,
          judgeName: precedent.judge_name,
          legalIssues: precedent.legal_issues,
          applicableStatutes: precedent.applicable_statutes,
          strategyUsed: precedent.strategy_used,
          outcome: precedent.outcome,
          decisionSummary: precedent.decision_summary,
          similarityScore: precedent.similarity_score,
          fullTextUrl: precedent.full_text_url
        })) || []
      },
      predictions: predictions ? {
        outcomePredictionScore: predictions.outcome_prediction_score,
        confidencePredictionPercentage: predictions.confidence_prediction_percentage,
        estimatedFinancialOutcome: predictions.estimated_financial_outcome,
        financialOutcomeRange: predictions.financial_outcome_range,
        litigationCostEstimate: predictions.litigation_cost_estimate,
        litigationCostRange: predictions.litigation_cost_range,
        settlementSuccessRate: predictions.settlement_success_rate,
        plaintiffSuccess: predictions.plaintiff_success,
        appealAfterTrial: predictions.appeal_after_trial,
        caseComplexityScore: predictions.case_complexity_score,
        riskScore: predictions.risk_score,
        witnessScore: predictions.witness_score,
        judgeAnalysis: predictions.judge_analysis,
        lawyerAnalysis: predictions.lawyer_analysis,
        settlementTrialAnalysis: predictions.settlement_trial_analysis,
        recommendedSettlementWindow: predictions.recommended_settlement_window,
        primaryStrategy: predictions.primary_strategy,
        alternativeApproach: predictions.alternative_approach,
        additionalFactsRecommendations: predictions.additional_facts_recommendations,
        averageTimeResolution: predictions.average_time_resolution,
        resolutionTimeRange: predictions.resolution_time_range
      } : null,
      analysisResults: analysis,
      dataQuality: {
        hasFusedData: !!fusedData,
        hasDocumentExtractions: (documentExtractions?.length || 0) > 0,
        hasPrecedentCases: (precedentCases?.length || 0) > 0,
        hasAIEnrichment: !!enrichment,
        hasPredictions: !!predictions,
        hasAnalysisResults: (analysisResults?.length || 0) > 0,
        fusionConfidence: fusedData?.fused_result?.confidence_score || 0,
        averageExtractionConfidence: documentExtractions?.length > 0 
          ? documentExtractions.reduce((sum, doc) => sum + (doc.extraction_metadata?.confidence || 0), 0) / documentExtractions.length
          : 0
      }
    };
    
    // Determine if case needs processing
    const needsProcessing = !enrichment && !predictions && caseData.processing_status !== 'processing';
    const isProcessing = caseData.processing_status === 'processing';
    
    const response = {
      caseId,
      case: caseData,
      enhancedData,
      enrichment: enrichment || null,
      predictions: predictions || null,
      analysis: analysis || {},
      status: {
        needsProcessing,
        isProcessing,
        processingStatus: caseData.processing_status,
        lastUpdate: caseData.last_ai_update,
        hasData: !!(enrichment || predictions || Object.keys(analysis).length > 0)
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Case data fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch case data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Processing status endpoint
app.get('/api/cases/:caseId/status', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    // Get case status
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('processing_status, ai_processed, last_ai_update, success_probability, risk_level')
      .eq('id', caseId)
      .single();
    
    if (caseError) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Get AI enrichment if available
    const { data: enrichment, error: enrichmentError } = await supabase
      .from('case_ai_enrichment')
      .select('*')
      .eq('case_id', caseId)
      .single();
    
    // Get predictions if available
    const { data: predictions, error: predictionsError } = await supabase
      .from('case_predictions')
      .select('*')
      .eq('case_id', caseId)
      .single();
    
    res.status(200).json({
      caseId,
      status: caseData.processing_status,
      aiProcessed: caseData.ai_processed,
      lastUpdate: caseData.last_ai_update,
      successProbability: caseData.success_probability,
      riskLevel: caseData.risk_level,
      hasEnrichment: !!enrichment,
      hasPredictions: !!predictions,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Document processing status endpoint
app.get('/api/documents/:documentId/status', authenticateJWT, async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const { data: document, error } = await supabase
      .from('case_documents')
      .select('processing_status, processed, processed_at, ai_extracted_text')
      .eq('id', documentId)
      .single();
    
    if (error) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.status(200).json({
      documentId,
      status: document.processing_status,
      processed: document.processed,
      processedAt: document.processed_at,
      hasExtractedText: !!document.ai_extracted_text,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Document status check error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Manual trigger for case processing (for cases that might have been missed)
app.post('/api/cases/:caseId/process', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    // Verify case exists and user has access
    const { data: caseData, error: caseError } = await supabase
      .from('case_briefs')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (caseError) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Add to processing queue
    const queueService = require('../services/queue.service');
            await queueService.add('case', {
      caseId: caseId,
      userId: req.user.id,
      caseData: caseData,
      webhookType: 'MANUAL_TRIGGER',
      source: 'manual'
    });
    
    // Update status to processing
    await supabase
      .from('case_briefs')
      .update({ 
        processing_status: 'processing',
        last_ai_update: new Date().toISOString()
      })
      .eq('id', caseId);
    
    res.status(200).json({
      success: true,
      caseId: caseId,
      message: 'Case processing triggered successfully'
    });
    
  } catch (error) {
    console.error('Manual processing trigger error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
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

// Initialize notification service
let notificationService;
try {
  notificationService = require('../services/notification.service');
  console.log('Notification service loaded successfully');
} catch (error) {
  console.error('Failed to load notification service:', error.message);
  notificationService = null;
}

// WebSocket connection statistics
app.get('/api/realtime/stats', authenticateJWT, (req, res) => {
  try {
    // On Vercel, WebSocket is not available, so we always return false
    const isWebSocketAvailable = process.env.NODE_ENV !== 'production' && !!notificationService?.isRealtimeAvailable();
    
    res.json({
      available: isWebSocketAvailable,
      stats: isWebSocketAvailable ? notificationService.getRealtimeStats() : null,
      message: isWebSocketAvailable ? 'WebSocket service is running' : 'WebSocket not available on Vercel - using polling fallback',
      environment: process.env.NODE_ENV || 'development',
      polling_endpoints: {
        case_status: '/api/cases/:caseId/status',
        user_cases: '/api/cases/status'
      }
    });
  } catch (error) {
    res.status(500).json({
      available: false,
      error: error.message,
      message: 'Error checking realtime availability'
    });
  }
});

// Polling endpoint for case status (fallback when WebSocket is not available)
app.get('/api/cases/:caseId/status', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    if (!notificationService) {
      return res.status(500).json({ error: 'Notification service not available' });
    }
    
    const status = await notificationService.getCaseStatus(caseId, req.user.id);
    res.json({
      ...status,
      polling: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Case status check error:', error);
    res.status(500).json({
      error: 'Failed to get case status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get all cases status for a user
app.get('/api/cases/status', authenticateJWT, async (req, res) => {
  try {
    if (!notificationService) {
      return res.status(500).json({ error: 'Notification service not available' });
    }
    
    const cases = await notificationService.getUserCasesStatus(req.user.id);
    res.json({
      cases,
      polling: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('User cases status check error:', error);
    res.status(500).json({
      error: 'Failed to get cases status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced case status endpoint with real-time updates
app.get('/api/cases/:caseId/updates', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { lastUpdate } = req.query;
    
    if (!notificationService) {
      return res.status(500).json({ error: 'Notification service not available' });
    }
    
    const status = await notificationService.getCaseStatus(caseId, req.user.id);
    
    // Check if there are any updates since last check
    const hasUpdates = !lastUpdate || new Date(status.lastUpdate) > new Date(lastUpdate);
    
    res.json({
      ...status,
      hasUpdates,
      polling: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Case updates check error:', error);
    res.status(500).json({
      error: 'Failed to get case updates',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced case status endpoint with detailed processing information
app.get('/api/cases/:caseId/enhanced-status', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    if (!notificationService) {
      return res.status(500).json({ error: 'Notification service not available' });
    }
    
    // Use the enhanced status method if available
    const status = typeof notificationService.getEnhancedCaseStatus === 'function' 
      ? await notificationService.getEnhancedCaseStatus(caseId, req.user.id)
      : await notificationService.getCaseStatus(caseId, req.user.id);
    
    res.json({
      ...status,
      polling: true,
      enhanced: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Enhanced case status check error:', error);
    res.status(500).json({
      error: 'Failed to get enhanced case status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Processing status endpoint for Enhanced ALEGI Pipeline
app.get('/api/cases/:id/processing-status', authenticateJWT, async (req, res) => {
  try {
    const processingStatusHandler = require('./cases/[id]/processing-status');
    await processingStatusHandler(req, res);
  } catch (error) {
    console.error('Processing status endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get processing status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Trigger analysis for existing cases endpoint
app.post('/api/cases/:caseId/trigger-analysis', authenticateJWT, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    if (!processingService) {
      return res.status(500).json({ error: 'Processing service not available' });
    }
    
    console.log(`Triggering analysis for case ${caseId} by user ${req.user.id}`);
    
    const result = await processingService.triggerAnalysisForExistingCase(caseId, req.user.id);
    
    // Return 202 if processing was triggered, 200 if already processing
    const statusCode = result.status === 'processing' ? 202 : 200;
    
    res.status(statusCode).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Trigger analysis error:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message;
    let errorCode = 'PROCESSING_ERROR';
    
    if (error.message.includes('Database service not available')) {
      errorCode = 'DATABASE_UNAVAILABLE';
      errorMessage = 'Database service is currently unavailable. Please try again later or contact support if the issue persists.';
    } else if (error.message.includes('Processing service not available')) {
      errorCode = 'SERVICE_UNAVAILABLE';
      errorMessage = 'Processing service is currently unavailable. Please try again later or contact support if the issue persists.';
    } else if (error.message.includes('Case not found')) {
      errorCode = 'CASE_NOT_FOUND';
      errorMessage = 'The specified case could not be found.';
    }
    
    res.status(500).json({
      error: 'Failed to trigger analysis',
      message: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
      retryable: errorCode === 'DATABASE_UNAVAILABLE' || errorCode === 'SERVICE_UNAVAILABLE'
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

// Initialize WebSocket service
let realtimeService;
try {
  realtimeService = require('../services/realtime.service');
  console.log('Realtime service loaded successfully');
} catch (error) {
  console.error('Failed to load realtime service:', error.message);
  realtimeService = null;
}

// For testing in local environment
if (require.main === module) {
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    
    // Initialize WebSocket server
    if (realtimeService) {
      realtimeService.initialize(server);
    }
  });
} else {
  // For Vercel deployment, we need to handle WebSocket differently
  // Vercel doesn't support WebSocket in serverless functions
  // We'll need to use a separate WebSocket service or polling
  console.log('Running in serverless environment - WebSocket not available');
}