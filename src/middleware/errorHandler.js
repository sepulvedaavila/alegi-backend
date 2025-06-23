import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userAgent: req.headers['user-agent']
  });

  // Record error metric
  metrics.addMetric('Errors', 1, 'Count', [
    { Name: 'Type', Value: err.name || 'Unknown' },
    { Name: 'Endpoint', Value: req.url }
  ]);

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Something went wrong'
    });
  }

  // Development error response
  res.status(500).json({
    error: err.name || 'Error',
    message: err.message,
    stack: err.stack
  });
}

export function notFoundHandler(req, res) {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method
  });

  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
} 