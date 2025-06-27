# Alegi Backend

AI-powered litigation platform backend built with Node.js, Express, and AWS services.

## 🏗 Architecture Overview

The backend follows a microservices architecture with event-driven processing:

- **Webhook Handler**: Receives Supabase database triggers
- **Event Router**: Distributes events to appropriate processing queues
- **Document Processor**: AWS Lambda functions for PDF/document processing
- **AI Enrichment Service**: Integrates with OpenAI for legal analysis
- **API Gateway**: RESTful API endpoints via Vercel/Express

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- AWS CLI configured
- Redis 6+
- MongoDB (optional, for local development)

### Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/sepulvedaavila/alegi-backend.git
cd alegi-backend
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Configure your `.env` file with required credentials (see Environment Variables section)

5. Start development services:
```bash
docker-compose up -d
```

6. Run the application:
```bash
npm run dev
```

## 📁 Project Structure

```
alegi-backend/
├── api/                    # Vercel API routes
│   ├── health.js
│   ├── cases/
│   │   ├── webhook.js
│   │   └── [id]/
│   │       ├── status.js
│   │       ├── documents.js
│   │       └── predictions.js
│   └── auth/
│       ├── login.js
│       └── refresh.js
├── src/
│   ├── services/          # Core business logic
│   │   ├── webhook-handler/
│   │   ├── event-processor/
│   │   ├── ai-enrichment/
│   │   └── document-processor/
│   ├── queues/           # Bull queue definitions
│   │   ├── document.queue.js
│   │   └── ai.queue.js
│   ├── utils/            # Utilities
│   │   ├── supabase.js
│   │   ├── aws.js
│   │   ├── metrics.js
│   │   └── logger.js
│   └── middleware/       # Express middleware
│       ├── auth.js
│       ├── rateLimiter.js
│       └── errorHandler.js
├── lambda/               # AWS Lambda functions
│   └── document-processor/
├── terraform/           # Infrastructure as Code
├── tests/              # Test files
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 🔧 Environment Variables

Create a `.env` file with the following variables:

```env
# Supabase
SUPABASE_URL=https://zunckttwoeuacolbgpnu.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_WEBHOOK_SECRET=your-webhook-secret

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=alegi-documents
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/alegi-case-events

# Redis (for Bull queues)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# OpenAI
OPENAI_API_KEY=your-openai-key

# MongoDB (optional for local dev)
MONGODB_URI=mongodb://localhost:27017/alegi

# API Keys
API_SECRET_KEY=your-api-secret

# Monitoring
SENTRY_DSN=your-sentry-dsn

# Environment
NODE_ENV=development
PORT=3000
```

## 🔌 API Endpoints

### Health Check
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed system status

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token

### Cases
- `POST /api/cases/webhook` - Supabase webhook receiver
- `GET /api/cases/:id/status` - Get case processing status
- `GET /api/cases/:id/documents` - List case documents
- `POST /api/cases/:id/documents` - Upload document
- `GET /api/cases/:id/predictions` - Get AI predictions

### Webhooks
- `POST /api/webhooks/supabase/case-created`
- `POST /api/webhooks/supabase/document-uploaded`
- `POST /api/webhooks/supabase/case-updated`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Deploy to Vercel
```bash
vercel deploy --prod
```

### Deploy Lambda Functions
```bash
npm run deploy:lambda
```

## 📊 Monitoring

The backend includes comprehensive monitoring:

- **Health Checks**: `/api/health` endpoint
- **Metrics**: AWS CloudWatch integration
- **Logging**: Winston logger with Sentry integration
- **Tracing**: OpenTelemetry support

## 🔒 Security

- JWT authentication with refresh tokens
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS configuration
- Webhook signature verification
- Secrets management with AWS Secrets Manager

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.