import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import dotenv from 'dotenv';
import router from './routes/index.ts';
import { initDatabase } from './db/index.ts';

dotenv.config();

const app = new Koa();

app.use(cors());
app.use(bodyParser({ jsonLimit: '10mb', formLimit: '10mb' }));

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Server error:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: 'Server internal error',
    };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(async (ctx) => {
  if (ctx.path === '/api/health') {
    ctx.body = { success: true, message: 'ok' };
    return;
  }
  if (ctx.path.startsWith('/api/')) {
    ctx.status = 404;
    ctx.body = { success: false, error: 'API not found' };
  }
});

initDatabase();

export default app;
