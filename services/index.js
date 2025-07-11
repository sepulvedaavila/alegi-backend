// services/index.js - Central export file for all services

// Export all services from a single entry point
module.exports = {
  // Core services
  aiService: require('./ai.service'),
  pdfService: require('./pdf.service'),
  courtListenerService: require('./courtlistener.service'),
  emailService: require('./email.service'),
  notificationService: require('./notification.service'),
  realtimeService: require('./realtime.service'),
  costMonitor: require('./costMonitor.service'),
  errorTrackingService: require('./error-tracking.service'),
  rateLimiter: require('./rateLimiter'),
  queueService: require('./queueService'),
  
  // Processing services
  processingService: require('./processing.service'),
  enhancedLinearPipelineService: require('./enhanced-linear-pipeline.service'),
  
  // External services
  externalService: require('./external.service'),
  internalAPIService: require('./internal-api.service'),
  internalAuthService: require('./internal-auth.service'),
  
  // Utility services
  serviceInitializer: require('./service-initializer'),
  
  // Legacy services (deprecated)
  // linearPipelineService: require('./linear-pipeline.service'), // REMOVED - Use enhanced pipeline instead
  
  // Individual service exports for direct access
  AIService: require('./ai.service'),
  PDFService: require('./pdf.service'),
  CourtListenerService: require('./courtlistener.service'),
  EmailService: require('./email.service'),
  NotificationService: require('./notification.service'),
  RealtimeService: require('./realtime.service'),
  CostMonitor: require('./costMonitor.service'),
  ErrorTrackingService: require('./error-tracking.service'),
  RateLimiter: require('./rateLimiter'),
  QueueService: require('./queueService'),
  ProcessingService: require('./processing.service'),
  EnhancedLinearPipelineService: require('./enhanced-linear-pipeline.service'),
  ExternalService: require('./external.service'),
  InternalAPIService: require('./internal-api.service'),
  InternalAuthService: require('./internal-auth.service'),
  ServiceInitializer: require('./service-initializer')
  // LinearPipelineService: require('./linear-pipeline.service') // REMOVED - Use enhanced pipeline instead
};