import { Router, type Request, type Response } from 'express';
import { getBlocksFromStore, getBlockDetailFromStore, getLatestBlockHeight, getForksFromStore, resolveFork, getAllBlocksAtHeight, syncForkBlock } from '../data/mockData.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const blocks = getBlocksFromStore(limit);
  res.json({
    success: true,
    data: blocks,
    latestHeight: getLatestBlockHeight(),
  });
});

router.get('/forks', (req: Request, res: Response) => {
  const forks = getForksFromStore();
  res.json({
    success: true,
    data: forks,
    count: forks.length,
  });
});

router.post('/forks/resolve', (req: Request, res: Response) => {
  const { height, canonicalHash } = req.body;
  if (!height || !canonicalHash) {
    return res.status(400).json({
      success: false,
      error: 'height and canonicalHash are required',
    });
  }
  const resolved = resolveFork(parseInt(height), canonicalHash);
  if (!resolved) {
    return res.status(404).json({
      success: false,
      error: 'Fork not found or hash does not exist at specified height',
    });
  }
  res.json({
    success: true,
    message: `Fork at height ${height} resolved to ${canonicalHash}`,
  });
});

router.post('/sync-fork', (req: Request, res: Response) => {
  const { height } = req.body;
  if (!height || typeof height !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'Valid height is required',
    });
  }
  const result = syncForkBlock(height);
  res.json({
    success: result.success,
    isFork: result.isFork,
    message: result.isFork
      ? `Fork detected at height ${height}. Block stored as alternative chain.`
      : `Block at height ${height} synced successfully.`,
  });
});

router.get('/:height/forks', (req: Request, res: Response) => {
  const height = parseInt(req.params.height);
  if (isNaN(height) || height <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid block height',
    });
  }
  const allBlocks = getAllBlocksAtHeight(height);
  res.json({
    success: true,
    height,
    data: allBlocks,
    count: allBlocks.length,
    isFork: allBlocks.length > 1,
  });
});

router.get('/:height', (req: Request, res: Response) => {
  const height = parseInt(req.params.height);
  if (isNaN(height) || height <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid block height',
    });
  }
  const blockDetail = getBlockDetailFromStore(height);
  if (!blockDetail) {
    return res.status(404).json({
      success: false,
      error: 'Block not found',
    });
  }
  res.json({
    success: true,
    data: blockDetail,
  });
});

export default router;
