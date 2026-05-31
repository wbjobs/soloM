use crate::components::*;
use crate::systems::{
    astar_pathfinding, calculate_visible_tiles, generate_bsp_chunk,
    generate_cellular_chunk, ChunkCache, DungeonConfig,
};
use bincode;
use bytes::{Buf, BufMut, BytesMut};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tracing::{debug, error, info};

const MESSAGE_HEADER_SIZE: usize = 4;

#[derive(Debug, Clone, Copy)]
pub enum SerializationFormat {
    Bincode,
    Json,
}

pub fn serialize_message(
    msg: &NetworkMessage,
    format: SerializationFormat,
) -> Result<Vec<u8>, String> {
    match format {
        SerializationFormat::Bincode => {
            bincode::serialize(msg).map_err(|e| format!("Bincode serialization error: {}", e))
        }
        SerializationFormat::Json => {
            serde_json::to_vec(msg).map_err(|e| format!("JSON serialization error: {}", e))
        }
    }
}

pub fn deserialize_message(
    data: &[u8],
    format: SerializationFormat,
) -> Result<NetworkMessage, String> {
    match format {
        SerializationFormat::Bincode => {
            bincode::deserialize(data).map_err(|e| format!("Bincode deserialization error: {}", e))
        }
        SerializationFormat::Json => {
            serde_json::from_slice(data).map_err(|e| format!("JSON deserialization error: {}", e))
        }
    }
}

fn encode_frame(data: &[u8]) -> BytesMut {
    let mut buf = BytesMut::with_capacity(MESSAGE_HEADER_SIZE + data.len());
    buf.put_u32_le(data.len() as u32);
    buf.put_slice(data);
    buf
}

async fn decode_frame(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut header = [0u8; MESSAGE_HEADER_SIZE];
    stream
        .read_exact(&mut header)
        .await
        .map_err(|e| format!("Read header error: {}", e))?;
    let len = (&header[..]).get_u32_le() as usize;

    if len > 10 * 1024 * 1024 {
        return Err(format!("Message too large: {} bytes", len));
    }

    let mut data = vec![0u8; len];
    stream
        .read_exact(&mut data)
        .await
        .map_err(|e| format!("Read body error: {}", e))?;
    Ok(data)
}

pub struct DungeonServer {
    config: DungeonConfig,
    cache: Arc<Mutex<ChunkCache>>,
    format: SerializationFormat,
}

impl DungeonServer {
    pub fn new(config: DungeonConfig, format: SerializationFormat) -> Self {
        Self {
            config,
            cache: Arc::new(Mutex::new(ChunkCache::new())),
            format,
        }
    }

    pub async fn run(&self, addr: &str) -> Result<(), String> {
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Bind error: {}", e))?;
        info!("Dungeon server listening on {}", addr);
        info!(
            "Map size: {}x{}, chunk size: {}",
            self.config.width, self.config.height, self.config.chunk_size
        );
        info!("Algorithm: {:?}", self.config.algorithm);

        loop {
            let (socket, addr) = listener
                .accept()
                .await
                .map_err(|e| format!("Accept error: {}", e))?;
            info!("New client connected: {}", addr);

            let config = self.config.clone();
            let cache = Arc::clone(&self.cache);
            let format = match self.format {
                SerializationFormat::Bincode => SerializationFormat::Bincode,
                SerializationFormat::Json => SerializationFormat::Json,
            };

            tokio::spawn(async move {
                if let Err(e) = handle_client(socket, config, cache, format).await {
                    error!("Client error: {}", e);
                }
                info!("Client disconnected: {}", addr);
            });
        }
    }
}

async fn handle_client(
    mut stream: TcpStream,
    config: DungeonConfig,
    cache: Arc<Mutex<ChunkCache>>,
    format: SerializationFormat,
) -> Result<(), String> {
    let info_msg = NetworkMessage::MapInfo {
        width: config.width,
        height: config.height,
        chunk_size: config.chunk_size,
    };

    let info_data = serialize_message(&info_msg, format)?;
    let info_frame = encode_frame(&info_data);
    stream
        .write_all(&info_frame)
        .await
        .map_err(|e| format!("Write info error: {}", e))?;
    stream
        .flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;

    loop {
        let data = decode_frame(&mut stream).await?;
        let msg = deserialize_message(&data, format)?;

        debug!("Received message: {:?}", msg);

        let response = match msg {
            NetworkMessage::RequestChunk { x, y } => {
                let coord = ChunkCoord::new(x, y);

                let chunk = {
                    let mut cache_guard = cache.lock().await;
                    if let Some(cached) = cache_guard.get(coord) {
                        cached.clone()
                    } else {
                        let new_chunk = match config.algorithm {
                            crate::systems::GenerationAlgorithm::BSP => {
                                generate_bsp_chunk(coord, &config)
                            }
                            crate::systems::GenerationAlgorithm::CellularAutomata => {
                                generate_cellular_chunk(coord, &config)
                            }
                        };
                        cache_guard.insert(new_chunk.clone());
                        new_chunk
                    }
                };

                debug!(
                    "Sending chunk ({}, {}) with {} tiles",
                    x,
                    y,
                    chunk.tiles.len()
                );
                NetworkMessage::ChunkData(chunk)
            }
            NetworkMessage::PlayerUpdate(player) => {
                debug!("Player update: {:?}", player);
                NetworkMessage::PlayerUpdate(player)
            }
            NetworkMessage::RequestPath {
                chunk_x,
                chunk_y,
                start_x,
                start_y,
                end_x,
                end_y,
            } => {
                let coord = ChunkCoord::new(chunk_x, chunk_y);
                let chunk = {
                    let mut cache_guard = cache.lock().await;
                    if let Some(cached) = cache_guard.get(coord) {
                        cached.clone()
                    } else {
                        let new_chunk = match config.algorithm {
                            crate::systems::GenerationAlgorithm::BSP => {
                                generate_bsp_chunk(coord, &config)
                            }
                            crate::systems::GenerationAlgorithm::CellularAutomata => {
                                generate_cellular_chunk(coord, &config)
                            }
                        };
                        cache_guard.insert(new_chunk.clone());
                        new_chunk
                    }
                };

                let path = astar_pathfinding(&chunk, start_x, start_y, end_x, end_y);
                match path {
                    Some(p) => {
                        debug!("Path found: {} steps", p.len());
                        NetworkMessage::PathResult {
                            chunk_x,
                            chunk_y,
                            path: p,
                            found: true,
                        }
                    }
                    None => {
                        debug!("No path found");
                        NetworkMessage::PathResult {
                            chunk_x,
                            chunk_y,
                            path: Vec::new(),
                            found: false,
                        }
                    }
                }
            }
            NetworkMessage::RequestVisibility {
                chunk_x,
                chunk_y,
                player_x,
                player_y,
                view_radius,
            } => {
                let coord = ChunkCoord::new(chunk_x, chunk_y);
                let chunk = {
                    let mut cache_guard = cache.lock().await;
                    if let Some(cached) = cache_guard.get(coord) {
                        cached.clone()
                    } else {
                        let new_chunk = match config.algorithm {
                            crate::systems::GenerationAlgorithm::BSP => {
                                generate_bsp_chunk(coord, &config)
                            }
                            crate::systems::GenerationAlgorithm::CellularAutomata => {
                                generate_cellular_chunk(coord, &config)
                            }
                        };
                        cache_guard.insert(new_chunk.clone());
                        new_chunk
                    }
                };

                let visible = calculate_visible_tiles(&chunk, player_x, player_y, view_radius);
                let visible_positions: Vec<Position> = visible
                    .into_iter()
                    .map(|(x, y)| Position::new(x, y))
                    .collect();

                debug!(
                    "Visibility update: {} tiles visible to player at ({}, {})",
                    visible_positions.len(),
                    player_x,
                    player_y
                );

                NetworkMessage::VisibilityData {
                    chunk_x,
                    chunk_y,
                    player_position: Position::new(player_x, player_y),
                    visible_tiles: visible_positions,
                }
            }
            NetworkMessage::PlayerMove {
                chunk_x,
                chunk_y,
                new_x,
                new_y,
            } => {
                debug!("Player moved to chunk ({}, {}), position ({}, {})", chunk_x, chunk_y, new_x, new_y);
                NetworkMessage::PlayerUpdate(Player {
                    position: Position::new(new_x, new_y),
                    health: 100,
                })
            }
            _ => NetworkMessage::Error("Unsupported message type".to_string()),
        };

        let response_data = serialize_message(&response, format)?;
        let response_frame = encode_frame(&response_data);
        stream
            .write_all(&response_frame)
            .await
            .map_err(|e| format!("Write response error: {}", e))?;
        stream
            .flush()
            .await
            .map_err(|e| format!("Flush error: {}", e))?;
    }
}

pub async fn stream_chunks(
    addr: &str,
    coords: Vec<ChunkCoord>,
    format: SerializationFormat,
) -> Result<Vec<MapChunk>, String> {
    let mut stream = TcpStream::connect(addr)
        .await
        .map_err(|e| format!("Connect error: {}", e))?;
    info!("Connected to server at {}", addr);

    let data = decode_frame(&mut stream).await?;
    let info_msg = deserialize_message(&data, format)?;
    info!("Received map info: {:?}", info_msg);

    let mut chunks = Vec::new();

    for coord in coords {
        let request = NetworkMessage::RequestChunk {
            x: coord.x,
            y: coord.y,
        };
        let request_data = serialize_message(&request, format)?;
        let request_frame = encode_frame(&request_data);
        stream
            .write_all(&request_frame)
            .await
            .map_err(|e| format!("Write request error: {}", e))?;
        stream
            .flush()
            .await
            .map_err(|e| format!("Flush error: {}", e))?;

        let response_data = decode_frame(&mut stream).await?;
        let response = deserialize_message(&response_data, format)?;

        match response {
            NetworkMessage::ChunkData(chunk) => {
                info!("Received chunk ({}, {})", chunk.coord.x, chunk.coord.y);
                chunks.push(chunk);
            }
            NetworkMessage::Error(e) => {
                return Err(format!("Server error: {}", e));
            }
            other => {
                return Err(format!("Unexpected response: {:?}", other));
            }
        }
    }

    Ok(chunks)
}
