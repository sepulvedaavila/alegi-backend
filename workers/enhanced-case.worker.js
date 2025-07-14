// workers/enhanced-case.worker.js - Enhanced case processing worker
const EnhancedLinearPipelineService = require('../services/enhanced-linear-pipeline.service');
const PDFService = require('../services/pdf.service');
const { createClient } = require('@supabase/supabase-js');

class EnhancedCaseWorker {
  constructor() {
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
    
    this.enhancedPipeline = new EnhancedLinearPipelineService();
    this.pdfService = PDFService;
  }

  async process(jobData) {
    try {
      console.log('🔄 Enhanced Case Worker processing job:', jobData);
      
      const { caseId, documentId, filePath, webhookType } = jobData;
      
      if (webhookType === 'new_document' && documentId) {
        return await this.processDocument(documentId, caseId, filePath);
      } else if (caseId) {
        return await this.processCase(caseId);
      } else {
        throw new Error('Invalid job data: missing caseId or documentId');
      }
    } catch (error) {
      console.error('Enhanced Case Worker error:', error);
      throw error;
    }
  }

  async processDocument(documentId, caseId, filePath) {
    try {
      console.log(`📄 Processing document ${documentId} for case ${caseId}`);
      
      // Get document details
      const { data: document, error } = await this.supabase
        .from('case_documents')
        .select('*')
        .eq('id', documentId)
        .single();
      
      if (error) throw error;
      
      console.log(`Document: ${document.file_name}, Path: ${document.file_path}`);
      
      // Validate file path
      const validation = this.pdfService.validateFilePath(document.file_path);
      if (!validation.valid) {
        throw new Error(`Invalid file path: ${validation.error}`);
      }
      
      // Use the relative path for extraction
      const filePathToUse = validation.relativePath || document.file_path;
      console.log(`Using file path for extraction: ${filePathToUse}`);
      
      // Extract text from PDF using the fixed service
      const extractedText = await this.pdfService.extractText(filePathToUse);
      
      console.log(`✅ Text extraction successful for ${document.file_name}`);
      console.log(`Text length: ${extractedText.text ? extractedText.text.length : 0}`);
      console.log(`Pages: ${extractedText.pages}`);
      console.log(`Remaining credits: ${extractedText.remainingCredits}`);
      
      // Update document with extracted text
      await this.supabase
        .from('case_documents')
        .update({ 
          ai_extracted_text: extractedText.text,
          processing_status: 'completed',
          processed_at: new Date().toISOString(),
          pages: extractedText.pages,
          confidence: extractedText.confidence
        })
        .eq('id', documentId);
      
      // Trigger enhanced pipeline for the case
      console.log(`🚀 Triggering enhanced pipeline for case ${caseId}`);
      const features = await this.enhancedPipeline.executeEnhancedPipeline(caseId);
      
      return {
        success: true,
        documentId,
        caseId,
        extractedText: extractedText.text,
        pages: extractedText.pages,
        features: Object.keys(features).length
      };
      
    } catch (error) {
      console.error(`❌ Document processing failed for ${documentId}:`, error);
      
      // Update document with error status
      try {
        await this.supabase
          .from('case_documents')
          .update({ 
            processing_status: 'failed',
            error_message: error.message,
            processed_at: new Date().toISOString()
          })
          .eq('id', documentId);
      } catch (updateError) {
        console.error(`Failed to update document error status:`, updateError);
      }
      
      throw error;
    }
  }

  async processCase(caseId) {
    try {
      console.log(`🎯 Processing case ${caseId} with enhanced pipeline`);
      
      // Execute the enhanced pipeline
      const features = await this.enhancedPipeline.executeEnhancedPipeline(caseId);
      
      return {
        success: true,
        caseId,
        features: Object.keys(features).length,
        featureList: Object.keys(features)
      };
      
    } catch (error) {
      console.error(`❌ Case processing failed for ${caseId}:`, error);
      throw error;
    }
  }

  async processDocumentExtraction(jobData) {
    try {
      console.log('📄 Processing document extraction job:', jobData);
      
      const { documentId, caseId, filePath } = jobData;
      
      if (!documentId) {
        throw new Error('Document ID is required for extraction');
      }
      
      return await this.processDocument(documentId, caseId, filePath);
      
    } catch (error) {
      console.error('Document extraction error:', error);
      throw error;
    }
  }
}

module.exports = new EnhancedCaseWorker(); 