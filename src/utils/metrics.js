import AWS from 'aws-sdk';
import { logger } from './logger.js';

// Initialize CloudWatch
const cloudwatch = new AWS.CloudWatch({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Custom metrics class
class Metrics {
  constructor() {
    this.namespace = 'Alegi/Backend';
    this.metrics = [];
  }

  // Add metric to batch
  addMetric(metricName, value, unit = 'Count', dimensions = []) {
    this.metrics.push({
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Dimensions: dimensions,
      Timestamp: new Date()
    });
  }

  // Record API request
  recordApiRequest(endpoint, statusCode, duration) {
    this.addMetric('ApiRequests', 1, 'Count', [
      { Name: 'Endpoint', Value: endpoint },
      { Name: 'StatusCode', Value: statusCode.toString() }
    ]);

    this.addMetric('ApiResponseTime', duration, 'Milliseconds', [
      { Name: 'Endpoint', Value: endpoint }
    ]);
  }

  // Record document processing
  recordDocumentProcessing(documentId, status, duration) {
    this.addMetric('DocumentProcessing', 1, 'Count', [
      { Name: 'Status', Value: status }
    ]);

    if (duration) {
      this.addMetric('DocumentProcessingTime', duration, 'Milliseconds', [
        { Name: 'Status', Value: status }
      ]);
    }
  }

  // Record queue metrics
  recordQueueMetrics(queueName, jobCount, status) {
    this.addMetric('QueueJobs', jobCount, 'Count', [
      { Name: 'QueueName', Value: queueName },
      { Name: 'Status', Value: status }
    ]);
  }

  // Record AI processing
  recordAIProcessing(action, duration, success) {
    this.addMetric('AIProcessing', 1, 'Count', [
      { Name: 'Action', Value: action },
      { Name: 'Success', Value: success.toString() }
    ]);

    if (duration) {
      this.addMetric('AIProcessingTime', duration, 'Milliseconds', [
        { Name: 'Action', Value: action }
      ]);
    }
  }

  // Send metrics to CloudWatch
  async sendMetrics() {
    if (this.metrics.length === 0) {
      return;
    }

    try {
      // CloudWatch allows max 20 metrics per request
      const batchSize = 20;
      for (let i = 0; i < this.metrics.length; i += batchSize) {
        const batch = this.metrics.slice(i, i + batchSize);
        
        const params = {
          Namespace: this.namespace,
          MetricData: batch
        };

        await cloudwatch.putMetricData(params).promise();
      }

      logger.info('Metrics sent to CloudWatch', { count: this.metrics.length });
      this.metrics = []; // Clear metrics after sending
    } catch (error) {
      logger.error('Error sending metrics to CloudWatch', { error: error.message });
    }
  }

  // Auto-send metrics every minute
  startAutoSend() {
    setInterval(() => {
      this.sendMetrics();
    }, 60000); // 1 minute
  }
}

// Create singleton instance
const metrics = new Metrics();

// Start auto-sending metrics
if (process.env.NODE_ENV === 'production') {
  metrics.startAutoSend();
}

export { metrics }; 