import { Router, Response, Request } from 'express';
import Snippet from '../models/Snippet';
import { authenticateJWT } from '../middleware/auth';
import * as Y from 'yjs';
import { encoding } from 'lib0';

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
  };
}

const router = Router();

router.use(authenticateJWT);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const snippets = await Snippet.find({ userId })
      .sort({ updatedAt: -1 })
      .select('ydocId title language updatedAt version');
    
    res.json(snippets);
  } catch (error) {
    console.error('Error fetching snippets:', error);
    res.status(500).json({ message: 'Failed to fetch snippets' });
  }
});

router.get('/:ydocId', async (req: AuthRequest, res: Response) => {
  try {
    const { ydocId } = req.params;
    const userId = req.user?.id;

    const snippet = await Snippet.findOne({ ydocId, userId });
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    res.json({
      ydocId: snippet.ydocId,
      title: snippet.title,
      language: snippet.language,
      snapshot: snippet.snapshot.toString('base64'),
      version: snippet.version,
      updatedAt: snippet.updatedAt
    });
  } catch (error) {
    console.error('Error fetching snippet:', error);
    res.status(500).json({ message: 'Failed to fetch snippet' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const username = req.user?.username || 'unknown';
    const { title = 'Untitled Snippet', language = 'javascript' } = req.body;

    const ydocId = `snippet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const ydoc = new Y.Doc();
    ydoc.getText('title').insert(0, title);
    ydoc.getText('content');
    
    const snapshot = Y.encodeStateAsUpdate(ydoc);
    
    const snippet = new Snippet({
      userId,
      ydocId,
      title,
      language,
      snapshot: Buffer.from(snapshot),
      version: 0,
      lastModifiedBy: username
    });

    await snippet.save();

    res.status(201).json({
      ydocId: snippet.ydocId,
      title: snippet.title,
      language: snippet.language,
      version: snippet.version,
      createdAt: snippet.createdAt
    });
  } catch (error) {
    console.error('Error creating snippet:', error);
    res.status(500).json({ message: 'Failed to create snippet' });
  }
});

router.delete('/:ydocId', async (req: AuthRequest, res: Response) => {
  try {
    const { ydocId } = req.params;
    const userId = req.user?.id;

    const snippet = await Snippet.findOneAndDelete({ ydocId, userId });
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    res.json({ message: 'Snippet deleted successfully' });
  } catch (error) {
    console.error('Error deleting snippet:', error);
    res.status(500).json({ message: 'Failed to delete snippet' });
  }
});

export default router;
