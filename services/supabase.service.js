// services/supabase.service.js
const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }

  async watchCaseChanges(callback) {
    const subscription = this.client
      .channel('case-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'cases' 
        }, 
        callback
      )
      .subscribe();
    
    return subscription;
  }

  async getCaseById(caseId) {
    const { data, error } = await this.client
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateCaseAIEnrichment(caseId, enrichmentData) {
    const { data, error } = await this.client
      .from('case_ai_enrichment')
      .upsert({
        case_id: caseId,
        ...enrichmentData,
        updated_at: new Date().toISOString()
      });
    
    if (error) throw error;
    return data;
  }

  async getCaseEvidence(caseId) {
    const { data, error } = await this.client
      .from('case_evidence')
      .select('*')
      .eq('case_id', caseId);
    
    if (error) throw error;
    return data;
  }
}

module.exports = new SupabaseService();
