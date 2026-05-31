import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { saveImageParams, getImageParams, deleteImageParams } from './paramsDb.js';

interface WSMessage {
  type: string;
  fileId: string;
  [key: string]: any;
}

interface AdjustmentUpdate {
  fileId: string;
  brightness: number;
  contrast: number;
  windowCenter: number;
  windowWidth: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  timestamp?: number;
}

const activeClients = new Map<string, Set<WebSocket>>();

function broadcastToFileClients(fileId: string, message: string, excludeClient?: WebSocket): void {
  const clients = activeClients.get(fileId);
  if (!clients) return;

  clients.forEach((client) => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
      }
    }
  });
}

function handleMessage(ws: WebSocket, rawMessage: string): void {
  try {
    const message: WSMessage = JSON.parse(rawMessage);

    switch (message.type) {
      case 'subscribe': {
        const fileId = message.fileId;
        if (!fileId) return;

        if (!activeClients.has(fileId)) {
          activeClients.set(fileId, new Set());
        }
        activeClients.get(fileId)!.add(ws);

        const savedParams = getImageParams(fileId);
        if (savedParams) {
          ws.send(JSON.stringify({
            type: 'paramsLoaded',
            fileId,
            ...savedParams,
          }));
        }
        break;
      }

      case 'unsubscribe': {
        const fileId = message.fileId;
        if (!fileId) return;

        const clients = activeClients.get(fileId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            activeClients.delete(fileId);
          }
        }
        break;
      }

      case 'adjustmentUpdate': {
        const update = message as unknown as AdjustmentUpdate;
        const fileId = update.fileId;
        if (!fileId) return;

        const updatedAt = new Date().toISOString();
        
        saveImageParams({
          fileId,
          brightness: update.brightness ?? 0,
          contrast: update.contrast ?? 1,
          windowCenter: update.windowCenter ?? 0,
          windowWidth: update.windowWidth ?? 0,
          zoom: update.zoom ?? 1,
          panX: update.panX ?? 0,
          panY: update.panY ?? 0,
          updatedAt,
        });

        const broadcastMsg = JSON.stringify({
          type: 'adjustmentSync',
          fileId,
          brightness: update.brightness,
          contrast: update.contrast,
          windowCenter: update.windowCenter,
          windowWidth: update.windowWidth,
          zoom: update.zoom,
          panX: update.panX,
          panY: update.panY,
          timestamp: Date.now(),
        });

        broadcastToFileClients(fileId, broadcastMsg, ws);
        break;
      }

      case 'requestParams': {
        const fileId = message.fileId;
        if (!fileId) return;

        const savedParams = getImageParams(fileId);
        ws.send(JSON.stringify({
          type: 'paramsLoaded',
          fileId,
          ...savedParams,
        }));
        break;
      }

      case 'resetParams': {
        const fileId = message.fileId;
        if (!fileId) return;

        deleteImageParams(fileId);

        const broadcastMsg = JSON.stringify({
          type: 'paramsReset',
          fileId,
        });
        broadcastToFileClients(fileId, broadcastMsg, ws);
        break;
      }
    }
  } catch {
  }
}

function handleClose(ws: WebSocket): void {
  activeClients.forEach((clients) => {
    clients.delete(ws);
  });

  activeClients.forEach((clients, fileId) => {
    if (clients.size === 0) {
      activeClients.delete(fileId);
    }
  });
}

export function createWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      handleClose(ws);
    });

    ws.on('error', () => {
      handleClose(ws);
    });
  });

  return wss;
}

export function getActiveClientCount(fileId?: string): number {
  if (fileId) {
    return activeClients.get(fileId)?.size || 0;
  }
  let total = 0;
  activeClients.forEach((clients) => {
    total += clients.size;
  });
  return total;
}
