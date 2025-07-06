// services/pdf.service.js
const axios = require('axios');
const pdfParse = require('pdf-parse');
const circuitBreaker = require('./circuit-breaker.service');

class PDFService {
  constructor() {
    this.services = [
      { name: 'primary', service: require('./pdfco.service') },
      { name: 'fallback', service: this.createFallbackService() }
    ];
  }

  async extractText(filePath, fileBuffer) {
    let lastError;
    
    for (const { name, service } of this.services) {
      try {
        console.log(`Attempting PDF extraction with ${name} service`);
        
        const result = await circuitBreaker.callWithCircuitBreaker(
          `pdf-${name}`, 
          () => service.extractText(filePath, fileBuffer),
          { threshold: 2, timeout: 120000 }
        );
        
        if (result && result.text && result.text.trim().length > 0) {
          console.log(`PDF extraction successful with ${name} service`);
          return result;
        }
      } catch (error) {
        console.warn(`PDF extraction failed with ${name} service:`, error.message);
        lastError = error;
        continue;
      }
    }

    // If all services fail, return partial result
    console.error('All PDF extraction services failed:', lastError);
    return {
      text: 'PDF text extraction failed - manual review required',
      pages: 0,
      error: lastError?.message || 'Unknown extraction error',
      fallback: true
    };
  }

  async extractTextFromURL(fileUrl, fileName) {
    try {
      // Get file buffer from URL
      const response = await axios.get(fileUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      return await this.extractText(fileName, response.data);
    } catch (error) {
      console.error('Failed to download file from URL:', error);
      return {
        text: `Failed to download file: ${fileName}`,
        pages: 0,
        error: error.message,
        fallback: true
      };
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
        pdf_text: extractedText.text || extractedText,
        processed_at: new Date().toISOString(),
        extraction_status: extractedText.fallback ? 'fallback' : 'success',
        error_message: extractedText.error || null
      });

    return extractedText;
  }

  createFallbackService() {
    return {
      extractText: async (filePath, fileBuffer) => {
        // Try simple text extraction methods
        const fileName = filePath.toLowerCase();
        
        if (fileName.endsWith('.txt')) {
          return {
            text: fileBuffer.toString('utf-8'),
            pages: 1,
            service: 'text-fallback'
          };
        }
        
        // For PDFs, try a simple approach or return placeholder
        return {
          text: `Document uploaded: ${filePath}\nContent requires manual extraction.`,
          pages: 1,
          service: 'manual-fallback'
        };
      }
    };
  }
}

module.exports = new PDFService();
