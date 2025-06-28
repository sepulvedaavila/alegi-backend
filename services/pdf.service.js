// services/pdf.service.js
const axios = require('axios');
const pdfParse = require('pdf-parse');

class PDFService {
  constructor() {
    this.pdfCoApiKey = process.env.PDF_CO_API_KEY;
    this.pdfCoBaseUrl = 'https://api.pdf.co/v1';
  }

  async extractTextFromURL(fileUrl, fileName) {
    try {
      // First try PDF.co API (matching Make.com behavior)
      const response = await axios.post(
        `${this.pdfCoBaseUrl}/pdf/convert/to/text`,
        {
          url: fileUrl,
          name: fileName,
          inline: true,
          async: false
        },
        {
          headers: {
            'x-api-key': this.pdfCoApiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.text;
    } catch (error) {
      console.error('PDF.co extraction failed, falling back to pdf-parse:', error);
      
      // Fallback to pdf-parse
      const pdfBuffer = await axios.get(fileUrl, { 
        responseType: 'arraybuffer' 
      });
      const data = await pdfParse(pdfBuffer.data);
      return data.text;
    }
  }

  async processCaseDocument(caseId, documentUrl, documentName) {
    const extractedText = await this.extractTextFromURL(documentUrl, documentName);
    
    // Store in Supabase
    const supabaseService = require('./supabase.service');
    await supabaseService.client
      .from('case_documents')
      .upsert({
        case_id: caseId,
        document_name: documentName,
        pdf_text: extractedText,
        processed_at: new Date().toISOString()
      });

    return extractedText;
  }
}

module.exports = new PDFService();
