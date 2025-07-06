const Sentry = require('@sentry/node');

function handleError(error, res, context = {}) {
  console.error('API Error:', error);
  
  // Capture in Sentry with context
  Sentry.captureException(error, {
    extra: context,
    tags: {
      api_version: '1.0',
      environment: process.env.NODE_ENV
    }
  });
  
  // Determine status code
  let statusCode = 500;
  let message = 'Internal server error';
  
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Invalid request data';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (error.message?.includes('Rate limit')) {
    statusCode = 429;
    message = error.message;
  }
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error.message
    })
  });
}

// Custom error classes
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

module.exports = { 
  handleError, 
  ValidationError, 
  UnauthorizedError, 
  NotFoundError 
}; 