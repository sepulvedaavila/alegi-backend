// services/pdf.service.js - PDF processing service
const axios = require('axios');
const FormData = require('form-data');

class PDFService {
  constructor() {
    this.apiKey = process.env.PDF_CO_API_KEY;
    this.baseURL = 'https://api.pdf.co/v1';
  }

  async extractText(filePath) {
    try {
      if (!this.apiKey) {
        throw new Error('PDF API key not configured');
      }

      console.log(`[PDFService] Extracting text from: ${filePath}`);

      // Step 1: Upload the file to PDF.co
      const uploadResponse = await this.uploadFile(filePath);
      console.log(`[PDFService] File uploaded, URL: ${uploadResponse.url}`);

      // Step 2: Extract text from the uploaded file
      const extractResponse = await this.extractTextFromURL(uploadResponse.url);
      console.log(`[PDFService] Text extraction completed, pages: ${extractResponse.pages}`);

      return {
        success: true,
        text: extractResponse.text,
        pages: extractResponse.pages,
        confidence: extractResponse.confidence || 0.95
      };
    } catch (error) {
      console.error('[PDFService] PDF extraction error:', error);
      throw error;
    }
  }

  async uploadFile(filePath) {
    try {
      // For Supabase storage files, we need to download them first
      const fileBuffer = await this.downloadFromSupabase(filePath);
      
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
      // PDF.co text extraction endpoint - using the correct endpoint
      const response = await axios.post(`${this.baseURL}/extract-text`, {
        url: fileUrl
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`PDF.co extraction error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      console.error('[PDFService] Text extraction error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  async downloadFromSupabase(filePath) {
    try {
      // Import Supabase client
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Download file from Supabase storage
      const { data, error } = await supabase.storage
        .from('case-files')
        .download(filePath);

      if (error) {
        throw new Error(`Supabase download error: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('[PDFService] Supabase download error:', error);
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
      const extractResponse = await axios.post(`${this.baseURL}/extract-text`, {
        url: uploadResponse.data.url
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
        text: extractResponse.data.text,
        pages: extractResponse.data.pages || 1,
        confidence: extractResponse.data.confidence || 0.95
      };
    } catch (error) {
      console.error('[PDFService] Direct extraction error:', error);
      throw error;
    }
  }
}

module.exports = new PDFService(); 