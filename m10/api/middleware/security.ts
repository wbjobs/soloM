import { type Request, type Response, type NextFunction } from 'express';

const globalRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
const GLOBAL_RATE_WINDOW = 60 * 1000;
const GLOBAL_RATE_MAX = 60;

export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  res.removeHeader('X-Powered-By');
  next();
};

export const globalRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = globalRateLimits.get(ip);

  if (!record || now > record.resetAt) {
    globalRateLimits.set(ip, { count: 1, resetAt: now + GLOBAL_RATE_WINDOW });
    next();
    return;
  }

  if (record.count >= GLOBAL_RATE_MAX) {
    res.status(429).json({
      success: false,
      error: '请求过于频繁，请稍后再试',
    });
    return;
  }

  record.count++;
  next();
};

export const requestSizeLimit = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 2 * 1024 * 1024) {
    res.status(413).json({
      success: false,
      error: '请求体过大，最大允许 2MB',
    });
    return;
  }
  next();
};

export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\0/g, '');
      }
    }
  }
  next();
};
