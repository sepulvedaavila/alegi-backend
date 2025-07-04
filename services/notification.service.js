const supabaseService = require('./supabase.service');
const emailService = require('./email.service');

class NotificationService {
  constructor() {
    this.realtimeService = null;
    this.initializeRealtimeService();
  }

  initializeRealtimeService() {
    try {
      this.realtimeService = require('./realtime.service');
    } catch (error) {
      console.warn('Realtime service not available:', error.message);
    }
  }

  // Notify case processing started
  async notifyCaseProcessingStarted(caseId, userId, caseData) {
    try {
      // Update database status
      await supabaseService.client
        .from('case_briefs')
        .update({ 
          processing_status: 'processing',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Send real-time notification if available
      if (this.realtimeService) {
        this.realtimeService.notifyCaseProcessingStarted(caseId, userId, caseData);
      }

      console.log(`Notified processing started for case ${caseId}`);
    } catch (error) {
      console.error('Failed to notify processing started:', error);
    }
  }

  // Notify case processing completed
  async notifyCaseProcessingCompleted(caseId, userId, caseData, results) {
    try {
      // Update database status
      await supabaseService.client
        .from('case_briefs')
        .update({ 
          processing_status: 'completed',
          last_ai_update: new Date().toISOString(),
          ai_processed: true
        })
        .eq('id', caseId);

      // Send real-time notification if available
      if (this.realtimeService) {
        this.realtimeService.notifyCaseProcessingCompleted(caseId, userId, caseData, results);
      }

      // Send email notification
      try {
        await emailService.sendCaseProcessedNotification(caseId, caseData);
      } catch (emailError) {
        console.warn('Failed to send email notification:', emailError.message);
      }

      console.log(`Notified processing completed for case ${caseId}`);
    } catch (error) {
      console.error('Failed to notify processing completed:', error);
    }
  }

  // Notify case processing failed
  async notifyCaseProcessingFailed(caseId, userId, caseData, error) {
    try {
      // Update database status
      await supabaseService.client
        .from('case_briefs')
        .update({ 
          processing_status: 'failed',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Send real-time notification if available
      if (this.realtimeService) {
        this.realtimeService.notifyCaseProcessingFailed(caseId, userId, caseData, error);
      }

      console.log(`Notified processing failed for case ${caseId}`);
    } catch (notifyError) {
      console.error('Failed to notify processing failed:', notifyError);
    }
  }

  // Get case processing status
  async getCaseStatus(caseId, userId) {
    try {
      const { data: caseData, error } = await supabaseService.client
        .from('case_briefs')
        .select('id, case_name, processing_status, last_ai_update, case_stage, user_id')
        .eq('id', caseId)
        .single();

      if (error) {
        throw new Error('Case not found');
      }

      // Check user access
      if (caseData.user_id !== userId) {
        throw new Error('Access denied');
      }

      return {
        caseId,
        caseName: caseData.case_name,
        status: caseData.processing_status || 'pending',
        lastUpdate: caseData.last_ai_update,
        caseStage: caseData.case_stage,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get case status:', error);
      throw error;
    }
  }

  // Get all cases for a user with their processing status
  async getUserCasesStatus(userId) {
    try {
      const { data: cases, error } = await supabaseService.client
        .from('case_briefs')
        .select('id, case_name, processing_status, last_ai_update, case_stage, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return cases.map(caseData => ({
        caseId: caseData.id,
        caseName: caseData.case_name,
        status: caseData.processing_status || 'pending',
        lastUpdate: caseData.last_ai_update,
        caseStage: caseData.case_stage,
        createdAt: caseData.created_at
      }));
    } catch (error) {
      console.error('Failed to get user cases status:', error);
      throw error;
    }
  }

  // Check if real-time notifications are available
  isRealtimeAvailable() {
    return !!this.realtimeService;
  }

  // Get real-time service statistics
  getRealtimeStats() {
    if (!this.realtimeService) {
      return null;
    }
    return this.realtimeService.getStats();
  }
}

module.exports = new NotificationService(); 