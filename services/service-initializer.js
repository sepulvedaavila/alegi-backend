class ServiceInitializer {
  constructor() {
    this.services = {
      openai: null,
      supabase: null,
      pdfco: null,
      email: null,
      costMonitor: null
    };
    this.initialized = false;
  }

  async initialize() {
    console.log('Initializing backend services...');
    
    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      try {
        const { OpenAI } = require('openai');
        this.services.openai = new OpenAI({ 
          apiKey: process.env.OPENAI_API_KEY 
        });
        console.log('✓ OpenAI initialized');
      } catch (error) {
        console.error('✗ OpenAI initialization failed:', error.message);
      }
    } else {
      console.warn('⚠ OpenAI API key not configured');
    }
    
    // Initialize Supabase
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        this.services.supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        console.log('✓ Supabase initialized');
      } catch (error) {
        console.error('✗ Supabase initialization failed:', error.message);
      }
    } else {
      console.warn('⚠ Supabase credentials not configured');
    }
    
    // Initialize PDFco
    if (process.env.PDF_CO_API_KEY) {
      try {
        this.services.pdfco = require('./pdfco.service');
        console.log('✓ PDFco initialized');
      } catch (error) {
        console.error('✗ PDFco initialization failed:', error.message);
      }
    } else {
      console.warn('⚠ PDFco API key not configured');
    }
    
    // Initialize Email service
    try {
      this.services.email = require('./email.service');
      console.log('✓ Email service initialized');
    } catch (error) {
      console.error('✗ Email service initialization failed:', error.message);
    }
    
    // Initialize Cost Monitor service (with error handling)
    try {
      this.services.costMonitor = require('./costMonitor.service');
      console.log('✓ Cost Monitor service initialized');
    } catch (error) {
      console.error('✗ Cost Monitor service initialization failed:', error.message);
    }
    
    this.initialized = true;
    return this.services;
  }

  getService(name) {
    if (!this.initialized) {
      console.error('Services not initialized');
      return null;
    }
    return this.services[name];
  }

  isServiceAvailable(name) {
    return this.services[name] !== null;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      services: {
        openai: this.isServiceAvailable('openai'),
        supabase: this.isServiceAvailable('supabase'),
        pdfco: this.isServiceAvailable('pdfco'),
        email: this.isServiceAvailable('email'),
        costMonitor: this.isServiceAvailable('costMonitor')
      }
    };
  }
}

module.exports = new ServiceInitializer(); 