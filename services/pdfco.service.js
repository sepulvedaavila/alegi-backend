const axios = require('axios');
const FormData = require('form-data');

class PDFCoService {
  constructor() {
    this.apiKey = process.env.PDF_CO_API_KEY || process.env.PDFCO_API_KEY;
    this.baseURL = 'https://api.pdf.co/v1';
  }

  async extractText(filePath, fileBuffer) {
    try {
      console.log('Making PDF.co API call for text extraction:', filePath);
      
      if (!this.apiKey) {
        throw new Error('PDF.co API key not configured');
      }
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: filePath,
        contentType: this.getContentType(filePath)
      });
      
      const response = await axios.post(`${this.baseURL}/pdf/convert/to/text`, formData, {
        headers: {
          'x-api-key': this.apiKey,
          ...formData.getHeaders()
        },
        timeout: 60000
      });

      console.log('PDF.co API response:', {
        error: response.data.error,
        url: response.data.url ? 'URL provided' : 'No URL',
        credits: response.data.credits
      });

      if (response.data.error) {
        throw new Error(response.data.message);
      }

      // Handle inline response or URL response
      let extractedText;
      if (response.data.body) {
        console.log('PDF text extraction completed (inline), length:', response.data.body.length);
        extractedText = response.data.body;
      } else if (response.data.url) {
        const textResponse = await axios.get(response.data.url);
        console.log('PDF text extraction completed (URL), length:', textResponse.data.length);
        extractedText = textResponse.data;
      } else {
        throw new Error('No text content returned from PDF.co API');
      }

      return {
        text: extractedText,
        pages: this.estimatePages(extractedText),
        service: 'pdfco'
      };
    } catch (error) {
      console.error('PDF.co text extraction error:', error);
      throw error;
    }
  }

  getContentType(filePath) {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'txt': return 'text/plain';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default: return 'application/octet-stream';
    }
  }

  estimatePages(text) {
    // Rough estimation based on text length and common page characteristics
    const avgCharsPerPage = 3000;
    return Math.max(1, Math.ceil(text.length / avgCharsPerPage));
  }

  async parseDocument(fileUrl) {
    try {
      const response = await axios.post(`${this.baseURL}/pdf/documentparser`, {
        url: fileUrl,
        templateId: process.env.PDFCO_TEMPLATE_ID || '',
        async: false,
        inline: true,
        generateCsvHeaders: true
      }, {
        headers: {
          'x-api-key': this.apiKey
        }
      });

      return response.data;
    } catch (error) {
      console.error('PDF.co parsing error:', error);
      throw error;
    }
  }
}

module.exports = new PDFCoService();