// services/costMonitor.service.js - Cost monitoring service
const { createClient } = require('@supabase/supabase-js');
const Sentry = require('@sentry/node');

class CostMonitorService {
  constructor() {
    // Initialize Supabase client
    this.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
    
    this.limits = {
      daily: 100, // $100 per day
      monthly: 2000, // $2000 per month
      total: 10000 // $10000 total
    };
  }

  // Log operation cost to cost_logs table as specified in CLAUDE.md
  async logOperationCost(operationName, userId, costs) {
    if (!this.supabase) {
      console.warn('Supabase not available - cost logging disabled');
      return;
    }

    try {
      const costLogEntry = {
        operation_name: operationName,
        user_id: userId,
        total_duration_ms: costs.duration || 0,
        ai_calls: costs.aiCalls || 0,
        ai_cost_usd: costs.aiCost || 0,
        function_cost_usd: costs.functionCost || 0,
        total_cost_usd: costs.totalCost || 0,
        operations: costs.operations || {},
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('cost_logs')
        .insert(costLogEntry);

      if (error) {
        console.error('Failed to log cost data:', error);
        Sentry.captureException(error, {
          tags: { service: 'cost-monitor', operation: 'logOperationCost' },
          extra: { operationName, userId, costs }
        });
        return;
      }

      console.log(`💰 Cost logged: ${operationName} - $${costs.totalCost} (user: ${userId})`);
      return data;
    } catch (error) {
      console.error('Cost logging error:', error);
      Sentry.captureException(error, {
        tags: { service: 'cost-monitor', operation: 'logOperationCost' },
        extra: { operationName, userId, costs }
      });
    }
  }

  // Legacy method - maintained for backward compatibility
  async trackCost(service, cost, userId = 'default') {
    try {
      // Use new cost logging method
      await this.logOperationCost(service, userId, {
        totalCost: cost,
        aiCost: cost, // Assume all cost is AI-related for legacy calls
        aiCalls: 1,
        duration: 0
      });

      // Get current totals for response
      const totals = await this.getCostTotals(userId);

      console.log(`Cost tracked: $${cost} for ${service} (user: ${userId})`);

      return {
        success: true,
        cost,
        service,
        userId,
        dailyTotal: totals.daily,
        monthlyTotal: totals.monthly,
        totalCost: totals.total
      };
    } catch (error) {
      console.error('Error tracking cost:', error);
      throw error;
    }
  }

  // Get cost totals from database
  async getCostTotals(userId) {
    if (!this.supabase) {
      return { daily: 0, monthly: 0, total: 0 };
    }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const thisMonth = now.toISOString().substring(0, 7); // YYYY-MM

      // Get daily costs
      const { data: dailyData } = await this.supabase
        .from('cost_logs')
        .select('total_cost_usd')
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`);

      // Get monthly costs
      const { data: monthlyData } = await this.supabase
        .from('cost_logs')
        .select('total_cost_usd')
        .eq('user_id', userId)
        .gte('created_at', `${thisMonth}-01T00:00:00.000Z`)
        .lt('created_at', `${thisMonth}-31T23:59:59.999Z`);

      // Get total costs
      const { data: totalData } = await this.supabase
        .from('cost_logs')
        .select('total_cost_usd')
        .eq('user_id', userId);

      const daily = (dailyData || []).reduce((sum, log) => sum + (log.total_cost_usd || 0), 0);
      const monthly = (monthlyData || []).reduce((sum, log) => sum + (log.total_cost_usd || 0), 0);
      const total = (totalData || []).reduce((sum, log) => sum + (log.total_cost_usd || 0), 0);

      return { daily, monthly, total };
    } catch (error) {
      console.error('Error getting cost totals:', error);
      return { daily: 0, monthly: 0, total: 0 };
    }
  }

  async checkLimits(userId = 'default') {
    try {
      const totals = await this.getCostTotals(userId);

      const limits = {
        daily: { limit: this.limits.daily, used: totals.daily, remaining: this.limits.daily - totals.daily },
        monthly: { limit: this.limits.monthly, used: totals.monthly, remaining: this.limits.monthly - totals.monthly },
        total: { limit: this.limits.total, used: totals.total, remaining: this.limits.total - totals.total }
      };

      const withinLimits = totals.daily <= this.limits.daily && 
                          totals.monthly <= this.limits.monthly && 
                          totals.total <= this.limits.total;

      return {
        withinLimits,
        limits,
        warnings: {
          daily: totals.daily > this.limits.daily * 0.8,
          monthly: totals.monthly > this.limits.monthly * 0.8,
          total: totals.total > this.limits.total * 0.8
        }
      };
    } catch (error) {
      console.error('Error checking limits:', error);
      throw error;
    }
  }

  // Alias for getCostTotals for backward compatibility
  async getCosts(userId = 'default') {
    return await this.getCostTotals(userId);
  }

  // Get detailed cost breakdown from database
  async getCostBreakdown(userId, options = {}) {
    if (!this.supabase) {
      return { operations: [], total: 0, breakdown: {} };
    }

    try {
      let query = this.supabase
        .from('cost_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply date filters if provided
      if (options.startDate) {
        query = query.gte('created_at', options.startDate);
      }
      if (options.endDate) {
        query = query.lte('created_at', options.endDate);
      }

      // Apply limit
      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      const operations = data || [];
      const total = operations.reduce((sum, op) => sum + (op.total_cost_usd || 0), 0);
      
      // Group by operation name
      const breakdown = operations.reduce((acc, op) => {
        const name = op.operation_name;
        if (!acc[name]) {
          acc[name] = { count: 0, cost: 0, aiCalls: 0 };
        }
        acc[name].count += 1;
        acc[name].cost += op.total_cost_usd || 0;
        acc[name].aiCalls += op.ai_calls || 0;
        return acc;
      }, {});

      return { operations, total, breakdown };
    } catch (error) {
      console.error('Error getting cost breakdown:', error);
      return { operations: [], total: 0, breakdown: {} };
    }
  }

  // Reset costs for testing (optional - only delete logs if specifically requested)
  async resetCosts(userId = 'default', permanent = false) {
    if (!permanent) {
      console.warn('Cost reset called but permanent=false - no action taken');
      return;
    }

    if (!this.supabase) {
      console.warn('Supabase not available - cannot reset costs');
      return;
    }

    try {
      const { error } = await this.supabase
        .from('cost_logs')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      console.log(`Cost logs reset for user ${userId}`);
    } catch (error) {
      console.error('Error resetting costs:', error);
      throw error;
    }
  }
}

module.exports = new CostMonitorService(); 