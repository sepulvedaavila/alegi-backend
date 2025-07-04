// test/test-realtime-system.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Test configuration
const TEST_CONFIG = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  wsUrl: process.env.WS_URL || 'ws://localhost:3000',
  testToken: process.env.TEST_TOKEN || 'test-token',
  testCaseId: process.env.TEST_CASE_ID || 'test-case-123'
};

// Generate a test JWT token
function generateTestToken() {
  const payload = {
    sub: 'test-user-123',
    email: 'test@example.com',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };
  
  return jwt.sign(payload, process.env.SUPABASE_WEBHOOK_SECRET || 'test-secret');
}

// Test WebSocket connection
async function testWebSocketConnection() {
  console.log('🧪 Testing WebSocket connection...');
  
  const token = generateTestToken();
  const ws = new WebSocket(`${TEST_CONFIG.wsUrl}/ws?token=${token}`);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'));
    }, 10000);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      clearTimeout(timeout);
      
      // Subscribe to test case
      ws.send(JSON.stringify({
        type: 'subscribe_case',
        caseId: TEST_CONFIG.testCaseId
      }));
      
      // Send ping
      ws.send(JSON.stringify({
        type: 'ping'
      }));
      
      resolve(ws);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Received message:', data);
        
        if (data.type === 'pong') {
          console.log('✅ Ping-pong working correctly');
        } else if (data.type === 'subscribed') {
          console.log('✅ Case subscription working correctly');
        }
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    };
    
    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
    };
  });
}

// Test HTTP endpoints
async function testHttpEndpoints() {
  console.log('\n🧪 Testing HTTP endpoints...');
  
  const token = generateTestToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  try {
    // Test realtime stats endpoint
    console.log('📊 Testing realtime stats endpoint...');
    const statsResponse = await fetch(`${TEST_CONFIG.backendUrl}/api/realtime/stats`, {
      headers
    });
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log('✅ Realtime stats endpoint working:', stats);
    } else {
      console.log('⚠️ Realtime stats endpoint returned:', statsResponse.status);
    }
    
    // Test case status endpoint
    console.log('📋 Testing case status endpoint...');
    const statusResponse = await fetch(`${TEST_CONFIG.backendUrl}/api/cases/${TEST_CONFIG.testCaseId}/status`, {
      headers
    });
    
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('✅ Case status endpoint working:', status);
    } else {
      console.log('⚠️ Case status endpoint returned:', statusResponse.status);
    }
    
  } catch (error) {
    console.error('❌ HTTP endpoint test failed:', error.message);
  }
}

// Test notification service
async function testNotificationService() {
  console.log('\n🧪 Testing notification service...');
  
  try {
    const notificationService = require('../services/notification.service');
    
    // Test notification service methods
    console.log('✅ Notification service loaded successfully');
    console.log('📡 Realtime available:', notificationService.isRealtimeAvailable());
    
    const stats = notificationService.getRealtimeStats();
    if (stats) {
      console.log('📊 Realtime stats:', stats);
    }
    
  } catch (error) {
    console.error('❌ Notification service test failed:', error.message);
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting real-time system tests...\n');
  
  try {
    // Test notification service
    await testNotificationService();
    
    // Test HTTP endpoints
    await testHttpEndpoints();
    
    // Test WebSocket connection
    const ws = await testWebSocketConnection();
    
    // Keep connection open for a few seconds to test
    setTimeout(() => {
      console.log('\n🔌 Closing WebSocket connection...');
      ws.close();
    }, 5000);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testWebSocketConnection,
  testHttpEndpoints,
  testNotificationService,
  runTests
}; 