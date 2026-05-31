import { Router, Response, Request } from 'express';
import SnippetVersion from '../models/SnippetVersion';
import { authenticateJWT } from '../middleware/auth';
import { rollbackToVersion } from '../websocket/YWebsocketServer';

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
  };
}

const router = Router();

router.use(authenticateJWT);

router.get('/:ydocId', async (req: AuthRequest, res: Response) => {
  try {
    const { ydocId } = req.params;
    const userId = req.user?.id;

    const versions = await SnippetVersion
      .find({ ydocId, userId })
      .sort({ version: -1 })
      .limit(10)
      .select('version modifiedBy description title createdAt');

    res.json(versions);
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ message: 'Failed to fetch version history' });
  }
});

router.post('/:ydocId/rollback', async (req: AuthRequest, res: Response) => {
  try {
    const { ydocId } = req.params;
    const userId = req.user?.id || '';
    const username = req.user?.username || 'unknown';
    const { targetVersion } = req.body;

    if (typeof targetVersion !== 'number' || targetVersion < 0) {
      return res.status(400).json({ message: 'Invalid target version' });
    }

    const versionRecord = await SnippetVersion.findOne({ ydocId, version: targetVersion, userId });
    if (!versionRecord) {
      return res.status(404).json({ message: 'Version not found' });
    }

    const success = await rollbackToVersion(ydocId, targetVersion, userId, username);

    if (success) {
      res.json({ 
        message: `Rolled back to version ${targetVersion}`,
        targetVersion 
      });
    } else {
      res.status(500).json({ message: 'Rollback failed' });
    }
  } catch (error) {
    console.error('Error rolling back version:', error);
    res.status(500).json({ message: 'Failed to rollback version' });
  }
});

export default router;
