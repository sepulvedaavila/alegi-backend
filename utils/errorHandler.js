// utils/errorHandler.js

// Assumes supabase client is initialized elsewhere and imported here
const { createClient } = require('@supabase/supabase-js');
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

module.exports = ErrorHandler; 