const EventEmitter = require('events');

class InMemoryQueue extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
    this.processing = new Map();
  }

  async add(queueName, data, options = {}) {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    
    const job = {
      id: Date.now() + Math.random(),
      data,
      options,
      status: 'waiting',
      createdAt: new Date()
    };
    
    this.queues.get(queueName).push(job);
    this.emit(`job:${queueName}`, job);
    
    return job;
  }

  process(queueName, handler) {
    this.on(`job:${queueName}`, async (job) => {
      if (this.processing.has(job.id)) return;
      
      this.processing.set(job.id, true);
      job.status = 'processing';
      
      try {
        await handler(job);
        job.status = 'completed';
      } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        console.error(`Job ${job.id} failed:`, error);
      } finally {
        this.processing.delete(job.id);
      }
    });
  }
}

module.exports = new InMemoryQueue();