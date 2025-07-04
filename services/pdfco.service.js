const axios = require('axios');
const FormData = require('form-data');

class PDFCoService {
  constructor() {
    this.apiKey = process.env.PDF_CO_API_KEY || process.env.PDFCO_API_KEY;
    this.baseURL = 'https://api.pdf.co/v1';
  }

  async extractText(fileUrl) {
    try {
      console.log('Making PDF.co API call for text extraction:', fileUrl);
      
      if (!this.apiKey) {
        throw new Error('PDF.co API key not configured');
      }
      
      const response = await axios.post(`${this.baseURL}/pdf/convert/to/text`, {
        url: fileUrl,
        inline: true,
        async: false
      }, {
        headers: {
          'x-api-key': this.apiKey
        }
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
      if (response.data.body) {
        console.log('PDF text extraction completed (inline), length:', response.data.body.length);
        return response.data.body;
      } else if (response.data.url) {
        const textResponse = await axios.get(response.data.url);
        console.log('PDF text extraction completed (URL), length:', textResponse.data.length);
        return textResponse.data;
      } else {
        throw new Error('No text content returned from PDF.co API');
      }
    } catch (error) {
      console.error('PDF.co text extraction error:', error);
      throw error;
    }
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