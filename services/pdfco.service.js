const axios = require('axios');
const FormData = require('form-data');

class PDFCoService {
  constructor() {
    this.apiKey = process.env.PDF_CO_API_KEY || process.env.PDFCO_API_KEY;
    this.baseURL = 'https://api.pdf.co/v1';
  }

  async extractText(fileUrl) {
    try {
      const response = await axios.post(`${this.baseURL}/pdf/convert/to/text`, {
        url: fileUrl,
        inline: true,
        async: false
      }, {
        headers: {
          'x-api-key': this.apiKey
        }
      });

      if (response.data.error) {
        throw new Error(response.data.message);
      }

      // Get the extracted text
      const textResponse = await axios.get(response.data.url);
      return textResponse.data;
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