// services/realtime.service.js - Real-time communication service

class RealtimeService {
  constructor() {
    this.connections = new Map();
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesSent: 0
    };
  }

  isRealtimeAvailable() {
    // WebSocket not available on Vercel, so return false
    return false;
  }

  getRealtimeStats() {
    return {
      ...this.stats,
      available: this.isRealtimeAvailable()
    };
  }

  broadcastToUser(userId, event, data) {
    // Placeholder for real-time broadcasting
    console.log(`Broadcasting to user ${userId}:`, { event, data });
    this.stats.messagesSent++;
  }

  broadcastToCase(caseId, event, data) {
    // Placeholder for case-specific broadcasting
    console.log(`Broadcasting to case ${caseId}:`, { event, data });
    this.stats.messagesSent++;
  }
}

module.exports = new RealtimeService(); 