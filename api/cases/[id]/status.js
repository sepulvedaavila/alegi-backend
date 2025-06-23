import { getCaseStatus } from '../../../src/services/event-processor/index.js';
import { authenticateUser } from '../../../src/middleware/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;
    const status = await getCaseStatus(id, user.id);
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Case status error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
} 