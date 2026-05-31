export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title: string;
  content: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  error: string | null;
}

export interface PowerEvent {
  event_type: string;
  timestamp: string;
}

export interface PeerInfo {
  peer_id: string;
  addr: string;
}

export interface SyncStatus {
  is_running: boolean;
  peer_id: string;
  connected_peers: PeerInfo[];
  last_sync: string | null;
  sync_count: number;
}
