import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app.ts';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app.callback()(req, res);
}