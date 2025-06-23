import { getCaseDocuments, uploadDocument } from '../../../src/services/document-processor/index.js';
import { authenticateUser } from '../../../src/middleware/auth.js';

export default async function handler(req, res) {
  try {
    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;

    if (req.method === 'GET') {
      const documents = await getCaseDocuments(id, user.id);
      res.status(200).json({
        success: true,
        data: documents
      });
    } else if (req.method === 'POST') {
      const result = await uploadDocument(id, req.body, user.id);
      res.status(201).json({
        success: true,
        data: result
      });
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Case documents error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}