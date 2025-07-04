const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class RealtimeService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map of userId -> Set of WebSocket connections
    this.connections = new Map(); // Map of WebSocket -> { userId, caseId }
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('WebSocket server initialized on /ws');
  }

  handleConnection(ws, req) {
    console.log('New WebSocket connection attempt');

    // Extract token from query string or headers
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.SUPABASE_WEBHOOK_SECRET);
      const userId = decoded.sub || decoded.user_id;

      if (!userId) {
        ws.close(1008, 'Invalid token: missing user ID');
        return;
      }

      // Store connection info
      this.connections.set(ws, { userId, caseId: null });

      // Add to clients map
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connection_established',
        userId,
        timestamp: new Date().toISOString()
      }));

      console.log(`WebSocket connected for user ${userId}`);

      // Handle incoming messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnection(ws);
      });

    } catch (error) {
      console.error('WebSocket authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  handleMessage(ws, data) {
    const connection = this.connections.get(ws);
    if (!connection) return;

    switch (data.type) {
      case 'subscribe_case':
        connection.caseId = data.caseId;
        ws.send(JSON.stringify({
          type: 'subscribed',
          caseId: data.caseId,
          timestamp: new Date().toISOString()
        }));
        break;

      case 'unsubscribe_case':
        connection.caseId = null;
        ws.send(JSON.stringify({
          type: 'unsubscribed',
          caseId: data.caseId,
          timestamp: new Date().toISOString()
        }));
        break;

      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type'
        }));
    }
  }

  handleDisconnection(ws) {
    const connection = this.connections.get(ws);
    if (connection) {
      const { userId } = connection;
      
      // Remove from clients map
      const userConnections = this.clients.get(userId);
      if (userConnections) {
        userConnections.delete(ws);
        if (userConnections.size === 0) {
          this.clients.delete(userId);
        }
      }

      // Remove from connections map
      this.connections.delete(ws);

      console.log(`WebSocket disconnected for user ${userId}`);
    }
  }

  // Send notification to specific user
  sendToUser(userId, notification) {
    const userConnections = this.clients.get(userId);
    if (!userConnections) {
      console.log(`No active connections for user ${userId}`);
      return;
    }

    const message = JSON.stringify({
      ...notification,
      timestamp: new Date().toISOString()
    });

    let sentCount = 0;
    userConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      }
    });

    console.log(`Sent notification to ${sentCount} connections for user ${userId}`);
  }

  // Send notification to users subscribed to a specific case
  sendToCaseSubscribers(caseId, notification) {
    let sentCount = 0;
    
    this.connections.forEach((connection, ws) => {
      if (connection.caseId === caseId && ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          ...notification,
          timestamp: new Date().toISOString()
        });
        ws.send(message);
        sentCount++;
      }
    });

    console.log(`Sent case notification to ${sentCount} subscribers for case ${caseId}`);
  }

  // Notify case processing started
  notifyCaseProcessingStarted(caseId, userId, caseData) {
    const notification = {
      type: 'case_processing_started',
      caseId,
      caseName: caseData.case_name,
      status: 'processing',
      message: 'Case is being analyzed by AI'
    };

    this.sendToUser(userId, notification);
    this.sendToCaseSubscribers(caseId, notification);
  }

  // Notify case processing completed
  notifyCaseProcessingCompleted(caseId, userId, caseData, results) {
    const notification = {
      type: 'case_processing_completed',
      caseId,
      caseName: caseData.case_name,
      status: 'completed',
      message: 'Case analysis complete',
      results: {
        hasEnrichment: !!results.enhancement,
        hasPrediction: !!results.prediction,
        caseType: results.enhancement?.enhanced_case_type,
        complexity: results.complexity
      }
    };

    this.sendToUser(userId, notification);
    this.sendToCaseSubscribers(caseId, notification);
  }

  // Notify case processing failed
  notifyCaseProcessingFailed(caseId, userId, caseData, error) {
    const notification = {
      type: 'case_processing_failed',
      caseId,
      caseName: caseData.case_name,
      status: 'failed',
      message: 'Case processing failed',
      error: error.message || 'Unknown error'
    };

    this.sendToUser(userId, notification);
    this.sendToCaseSubscribers(caseId, notification);
  }

  // Get connection statistics
  getStats() {
    return {
      totalConnections: this.wss?.clients?.size || 0,
      uniqueUsers: this.clients.size,
      connections: this.connections.size
    };
  }
}

module.exports = new RealtimeService(); 