// middleware/webhook-auth.js
const crypto = require('crypto');

const verifySupabaseWebhook = (req, res, next) => {
  try {
    // For Supabase webhooks, we verify using the webhook secret
    const signature = req.headers['x-supabase-signature'];
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn('SUPABASE_WEBHOOK_SECRET not configured');
      return next(); // Allow in development
    }
    
    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }
    
    // Verify the signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    const signatureBuffer = Buffer.from(signature.replace('sha256=', ''), 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    next();
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

const verifyExternalWebhook = (req, res, next) => {
  try {
    // For external webhooks, we verify using a generic webhook secret
    const webhookSecret = process.env.EXTERNAL_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn('EXTERNAL_WEBHOOK_SECRET not configured');
      return next(); // Allow in development
    }
    
    // Log webhook source for monitoring
    const userAgent = req.headers['user-agent'];
    const host = req.headers['host'];
    const xForwardedFor = req.headers['x-forwarded-for'];
    
    console.log('External webhook received:', {
      userAgent: userAgent?.substring(0, 50),
      host: host,
      sourceIP: xForwardedFor?.split(',')[0],
      timestamp: new Date().toISOString()
    });
    
    // Validate the webhook payload structure
    const { type, table, record, schema, old_record } = req.body;
    
    if (!type || !table || !record) {
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }
    
    if (table !== 'case_briefs') {
      return res.status(400).json({ error: 'Unsupported table for webhook' });
    }
    
    if (type !== 'INSERT' && type !== 'UPDATE' && type !== 'DELETE') {
      return res.status(400).json({ error: 'Unsupported webhook type' });
    }
    
    // Validate required fields in the record
    if (!record.id || !record.user_id) {
      return res.status(400).json({ error: 'Missing required fields in record' });
    }
    
    // Optional: Verify webhook signature if provided
    const signature = req.headers['x-webhook-signature'];
    if (signature && webhookSecret) {
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }
    
    next();
  } catch (error) {
    console.error('External webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

module.exports = { verifySupabaseWebhook, verifyExternalWebhook };