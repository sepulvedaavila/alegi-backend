// services/error-tracking.service.js - Error tracking and monitoring

class ErrorTrackingService {
  constructor() {
    this.errors = [];
    this.maxErrors = 1000; // Keep last 1000 errors
  }

  captureException(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context: context,
      type: error.constructor.name
    };

    this.errors.push(errorEntry);

    // Keep only the last maxErrors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error captured:', errorEntry);
    }

    return errorEntry;
  }

  captureMessage(message, level = 'error', context = {}) {
    const messageEntry = {
      timestamp: new Date().toISOString(),
      message: message,
      level: level,
      context: context
    };

    this.errors.push(messageEntry);

    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    return messageEntry;
  }

  getRecentErrors(limit = 50) {
    return this.errors.slice(-limit);
  }

  getErrorsByType(type) {
    return this.errors.filter(error => error.type === type);
  }

  clearErrors() {
    this.errors = [];
  }
}

module.exports = new ErrorTrackingService(); 