const Sentry = require('@sentry/node');

class APIError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

class UnauthorizedError extends APIError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class NotFoundError extends APIError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

class ValidationError extends APIError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

class RateLimitError extends APIError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
  }
}

const handleError = (error, res, context = {}) => {
  // Log error details
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    context
  });

  // Report to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: context,
      level: 'error'
    });
  }

  // Send appropriate response
  if (error instanceof APIError) {
    return res.status(error.statusCode).json({
      error: error.message,
      type: error.constructor.name
    });
  }

  // Handle specific errors
  if (error.message?.includes('Rate limit')) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.'
    });
  }

  if (error.message?.includes('Network')) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'External service is temporarily unavailable.'
    });
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
  });
};

module.exports = {
  APIError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  handleError
}; 