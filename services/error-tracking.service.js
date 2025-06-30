// services/error-tracking.service.js
const Sentry = require('@sentry/node');
const supabaseService = require('./supabase.service');

class ErrorTrackingService {
  constructor() {
    // Initialize Sentry if DSN is provided
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 1.0,
      });
    }
  }

  // Log processing errors to database
  async logProcessingError(caseId, error, context = {}) {
    try {
      const errorData = {
        case_id: caseId,
        error_message: error.message,
        error_stack: error.stack,
        error_context: {
          ...context,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        },
        created_at: new Date().toISOString()
      };

      await supabaseService.logProcessingError(errorData);
      
      // Also send to Sentry if critical
      if (context.severity === 'critical' || !context.severity) {
        Sentry.captureException(error, {
          tags: { caseId, ...context },
          level: 'error'
        });
      }
      
      console.error(`Processing error logged for case ${caseId}:`, error.message);
    } catch (loggingError) {
      console.error('Failed to log processing error:', loggingError);
      // Don't throw - we don't want logging failures to break the flow
    }
  }

  // Log AI enrichment specific errors
  async logAIEnrichmentError(caseId, error, aiResponse = null) {
    try {
      const errorData = {
        case_id: caseId,
        error_message: error.message,
        error_stack: error.stack,
        ai_response: aiResponse,
        created_at: new Date().toISOString()
      };

      await supabaseService.logAIEnrichmentError(errorData);
      
      // Send to Sentry with AI context
      Sentry.captureException(error, {
        tags: { 
          caseId, 
          errorType: 'ai_enrichment',
          aiModel: aiResponse?.model || 'unknown'
        },
        extra: { aiResponse }
      });
      
      console.error(`AI enrichment error logged for case ${caseId}:`, error.message);
    } catch (loggingError) {
      console.error('Failed to log AI enrichment error:', loggingError);
    }
  }

  // Log webhook errors
  async logWebhookError(webhookData, error) {
    try {
      const errorContext = {
        webhookType: webhookData.type,
        table: webhookData.table,
        recordId: webhookData.record?.id,
        source: webhookData.source || 'unknown'
      };

      // Log to console
      console.error('Webhook processing error:', {
        error: error.message,
        ...errorContext
      });

      // Send to Sentry
      Sentry.captureException(error, {
        tags: errorContext,
        extra: { webhookData }
      });

      // If we have a case ID, log to database
      if (webhookData.record?.id) {
        await this.logProcessingError(
          webhookData.record.id, 
          error, 
          errorContext
        );
      }
    } catch (loggingError) {
      console.error('Failed to log webhook error:', loggingError);
    }
  }

  // Track performance metrics
  async trackPerformance(operation, duration, metadata = {}) {
    try {
      const transaction = Sentry.startTransaction({
        op: operation,
        name: `Processing ${operation}`,
      });

      Sentry.getCurrentHub().configureScope(scope => scope.setSpan(transaction));

      const span = transaction.startChild({
        op: 'processing',
        description: `${operation} processing time`,
      });

      // Log performance data
      console.log(`Performance: ${operation} took ${duration}ms`, metadata);

      // Send to Sentry
      span.setData('duration', duration);
      span.setData('metadata', metadata);
      span.finish();
      transaction.finish();

    } catch (error) {
      console.error('Failed to track performance:', error);
    }
  }

  // Get error statistics
  async getErrorStats(caseId = null) {
    try {
      const query = supabaseService.client
        .from('processing_errors')
        .select('*', { count: 'exact' });

      if (caseId) {
        query.eq('case_id', caseId);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return {
        totalErrors: count,
        recentErrors: data,
        errorRate: this.calculateErrorRate(data)
      };
    } catch (error) {
      console.error('Failed to get error stats:', error);
      return null;
    }
  }

  // Calculate error rate
  calculateErrorRate(errors) {
    if (!errors || errors.length === 0) return 0;

    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentErrors = errors.filter(e => 
      new Date(e.created_at) > oneHourAgo
    );

    return recentErrors.length;
  }

  // Create error summary for notifications
  createErrorSummary(errors) {
    const summary = {
      total: errors.length,
      byType: {},
      critical: 0,
      recent: 0
    };

    const oneHourAgo = new Date(Date.now() - 3600000);

    errors.forEach(error => {
      // Count by error type
      const errorType = error.error_context?.step || 'unknown';
      summary.byType[errorType] = (summary.byType[errorType] || 0) + 1;

      // Count critical errors
      if (error.error_context?.severity === 'critical') {
        summary.critical++;
      }

      // Count recent errors
      if (new Date(error.created_at) > oneHourAgo) {
        summary.recent++;
      }
    });

    return summary;
  }

  // Retry failed operations
  async retryFailedOperation(errorRecord) {
    try {
      const { case_id, error_context } = errorRecord;
      
      console.log(`Retrying failed operation for case ${case_id}`);
      
      // Import processing service dynamically to avoid circular dependency
      const processingService = require('./processing.service');
      
      // Retry based on the original context
      const result = await processingService.processNewCase({
        caseId: case_id,
        webhookType: error_context.webhookType || 'RETRY',
        table: error_context.table || 'case_briefs',
        source: 'retry'
      });

      return result;
    } catch (retryError) {
      console.error('Retry failed:', retryError);
      throw retryError;
    }
  }
}

module.exports = new ErrorTrackingService();