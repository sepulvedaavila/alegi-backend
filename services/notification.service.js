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
      // Check if we're using a mock client
      if (supabaseService.isMock) {
        return {
          caseId,
          caseName: 'Mock Case',
          status: 'pending',
          lastUpdate: new Date().toISOString(),
          caseStage: 'intake',
          timestamp: new Date().toISOString(),
          mock: true
        };
      }

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
      // Check if we're using a mock client
      if (supabaseService.isMock) {
        return [{
          caseId: 'mock-case-1',
          caseName: 'Mock Case 1',
          status: 'pending',
          lastUpdate: new Date().toISOString(),
          caseStage: 'intake',
          createdAt: new Date().toISOString(),
          mock: true
        }];
      }

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
    // On Vercel (production), WebSocket is not available
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return !!this.realtimeService;
  }

  // Get real-time service statistics
  getRealtimeStats() {
    if (!this.realtimeService) {
      return {
        available: false,
        environment: process.env.NODE_ENV || 'development',
        message: process.env.NODE_ENV === 'production' 
          ? 'WebSocket not available on Vercel - using polling fallback'
          : 'WebSocket service not available'
      };
    }
    return {
      ...this.realtimeService.getStats(),
      available: true,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // Enhanced processing notifications
  async notifyEnhancedProcessingStarted(caseId, userId, caseData) {
    try {
      console.log(`Notifying enhanced processing started for case ${caseId}`);

      // Update database status
      await supabaseService.client
        .from('case_briefs')
        .update({ 
          enhanced_processing_status: 'document_extraction',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Send real-time notification if available
      if (this.realtimeService) {
        this.realtimeService.notifyEnhancedProcessingStarted(caseId, userId, caseData);
      }

      console.log(`Notified enhanced processing started for case ${caseId}`);
    } catch (notifyError) {
      console.error('Failed to notify enhanced processing started:', notifyError);
    }
  }

  async notifyEnhancedProcessingCompleted(caseId, userId, caseData, results) {
    try {
      console.log(`Notifying enhanced processing completed for case ${caseId}`);

      // Update database status
      await supabaseService.client
        .from('case_briefs')
        .update({ 
          enhanced_processing_status: 'completed',
          processing_status: 'complete',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Send real-time notification if available
      if (this.realtimeService) {
        this.realtimeService.notifyEnhancedProcessingCompleted(caseId, userId, caseData, results);
      }

      console.log(`Notified enhanced processing completed for case ${caseId}`);
    } catch (notifyError) {
      console.error('Failed to notify enhanced processing completed:', notifyError);
    }
  }

  async notifyEnhancedProcessingFailed(caseId, userId, caseData, error) {
    try {
      console.log(`Notifying enhanced processing failed for case ${caseId}`);

      // Update database status
      await supabaseService.client
        .from('case_briefs')
        .update({ 
          enhanced_processing_status: 'failed',
          processing_status: 'failed',
          last_ai_update: new Date().toISOString()
        })
        .eq('id', caseId);

      // Send real-time notification if available
      if (this.realtimeService) {
        this.realtimeService.notifyEnhancedProcessingFailed(caseId, userId, caseData, error);
      }

      console.log(`Notified enhanced processing failed for case ${caseId}`);
    } catch (notifyError) {
      console.error('Failed to notify enhanced processing failed:', notifyError);
    }
  }

  // Get enhanced case status with processing details
  async getEnhancedCaseStatus(caseId, userId) {
    try {
      // Check if we're using a mock client
      if (supabaseService.isMock) {
        return {
          caseId,
          caseName: 'Mock Case',
          status: 'pending',
          lastUpdate: new Date().toISOString(),
          caseStage: 'intake',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          aiProcessed: false,
          processingStartedAt: null,
          processingCompletedAt: null,
          timestamp: new Date().toISOString(),
          mock: true
        };
      }

      const { data: caseData, error } = await supabaseService.client
        .from('case_briefs')
        .select(`
          id, 
          case_name, 
          processing_status, 
          last_ai_update, 
          case_stage, 
          user_id,
          created_at,
          updated_at,
          ai_processed,
          processing_started_at,
          processing_completed_at,
          processing_type,
          enhanced_processing_status
        `)
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
        createdAt: caseData.created_at,
        updatedAt: caseData.updated_at,
        aiProcessed: caseData.ai_processed || false,
        processingStartedAt: caseData.processing_started_at,
        processingCompletedAt: caseData.processing_completed_at,
        processingType: caseData.processing_type || 'standard',
        enhancedProcessingStatus: caseData.enhanced_processing_status || 'not_started',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get enhanced case status:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService(); 