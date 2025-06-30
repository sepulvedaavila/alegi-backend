// services/supabase.service.js
const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  // Get case by ID
  async getCaseById(caseId) {
    try {
      const { data, error } = await this.client
        .from('case_briefs')
        .select('*')
        .eq('id', caseId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error fetching case ${caseId}:`, error);
      throw error;
    }
  }

  // Get case evidence
  async getCaseEvidence(caseId) {
    try {
      const { data, error } = await this.client
        .from('case_evidence')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error fetching evidence for case ${caseId}:`, error);
      throw error;
    }
  }

  // Update case AI enrichment
  async updateCaseAIEnrichment(caseId, enrichmentData) {
    try {
      // Check if record exists
      const { data: existing } = await this.client
        .from('case_ai_enrichment')
        .select('id')
        .eq('case_id', caseId)
        .single();
      
      const payload = {
        case_id: caseId,
        ...enrichmentData,
        updated_at: new Date().toISOString()
      };
      
      let result;
      if (existing) {
        // Update existing record
        result = await this.client
          .from('case_ai_enrichment')
          .update(payload)
          .eq('case_id', caseId);
      } else {
        // Insert new record
        result = await this.client
          .from('case_ai_enrichment')
          .insert({
            ...payload,
            created_at: new Date().toISOString()
          });
      }
      
      if (result.error) throw result.error;
      return result.data;
    } catch (error) {
      console.error(`Error updating AI enrichment for case ${caseId}:`, error);
      throw error;
    }
  }

  // Update case brief
  async updateCaseBrief(caseId, updates) {
    try {
      const { data, error } = await this.client
        .from('case_briefs')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', caseId);
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error updating case brief ${caseId}:`, error);
      throw error;
    }
  }

  // Update case predictions
  async updateCasePredictions(caseId, predictionData) {
    try {
      const { data, error } = await this.client
        .from('case_predictions')
        .upsert({
          case_id: caseId,
          ...predictionData,
          created_at: new Date().toISOString()
        });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error updating predictions for case ${caseId}:`, error);
      throw error;
    }
  }

  // Create processing error record
  async logProcessingError(errorData) {
    try {
      const { error } = await this.client
        .from('processing_errors')
        .insert(errorData);
      
      if (error) throw error;
    } catch (dbError) {
      console.error('Failed to log processing error:', dbError);
    }
  }

  // Create AI enrichment error record
  async logAIEnrichmentError(errorData) {
    try {
      const { error } = await this.client
        .from('ai_enrichment_errors')
        .insert(errorData);
      
      if (error) throw error;
    } catch (dbError) {
      console.error('Failed to log AI enrichment error:', dbError);
    }
  }

  // Get case documents
  async getCaseDocuments(caseId) {
    try {
      const { data, error } = await this.client
        .from('case_documents')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error fetching documents for case ${caseId}:`, error);
      throw error;
    }
  }

  // Update document with extracted text
  async updateDocumentText(documentId, extractedText) {
    try {
      const { data, error } = await this.client
        .from('case_documents')
        .update({
          ai_extracted_text: extractedText,
          processed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error updating document ${documentId}:`, error);
      throw error;
    }
  }

  // Batch operations for efficiency
  async batchUpdateCaseEnrichment(updates) {
    try {
      const { data, error } = await this.client
        .from('case_ai_enrichment')
        .upsert(updates);
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  // Get cases pending processing
  async getPendingCases(limit = 10) {
    try {
      const { data, error } = await this.client
        .from('case_briefs')
        .select('*')
        .or('processing_status.eq.pending,ai_processed.eq.false')
        .order('created_at', { ascending: true })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending cases:', error);
      throw error;
    }
  }

  // Get processing statistics
  async getProcessingStats() {
    try {
      const { data: stats, error } = await this.client
        .rpc('get_processing_stats');
      
      if (error) throw error;
      return stats;
    } catch (error) {
      console.error('Error fetching processing stats:', error);
      throw error;
    }
  }
}

module.exports = new SupabaseService();