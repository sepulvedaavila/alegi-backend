import { verifyWebhookSignature } from '../../src/utils/supabase.js';
import { processWebhookEvent } from '../../src/services/webhook-handler/index.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Verify webhook signature
    const signature = req.headers['x-supabase-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    const isValid = verifyWebhookSignature(req.body, signature);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Process the webhook event
    const result = await processWebhookEvent(req.body);
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}