const { supabaseService, errorTrackingService } = require('../../services');

module.exports = async (req, res) => {
  try {
    // Basic stats - adjust based on what's available
    const stats = {
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        supabase: !!supabaseService,
        ai: !!require('../../services/ai.service'),
        processing: !!require('../../services/processing.service')
      }
    };

    // Try to get processing stats if available
    if (supabaseService && typeof supabaseService.getProcessingStats === 'function') {
      try {
        stats.processing = await supabaseService.getProcessingStats();
      } catch (error) {
        console.error('Failed to get processing stats:', error);
        stats.processing = { error: error.message };
      }
    }

    // Try to get error stats if available
    if (errorTrackingService && typeof errorTrackingService.getErrorStats === 'function') {
      try {
        stats.errors = await errorTrackingService.getErrorStats();
      } catch (error) {
        console.error('Failed to get error stats:', error);
        stats.errors = { error: error.message };
      }
    }

    res.status(200).json(stats);
  } catch (error) {
    console.error('Monitoring stats error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};