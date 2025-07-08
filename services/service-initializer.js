// services/service-initializer.js - Centralized service initialization

const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

class ServiceInitializer {
  constructor() {
    this.services = {};
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return this.services;
    }

    try {
      // Initialize Supabase
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        this.services.supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        console.log('Supabase service initialized');
      } else {
        console.warn('Supabase credentials not configured');
      }

      // Initialize OpenAI
      if (process.env.OPENAI_API_KEY) {
        this.services.openai = new OpenAI({ 
          apiKey: process.env.OPENAI_API_KEY 
        });
        console.log('OpenAI service initialized');
      } else {
        console.warn('OpenAI API key not configured');
      }

      // Initialize other services as needed
      this.services.rateLimiter = require('./rateLimiter');
      this.services.errorHandler = require('../utils/errorHandler').ErrorHandler;

      this.initialized = true;
      console.log('All services initialized successfully');
      
      return this.services;
    } catch (error) {
      console.error('Service initialization failed:', error);
      throw error;
    }
  }

  getService(name) {
    if (!this.initialized) {
      throw new Error('Services not initialized. Call initialize() first.');
    }
    return this.services[name];
  }

  getAllServices() {
    if (!this.initialized) {
      throw new Error('Services not initialized. Call initialize() first.');
    }
    return this.services;
  }

  isHealthy() {
    return this.initialized && 
           this.services.supabase && 
           this.services.openai;
  }
}

// Export singleton instance
const serviceInitializer = new ServiceInitializer();
module.exports = serviceInitializer; 