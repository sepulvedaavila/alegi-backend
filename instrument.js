// instrument.js
const Sentry = require("@sentry/node");

// Only initialize Sentry if DSN is provided and not already initialized
if (process.env.SENTRY_DSN && !Sentry.getClient()) {
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      
      // Serverless optimizations
      beforeSend(event) {
        // Filter out certain errors in production
        if (process.env.NODE_ENV === 'production') {
          // You can add filtering logic here
        }
        return event;
      },

      // Reduce integrations for serverless
      integrations: [
        new Sentry.Integrations.Http({ tracing: false }),
      ],
      
      // Disable performance monitoring in production to reduce overhead
      enableTracing: process.env.NODE_ENV !== 'production',
    });
  } catch (error) {
    console.warn('Failed to initialize Sentry:', error.message);
  }
}

module.exports = Sentry;