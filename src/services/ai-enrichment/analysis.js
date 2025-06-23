import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function analyzeDocuments(documents) {
  try {
    logger.info('Starting AI document analysis', { 
      documentsCount: documents.length 
    });

    const analysisResults = [];

    for (const document of documents) {
      try {
        logger.info('Analyzing document', { 
          documentId: document.id,
          filename: document.filename 
        });

        const analysis = await analyzeSingleDocument(document);
        analysisResults.push({
          documentId: document.id,
          results: analysis
        });

        logger.info('Document analysis completed', { 
          documentId: document.id 
        });
      } catch (error) {
        logger.error('Error analyzing document', { 
          documentId: document.id,
          error: error.message 
        });
        
        analysisResults.push({
          documentId: document.id,
          error: error.message,
          results: null
        });
      }
    }

    return analysisResults;
  } catch (error) {
    logger.error('Error in document analysis', { error: error.message });
    throw error;
  }
}

async function analyzeSingleDocument(document) {
  const content = document.content || '';
  
  if (!content.trim()) {
    return {
      summary: 'No content available for analysis',
      entities: [],
      keyPhrases: [],
      sentiment: 'neutral',
      documentType: 'unknown'
    };
  }

  // Analyze document content with OpenAI
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are a legal document analysis AI. Analyze the provided document and extract:
        1. A concise summary (2-3 sentences)
        2. Key legal entities (parties, dates, amounts, case numbers)
        3. Important legal phrases and terms
        4. Document type classification
        5. Overall sentiment (positive, negative, neutral)
        
        Return the analysis in JSON format.`
      },
      {
        role: "user",
        content: `Analyze this legal document: "${document.filename}"
        
        Content:
        ${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}`
      }
    ],
    temperature: 0.2,
    max_tokens: 1500
  });

  try {
    const analysis = JSON.parse(completion.choices[0].message.content);
    
    return {
      summary: analysis.summary || 'No summary available',
      entities: analysis.entities || [],
      keyPhrases: analysis.keyPhrases || [],
      sentiment: analysis.sentiment || 'neutral',
      documentType: analysis.documentType || 'unknown',
      analysisDate: new Date().toISOString()
    };
  } catch (parseError) {
    logger.warn('Failed to parse AI analysis response', { 
      documentId: document.id,
      error: parseError.message 
    });

    // Fallback analysis
    return {
      summary: completion.choices[0].message.content.substring(0, 500),
      entities: [],
      keyPhrases: [],
      sentiment: 'neutral',
      documentType: 'unknown',
      analysisDate: new Date().toISOString(),
      rawResponse: completion.choices[0].message.content
    };
  }
}

export async function extractEntities(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Extract legal entities from the text. Return as JSON array with type and value."
        },
        {
          role: "user",
          content: text.substring(0, 3000)
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    try {
      return JSON.parse(completion.choices[0].message.content);
    } catch {
      return [];
    }
  } catch (error) {
    logger.error('Error extracting entities', { error: error.message });
    return [];
  }
}

export async function classifyDocument(content, filename) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Classify this legal document. Return only the document type."
        },
        {
          role: "user",
          content: `Filename: ${filename}\nContent: ${content.substring(0, 2000)}`
        }
      ],
      temperature: 0.1,
      max_tokens: 100
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    logger.error('Error classifying document', { error: error.message });
    return 'unknown';
  }
} 