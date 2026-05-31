import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import apiRoutes from './api';
import wsRoutes from './ws';

const PORT = 4000;

async function main() {
  const server = Fastify({ logger: true });

  await server.register(cors, { origin: '*' });
  await server.register(websocket);
  server.register(apiRoutes);
  server.register(wsRoutes);

  try {
    await server.ready();
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`CI/CD Server running on http://localhost:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
