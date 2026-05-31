use libp2p::gossipsub::IdentTopic;
use serde::{Deserialize, Serialize};

pub const TOPIC_NAME: &str = "encrypted-notes-sync";
pub const PROTOCOL_VERSION: &str = "1.0.0";

pub fn sync_topic() -> IdentTopic {
    IdentTopic::new(TOPIC_NAME)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncMessage {
    NoteCreated(EncryptedNotePayload),
    NoteUpdated(EncryptedNotePayload),
    NoteDeleted(NoteDeletePayload),
    FullSyncRequest(FullSyncRequestPayload),
    FullSyncResponse(FullSyncResponsePayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedNotePayload {
    pub id: String,
    pub encrypted_title: String,
    pub encrypted_content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteDeletePayload {
    pub id: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullSyncRequestPayload {
    pub request_id: String,
    pub known_note_ids: Vec<KnownNote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownNote {
    pub id: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullSyncResponsePayload {
    pub request_id: String,
    pub notes_to_create: Vec<EncryptedNotePayload>,
    pub notes_to_update: Vec<EncryptedNotePayload>,
    pub note_ids_to_delete: Vec<String>,
}

impl SyncMessage {
    pub fn encode(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(self).map_err(|e| e.to_string())
    }

    pub fn decode(data: &[u8]) -> Result<Self, String> {
        serde_json::from_slice(data).map_err(|e| e.to_string())
    }
}
