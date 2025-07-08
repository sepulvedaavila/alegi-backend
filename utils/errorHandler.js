// utils/errorHandler.js

// Assumes supabase client is initialized elsewhere and imported here
const { createClient } = require('@supabase/supabase-js');

// Custom error classes
class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : {
      from: () => ({
        insert: () => Promise.resolve({ data: null, error: null })
      })
    };

class ErrorHandler {
  static async logError(caseId, step, error, context = {}) {
    await supabase
      .from('case_processing_log')
      .insert({
        case_id: caseId,
        step_name: step,
        status: 'failed',
        error_message: error.message,
        data: context
      });
  }

  static async logStep(caseId, step, status, data = {}) {
    await supabase
      .from('case_processing_log')
      .insert({
        case_id: caseId,
        step_name: step,
        status,
        data: data,
        [status === 'completed' ? 'completed_at' : 'started_at']: new Date().toISOString()
      });
  }
}

// Add the missing handleError function that's being imported by endpoint files
const handleError = (error, res, context = {}) => {
  console.error('API Error:', error);
  console.error('Context:', context);
  
  // Log error to database if caseId is available
  if (context.caseId) {
    ErrorHandler.logError(context.caseId, context.operation || 'unknown', error, context).catch(console.error);
  }
  
  // Determine appropriate status code
  let statusCode = 500;
  let message = 'Internal Server Error';
  
  if (error.message?.includes('Unauthorized') || error.message?.includes('No authorization')) {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.message?.includes('not found') || error.message?.includes('Case not found')) {
    statusCode = 404;
    message = 'Not Found';
  } else if (error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
    statusCode = 429;
    message = 'Too Many Requests';
  } else if (error.message?.includes('validation') || error.message?.includes('required')) {
    statusCode = 400;
    message = 'Bad Request';
  }
  
  // Send error response
  res.status(statusCode).json({
    error: message,
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
};

module.exports = { ErrorHandler, handleError, UnauthorizedError }; 