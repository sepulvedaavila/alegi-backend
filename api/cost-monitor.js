const { costMonitor } = require('../services');
const { validateSupabaseToken } = require('../middleware/auth');
const { applyCorsHeaders } = require('../utils/cors-helper');

module.exports = async (req, res) => {
  // Apply CORS headers
  if (applyCorsHeaders(req, res)) {
    return; // Request was handled (OPTIONS)
  }
  try {
    // Validate user authentication
    const user = await validateSupabaseToken(req);
    
    const { days = 7, operation } = req.query;
    
    // Start cost monitoring for this request
    costMonitor.startOperation('cost_monitor_request', { user: user.id, days });
    
    let result;
    
    switch (operation) {
      case 'trends':
        result = await costMonitor.getCostTrends(parseInt(days));
        break;
        
      case 'recommendations':
        result = {
          recommendations: costMonitor.getOptimizationRecommendations(),
          currentSummary: costMonitor.getCostSummary()
        };
        break;
        
      case 'summary':
        result = costMonitor.getCostSummary();
        break;
        
      default:
        // Return comprehensive cost analysis
        const trends = await costMonitor.getCostTrends(parseInt(days));
        const recommendations = costMonitor.getOptimizationRecommendations();
        const summary = costMonitor.getCostSummary();
        
        result = {
          summary,
          trends,
          recommendations,
          cronJobOptimization: {
            currentJobs: 1, // We now have only 1 cron job
            maxJobs: 40, // Vercel Pro limit
            costSavings: '~75% reduction in cron costs',
            optimization: 'Consolidated 2 jobs into 1, removed AI analysis from cron'
          },
          aiCostOptimization: {
            strategy: 'On-demand AI analysis',
            benefit: 'AI costs only when users request analysis',
            potentialSavings: '~60% reduction in AI costs'
          }
        };
    }
    
    // Log the cost of this monitoring request
    await costMonitor.logCosts('cost_monitor', user.id);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Cost monitor error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 