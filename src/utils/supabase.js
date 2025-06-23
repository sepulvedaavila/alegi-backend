import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Create Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Verify webhook signature
export function verifyWebhookSignature(payload, signature) {
  try {
    const secret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SUPABASE_WEBHOOK_SECRET not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

// Get user from JWT token
export async function getUserFromToken(token) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      throw error;
    }
    
    return user;
  } catch (error) {
    console.error('Error getting user from token:', error);
    return null;
  }
}

// Create database trigger function
export async function createDatabaseTrigger(tableName, eventType) {
  try {
    const { error } = await supabase.rpc('create_trigger', {
      table_name: tableName,
      event_type: eventType
    });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error creating database trigger:', error);
    throw error;
  }
} 