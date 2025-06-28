// Remove AWS SDK
// const AWS = require('aws-sdk');

// Remove S3 initialization
// const s3 = new AWS.S3({...});

// Add Supabase storage functions
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase (already exists)
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
    const { data, error } = await supabase.storage
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
      fileName: fileName
    };
  } catch (error) {
    console.error('Supabase storage upload error:', error);
    throw error;
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
      .from('case_documents')
      .insert({
        case_id: caseId,
        file_name: file.originalname,
        file_path: uploadResult.path,
        file_url: uploadResult.url,
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
      file_url: uploadResult.url,
      message: 'Document uploaded successfully'
    });
    
  } catch (error) {
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
      .from('case_documents')
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