import { Server, Socket } from 'socket.io';
import { CanvasStateManager } from '../ot/CanvasStateManager';
import { storageService } from '../services/StorageService';
import { Operation, User } from '../types';

export class SocketHandler {
  private io: Server;
  private canvasManager: CanvasStateManager;
  private users: Map<string, User> = new Map();
  private canvasUsers: Map<string, Set<string>> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.canvasManager = new CanvasStateManager();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log('Client connected:', socket.id);

      socket.on('join', this.handleJoin(socket));
      socket.on('leave', this.handleLeave(socket));
      socket.on('operation', this.handleOperation(socket));
      socket.on('get_history', this.handleGetHistory(socket));
      socket.on('request_sync', this.handleRequestSync(socket));
      socket.on('disconnect', this.handleDisconnect(socket));
    });
  }

  private handleJoin(socket: Socket) {
    return async (data: { canvasId: string; userId: string; userName: string }) => {
      const { canvasId, userId, userName } = data;

      const user: User = {
        id: userId,
        name: userName,
        socketId: socket.id,
      };
      this.users.set(socket.id, user);

      if (!this.canvasUsers.has(canvasId)) {
        this.canvasUsers.set(canvasId, new Set());
      }
      this.canvasUsers.get(canvasId)!.add(socket.id);

      socket.join(canvasId);

      await this.loadCanvasToMemory(canvasId);
      const shapes = this.canvasManager.getShapes(canvasId);
      const version = this.canvasManager.getVersion(canvasId);

      socket.emit('sync', {
        canvasId,
        shapes,
        version,
        users: this.getUsersInCanvas(canvasId),
      });

      this.io.to(canvasId).emit('user_joined', {
        user,
        users: this.getUsersInCanvas(canvasId),
      });

      console.log(`User ${userName} joined canvas ${canvasId}`);
    };
  }

  private handleLeave(socket: Socket) {
    return (data: { canvasId: string }) => {
      const { canvasId } = data;
      const user = this.users.get(socket.id);

      if (user) {
        socket.leave(canvasId);

        const canvasUserSet = this.canvasUsers.get(canvasId);
        if (canvasUserSet) {
          canvasUserSet.delete(socket.id);
          if (canvasUserSet.size === 0) {
            this.canvasUsers.delete(canvasId);
          }
        }

        this.io.to(canvasId).emit('user_left', {
          user,
          users: this.getUsersInCanvas(canvasId),
        });

        console.log(`User ${user.name} left canvas ${canvasId}`);
      }
    };
  }

  private handleOperation(socket: Socket) {
    return async (data: { canvasId: string; operation: Operation }) => {
      const { canvasId, operation } = data;

      const result = this.canvasManager.applyOperation(canvasId, operation);

      await storageService.saveCanvas(
        canvasId,
        this.canvasManager.getShapes(canvasId),
        result.applied.version,
        result.applied
      );

      socket.emit('ack', {
        operationId: operation.id,
        version: result.applied.version,
        transformedOps: result.transformedOps,
      });

      socket.to(canvasId).emit('operation', {
        operation: result.applied,
        fromUser: this.users.get(socket.id),
      });
    };
  }

  private handleGetHistory(socket: Socket) {
    return (data: { canvasId: string; fromVersion: number }) => {
      const { canvasId, fromVersion } = data;
      const history = this.canvasManager.getHistory(canvasId, fromVersion);

      socket.emit('history', {
        canvasId,
        operations: history,
      });
    };
  }

  private handleRequestSync(socket: Socket) {
    return async (data: { canvasId: string }) => {
      const { canvasId } = data;

      await this.loadCanvasToMemory(canvasId);
      const shapes = this.canvasManager.getShapes(canvasId);
      const version = this.canvasManager.getVersion(canvasId);

      socket.emit('sync', {
        canvasId,
        shapes,
        version,
      });
    };
  }

  private handleDisconnect(socket: Socket) {
    return () => {
      const user = this.users.get(socket.id);

      if (user) {
        for (const [canvasId, userSet] of this.canvasUsers.entries()) {
          if (userSet.has(socket.id)) {
            userSet.delete(socket.id);

            this.io.to(canvasId).emit('user_left', {
              user,
              users: this.getUsersInCanvas(canvasId),
            });

            if (userSet.size === 0) {
              this.canvasUsers.delete(canvasId);
            }
          }
        }

        this.users.delete(socket.id);
        console.log('Client disconnected:', socket.id);
      }
    };
  }

  private async loadCanvasToMemory(canvasId: string): Promise<void> {
    const exists = await storageService.canvasExists(canvasId);

    if (!exists) {
      await storageService.createCanvas(canvasId);
      this.canvasManager.getOrCreateCanvas(canvasId);
      return;
    }

    const memVersion = this.canvasManager.getVersion(canvasId);
    const dbData = await storageService.loadCanvas(canvasId);

    if (dbData && dbData.version > memVersion) {
      this.canvasManager.resetCanvas(canvasId, dbData.shapes);
    }
  }

  private getUsersInCanvas(canvasId: string): User[] {
    const userSet = this.canvasUsers.get(canvasId);
    if (!userSet) return [];

    return Array.from(userSet)
      .map(id => this.users.get(id))
      .filter((u): u is User => u !== undefined);
  }
}
