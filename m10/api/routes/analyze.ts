import { Router, type Request, type Response } from 'express';
import { analyzeSolidity } from '../analyzer/solidityAnalyzer.js';
import type { AnalyzeRequest } from '../../shared/types.js';

const requestCounts: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
};

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { code } = req.body as AnalyzeRequest;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Code is required and must be a string',
    });
  }

  if (code.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Code cannot be empty',
    });
  }

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: '请求过于频繁，请稍后再试（每分钟最多 10 次分析请求）',
      issues: [],
      summary: { errors: 0, warnings: 0, infos: 0, optimizations: 0 },
      compileTime: 0,
      analysisTime: 0,
    });
  }

  try {
    const result = await analyzeSolidity(code);
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis failed: ' + (error as Error).message,
      issues: [],
      summary: { errors: 0, warnings: 0, infos: 0, optimizations: 0 },
      compileTime: 0,
      analysisTime: 0,
    });
  }
});

export default router;
