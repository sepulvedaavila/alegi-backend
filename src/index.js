import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/auth.js';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter(100, 15 * 60 * 1000)); // 100 requests per 15 minutes

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('API Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent']
    });
    
    // Record metrics
    metrics.recordApiRequest(req.url, res.statusCode, duration);
  });
  
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Import and use API routes
import healthHandler from '../api/health.js';
import webhookHandler from '../api/cases/webhook.js';
import caseStatusHandler from '../api/cases/[id]/status.js';
import caseDocumentsHandler from '../api/cases/[id]/documents.js';
import casePredictionsHandler from '../api/cases/[id]/predictions.js';
import loginHandler from '../api/auth/login.js';
import refreshHandler from '../api/auth/refresh.js';

// Route handlers
app.get('/api/health', healthHandler);
app.post('/api/cases/webhook', webhookHandler);

// Case routes with dynamic ID
app.get('/api/cases/:id/status', (req, res) => {
  req.query.id = req.params.id;
  caseStatusHandler(req, res);
});

app.get('/api/cases/:id/documents', (req, res) => {
  req.query.id = req.params.id;
  caseDocumentsHandler(req, res);
});

app.post('/api/cases/:id/documents', (req, res) => {
  req.query.id = req.params.id;
  caseDocumentsHandler(req, res);
});

app.get('/api/cases/:id/predictions', (req, res) => {
  req.query.id = req.params.id;
  casePredictionsHandler(req, res);
});

// Auth routes
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/refresh', refreshHandler);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, {
      environment: process.env.NODE_ENV || 'development',
      port: PORT
    });
  });
}

export default app;