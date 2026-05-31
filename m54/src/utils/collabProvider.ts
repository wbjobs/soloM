import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface CollabProviderOptions {
  docId: string;
  ydoc: Y.Doc;
  username: string;
  cryptoKey?: CryptoKey;
  onStatusChange?: (status: ConnectionStatus) => void;
  onMembersChange?: (members: Member[]) => void;
}

interface Member {
  id: string;
  username: string;
  color: string;
  cursorPosition?: number;
}

const REMOTE_ORIGIN = Symbol('remote');

export class CollabProvider {
  private docId: string;
  private ydoc: Y.Doc;
  private username: string;
  private cryptoKey?: CryptoKey;
  private socket: Socket;
  private status: ConnectionStatus = 'disconnected';
  private members: Member[] = [];
  private onStatusChange?: (status: ConnectionStatus) => void;
  private onMembersChange?: (members: Member[]) => void;
  private pendingUpdates: Uint8Array[] = [];
  private isOnline: boolean = true;
  private syncCompleted: boolean = false;

  constructor(options: CollabProviderOptions) {
    this.docId = options.docId;
    this.ydoc = options.ydoc;
    this.username = options.username;
    this.cryptoKey = options.cryptoKey;
    this.onStatusChange = options.onStatusChange;
    this.onMembersChange = options.onMembersChange;

    this.socket = io('/', {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupSocketListeners();
    this.setupYjsListeners();
    this.setupOnlineDetection();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      this.setStatus('connected');
      this.isOnline = true;
      this.syncCompleted = false;
      this.socket.emit('room:join', {
        roomId: this.docId,
        username: this.username,
      });
    });

    this.socket.on('disconnect', () => {
      this.setStatus('disconnected');
      this.isOnline = false;
      this.syncCompleted = false;
    });

    this.socket.on('connect_error', () => {
      this.setStatus('reconnecting');
    });

    this.socket.on('reconnecting', () => {
      this.setStatus('reconnecting');
      this.syncCompleted = false;
    });

    this.socket.on('room:joined', async (data: { roomId: string; members: Member[] }) => {
      this.members = data.members;
      this.onMembersChange?.(this.members);

      const stateVector = Y.encodeStateVector(this.ydoc);
      this.socket.emit('doc:sync_request', {
        docId: this.docId,
        stateVector,
      });
    });

    this.socket.on('room:member_joined', (data: { member: Member }) => {
      this.members.push(data.member);
      this.onMembersChange?.(this.members);
    });

    this.socket.on('room:member_left', (data: { memberId: string }) => {
      this.members = this.members.filter((m) => m.id !== data.memberId);
      this.onMembersChange?.(this.members);
    });

    this.socket.on('doc:update', async (data: { docId: string; update: Uint8Array; from: string }) => {
      if (data.docId !== this.docId) return;
      if (data.from === this.socket.id) return;

      try {
        let updateData = data.update;
        if (this.cryptoKey) {
          const { decrypt } = await import('@/utils/crypto');
          const payload = {
            ciphertext: updateData.slice(28),
            iv: updateData.slice(0, 12),
            salt: updateData.slice(12, 28),
          };
          updateData = await decrypt(payload, this.cryptoKey);
        }
        Y.applyUpdate(this.ydoc, updateData, REMOTE_ORIGIN);
      } catch (err) {
        console.error('Failed to apply remote update:', err);
      }
    });

    this.socket.on('doc:sync_request', async (data: { docId: string; stateVector: Uint8Array }) => {
      if (data.docId !== this.docId) return;

      const diff = Y.encodeStateAsUpdate(this.ydoc, data.stateVector);
      if (diff.length > 0) {
        let payload = diff;
        if (this.cryptoKey) {
          const { encrypt } = await import('@/utils/crypto');
          const encrypted = await encrypt(diff, this.cryptoKey);
          payload = mergeEncryptedPayload(encrypted);
        }
        this.socket.emit('doc:sync_response', {
          docId: this.docId,
          diff: payload,
        });
      }
    });

    this.socket.on('doc:sync_response', async (data: { docId: string; diff: Uint8Array }) => {
      if (data.docId !== this.docId) return;

      try {
        let diffData = data.diff;
        if (this.cryptoKey) {
          const { decrypt } = await import('@/utils/crypto');
          const payload = {
            ciphertext: diffData.slice(28),
            iv: diffData.slice(0, 12),
            salt: diffData.slice(12, 28),
          };
          diffData = await decrypt(payload, this.cryptoKey);
        }
        Y.applyUpdate(this.ydoc, diffData, REMOTE_ORIGIN);
        this.syncCompleted = true;
        await this.flushPendingUpdates();
      } catch (err) {
        console.error('Failed to apply sync response:', err);
        this.syncCompleted = true;
        await this.flushPendingUpdates();
      }
    });
  }

  private setupYjsListeners() {
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;

      if (this.isOnline && this.socket.connected && this.syncCompleted) {
        this.sendUpdate(update);
      } else {
        this.pendingUpdates.push(update);
        this.savePendingUpdateToLocal(update);
      }
    });
  }

  private setupOnlineDetection() {
    const handleOnline = () => {
      this.isOnline = true;
      if (!this.socket.connected) {
        this.socket.connect();
      }
    };
    const handleOffline = () => {
      this.isOnline = false;
      this.setStatus('disconnected');
      this.syncCompleted = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  private async sendUpdate(update: Uint8Array) {
    try {
      let payload = update;
      if (this.cryptoKey) {
        const { encrypt } = await import('@/utils/crypto');
        const encrypted = await encrypt(update, this.cryptoKey);
        payload = mergeEncryptedPayload(encrypted);
      }
      this.socket.emit('doc:update', {
        docId: this.docId,
        update: payload,
      });
    } catch (err) {
      console.error('Failed to send update:', err);
      this.pendingUpdates.push(update);
    }
  }

  private async savePendingUpdateToLocal(update: Uint8Array) {
    try {
      const { savePendingUpdate } = await import('@/utils/db');
      await savePendingUpdate(this.docId, update, this.cryptoKey);
    } catch (err) {
      console.error('Failed to save pending update:', err);
    }
  }

  private async flushPendingUpdates() {
    if (!this.syncCompleted) return;

    try {
      const { getUnsyncedUpdates, markUpdateSynced } = await import('@/utils/db');
      const unsynced = await getUnsyncedUpdates(this.docId);
      
      for (const record of unsynced.sort((a, b) => a.timestamp - b.timestamp)) {
        try {
          let updateData = record.encryptedUpdate;
          if (this.cryptoKey) {
            const { decrypt } = await import('@/utils/crypto');
            updateData = await decrypt(
              { ciphertext: updateData, iv: record.iv, salt: record.iv.slice(0, 16) },
              this.cryptoKey
            );
          }
          await this.sendUpdate(updateData);
          await markUpdateSynced(record.id);
        } catch (err) {
          console.error('Failed to flush pending update:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load unsynced updates:', err);
    }

    if (this.pendingUpdates.length > 0) {
      const updates = [...this.pendingUpdates];
      this.pendingUpdates = [];

      for (const update of updates) {
        await this.sendUpdate(update);
      }
    }
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.onStatusChange?.(status);
  }

  connect() {
    this.setStatus('connecting');
    this.socket.connect();
  }

  disconnect() {
    this.socket.emit('room:leave', { roomId: this.docId });
    this.socket.disconnect();
    this.setStatus('disconnected');
    this.syncCompleted = false;
  }

  getMembers(): Member[] {
    return this.members;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSocketId(): string {
    return this.socket.id || '';
  }

  setCryptoKey(key: CryptoKey) {
    this.cryptoKey = key;
  }

  destroy() {
    this.disconnect();
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  }
}

function mergeEncryptedPayload(encrypted: { ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array }): Uint8Array {
  const merged = new Uint8Array(12 + 16 + encrypted.ciphertext.length);
  merged.set(encrypted.iv, 0);
  merged.set(encrypted.salt, 12);
  merged.set(encrypted.ciphertext, 28);
  return merged;
}
