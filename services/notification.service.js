// services/notification.service.js - Notification and status service

const { createClient } = require('@supabase/supabase-js');

class NotificationService {
  constructor() {
    this.supabase = null;
    this.initializeSupabase();
  }

  initializeSupabase() {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
    }
  }

  async getCaseStatus(caseId, userId) {
    try {
      if (!this.supabase) {
        throw new Error('Supabase not configured');
      }

      const { data: caseData, error } = await this.supabase
        .from('case_briefs')
        .select('processing_status, ai_processed, last_ai_update, success_probability, risk_level')
        .eq('id', caseId)
        .eq('user_id', userId)
        .single();

      if (error) {
        throw error;
      }

      return {
        caseId,
        status: caseData.processing_status || 'pending',
        aiProcessed: caseData.ai_processed || false,
        lastUpdate: caseData.last_ai_update,
        successProbability: caseData.success_probability,
        riskLevel: caseData.risk_level,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting case status:', error);
      return {
        caseId,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getEnhancedCaseStatus(caseId, userId) {
    try {
      const basicStatus = await this.getCaseStatus(caseId, userId);
      
      if (!this.supabase) {
        return basicStatus;
      }

      // Get additional data
      const [enrichment, predictions] = await Promise.all([
        this.supabase
          .from('case_ai_enrichment')
          .select('*')
          .eq('case_id', caseId)
          .single(),
        this.supabase
          .from('case_predictions')
          .select('*')
          .eq('case_id', caseId)
          .single()
      ]);

      return {
        ...basicStatus,
        hasEnrichment: !!enrichment,
        hasPredictions: !!predictions,
        enrichment: enrichment || null,
        predictions: predictions || null
      };
    } catch (error) {
      console.error('Error getting enhanced case status:', error);
      return await this.getCaseStatus(caseId, userId);
    }
  }

  async getUserCasesStatus(userId) {
    try {
      if (!this.supabase) {
        throw new Error('Supabase not configured');
      }

      const { data: cases, error } = await this.supabase
        .from('case_briefs')
        .select('id, case_name, processing_status, ai_processed, last_ai_update')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return cases.map(caseData => ({
        caseId: caseData.id,
        caseName: caseData.case_name,
        status: caseData.processing_status || 'pending',
        aiProcessed: caseData.ai_processed || false,
        lastUpdate: caseData.last_ai_update
      }));
    } catch (error) {
      console.error('Error getting user cases status:', error);
      return [];
    }
  }

  isRealtimeAvailable() {
    // WebSocket not available on Vercel
    return false;
  }
}

module.exports = new NotificationService(); 