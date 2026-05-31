import { io, Socket } from 'socket.io-client';
import {
  Operation,
  AnyShape,
  User,
  SyncMessage,
  OperationMessage,
  AckMessage,
} from '../types';
import { OTClient } from '../ot/OTClient';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface EventHandlers {
  onSync: (message: SyncMessage) => void;
  onOperation: (message: OperationMessage) => void;
  onUserJoined: (data: { user: User; users: User[] }) => void;
  onUserLeft: (data: { user: User; users: User[] }) => void;
  onAck: (message: AckMessage) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
}

export class CollaborativeClient {
  private socket: Socket;
  private otClient: OTClient;
  private canvasId: string | null = null;
  private userId: string;
  private userName: string;
  private handlers: Partial<EventHandlers> = {};
  private shapes: Map<string, AnyShape> = new Map();
  private connected: boolean = false;

  constructor(userId: string, userName: string) {
    this.userId = userId;
    this.userName = userName;
    this.otClient = new OTClient(userId);

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupOTCallbacks();
    this.setupSocketListeners();
  }

  private setupOTCallbacks(): void {
    this.otClient.setOnSendOperation((op: Operation) => {
      this.sendOperation(op);
    });

    this.otClient.setOnOperationApplied((op: Operation) => {
      this.shapes = this.otClient.applyOperationLocal(op, this.shapes);
    });
  }

  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Connected to server');
      this.handlers.onConnect?.();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Disconnected from server');
      this.handlers.onDisconnect?.();
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('Connection error:', error);
      this.handlers.onError?.(error);
    });

    this.socket.on('sync', (message: SyncMessage) => {
      this.handleSync(message);
    });

    this.socket.on('operation', (message: OperationMessage) => {
      this.handleServerOperation(message);
    });

    this.socket.on('ack', (message: AckMessage) => {
      this.handleAck(message);
    });

    this.socket.on('user_joined', (data: { user: User; users: User[] }) => {
      this.handlers.onUserJoined?.(data);
    });

    this.socket.on('user_left', (data: { user: User; users: User[] }) => {
      this.handlers.onUserLeft?.(data);
    });

    this.socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
      this.handlers.onError?.(error);
    });
  }

  private handleSync(message: SyncMessage): void {
    this.shapes = new Map(message.shapes.map(s => [s.id, s]));
    this.otClient.setVersion(message.version);
    this.otClient.clearPending();
    this.handlers.onSync?.(message);
  }

  private handleServerOperation(message: OperationMessage): void {
    const transformedOp = this.otClient.handleServerOperation(message.operation);
    
    if (transformedOp) {
      this.handlers.onOperation?.({
        ...message,
        operation: transformedOp,
      });
    }
  }

  private handleAck(message: AckMessage): void {
    this.otClient.handleAck(message.operationId, message.version);
    this.handlers.onAck?.(message);
  }

  joinCanvas(canvasId: string): void {
    this.canvasId = canvasId;
    this.socket.emit('join', {
      canvasId,
      userId: this.userId,
      userName: this.userName,
    });
  }

  leaveCanvas(canvasId: string): void {
    this.socket.emit('leave', { canvasId });
    if (this.canvasId === canvasId) {
      this.canvasId = null;
    }
  }

  private sendOperation(operation: Operation): void {
    if (!this.canvasId) {
      console.error('Cannot send operation: not joined to a canvas');
      return;
    }

    if (!this.connected) {
      console.warn('Not connected to server, operation queued');
      return;
    }

    this.socket.emit('operation', {
      canvasId: this.canvasId,
      operation,
    });
  }

  addShape(shape: AnyShape): Operation {
    const op = this.otClient.generateOperation('add', shape.id, shape);
    this.shapes = this.otClient.applyOperationLocal(op, this.shapes);
    return op;
  }

  removeShape(shapeId: string): Operation {
    const op = this.otClient.generateOperation('remove', shapeId);
    this.shapes = this.otClient.applyOperationLocal(op, this.shapes);
    return op;
  }

  updateShape(shapeId: string, shape: Partial<AnyShape>): Operation {
    const existing = this.shapes.get(shapeId);
    if (!existing) {
      throw new Error(`Shape ${shapeId} not found`);
    }

    const updatedShape = { ...existing, ...shape } as AnyShape;
    const op = this.otClient.generateOperation('update', shapeId, updatedShape);
    this.shapes = this.otClient.applyOperationLocal(op, this.shapes);
    return op;
  }

  getShapes(): AnyShape[] {
    return Array.from(this.shapes.values());
  }

  getShapesMap(): Map<string, AnyShape> {
    return new Map(this.shapes);
  }

  getVersion(): number {
    return this.otClient.getVersion();
  }

  isConnected(): boolean {
    return this.connected;
  }

  setHandlers(handlers: Partial<EventHandlers>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  requestSync(): void {
    if (this.canvasId) {
      this.socket.emit('request_sync', { canvasId: this.canvasId });
    }
  }

  getHistory(fromVersion: number = 0): void {
    if (this.canvasId) {
      this.socket.emit('get_history', {
        canvasId: this.canvasId,
        fromVersion,
      });
    }
  }

  disconnect(): void {
    if (this.canvasId) {
      this.leaveCanvas(this.canvasId);
    }
    this.socket.disconnect();
  }
}
