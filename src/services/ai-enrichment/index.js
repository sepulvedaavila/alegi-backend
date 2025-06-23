import { supabase } from '../../utils/supabase.js';
import { logger } from '../../utils/logger.js';
import { generatePredictions } from './predictions.js';
import { analyzeDocuments } from './analysis.js';

export async function getCasePredictions(caseId, userId) {
  try {
    logger.info('Getting case predictions', { caseId, userId });

    // Verify user has access to case
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, title')
      .eq('id', caseId)
      .eq('user_id', userId)
      .single();

    if (caseError || !caseData) {
      throw new Error('Case not found or access denied');
    }

    // Get processed documents
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename, content, analysis_results')
      .eq('case_id', caseId)
      .eq('status', 'processed');

    if (docsError) {
      logger.error('Error fetching documents', { error: docsError.message });
      throw docsError;
    }

    if (!documents || documents.length === 0) {
      return {
        predictions: [],
        message: 'No processed documents found for predictions'
      };
    }

    // Generate predictions based on document analysis
    const predictions = await generatePredictions(documents, caseData);

    return {
      case: caseData,
      predictions,
      documentsCount: documents.length
    };
  } catch (error) {
    logger.error('Error in getCasePredictions', { error: error.message });
    throw error;
  }
}

export async function enrichCaseWithAI(caseId) {
  try {
    logger.info('Enriching case with AI', { caseId });

    // Get case documents
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, filename, content')
      .eq('case_id', caseId)
      .eq('status', 'processed');

    if (error) {
      logger.error('Error fetching documents for AI enrichment', { error: error.message });
      throw error;
    }

    if (!documents || documents.length === 0) {
      return { message: 'No documents to analyze' };
    }

    // Analyze documents with AI
    const analysisResults = await analyzeDocuments(documents);

    // Update documents with analysis results
    for (const doc of documents) {
      const analysis = analysisResults.find(r => r.documentId === doc.id);
      if (analysis) {
        await supabase
          .from('documents')
          .update({ 
            analysis_results: analysis.results,
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.id);
      }
    }

    return {
      success: true,
      documentsAnalyzed: documents.length,
      analysisResults
    };
  } catch (error) {
    logger.error('Error in enrichCaseWithAI', { error: error.message });
    throw error;
  }
} 