-- Alegi Backend Database Schema Updates
-- Run these migrations on your Supabase instance

-- Add processing status fields to cases table
ALTER TABLE cases 
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ai_processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_ai_update TIMESTAMP,
ADD COLUMN IF NOT EXISTS success_probability INTEGER CHECK (success_probability >= 0 AND success_probability <= 100),
ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMP;

-- Create processing errors table
CREATE TABLE IF NOT EXISTS processing_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT
);

-- Create AI enrichment errors table
CREATE TABLE IF NOT EXISTS ai_enrichment_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_type VARCHAR(100),
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Update case_documents table
ALTER TABLE case_documents
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS extracted_text TEXT,
ADD COLUMN IF NOT EXISTS extracted_text_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS extraction_error TEXT,
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
ADD COLUMN IF NOT EXISTS page_count INTEGER;

-- Update case_ai_enrichment table
ALTER TABLE case_ai_enrichment
ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS model_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS precedents JSONB,
ADD COLUMN IF NOT EXISTS recommendations JSONB,
ADD COLUMN IF NOT EXISTS risk_assessment JSONB;

-- Create webhook logs table for debugging
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id UUID,
  payload JSONB NOT NULL,
  processing_status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create queue jobs table for tracking
CREATE TABLE IF NOT EXISTS queue_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50) NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_processing_status ON cases(processing_status);
CREATE INDEX IF NOT EXISTS idx_cases_ai_processed ON cases(ai_processed);
CREATE INDEX IF NOT EXISTS idx_case_documents_processed ON case_documents(processed);
CREATE INDEX IF NOT EXISTS idx_case_documents_case_id ON case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_ai_enrichment_case_id ON case_ai_enrichment(case_id);
CREATE INDEX IF NOT EXISTS idx_processing_errors_case_id ON processing_errors(case_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_case_id ON queue_jobs(case_id);

-- Create functions for webhook triggers
CREATE OR REPLACE FUNCTION notify_case_created()
RETURNS TRIGGER AS $
BEGIN
  PERFORM pg_notify(
    'case_created',
    json_build_object(
      'id', NEW.id,
      'type', 'INSERT',
      'table', 'cases',
      'record', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_document_uploaded()
RETURNS TRIGGER AS $
BEGIN
  PERFORM pg_notify(
    'document_uploaded',
    json_build_object(
      'id', NEW.id,
      'case_id', NEW.case_id,
      'type', 'INSERT',
      'table', 'case_documents',
      'record', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_case_created ON cases;
CREATE TRIGGER trigger_case_created
AFTER INSERT ON cases
FOR EACH ROW
EXECUTE FUNCTION notify_case_created();

DROP TRIGGER IF EXISTS trigger_document_uploaded ON case_documents;
CREATE TRIGGER trigger_document_uploaded
AFTER INSERT ON case_documents
FOR EACH ROW
EXECUTE FUNCTION notify_document_uploaded();

-- Create views for monitoring
CREATE OR REPLACE VIEW case_processing_status AS
SELECT 
  c.id,
  c.case_name,
  c.processing_status,
  c.ai_processed,
  c.last_ai_update,
  c.success_probability,
  c.risk_level,
  COUNT(DISTINCT cd.id) as document_count,
  COUNT(DISTINCT cd.id) FILTER (WHERE cd.processed = true) as processed_document_count,
  COUNT(DISTINCT pe.id) as error_count,
  MAX(pe.created_at) as last_error_at
FROM cases c
LEFT JOIN case_documents cd ON c.id = cd.case_id
LEFT JOIN processing_errors pe ON c.id = pe.case_id
GROUP BY c.id;

-- Create materialized view for analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS case_analytics AS
SELECT 
  DATE_TRUNC('day', c.created_at) as date,
  COUNT(DISTINCT c.id) as total_cases,
  COUNT(DISTINCT c.id) FILTER (WHERE c.ai_processed = true) as ai_processed_cases,
  COUNT(DISTINCT c.id) FILTER (WHERE c.processing_status = 'completed') as completed_cases,
  COUNT(DISTINCT c.id) FILTER (WHERE c.processing_status = 'error') as error_cases,
  AVG(c.success_probability) as avg_success_probability,
  COUNT(DISTINCT c.id) FILTER (WHERE c.risk_level = 'high') as high_risk_cases,
  COUNT(DISTINCT c.id) FILTER (WHERE c.risk_level = 'medium') as medium_risk_cases,
  COUNT(DISTINCT c.id) FILTER (WHERE c.risk_level = 'low') as low_risk_cases
FROM cases c
GROUP BY DATE_TRUNC('day', c.created_at);

-- Refresh materialized view daily
CREATE OR REPLACE FUNCTION refresh_case_analytics()
RETURNS void AS $
BEGIN
  REFRESH MATERIALIZED VIEW case_analytics;
END;
$ LANGUAGE plpgsql;

-- Grant permissions (adjust based on your Supabase setup)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;