import { Router, type Request, type Response } from 'express';
import { generateGasRanking } from '../data/mockData.js';

const router = Router();

router.get('/ranking', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const ranking = generateGasRanking(limit);
  res.json({
    success: true,
    data: ranking,
  });
});

export default router;
