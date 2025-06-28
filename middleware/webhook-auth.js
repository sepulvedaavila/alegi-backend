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

module.exports = { verifySupabaseWebhook };