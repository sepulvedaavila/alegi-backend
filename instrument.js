const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://75ad6b038fc5c4e13419c7959bf04cfb@o4509578896605184.ingest.us.sentry.io/4509578899685376",

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,

  // Performance monitoring
  tracesSampleRate: 1.0,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: process.env.VERCEL_GIT_COMMIT_SHA || '1.0.0',

  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Configure integrations
  integrations: [
    // Enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // Enable Express.js middleware tracing
    new Sentry.Integrations.Express({ app: true }),
  ],

  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
}); 