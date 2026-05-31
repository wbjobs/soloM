import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Note,
  NoteCreate,
  NoteUpdate,
  ConnectionStatus,
  PowerEvent,
  SyncStatus,
} from "../types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  retryDelay: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMsg = String(error);

      if (
        errorMsg.includes("Database not connected") ||
        errorMsg.includes("Connection broken") ||
        errorMsg.includes("Reconnection") ||
        errorMsg.includes("LockPoisoned")
      ) {
        throw error;
      }

      if (attempt < maxAttempts) {
        console.warn(
          `Attempt ${attempt} failed, retrying in ${retryDelay * attempt}ms...`
        );
        await sleep(retryDelay * attempt);
      }
    }
  }
  throw lastError;
}

export const api = {
  async initializeDatabase(): Promise<string> {
    return withRetry(() => invoke<string>("initialize_database"), 3, 1000);
  },

  async reconnectDatabase(): Promise<string> {
    return withRetry(() => invoke<string>("reconnect_database"), 5, 2000);
  },

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return invoke<ConnectionStatus>("get_connection_status");
  },

  async healthCheck(): Promise<boolean> {
    return invoke<boolean>("health_check");
  },

  async refreshEncryptionKey(): Promise<string> {
    return invoke<string>("refresh_encryption_key");
  },

  async startP2PSync(port?: number): Promise<string> {
    return invoke<string>("start_p2p_sync", { port: port ?? null });
  },

  async stopP2PSync(): Promise<string> {
    return invoke<string>("stop_p2p_sync");
  },

  async getSyncStatus(): Promise<SyncStatus> {
    return invoke<SyncStatus>("get_sync_status");
  },

  async requestFullSync(): Promise<string> {
    return invoke<string>("request_full_sync");
  },

  async createNote(note: NoteCreate): Promise<Note> {
    return withRetry(() => invoke<Note>("create_note", { note }), 2, 500);
  },

  async getNotes(): Promise<Note[]> {
    return withRetry(() => invoke<Note[]>("get_notes"), 2, 500);
  },

  async getNoteById(id: string): Promise<Note | null> {
    return withRetry(() => invoke<Note | null>("get_note_by_id", { id }), 2, 500);
  },

  async updateNote(id: string, note: NoteUpdate): Promise<Note> {
    return withRetry(() => invoke<Note>("update_note", { id, note }), 2, 500);
  },

  async deleteNote(id: string): Promise<boolean> {
    return withRetry(() => invoke<boolean>("delete_note", { id }), 2, 500);
  },

  async searchNotes(query: string): Promise<Note[]> {
    return withRetry(() => invoke<Note[]>("search_notes", { query }), 2, 500);
  },

  async onConnectionStatusChange(
    callback: (status: ConnectionStatus) => void
  ): Promise<() => void> {
    const unlisten = await listen<ConnectionStatus>(
      "connection-status",
      (event) => callback(event.payload)
    );
    return unlisten;
  },

  async onPowerEvent(
    callback: (event: PowerEvent) => void
  ): Promise<() => void> {
    const unlisten = await listen<PowerEvent>("power-event", (event) =>
      callback(event.payload)
    );
    return unlisten;
  },

  async onWakeupRecovery(
    callback: (status: string) => void
  ): Promise<() => void> {
    const unlisten = await listen<string>("wakeup-recovery", (event) =>
      callback(event.payload)
    );
    return unlisten;
  },

  async onSyncStatusChange(
    callback: (status: SyncStatus) => void
  ): Promise<() => void> {
    const unlisten = await listen<SyncStatus>("sync-status", (event) =>
      callback(event.payload)
    );
    return unlisten;
  },

  async onSyncNoteUpdated(
    callback: (noteId: string) => void
  ): Promise<() => void> {
    const unlisten = await listen<string>("sync-note-updated", (event) =>
      callback(event.payload)
    );
    return unlisten;
  },

  async onSyncNoteDeleted(
    callback: (noteId: string) => void
  ): Promise<() => void> {
    const unlisten = await listen<string>("sync-note-deleted", (event) =>
      callback(event.payload)
    );
    return unlisten;
  },

  async onSyncCompleted(
    callback: (type: string) => void
  ): Promise<() => void> {
    const unlisten = await listen<string>("sync-completed", (event) =>
      callback(event.payload)
    );
    return unlisten;
  },
};
