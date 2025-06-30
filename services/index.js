// services/index.js - Central export file for all services

// Export all services from a single entry point
module.exports = {
    // Core services
    supabaseService: require('./supabase.service'),
    errorTrackingService: require('./error-tracking.service'),
    processingService: require('./processing.service'),
    aiService: require('./ai.service'),
    pdfService: require('./pdf.service'),
    emailService: require('./email.service'),
    externalService: require('./external.service'),
    internalAuthService: require('./internal-auth.service'),
    
    // Re-export individual services for backwards compatibility
    SupabaseService: require('./supabase.service'),
    ErrorTrackingService: require('./error-tracking.service'),
    ProcessingService: require('./processing.service'),
    AIService: require('./ai.service'),
    PDFService: require('./pdf.service'),
    EmailService: require('./email.service'),
    ExternalService: require('./external.service'),
    InternalAuthService: require('./internal-auth.service')
  };