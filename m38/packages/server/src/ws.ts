import { FastifyInstance } from 'fastify';
import { engine } from './engine';
import { LogEntry } from './types';

interface ClientConnection {
  socket: any;
  runId?: string;
  subscribeAll: boolean;
}

const connections: Set<ClientConnection> = new Set();

export default function wsRoutes(fastify: FastifyInstance, opts: any, done: Function) {
  fastify.get('/ws', { websocket: true }, (connection: any, req: any) => {
    const client: ClientConnection = {
      socket: connection.socket,
      runId: undefined,
      subscribeAll: false,
    };

    connections.add(client);

    connection.socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'subscribe' && msg.runId) {
          client.runId = msg.runId;
        }

        if (msg.type === 'subscribe-all') {
          client.subscribeAll = true;
        }
      } catch {}
    });

    connection.socket.on('close', () => {
      connections.delete(client);
    });
  });

  engine.on('log', (entry: LogEntry) => {
    const message = JSON.stringify({ type: 'log', data: entry });
    for (const client of connections) {
      if (client.subscribeAll || client.runId === entry.runId) {
        try {
          client.socket.send(message);
        } catch {}
      }
    }
  });

  engine.on('step-status', (data: { runId: string; stepName: string; status: string }) => {
    const message = JSON.stringify({ type: 'step-status', data });
    for (const client of connections) {
      if (client.subscribeAll || client.runId === data.runId) {
        try {
          client.socket.send(message);
        } catch {}
      }
    }
  });

  engine.on('run-status', (data: { runId: string; status: string }) => {
    const message = JSON.stringify({ type: 'run-status', data });
    for (const client of connections) {
      if (client.subscribeAll || client.runId === data.runId) {
        try {
          client.socket.send(message);
        } catch {}
      }
    }
  });

  done();
}
