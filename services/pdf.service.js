// services/pdf.service.js - PDF processing service
const axios = require('axios');
const FormData = require('form-data');

class PDFService {
  constructor() {
    this.apiKey = process.env.PDF_CO_API_KEY;
    this.baseURL = 'https://api.pdf.co/v1';
  }

  async extractText(filePath, timeoutMs = 15000) {
    try {
      if (!this.apiKey) {
        console.warn('[PDFService] PDF API key not configured, skipping extraction');
        return {
          success: false,
          text: '',
          pages: 0,
          confidence: 0,
          skipped: true,
          reason: 'PDF API key not configured'
        };
      }

      console.log(`[PDFService] Extracting text from: ${filePath} (timeout: ${timeoutMs}ms)`);

      // Wrap the entire extraction process with a timeout
      return await Promise.race([
        this.performExtraction(filePath),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF extraction timeout')), timeoutMs)
        )
      ]);

    } catch (error) {
      console.error('[PDFService] PDF extraction error:', error.message);
      
      // Log the error but don't throw - make it optional
      if (error.message.includes('timeout')) {
        console.warn('[PDFService] PDF extraction timed out, continuing without document text');
      } else if (error.message.includes('Supabase download error') || error.message.includes('Failed to download file')) {
        console.warn('[PDFService] File download failed, continuing without document text');
        console.warn('[PDFService] This could be due to:');
        console.warn('  - File not found in Supabase storage');
        console.warn('  - Incorrect file path');
        console.warn('  - Supabase environment variables not configured');
        console.warn('  - Storage bucket access issues');
        console.warn(`  - File path attempted: ${filePath}`);
      } else {
        console.warn('[PDFService] PDF.co API error, continuing without document text');
      }
      
      // Return a default response instead of throwing
      return {
        success: false,
        text: '',
        pages: 0,
        confidence: 0,
        skipped: true,
        reason: error.message
      };
    }
  }

  async performExtraction(filePath) {
    // Download file from Supabase first
    const fileBlob = await this.downloadFromSupabase(filePath);
    
    // Convert Blob to Buffer for FormData compatibility
    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    
    // Upload file to PDF.co to get a URL
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: 'document.pdf',
      contentType: 'application/pdf'
    });

    const uploadResponse = await axios.post(`${this.baseURL}/file/upload`, formData, {
      headers: {
        'x-api-key': this.apiKey,
        ...formData.getHeaders()
      },
      timeout: 10000 // 10 second timeout for upload
    });

    if (uploadResponse.data.error) {
      throw new Error(`PDF.co upload error: ${uploadResponse.data.error}`);
    }

    console.log(`[PDFService] File uploaded to PDF.co: ${uploadResponse.data.url}`);

    // Now extract text using the uploaded file URL
    const extractResponse = await this.extractTextFromURL(uploadResponse.data.url);
    console.log(`[PDFService] Text extraction completed, pages: ${extractResponse.pages}`);

    return {
      success: true,
      text: extractResponse.text,
      pages: extractResponse.pages,
      confidence: extractResponse.confidence || 0.95
    };
  }

  async uploadFile(filePath) {
    try {
      // For Supabase storage files, we need to download them first
      const fileBlob = await this.downloadFromSupabase(filePath);
      
      // Convert Blob to Buffer for FormData compatibility
      const arrayBuffer = await fileBlob.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: 'document.pdf',
        contentType: 'application/pdf'
      });

      const response = await axios.post(`${this.baseURL}/file/upload`, formData, {
        headers: {
          'x-api-key': this.apiKey,
          ...formData.getHeaders()
        }
      });

      if (response.data.error) {
        throw new Error(`PDF.co upload error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      console.error('[PDFService] Upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  async extractTextFromURL(fileUrl) {
    try {
      // PDF.co text extraction endpoint - using the correct endpoint according to docs
      const response = await axios.post(`${this.baseURL}/pdf/convert/to/text`, {
        url: fileUrl,
        inline: true,
        async: false
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout for extraction
      });

      if (response.data.error) {
        throw new Error(`PDF.co extraction error: ${response.data.error}`);
      }

      // PDFco returns 'body' for the extracted text, not 'text'
      return {
        text: response.data.body || '',
        pages: response.data.pageCount || 1,
        confidence: 0.95,
        remainingCredits: response.data.remainingCredits,
        credits: response.data.credits
      };
    } catch (error) {
      console.error('[PDFService] Text extraction error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  async downloadFromSupabase(filePath) {
    try {
      // Validate file path first
      const validation = this.validateFilePath(filePath);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Use the relative path for Supabase operations
      const relativePath = validation.relativePath || filePath;

      // Check environment variables
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        throw new Error('Supabase environment variables not configured (SUPABASE_URL or SUPABASE_SERVICE_KEY missing)');
      }

      console.log(`[PDFService] Attempting to download file from Supabase: ${relativePath}`);
      console.log(`[PDFService] Supabase URL: ${process.env.SUPABASE_URL}`);
      console.log(`[PDFService] Service key configured: ${!!process.env.SUPABASE_SERVICE_KEY}`);

      // Import Supabase client
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // First, check if the bucket exists and we have access
      console.log(`[PDFService] Checking bucket access...`);
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      
      if (bucketError) {
        console.error('[PDFService] Bucket access error:', bucketError);
        throw new Error(`Bucket access failed: ${bucketError.message}`);
      }

      const availableBuckets = buckets.map(b => b.name);
      console.log(`[PDFService] Available buckets: ${availableBuckets.join(', ')}`);

      if (!availableBuckets.includes('case-files')) {
        throw new Error(`case-files bucket not found. Available buckets: ${availableBuckets.join(', ')}`);
      }

      // Check if file exists before attempting download
      console.log(`[PDFService] Checking if file exists: ${relativePath}`);
      const { data: fileList, error: listError } = await supabase.storage
        .from('case-files')
        .list(relativePath.split('/').slice(0, -1).join('/'));

      if (listError) {
        console.error('[PDFService] File list error:', listError);
        // Continue anyway, the file might exist
      } else {
        const fileName = relativePath.split('/').pop();
        const fileExists = fileList.some(file => file.name === fileName);
        console.log(`[PDFService] File exists check: ${fileExists ? 'Found' : 'Not found'}`);
      }

      // Download file from Supabase storage
      const { data, error } = await supabase.storage
        .from('case-files')
        .download(relativePath);

      if (error) {
        console.error('[PDFService] Supabase download error details:', {
          error: error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        
        // Provide more specific error messages based on error code
        let errorMessage = error.message || 'Unknown error';
        if (error.code === '404') {
          errorMessage = `File not found: ${relativePath}`;
        } else if (error.code === '401') {
          errorMessage = 'Unauthorized access to Supabase storage';
        } else if (error.code === '403') {
          errorMessage = 'Forbidden access to Supabase storage';
        }
        
        throw new Error(`Supabase download error: ${errorMessage} (Code: ${error.code || 'N/A'})`);
      }

      if (!data) {
        throw new Error(`No data returned from Supabase for file path: ${relativePath}`);
      }

      console.log(`[PDFService] Successfully downloaded file from Supabase: ${relativePath}`);
      return data;
    } catch (error) {
      console.error('[PDFService] Supabase download error:', {
        message: error.message,
        stack: error.stack,
        filePath: filePath
      });
      throw new Error(`Failed to download file from Supabase: ${error.message}`);
    }
  }

  async convertToText(fileBuffer) {
    return this.extractText(fileBuffer);
  }

  isConfigured() {
    return !!this.apiKey;
  }

  // Test method to verify API connectivity
  async testConnection() {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'API key not configured' };
      }

      // Make a simple API call to test connectivity
      const response = await axios.get(`${this.baseURL}/user/profile`, {
        headers: {
          'x-api-key': this.apiKey
        }
      });

      return { 
        success: true, 
        message: 'PDF.co API connection successful',
        userInfo: response.data
      };
    } catch (error) {
      return { 
        success: false, 
        error: `API connection failed: ${error.message}` 
      };
    }
  }

  // Test method to verify Supabase file download
  async testSupabaseDownload(filePath) {
    try {
      console.log(`[PDFService] Testing Supabase download for: ${filePath}`);
      
      // Check environment variables
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return { 
          success: false, 
          error: 'Supabase environment variables not configured' 
        };
      }

      // Import Supabase client
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Test bucket access first
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      
      if (bucketError) {
        return { 
          success: false, 
          error: `Bucket access failed: ${bucketError.message}` 
        };
      }

      const availableBuckets = buckets.map(b => b.name);
      console.log(`[PDFService] Available buckets: ${availableBuckets.join(', ')}`);

      // Test file download
      const { data, error } = await supabase.storage
        .from('case-files')
        .download(filePath);

      if (error) {
        return { 
          success: false, 
          error: `Download failed: ${error.message}`,
          details: {
            code: error.code,
            details: error.details,
            hint: error.hint
          }
        };
      }

      if (!data) {
        return { 
          success: false, 
          error: 'No data returned from download' 
        };
      }

      return { 
        success: true, 
        message: 'Supabase download test successful',
        fileSize: data.size || 'unknown'
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Test failed: ${error.message}` 
      };
    }
  }

  // Validate file path format
  validateFilePath(filePath) {
    if (!filePath) {
      return { valid: false, error: 'File path is required' };
    }

    // Handle full Supabase URLs by extracting the relative path
    let relativePath = filePath;
    if (filePath.startsWith('http')) {
      // Extract path from Supabase URL
      // URL format: https://project.supabase.co/storage/v1/object/public/bucket/path
      const urlParts = filePath.split('/');
      const bucketIndex = urlParts.findIndex(part => part === 'case-files');
      if (bucketIndex !== -1 && bucketIndex + 1 < urlParts.length) {
        // Extract everything after the bucket name
        relativePath = urlParts.slice(bucketIndex + 1).join('/');
        console.log(`[PDFService] Extracted relative path from URL: ${relativePath}`);
      } else {
        return { 
          valid: false, 
          error: `Invalid Supabase URL format. Expected URL with case-files bucket, got: ${filePath}` 
        };
      }
    }

    // Check if path follows expected format: documents/{caseId}/{fileName}
    const pathParts = relativePath.split('/');
    if (pathParts.length < 3) {
      return { 
        valid: false, 
        error: `Invalid file path format. Expected: documents/{caseId}/{fileName}, got: ${relativePath}` 
      };
    }

    if (pathParts[0] !== 'documents') {
      return { 
        valid: false, 
        error: `File path should start with 'documents/', got: ${relativePath}` 
      };
    }

    return { valid: true, pathParts, relativePath };
  }

  // Alternative method using direct file upload and text extraction
  async extractTextDirect(fileBuffer, filename = 'document.pdf') {
    try {
      if (!this.apiKey) {
        throw new Error('PDF API key not configured');
      }

      console.log(`[PDFService] Direct text extraction for: ${filename}`);

      // Upload file directly
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'application/pdf'
      });

      const uploadResponse = await axios.post(`${this.baseURL}/file/upload`, formData, {
        headers: {
          'x-api-key': this.apiKey,
          ...formData.getHeaders()
        }
      });

      if (uploadResponse.data.error) {
        throw new Error(`PDF.co upload error: ${uploadResponse.data.error}`);
      }

      console.log(`[PDFService] File uploaded, URL: ${uploadResponse.data.url}`);

      // Extract text
      const extractResponse = await axios.post(`${this.baseURL}/pdf/convert/to/text`, {
        url: uploadResponse.data.url,
        inline: true,
        async: false
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (extractResponse.data.error) {
        throw new Error(`PDF.co extraction error: ${extractResponse.data.error}`);
      }

      console.log(`[PDFService] Text extraction completed`);

      return {
        success: true,
        text: extractResponse.data.body || '',
        pages: extractResponse.data.pageCount || 1,
        confidence: extractResponse.data.confidence || 0.95,
        remainingCredits: extractResponse.data.remainingCredits,
        credits: extractResponse.data.credits
      };
    } catch (error) {
      console.error('[PDFService] Direct extraction error:', error);
      throw error;
    }
  }
}

module.exports = new PDFService(); 