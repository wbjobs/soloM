import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SocketHandler } from './websocket/SocketHandler';
import { connectDatabase } from './db/database';

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    const app = express();
    const server = http.createServer(app);

    app.use(cors({
      origin: CLIENT_URL,
      credentials: true,
    }));

    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const io = new Server(server, {
      cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    new SocketHandler(io);

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`WebSocket server ready`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
