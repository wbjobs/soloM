import { ImageAdjustmentParams } from '@/types/dicom';

type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'adjustmentUpdate'
  | 'adjustmentSync'
  | 'requestParams'
  | 'paramsLoaded'
  | 'resetParams'
  | 'paramsReset';

interface WSMessage {
  type: WSMessageType;
  fileId: string;
  brightness?: number;
  contrast?: number;
  windowCenter?: number;
  windowWidth?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  timestamp?: number;
}

interface ParamsLoadedMessage extends WSMessage {
  type: 'paramsLoaded';
  brightness: number;
  contrast: number;
  windowCenter: number;
  windowWidth: number;
  zoom: number;
  panX: number;
  panY: number;
}

type MessageHandler = (message: WSMessage) => void;

export class DicomWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private subscribedFiles = new Set<string>();
  private reconnectTimeout: number | null = null;
  private connectionPromise: Promise<void> | null = null;

  constructor(wsUrl?: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port;
    this.url = wsUrl || `${protocol}//${host}${port ? ':' + port : ''}/ws`;
  }

  connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.subscribedFiles.forEach((fileId) => {
            this.sendSubscribe(fileId);
          });
          resolve();
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private handleDisconnect(): void {
    this.connectionPromise = null;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      
      this.reconnectTimeout = window.setTimeout(() => {
        this.connect().catch(() => {});
      }, Math.min(delay, 30000));
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => handler(message));
      }
    } catch {
    }
  }

  private send(message: WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private sendSubscribe(fileId: string): void {
    this.send({
      type: 'subscribe',
      fileId,
    });
  }

  subscribe(fileId: string): void {
    if (this.subscribedFiles.has(fileId)) return;
    this.subscribedFiles.add(fileId);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe(fileId);
    } else {
      this.connect().catch(() => {});
    }
  }

  unsubscribe(fileId: string): void {
    this.subscribedFiles.delete(fileId);
    this.send({
      type: 'unsubscribe',
      fileId,
    });
  }

  sendAdjustment(fileId: string, params: Omit<ImageAdjustmentParams, 'fileId' | 'updatedAt'>): void {
    this.send({
      type: 'adjustmentUpdate',
      fileId,
      brightness: params.brightness,
      contrast: params.contrast,
      windowCenter: params.windowCenter,
      windowWidth: params.windowWidth,
      zoom: params.zoom,
      panX: params.panX,
      panY: params.panY,
      timestamp: Date.now(),
    });
  }

  requestParams(fileId: string): void {
    this.send({
      type: 'requestParams',
      fileId,
    });
  }

  resetParams(fileId: string): void {
    this.send({
      type: 'resetParams',
      fileId,
    });
  }

  on(type: WSMessageType, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  onParamsLoaded(handler: (params: ImageAdjustmentParams) => void): () => void {
    return this.on('paramsLoaded', (msg) => {
      const params = msg as ParamsLoadedMessage;
      handler({
        fileId: params.fileId,
        brightness: params.brightness,
        contrast: params.contrast,
        windowCenter: params.windowCenter,
        windowWidth: params.windowWidth,
        zoom: params.zoom,
        panX: params.panX,
        panY: params.panY,
      });
    });
  }

  onAdjustmentSync(handler: (params: ImageAdjustmentParams & { timestamp: number }) => void): () => void {
    return this.on('adjustmentSync', (msg) => {
      handler({
        fileId: msg.fileId,
        brightness: msg.brightness!,
        contrast: msg.contrast!,
        windowCenter: msg.windowCenter!,
        windowWidth: msg.windowWidth!,
        zoom: msg.zoom ?? 1,
        panX: msg.panX ?? 0,
        panY: msg.panY ?? 0,
        timestamp: msg.timestamp!,
      });
    });
  }

  onParamsReset(handler: (fileId: string) => void): () => void {
    return this.on('paramsReset', (msg) => {
      handler(msg.fileId);
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connectionPromise = null;
    this.subscribedFiles.clear();
  }
}

let wsClientInstance: DicomWebSocketClient | null = null;

export function getWebSocketClient(): DicomWebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new DicomWebSocketClient();
  }
  return wsClientInstance;
}
