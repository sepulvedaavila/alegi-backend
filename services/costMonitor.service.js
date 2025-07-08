// services/costMonitor.service.js - Cost monitoring service

class CostMonitorService {
  constructor() {
    this.costs = new Map();
    this.limits = {
      daily: 100, // $100 per day
      monthly: 2000, // $2000 per month
      total: 10000 // $10000 total
    };
  }

  async trackCost(service, cost, userId = 'default') {
    try {
      const now = new Date();
      const dayKey = now.toISOString().split('T')[0];
      const monthKey = now.toISOString().substring(0, 7); // YYYY-MM

      if (!this.costs.has(userId)) {
        this.costs.set(userId, {
          daily: new Map(),
          monthly: new Map(),
          total: 0
        });
      }

      const userCosts = this.costs.get(userId);

      // Update daily costs
      const dailyCost = userCosts.daily.get(dayKey) || 0;
      userCosts.daily.set(dayKey, dailyCost + cost);

      // Update monthly costs
      const monthlyCost = userCosts.monthly.get(monthKey) || 0;
      userCosts.monthly.set(monthKey, monthlyCost + cost);

      // Update total costs
      userCosts.total += cost;

      console.log(`Cost tracked: $${cost} for ${service} (user: ${userId})`);

      return {
        success: true,
        cost,
        service,
        userId,
        dailyTotal: userCosts.daily.get(dayKey),
        monthlyTotal: userCosts.monthly.get(monthKey),
        totalCost: userCosts.total
      };
    } catch (error) {
      console.error('Error tracking cost:', error);
      throw error;
    }
  }

  async checkLimits(userId = 'default') {
    try {
      if (!this.costs.has(userId)) {
        return { withinLimits: true, limits: this.limits };
      }

      const userCosts = this.costs.get(userId);
      const now = new Date();
      const dayKey = now.toISOString().split('T')[0];
      const monthKey = now.toISOString().substring(0, 7);

      const dailyCost = userCosts.daily.get(dayKey) || 0;
      const monthlyCost = userCosts.monthly.get(monthKey) || 0;

      const limits = {
        daily: { limit: this.limits.daily, used: dailyCost, remaining: this.limits.daily - dailyCost },
        monthly: { limit: this.limits.monthly, used: monthlyCost, remaining: this.limits.monthly - monthlyCost },
        total: { limit: this.limits.total, used: userCosts.total, remaining: this.limits.total - userCosts.total }
      };

      const withinLimits = dailyCost <= this.limits.daily && 
                          monthlyCost <= this.limits.monthly && 
                          userCosts.total <= this.limits.total;

      return {
        withinLimits,
        limits,
        warnings: {
          daily: dailyCost > this.limits.daily * 0.8,
          monthly: monthlyCost > this.limits.monthly * 0.8,
          total: userCosts.total > this.limits.total * 0.8
        }
      };
    } catch (error) {
      console.error('Error checking limits:', error);
      throw error;
    }
  }

  getCosts(userId = 'default') {
    if (!this.costs.has(userId)) {
      return { daily: 0, monthly: 0, total: 0 };
    }

    const userCosts = this.costs.get(userId);
    const now = new Date();
    const dayKey = now.toISOString().split('T')[0];
    const monthKey = now.toISOString().substring(0, 7);

    return {
      daily: userCosts.daily.get(dayKey) || 0,
      monthly: userCosts.monthly.get(monthKey) || 0,
      total: userCosts.total
    };
  }

  resetCosts(userId = 'default') {
    this.costs.delete(userId);
  }
}

module.exports = new CostMonitorService(); 