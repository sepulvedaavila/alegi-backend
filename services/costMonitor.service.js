const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase for cost logging
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class CostMonitor {
  constructor() {
    this.startTime = Date.now();
    this.operations = [];
    this.aiCalls = 0;
    this.databaseQueries = 0;
  }

  // Track operation start
  startOperation(operationType, metadata = {}) {
    const operation = {
      type: operationType,
      startTime: Date.now(),
      metadata
    };
    this.operations.push(operation);
    return operation;
  }

  // Track operation completion
  endOperation(operationType, result = {}) {
    const operation = this.operations.find(op => op.type === operationType);
    if (operation) {
      operation.endTime = Date.now();
      operation.duration = operation.endTime - operation.startTime;
      operation.result = result;
    }
  }

  // Track AI call
  trackAICall(model, tokens = 0) {
    this.aiCalls++;
    this.operations.push({
      type: 'ai_call',
      model,
      tokens,
      timestamp: Date.now(),
      estimatedCost: this.estimateAICost(model, tokens)
    });
  }

  // Track database query
  trackDatabaseQuery(table, operation) {
    this.databaseQueries++;
    this.operations.push({
      type: 'database_query',
      table,
      operation,
      timestamp: Date.now()
    });
  }

  // Estimate AI cost based on model and tokens
  estimateAICost(model, tokens) {
    const costs = {
      'gpt-4-turbo-preview': 0.01, // $0.01 per 1K tokens (input)
      'gpt-4': 0.03,
      'gpt-3.5-turbo': 0.001
    };
    
    const costPer1K = costs[model] || 0.01;
    return (tokens / 1000) * costPer1K;
  }

  // Get cost summary
  getCostSummary() {
    const totalDuration = Date.now() - this.startTime;
    const aiCost = this.operations
      .filter(op => op.type === 'ai_call')
      .reduce((sum, op) => sum + (op.estimatedCost || 0), 0);
    
    const functionCost = this.estimateFunctionCost(totalDuration);
    
    return {
      totalDuration,
      aiCalls: this.aiCalls,
      databaseQueries: this.databaseQueries,
      aiCost: Math.round(aiCost * 100) / 100, // Round to 2 decimal places
      functionCost: Math.round(functionCost * 100) / 100,
      totalCost: Math.round((aiCost + functionCost) * 100) / 100,
      operations: this.operations
    };
  }

  // Estimate Vercel function cost
  estimateFunctionCost(durationMs) {
    // Vercel Pro pricing: $20/month for 1000 GB-hours
    // 1 GB-hour = 3,600,000 ms * 1 GB
    const gbHours = (durationMs / (1000 * 60 * 60)) * 1; // Assuming 1GB memory
    const costPerGbHour = 20 / 1000; // $20/1000 GB-hours
    return gbHours * costPerGbHour;
  }

  // Log costs to database
  async logCosts(operationName, userId = null) {
    try {
      const summary = this.getCostSummary();
      
      const costLog = {
        operation_name: operationName,
        user_id: userId,
        total_duration_ms: summary.totalDuration,
        ai_calls: summary.aiCalls,
        database_queries: summary.databaseQueries,
        ai_cost_usd: summary.aiCost,
        function_cost_usd: summary.functionCost,
        total_cost_usd: summary.totalCost,
        operations: summary.operations,
        timestamp: new Date().toISOString()
      };

      await supabase
        .from('cost_logs')
        .insert(costLog);

      console.log(`Cost logged for ${operationName}: $${summary.totalCost} (AI: $${summary.aiCost}, Function: $${summary.functionCost})`);
      
      return costLog;
    } catch (error) {
      console.error('Error logging costs:', error);
      return null;
    }
  }

  // Get cost trends
  async getCostTrends(days = 7) {
    try {
      const { data, error } = await supabase
        .from('cost_logs')
        .select('*')
        .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const trends = {
        totalCost: data.reduce((sum, log) => sum + log.total_cost_usd, 0),
        aiCost: data.reduce((sum, log) => sum + log.ai_cost_usd, 0),
        functionCost: data.reduce((sum, log) => sum + log.function_cost_usd, 0),
        totalOperations: data.length,
        averageCostPerOperation: data.length > 0 ? 
          data.reduce((sum, log) => sum + log.total_cost_usd, 0) / data.length : 0,
        dailyBreakdown: this.groupByDay(data)
      };

      return trends;
    } catch (error) {
      console.error('Error getting cost trends:', error);
      return null;
    }
  }

  // Group costs by day
  groupByDay(data) {
    const daily = {};
    data.forEach(log => {
      const date = log.timestamp.split('T')[0];
      if (!daily[date]) {
        daily[date] = {
          totalCost: 0,
          aiCost: 0,
          functionCost: 0,
          operations: 0
        };
      }
      daily[date].totalCost += log.total_cost_usd;
      daily[date].aiCost += log.ai_cost_usd;
      daily[date].functionCost += log.function_cost_usd;
      daily[date].operations += 1;
    });
    return daily;
  }

  // Get cost optimization recommendations
  getOptimizationRecommendations() {
    const summary = this.getCostSummary();
    const recommendations = [];

    if (summary.aiCost > summary.functionCost * 2) {
      recommendations.push({
        type: 'ai_optimization',
        priority: 'high',
        message: 'AI costs are significantly higher than function costs. Consider batching AI calls or using cheaper models.',
        potentialSavings: Math.round(summary.aiCost * 0.3 * 100) / 100
      });
    }

    if (summary.aiCalls > 10) {
      recommendations.push({
        type: 'ai_batching',
        priority: 'medium',
        message: 'High number of AI calls detected. Consider implementing request batching.',
        potentialSavings: Math.round(summary.aiCost * 0.2 * 100) / 100
      });
    }

    if (summary.databaseQueries > 50) {
      recommendations.push({
        type: 'database_optimization',
        priority: 'medium',
        message: 'High number of database queries. Consider implementing query caching.',
        potentialSavings: Math.round(summary.functionCost * 0.1 * 100) / 100
      });
    }

    return recommendations;
  }
}

// Export singleton instance
module.exports = new CostMonitor(); 