
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod crypto;

use std::collections::HashMap;
use std::fs::{OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::task::JoinHandle;

use crypto::{CryptoKeys, EncryptedPayload, PairingInfo};

const MULTICAST_ADDR: &str = "239.255.255.250";
const MULTICAST_PORT: u16 = 1900;
const DISCOVERY_PORT: u16 = 58762;
const HTTP_PORT: u16 = 58763;
const CLIPBOARD_PORT: u16 = 58764;
const CHUNK_SIZE: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Device {
    name: String,
    ip: String,
    port: u16,
    last_seen: u64,
    paired: bool,
    fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PartialFileInfo {
    filename: String,
    file_size: u64,
    received_bytes: u64,
    checksum: String,
}

#[derive(Debug, Clone)]
struct AppState {
    devices: Arc<Mutex<HashMap<String, Device>>>,
    clipboard_sync_enabled: Arc<Mutex<bool>>,
    last_clipboard_content: Arc<Mutex<String>>,
    partial_files: Arc<Mutex<HashMap<String, PartialFileInfo>>>,
    crypto_keys: Arc<Mutex<CryptoKeys>>,
    tasks: Arc<Mutex<Vec<JoinHandle<()>>>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DiscoveryMessage {
    name: String,
    ip: String,
    port: u16,
    timestamp: u64,
    fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileStatusResponse {
    exists: bool,
    received_bytes: u64,
    file_size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SendFileResponse {
    success: bool,
    received_bytes: u64,
    completed: bool,
    message: String,
}

fn get_current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn get_hostname() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string())
}

fn get_all_local_ips() -> Vec<Ipv4Addr> {
    let mut ips = Vec::new();
    if let Ok(addrs) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in addrs {
            if let IpAddr::V4(ipv4) = ip {
                if !ipv4.is_loopback() && !ipv4.is_link_local() {
                    ips.push(ipv4);
                }
            }
        }
    }
    if ips.is_empty() {
        if let Ok(ip) = local_ip_address::local_ip() {
            if let IpAddr::V4(ipv4) = ip {
                ips.push(ipv4);
            }
        }
    }
    ips
}

fn get_local_ip() -> String {
    get_all_local_ips()
        .first()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

fn calculate_checksum(data: &[u8]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn get_temp_file_path(filename: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!(".lanshare_partial_{}", filename));
    path
}

fn get_partial_info(filename: &str) -> Option<PartialFileInfo> {
    let temp_path = get_temp_file_path(filename);
    let info_path = temp_path.with_extension("info");
    if info_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&info_path) {
            if let Ok(info) = serde_json::from_str::<PartialFileInfo>(&content) {
                if temp_path.exists() {
                    if let Ok(metadata) = std::fs::metadata(&temp_path) {
                        let mut info = info;
                        info.received_bytes = metadata.len();
                        return Some(info);
                    }
                }
            }
        }
    }
    None
}

fn save_partial_info(info: &PartialFileInfo) {
    let temp_path = get_temp_file_path(&info.filename);
    let info_path = temp_path.with_extension("info");
    if let Ok(json) = serde_json::to_string_pretty(info) {
        let _ = std::fs::write(&info_path, json);
    }
}

async fn start_discovery_listener(state: AppState) {
    let multicast_ip: Ipv4Addr = MULTICAST_ADDR.parse().unwrap();
    let local_ips = get_all_local_ips();
    let fingerprint = state.crypto_keys.lock().unwrap().fingerprint();

    for local_ip in local_ips.clone() {
        let state = state.clone();
        let fingerprint = fingerprint.clone();

        tokio::spawn(async move {
            let socket = match UdpSocket::bind((local_ip, DISCOVERY_PORT)) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to bind discovery listener to {}: {}", local_ip, e);
                    return;
                }
            };

            if let Err(e) = socket.set_multicast_ttl_v4(2) {
                eprintln!("Failed to set multicast TTL: {}", e);
            }
            if let Err(e) = socket.join_multicast_v4(&multicast_ip, &local_ip) {
                eprintln!("Failed to join multicast on {}: {}", local_ip, e);
                return;
            }

            println!("Discovery listener running on {}", local_ip);

            let mut buf = [0u8; 2048];
            loop {
                match socket.recv_from(&mut buf) {
                    Ok((len, _src)) => {
                        if let Ok(msg) = serde_json::from_slice::<DiscoveryMessage>(&buf[..len]) {
                            let local_ips = get_all_local_ips();
                            let msg_ip: Ipv4Addr = match msg.ip.parse() {
                                Ok(ip) => ip,
                                Err(_) => continue,
                            };
                            if !local_ips.contains(&msg_ip) {
                                let crypto_keys = state.crypto_keys.lock().unwrap();
                                let paired = crypto_keys.has_peer(&msg.fingerprint);
                                let mut devices = state.devices.lock().unwrap();
                                devices.insert(
                                    msg.ip.clone(),
                                    Device {
                                        name: msg.name,
                                        ip: msg.ip,
                                        port: msg.port,
                                        last_seen: get_current_timestamp(),
                                        paired,
                                        fingerprint: msg.fingerprint,
                                    },
                                );
                            }
                        }
                    }
                    Err(e) => eprintln!("Discovery receive error on {}: {}", local_ip, e),
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        });
    }
}

async fn start_discovery_announcer(state: AppState) {
    let multicast_addr: SocketAddr = format!("{}:{}", MULTICAST_ADDR, MULTICAST_PORT).parse().unwrap();

    tokio::spawn(async move {
        loop {
            let local_ips = get_all_local_ips();
            let hostname = get_hostname();
            let timestamp = get_current_timestamp();
            let fingerprint = state.crypto_keys.lock().unwrap().fingerprint();

            for local_ip in local_ips {
                let socket = match UdpSocket::bind((local_ip, 0)) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("Failed to bind announcer socket on {}: {}", local_ip, e);
                        continue;
                    }
                };
                if let Err(e) = socket.set_multicast_ttl_v4(2) {
                    eprintln!("Failed to set multicast TTL: {}", e);
                }
                if let Err(e) = socket.set_multicast_if_v4(&local_ip) {
                    eprintln!("Failed to set multicast interface on {}: {}", local_ip, e);
                }

                let msg = DiscoveryMessage {
                    name: hostname.clone(),
                    ip: local_ip.to_string(),
                    port: HTTP_PORT,
                    timestamp,
                    fingerprint: fingerprint.clone(),
                };

                if let Ok(data) = serde_json::to_vec(&msg) {
                    let _ = socket.send_to(&data, multicast_addr);
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn start_http_server(state: AppState, app_handle: tauri::AppHandle) {
    use warp::Filter;
    use warp::http::StatusCode;

    let app_handle = Arc::new(app_handle);
    let state = Arc::new(state);

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["*"])
        .allow_methods(vec!["GET", "POST", "HEAD", "OPTIONS"]);

    let state_status = state.clone();
    let status_route = warp::path("status")
        .and(warp::get())
        .and(warp::query::<HashMap<String, String>>())
        .and_then(move |params: HashMap<String, String>| {
            let _state = state_status.clone();
            async move {
                let filename = params.get("filename").unwrap_or(&String::new());
                let file_size = params.get("file_size").and_then(|s| s.parse::<u64>().ok());
                let partial_info = get_partial_info(filename);
                let response = match partial_info {
                    Some(info) => FileStatusResponse {
                        exists: true,
                        received_bytes: info.received_bytes,
                        file_size: Some(info.file_size),
                    },
                    None => FileStatusResponse {
                        exists: false,
                        received_bytes: 0,
                        file_size,
                    },
                };
                Ok::<_, warp::Rejection>(warp::reply::json(&response))
            }
        });

    let state_pair = state.clone();
    let app_handle_pair = app_handle.clone();
    let pair_route = warp::path("pair")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(move |pairing: PairingInfo| {
            let state = state_pair.clone();
            let app_handle = app_handle_pair.clone();
            async move {
                let mut crypto_keys = state.crypto_keys.lock().unwrap();
                match crypto_keys.add_peer_key(pairing.fingerprint.clone(), pairing.public_key_pem.clone()) {
                    Ok(()) => {
                        let mut devices = state.devices.lock().unwrap();
                        if let Some(device) = devices.get_mut(&pairing.ip) {
                            device.paired = true;
                            device.fingerprint = pairing.fingerprint.clone();
                        }
                        app_handle.emit_all("device-paired", serde_json::json!({
                            "device_ip": pairing.ip,
                            "device_name": pairing.device_name,
                            "fingerprint": pairing.fingerprint,
                        })).ok();
                        Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({"status": "ok"})))
                    }
                    Err(e) => Ok(warp::reply::json(&serde_json::json!({"status": "error", "message": e}))),
                }
            }
        });

    let state_receive = state.clone();
    let app_handle_receive = app_handle.clone();
    let receive_route = warp::path("receive")
        .and(warp::post())
        .and(warp::body::bytes())
        .and(warp::header::<String>("x-filename"))
        .and(warp::header::<u64>("x-file-size"))
        .and(warp::header::<u64>("x-offset"))
        .and(warp::header::<String>("x-checksum"))
        .and(warp::header::optional::<String>("x-encrypted"))
        .and(warp::header::optional::<String>("x-fingerprint"))
        .and_then(move |bytes: bytes::Bytes, filename: String, file_size: u64, offset: u64, checksum: String, encrypted: Option<String>, fingerprint: Option<String>| {
            let state = state_receive.clone();
            let app_handle = app_handle_receive.clone();
            async move {
                let is_encrypted = encrypted.as_deref() == Some("true");
                let data_bytes = if is_encrypted {
                    let payload = match EncryptedPayload::from_json(&String::from_utf8_lossy(&bytes)) {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok::<_, warp::Rejection>(warp::reply::with_status(
                                warp::reply::json(&serde_json::json!({"status": "error", "message": format!("Parse encrypted payload: {}", e)})),
                                StatusCode::BAD_REQUEST,
                            ));
                        }
                    };
                    let crypto_keys = state.crypto_keys.lock().unwrap();
                    match crypto_keys.decrypt(&payload) {
                        Ok(decrypted) => decrypted,
                        Err(e) => {
                            return Ok::<_, warp::Rejection>(warp::reply::with_status(
                                warp::reply::json(&serde_json::json!({"status": "error", "message": format!("Decrypt error: {}", e)})),
                                StatusCode::BAD_REQUEST,
                            ));
                        }
                    }
                } else {
                    bytes.to_vec()
                };

                let data_checksum = calculate_checksum(&data_bytes);
                if data_checksum != checksum {
                    return Ok::<_, warp::Rejection>(warp::reply::with_status(
                        warp::reply::json(&serde_json::json!({"status": "error", "message": "Checksum mismatch"})),
                        StatusCode::BAD_REQUEST,
                    ));
                }

                let downloads_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
                let final_path = downloads_dir.join(&filename);
                let temp_path = get_temp_file_path(&filename);

                if offset == 0 && final_path.exists() {
                    return Ok::<_, warp::Rejection>(warp::reply::with_status(
                        warp::reply::json(&serde_json::json!({"status": "error", "message": "File already exists"})),
                        StatusCode::CONFLICT,
                    ));
                }

                let result = (|| -> std::io::Result<()> {
                    let mut file = OpenOptions::new()
                        .create(true)
                        .write(true)
                        .open(&temp_path)?;
                    file.seek(SeekFrom::Start(offset))?;
                    file.write_all(&data_bytes)?;
                    file.flush()?;

                    let received_bytes = offset + data_bytes.len() as u64;
                    let info = PartialFileInfo {
                        filename: filename.clone(),
                        file_size,
                        received_bytes,
                        checksum: String::new(),
                    };
                    save_partial_info(&info);

                    if received_bytes >= file_size {
                        std::fs::rename(&temp_path, &final_path)?;
                        let info_path = temp_path.with_extension("info");
                        let _ = std::fs::remove_file(info_path);
                        app_handle.emit_all("file-received", serde_json::json!({
                            "filename": filename,
                            "size": file_size,
                            "encrypted": is_encrypted,
                        })).ok();
                    }
                    Ok(())
                })();

                match result {
                    Ok(()) => {
                        let received_bytes = offset + data_bytes.len() as u64;
                        Ok(warp::reply::with_status(
                            warp::reply::json(&serde_json::json!({
                                "status": "ok",
                                "received_bytes": received_bytes,
                                "completed": received_bytes >= file_size
                            })),
                            StatusCode::OK,
                        ))
                    }
                    Err(e) => Ok(warp::reply::with_status(
                        warp::reply::json(&serde_json::json!({"status": "error", "message": e.to_string()})),
                        StatusCode::INTERNAL_SERVER_ERROR,
                    )),
                }
            }
        });

    let routes = status_route
        .or(pair_route)
        .or(receive_route)
        .with(cors);

    tokio::spawn(async move {
        warp::serve(routes)
            .run(([0, 0, 0, 0], HTTP_PORT))
            .await;
    });
}

async fn start_clipboard_listener(state: AppState, app_handle: tauri::AppHandle) {
    let local_ips = get_all_local_ips();
    let multicast_ip: Ipv4Addr = MULTICAST_ADDR.parse().unwrap();

    for local_ip in local_ips {
        let state = state.clone();
        let app_handle = app_handle.clone();

        tokio::spawn(async move {
            let socket = match UdpSocket::bind((local_ip, CLIPBOARD_PORT)) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to bind clipboard listener to {}: {}", local_ip, e);
                    return;
                }
            };
            if let Err(e) = socket.join_multicast_v4(&multicast_ip, &local_ip) {
                eprintln!("Failed to join clipboard multicast on {}: {}", local_ip, e);
                return;
            }

            let mut buf = [0u8; 131072];
            loop {
                match socket.recv_from(&mut buf) {
                    Ok((len, _src)) => {
                        if let Ok(payload) = EncryptedPayload::from_json(&String::from_utf8_lossy(&buf[..len])) {
                            let crypto_keys = state.crypto_keys.lock().unwrap();
                            let enabled = state.clipboard_sync_enabled.lock().unwrap();
                            if *enabled {
                                if let Ok(content) = crypto_keys.decrypt(&payload) {
                                    if let Ok(text) = String::from_utf8(content) {
                                        let mut last_content = state.last_clipboard_content.lock().unwrap();
                                        if *last_content != text {
                                            *last_content = text.clone();
                                            drop(last_content);
                                            if let Ok(mut clipboard) = clipboard::ClipboardContext::new() {
                                                let _ = clipboard.set_contents(text);
                                            }
                                            app_handle.emit_all("clipboard-received", serde_json::json!({})).ok();
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(_e) => {}
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        });
    }
}

fn start_clipboard_monitor(state: AppState) {
    std::thread::spawn(move || {
        let mut last_content = String::new();

        loop {
            {
                let enabled = state.clipboard_sync_enabled.lock().unwrap();
                if !*enabled {
                    std::thread::sleep(Duration::from_secs(1));
                    continue;
                }
            }

            if let Ok(mut clipboard) = clipboard::ClipboardContext::new() {
                if let Ok(content) = clipboard.get_contents() {
                    if !content.is_empty() && content != last_content {
                        last_content = content.clone();

                        let crypto_keys = state.crypto_keys.lock().unwrap();
                        let peers: Vec<String> = crypto_keys.peer_keys.keys().cloned().collect();

                        if !peers.is_empty() {
                            for fingerprint in &peers {
                                if let Ok(payload) = crypto_keys.encrypt_for_peer(fingerprint, content.as_bytes()) {
                                    let json = payload.to_json();
                                    let local_ips = get_all_local_ips();
                                    for local_ip in local_ips {
                                        if let Ok(socket) = UdpSocket::bind((local_ip, 0)) {
                                            let _ = socket.set_multicast_if_v4(&local_ip);
                                            let addr: SocketAddr = format!("{}:{}", MULTICAST_ADDR, CLIPBOARD_PORT).parse().unwrap();
                                            let _ = socket.send_to(json.as_bytes(), addr);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

#[tauri::command]
fn get_device_name() -> String {
    get_hostname()
}

#[tauri::command]
fn get_device_ip() -> String {
    get_local_ip()
}

#[tauri::command]
fn get_all_ips() -> Vec<String> {
    get_all_local_ips().iter().map(|ip| ip.to_string()).collect()
}

#[tauri::command]
fn discover_devices(state: State<AppState>) -> Vec<Device> {
    let devices = state.devices.lock().unwrap();
    let now = get_current_timestamp();
    devices
        .values()
        .filter(|d| now - d.last_seen < 30)
        .cloned()
        .collect()
}

#[tauri::command]
fn get_qr_code_data(state: State<AppState>) -> Result<String, String> {
    let crypto_keys = state.crypto_keys.lock().unwrap();
    let pairing_info = PairingInfo {
        device_name: get_hostname(),
        ip: get_local_ip(),
        port: HTTP_PORT,
        public_key_pem: crypto_keys.public_key_pem(),
        fingerprint: crypto_keys.fingerprint(),
    };
    serde_json::to_string(&pairing_info).map_err(|e| e.to_string())
}

#[tauri::command]
fn generate_qr_image(data: String) -> Result<Vec<u8>, String> {
    use qrcode::QrCode;
    let code = QrCode::new(data.as_bytes()).map_err(|e| e.to_string())?;
    let image = code.render::<image::Rgba<u8>>()
        .min_dimensions(256, 256)
        .build();
    let mut png_bytes = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(png_bytes)
}

#[tauri::command]
fn pair_with_device(qr_data: String, state: State<AppState>) -> Result<(), String> {
    let pairing_info: PairingInfo = serde_json::from_str(&qr_data)
        .map_err(|e| format!("Invalid QR data: {}", e))?;

    {
        let mut crypto_keys = state.crypto_keys.lock().unwrap();
        crypto_keys.add_peer_key(pairing_info.fingerprint.clone(), pairing_info.public_key_pem.clone())?;
    }

    let mut devices = state.devices.lock().unwrap();
    if let Some(device) = devices.get_mut(&pairing_info.ip) {
        device.paired = true;
        device.fingerprint = pairing_info.fingerprint.clone();
    } else {
        devices.insert(pairing_info.ip.clone(), Device {
            name: pairing_info.device_name,
            ip: pairing_info.ip.clone(),
            port: pairing_info.port,
            last_seen: get_current_timestamp(),
            paired: true,
            fingerprint: pairing_info.fingerprint,
        });
    }

    let my_pairing = {
        let crypto_keys = state.crypto_keys.lock().unwrap();
        PairingInfo {
            device_name: get_hostname(),
            ip: get_local_ip(),
            port: HTTP_PORT,
            public_key_pem: crypto_keys.public_key_pem(),
            fingerprint: crypto_keys.fingerprint(),
        }
    };

    let url = format!("http://{}:{}/pair", pairing_info.ip, pairing_info.port);
    match ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_json(ureq::json!({
            "device_name": my_pairing.device_name,
            "ip": my_pairing.ip,
            "port": my_pairing.port,
            "public_key_pem": my_pairing.public_key_pem,
            "fingerprint": my_pairing.fingerprint,
        }))
    {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to send pairing to peer: {}", e)),
    }
}

#[tauri::command]
fn is_device_paired(fingerprint: String, state: State<AppState>) -> bool {
    state.crypto_keys.lock().unwrap().has_peer(&fingerprint)
}

#[tauri::command]
fn get_file_status(ip: String, port: u16, filename: String, file_size: u64) -> Result<FileStatusResponse, String> {
    let url = format!("http://{}:{}/status?filename={}&file_size={}", ip, port, filename, file_size);
    match ureq::get(&url).call() {
        Ok(resp) => {
            let status: FileStatusResponse = resp.into_json().map_err(|e| e.to_string())?;
            Ok(status)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn send_file_chunk(
    ip: String,
    port: u16,
    filename: String,
    file_size: u64,
    offset: u64,
    data: Vec<u8>,
    fingerprint: Option<String>,
    state: State<AppState>,
) -> Result<SendFileResponse, String> {
    let checksum = calculate_checksum(&data);
    let url = format!("http://{}:{}/receive", ip, port);

    let (send_data, is_encrypted) = if let Some(ref fp) = fingerprint {
        let crypto_keys = state.crypto_keys.lock().unwrap();
        match crypto_keys.encrypt_for_peer(fp, &data) {
            Ok(payload) => (payload.to_json().into_bytes(), true),
            Err(_) => (data, false),
        }
    } else {
        (data, false)
    };

    let mut request = ureq::post(&url)
        .set("X-Filename", &filename)
        .set("X-File-Size", &file_size.to_string())
        .set("X-Offset", &offset.to_string())
        .set("X-Checksum", &checksum);

    if is_encrypted {
        request = request
            .set("X-Encrypted", "true")
            .set("X-Fingerprint", fingerprint.as_deref().unwrap_or(""));
    }

    match request.send_bytes(&send_data) {
        Ok(resp) => {
            let result: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
            Ok(SendFileResponse {
                success: result["status"].as_str() == Some("ok"),
                received_bytes: result["received_bytes"].as_u64().unwrap_or(0),
                completed: result["completed"].as_bool().unwrap_or(false),
                message: result["message"].as_str().unwrap_or("").to_string(),
            })
        }
        Err(ureq::Error::Status(code, resp)) => {
            let result: serde_json::Value = resp.into_json().unwrap_or(serde_json::json!({}));
            Ok(SendFileResponse {
                success: false,
                received_bytes: 0,
                completed: false,
                message: result["message"].as_str().unwrap_or(&format!("HTTP {}", code)).to_string(),
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_clipboard_sync(enabled: bool, state: State<AppState>) -> Result<(), String> {
    let mut sync_enabled = state.clipboard_sync_enabled.lock().unwrap();
    *sync_enabled = enabled;
    Ok(())
}

#[tauri::command]
fn get_clipboard_content() -> Result<String, String> {
    let mut clipboard = clipboard::ClipboardContext::new()
        .map_err(|e| e.to_string())?;
    clipboard.get_contents().map_err(|e| e.to_string())
}

fn main() {
    let state = AppState {
        devices: Arc::new(Mutex::new(HashMap::new())),
        clipboard_sync_enabled: Arc::new(Mutex::new(false))),
        last_clipboard_content: Arc::new(Mutex::new(String::new()))),
        partial_files: Arc::new(Mutex::new(HashMap::new())),
        crypto_keys: Arc::new(Mutex::new(CryptoKeys::new()))),
        tasks: Arc::new(Mutex::new(Vec::new()))),
    };

    tauri::Builder::default()
        .manage(state.clone())
        .setup(|app| {
            let app_handle = app.handle();

            tauri::async_runtime::spawn(start_discovery_listener(state.clone()));
            tauri::async_runtime::spawn(start_discovery_announcer(state.clone()));
            tauri::async_runtime::spawn(start_http_server(state.clone(), app_handle.clone()));
            tauri::async_runtime::spawn(start_clipboard_listener(state.clone(), app_handle));

            start_clipboard_monitor(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_device_name,
            get_device_ip,
            get_all_ips,
            discover_devices,
            get_qr_code_data,
            generate_qr_image,
            pair_with_device,
            is_device_paired,
            get_file_status,
            send_file_chunk,
            set_clipboard_sync,
            get_clipboard_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
