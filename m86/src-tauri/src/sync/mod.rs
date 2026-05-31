pub mod behaviour;
pub mod protocol;

use behaviour::SyncBehaviour;
use protocol::*;

use futures::StreamExt;
use libp2p::gossipsub::{self, MessageAuthenticity, ValidationMode};
use libp2p::identity::Keypair;
use libp2p::multiaddr::Protocol;
use libp2p::swarm::{SwarmBuilder, SwarmEvent};
use libp2p::{Multiaddr, PeerId, Swarm};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex as TokioMutex};

use crate::database::Database;

#[derive(Debug, Clone, serde::Serialize)]
pub struct PeerInfo {
    pub peer_id: String,
    pub addr: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncStatus {
    pub is_running: bool,
    pub peer_id: String,
    pub connected_peers: Vec<PeerInfo>,
    pub last_sync: Option<String>,
    pub sync_count: u64,
}

struct SyncState {
    connected_peers: HashSet<PeerId>,
    sync_count: u64,
    last_sync: Option<String>,
}

pub struct SyncEngine {
    swarm: Swarm<SyncBehaviour>,
    state: SyncState,
    db: Arc<TokioMutex<Option<Database>>>,
    app: AppHandle,
    command_rx: mpsc::Receiver<SyncCommand>,
}

enum SyncCommand {
    BroadcastNoteCreated(EncryptedNotePayload),
    BroadcastNoteUpdated(EncryptedNotePayload),
    BroadcastNoteDeleted(NoteDeletePayload),
    RequestFullSync,
    GetStatus(mpsc::Sender<SyncStatus>),
    Stop,
}

pub struct SyncHandle {
    command_tx: mpsc::Sender<SyncCommand>,
}

impl SyncHandle {
    pub async fn broadcast_note_created(&self, payload: EncryptedNotePayload) -> Result<(), String> {
        self.command_tx
            .send(SyncCommand::BroadcastNoteCreated(payload))
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn broadcast_note_updated(&self, payload: EncryptedNotePayload) -> Result<(), String> {
        self.command_tx
            .send(SyncCommand::BroadcastNoteUpdated(payload))
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn broadcast_note_deleted(&self, payload: NoteDeletePayload) -> Result<(), String> {
        self.command_tx
            .send(SyncCommand::BroadcastNoteDeleted(payload))
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn request_full_sync(&self) -> Result<(), String> {
        self.command_tx
            .send(SyncCommand::RequestFullSync)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn get_status(&self) -> Result<SyncStatus, String> {
        let (tx, rx) = mpsc::channel(1);
        self.command_tx
            .send(SyncCommand::GetStatus(tx))
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())
    }

    pub async fn stop(&self) -> Result<(), String> {
        self.command_tx
            .send(SyncCommand::Stop)
            .await
            .map_err(|e| e.to_string())
    }
}

pub async fn start_sync_engine(
    db: Arc<TokioMutex<Option<Database>>>,
    app: AppHandle,
    listen_port: u16,
) -> Result<(SyncHandle, PeerId), String> {
    let local_key = Keypair::generate_ed25519();
    let peer_id = PeerId::from(local_key.public());

    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .validation_mode(ValidationMode::Permissive)
        .build()
        .map_err(|e| e.to_string())?;

    let gossipsub = gossipsub::Behaviour::new(
        MessageAuthenticity::Signed(local_key.clone()),
        gossipsub_config,
    )
    .map_err(|e| e.to_string())?;

    let mdns = mdns::tokio::Behaviour::new(Default::default(), peer_id)
        .map_err(|e| e.to_string())?;

    let behaviour = SyncBehaviour {
        gossipsub,
        mdns,
    };

    let swarm = SwarmBuilder::with_existing_identity(local_key)
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default(),
            libp2p::noise::Config::new,
            libp2p::yamux::Config::default,
        )
        .map_err(|e| e.to_string())?
        .with_behaviour(|_| behaviour)
        .map_err(|e| e.to_string())?
        .build();

    let (command_tx, command_rx) = mpsc::channel(100);

    let mut engine = SyncEngine {
        swarm,
        state: SyncState {
            connected_peers: HashSet::new(),
            sync_count: 0,
            last_sync: None,
        },
        db,
        app,
        command_rx,
    };

    let handle = SyncHandle { command_tx };

    let addr: Multiaddr = format!("/ip4/0.0.0.0/tcp/{listen_port}")
        .parse()
        .map_err(|e| e.to_string())?;
    engine.swarm.listen_on(addr).map_err(|e| e.to_string())?;

    engine
        .swarm
        .behaviour_mut()
        .gossipsub
        .subscribe(&sync_topic())
        .map_err(|e| e.to_string())?;

    let pid = peer_id;
    tokio::spawn(async move {
        engine.run().await;
    });

    Ok((handle, pid))
}

impl SyncEngine {
    async fn run(&mut self) {
        eprintln!("P2P sync engine started");

        loop {
            tokio::select! {
                Some(command) = self.command_rx.recv() => {
                    match command {
                        SyncCommand::Stop => {
                            eprintln!("P2P sync engine stopping...");
                            return;
                        }
                        SyncCommand::BroadcastNoteCreated(payload) => {
                            self.broadcast(SyncMessage::NoteCreated(payload)).await;
                        }
                        SyncCommand::BroadcastNoteUpdated(payload) => {
                            self.broadcast(SyncMessage::NoteUpdated(payload)).await;
                        }
                        SyncCommand::BroadcastNoteDeleted(payload) => {
                            self.broadcast(SyncMessage::NoteDeleted(payload)).await;
                        }
                        SyncCommand::RequestFullSync => {
                            self.send_full_sync_request().await;
                        }
                        SyncCommand::GetStatus(tx) => {
                            let status = self.get_status();
                            let _ = tx.send(status).await;
                        }
                    }
                }
                event = self.swarm.select_next_some() => {
                    match event {
                        SwarmEvent::Behaviour(behaviour_event) => {
                            self.handle_behaviour_event(behaviour_event).await;
                        }
                        SwarmEvent::NewListenAddr { address, .. } => {
                            eprintln!("Listening on {address}");
                        }
                        SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                            self.state.connected_peers.insert(peer_id);
                            self.emit_status();
                        }
                        SwarmEvent::ConnectionClosed { peer_id, .. } => {
                            self.state.connected_peers.remove(&peer_id);
                            self.emit_status();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    async fn broadcast(&mut self, message: SyncMessage) {
        let data = match message.encode() {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Failed to encode sync message: {e}");
                return;
            }
        };

        let topic = sync_topic();
        if let Err(e) = self
            .swarm
            .behaviour_mut()
            .gossipsub
            .publish(topic, data)
        {
            eprintln!("Failed to publish message: {e}");
        }
    }

    async fn send_full_sync_request(&mut self) {
        let db_guard = self.db.lock().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return,
        };

        let known_notes = match db.get_sync_metadata() {
            Ok(notes) => notes,
            Err(e) => {
                eprintln!("Failed to get sync metadata: {e}");
                return;
            }
        };

        drop(db_guard);

        let request = FullSyncRequestPayload {
            request_id: uuid::Uuid::new_v4().to_string(),
            known_note_ids: known_notes,
        };

        self.broadcast(SyncMessage::FullSyncRequest(request)).await;
    }

    async fn handle_behaviour_event(
        &mut self,
        event: SyncBehaviourEvent,
    ) {
        match event {
            SyncBehaviourEvent::Mdns(mdns::Event::Discovered(list)) => {
                for (peer_id, addr) in list {
                    eprintln!("mDNS discovered peer: {peer_id} at {addr}");
                    self.swarm.dial(addr).ok();
                    self.state.connected_peers.insert(peer_id);
                }
                self.emit_status();
            }
            SyncBehaviourEvent::Mdns(mdns::Event::Expired(list)) => {
                for (peer_id, _addr) in list {
                    self.state.connected_peers.remove(&peer_id);
                }
                self.emit_status();
            }
            SyncBehaviourEvent::Gossipsub(gossipsub::Event::Message {
                propagation_source: _,
                message_id: _,
                message,
            }) => {
                self.handle_incoming_message(&message.data).await;
            }
            _ => {}
        }
    }

    async fn handle_incoming_message(&mut self, data: &[u8]) {
        let msg = match SyncMessage::decode(data) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Failed to decode sync message: {e}");
                return;
            }
        };

        match msg {
            SyncMessage::NoteCreated(payload) => {
                self.apply_incoming_note(payload, true).await;
            }
            SyncMessage::NoteUpdated(payload) => {
                self.apply_incoming_note(payload, false).await;
            }
            SyncMessage::NoteDeleted(payload) => {
                self.apply_note_deletion(payload).await;
            }
            SyncMessage::FullSyncRequest(request) => {
                self.handle_full_sync_request(request).await;
            }
            SyncMessage::FullSyncResponse(response) => {
                self.handle_full_sync_response(response).await;
            }
        }
    }

    async fn apply_incoming_note(&mut self, payload: EncryptedNotePayload, is_new: bool) {
        let db_guard = self.db.lock().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return,
        };

        let result = if is_new {
            db.upsert_encrypted_note(
                &payload.id,
                &payload.encrypted_title,
                &payload.encrypted_content,
                &payload.created_at,
                &payload.updated_at,
            )
        } else {
            db.upsert_encrypted_note_if_newer(
                &payload.id,
                &payload.encrypted_title,
                &payload.encrypted_content,
                &payload.created_at,
                &payload.updated_at,
            )
        };

        drop(db_guard);

        match result {
            Ok(true) => {
                self.state.sync_count += 1;
                self.state.last_sync = Some(chrono::Utc::now().to_rfc3339());
                self.emit_status();
                let _ = self.app.emit("sync-note-updated", &payload.id);
            }
            Ok(false) => {}
            Err(e) => {
                eprintln!("Failed to apply incoming note: {e}");
            }
        }
    }

    async fn apply_note_deletion(&mut self, payload: NoteDeletePayload) {
        let db_guard = self.db.lock().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return,
        };

        match db.delete_encrypted_note(&payload.id) {
            Ok(_) => {
                self.state.sync_count += 1;
                self.state.last_sync = Some(chrono::Utc::now().to_rfc3339());
                self.emit_status();
                let _ = self.app.emit("sync-note-deleted", &payload.id);
            }
            Err(e) => {
                eprintln!("Failed to apply note deletion: {e}");
            }
        }

        drop(db_guard);
    }

    async fn handle_full_sync_request(&mut self, request: FullSyncRequestPayload) {
        let db_guard = self.db.lock().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return,
        };

        let all_encrypted = match db.get_all_encrypted_notes() {
            Ok(notes) => notes,
            Err(e) => {
                eprintln!("Failed to get encrypted notes for full sync: {e}");
                return;
            }
        };

        let mut notes_to_create = Vec::new();
        let mut notes_to_update = Vec::new();
        let mut remote_ids: HashSet<String> = request
            .known_note_ids
            .iter()
            .map(|n| n.id.clone())
            .collect();

        for note in all_encrypted {
            if let Some(known) = request.known_note_ids.iter().find(|n| n.id == note.id) {
                if note.updated_at > known.updated_at {
                    notes_to_update.push(note);
                }
            } else {
                notes_to_create.push(note);
            }
            remote_ids.remove(&note.id);
        }

        let note_ids_to_delete: Vec<String> = remote_ids.into_iter().collect();

        drop(db_guard);

        let response = FullSyncResponsePayload {
            request_id: request.request_id,
            notes_to_create,
            notes_to_update,
            note_ids_to_delete,
        };

        self.broadcast(SyncMessage::FullSyncResponse(response)).await;
    }

    async fn handle_full_sync_response(&mut self, response: FullSyncResponsePayload) {
        let db_guard = self.db.lock().await;
        let db = match db_guard.as_ref() {
            Some(db) => db,
            None => return,
        };

        for note in response.notes_to_create {
            if let Err(e) = db.upsert_encrypted_note(
                &note.id,
                &note.encrypted_title,
                &note.encrypted_content,
                &note.created_at,
                &note.updated_at,
            ) {
                eprintln!("Failed to upsert note during full sync: {e}");
            }
        }

        for note in response.notes_to_update {
            if let Err(e) = db.upsert_encrypted_note_if_newer(
                &note.id,
                &note.encrypted_title,
                &note.encrypted_content,
                &note.created_at,
                &note.updated_at,
            ) {
                eprintln!("Failed to update note during full sync: {e}");
            }
        }

        for id in &response.note_ids_to_delete {
            if let Err(e) = db.delete_encrypted_note(id) {
                eprintln!("Failed to delete note during full sync: {e}");
            }
        }

        drop(db_guard);

        self.state.sync_count += 1;
        self.state.last_sync = Some(chrono::Utc::now().to_rfc3339());
        self.emit_status();
        let _ = self.app.emit("sync-completed", "full");
    }

    fn get_status(&self) -> SyncStatus {
        SyncStatus {
            is_running: true,
            peer_id: self.swarm.local_peer_id().to_string(),
            connected_peers: self
                .state
                .connected_peers
                .iter()
                .map(|pid| PeerInfo {
                    peer_id: pid.to_string(),
                    addr: String::new(),
                })
                .collect(),
            last_sync: self.state.last_sync.clone(),
            sync_count: self.state.sync_count,
        }
    }

    fn emit_status(&self) {
        let status = self.get_status();
        let _ = self.app.emit("sync-status", &status);
    }
}
