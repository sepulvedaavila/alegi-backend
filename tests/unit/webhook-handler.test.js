import { jest } from '@jest/globals';
import { processWebhookEvent } from '../../src/services/webhook-handler/index.js';

// Mock dependencies
jest.mock('../../src/utils/logger.js');
jest.mock('../../src/queues/document.queue.js');

describe('Webhook Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processWebhookEvent', () => {
    it('should handle case created event', async () => {
      const event = {
        type: 'INSERT',
        table: 'cases',
        record: { id: '123', title: 'Test Case' }
      };

      const result = await processWebhookEvent(event);

      expect(result).toEqual({
        success: true,
        processed: true
      });
    });

    it('should handle document uploaded event', async () => {
      const event = {
        type: 'INSERT',
        table: 'documents',
        record: { 
          id: '456', 
          case_id: '123',
          filename: 'test.pdf'
        }
      };

      const result = await processWebhookEvent(event);

      expect(result).toEqual({
        success: true,
        processed: true
      });
    });

    it('should handle case updated event', async () => {
      const event = {
        type: 'UPDATE',
        table: 'cases',
        record: { id: '123', status: 'updated' }
      };

      const result = await processWebhookEvent(event);

      expect(result).toEqual({
        success: true,
        processed: true
      });
    });

    it('should handle unknown event type', async () => {
      const event = {
        type: 'DELETE',
        table: 'cases',
        record: { id: '123' }
      };

      const result = await processWebhookEvent(event);

      expect(result).toEqual({
        success: true,
        processed: true
      });
    });

    it('should throw error on processing failure', async () => {
      const event = {
        type: 'INSERT',
        table: 'cases',
        record: { id: '123' }
      };

      // Mock queue to throw error
      const { addToQueue } = await import('../../src/queues/document.queue.js');
      addToQueue.mockRejectedValue(new Error('Queue error'));

      await expect(processWebhookEvent(event)).rejects.toThrow('Queue error');
    });
  });
}); 