use hyper::body::to_bytes;
use hyper::client::conn::Builder;
use hyper::{Body, Method, Request};
use std::env;
use std::sync::RwLock;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TransportKind {
    NamedPipe,
    Tcp,
}

#[derive(Debug, Clone)]
pub struct DockerTransport {
    kind: TransportKind,
    pipe_name: String,
    tcp_base_url: String,
}

pub struct DockerTransportManager {
    transport: RwLock<DockerTransport>,
    reqwest_client: reqwest::Client,
}

impl DockerTransport {
    pub fn detect() -> Self {
        if let Ok(host) = env::var("DOCKER_HOST") {
            return Self::from_docker_host(&host);
        }

        #[cfg(target_os = "windows")]
        {
            Self {
                kind: TransportKind::NamedPipe,
                pipe_name: r"\\.\pipe\docker_engine".to_string(),
                tcp_base_url: "http://localhost:2375".to_string(),
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            Self {
                kind: TransportKind::Tcp,
                pipe_name: String::new(),
                tcp_base_url: "http://localhost:2375".to_string(),
            }
        }
    }

    fn from_docker_host(host: &str) -> Self {
        let trimmed = host.trim();

        #[cfg(target_os = "windows")]
        {
            if trimmed.starts_with("npipe:") || trimmed.starts_with(r"\\") {
                let pipe_name = if trimmed.starts_with("npipe://") {
                    let rest = trimmed.trim_start_matches("npipe://");
                    format!(r"\\.\{}", rest.replace('/', r"\"))
                } else if trimmed.starts_with("npipe:") {
                    let rest = trimmed.trim_start_matches("npipe:");
                    format!(r"\\.\{}", rest.replace('/', r"\"))
                } else {
                    trimmed.to_string()
                };
                return Self {
                    kind: TransportKind::NamedPipe,
                    pipe_name,
                    tcp_base_url: "http://localhost:2375".to_string(),
                };
            }
        }

        if trimmed.starts_with("tcp://") || trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            let base_url = if trimmed.starts_with("tcp://") {
                trimmed.replace("tcp://", "http://")
            } else {
                trimmed.to_string()
            };
            return Self {
                kind: TransportKind::Tcp,
                pipe_name: String::new(),
                tcp_base_url: base_url,
            };
        }

        #[cfg(target_os = "windows")]
        {
            Self {
                kind: TransportKind::NamedPipe,
                pipe_name: r"\\.\pipe\docker_engine".to_string(),
                tcp_base_url: "http://localhost:2375".to_string(),
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            Self {
                kind: TransportKind::Tcp,
                pipe_name: String::new(),
                tcp_base_url: "http://localhost:2375".to_string(),
            }
        }
    }

    pub fn fallback_to_tcp(&mut self) {
        self.kind = TransportKind::Tcp;
    }
}

impl DockerTransportManager {
    pub fn new() -> Self {
        let transport = DockerTransport::detect();
        eprintln!("[docker-analyzer] Transport: {:?}, pipe={}, tcp={}", 
            transport.kind, transport.pipe_name, transport.tcp_base_url);
        Self {
            transport: RwLock::new(transport),
            reqwest_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub async fn get_text(&self, path: &str) -> Result<String, String> {
        let kind = {
            self.transport.read().unwrap().kind
        };

        match kind {
            TransportKind::NamedPipe => {
                let (pipe_name, tcp_base_url) = {
                    let t = self.transport.read().unwrap();
                    (t.pipe_name.clone(), t.tcp_base_url.clone())
                };

                match self.named_pipe_get(&pipe_name, path).await {
                    Ok(result) => Ok(result),
                    Err(np_err) => {
                        eprintln!("[docker-analyzer] Named pipe failed ({}): {}, falling back to TCP", path, np_err);
                        {
                            let mut t = self.transport.write().unwrap();
                            t.fallback_to_tcp();
                        }
                        self.tcp_get(&tcp_base_url, path).await
                    }
                }
            }
            TransportKind::Tcp => {
                let tcp_base_url = {
                    self.transport.read().unwrap().tcp_base_url.clone()
                };
                self.tcp_get(&tcp_base_url, path).await
            }
        }
    }

    async fn tcp_get(&self, base_url: &str, path: &str) -> Result<String, String> {
        let url = format!("{}{}", base_url.trim_end_matches('/'), path);
        match self.reqwest_client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    response
                        .text()
                        .await
                        .map_err(|e| format!("Failed to read response: {}", e))
                } else {
                    Err(format!("Docker API error: {} for {}", response.status(), url))
                }
            }
            Err(e) => Err(format!(
                "TCP connection failed ({}). Ensure Docker Desktop is running and 'Expose daemon on tcp://localhost:2375' is enabled in Docker Desktop settings, or run this application with appropriate permissions for named pipe access. Error: {}", 
                url, e
            )),
        }
    }

    #[cfg(target_os = "windows")]
    async fn named_pipe_get(
        &self,
        pipe_name: &str,
        path: &str,
    ) -> Result<String, String> {
        let stream = tokio::net::windows::named_pipe::ClientOptions::new()
            .open(pipe_name)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    format!(
                        "Permission denied opening named pipe '{}'. Solutions:\n\
                         1. Add your user to the 'docker-users' group: net localgroup docker-users {} /add\n\
                         2. Run this application as Administrator\n\
                         3. Enable 'Expose daemon on tcp://localhost:2375' in Docker Desktop settings\n\
                         Original error: {}", 
                        pipe_name, 
                        env::var("USERNAME").unwrap_or_else(|_| "YOUR_USERNAME".to_string()), 
                        e
                    )
                } else if e.kind() == std::io::ErrorKind::NotFound {
                    format!(
                        "Named pipe '{}' not found. Is Docker Desktop running? Error: {}", 
                        pipe_name, e
                    )
                } else {
                    format!("Named pipe open error ({}): {}", pipe_name, e)
                }
            })?;

        let (mut sender, connection) = Builder::new()
            .handshake(stream)
            .await
            .map_err(|e| format!("HTTP handshake error on named pipe: {}", e))?;

        tokio::spawn(async move {
            let _ = connection.await;
        });

        let request = Request::builder()
            .method(Method::GET)
            .uri(path)
            .header("Host", "localhost")
            .body(Body::empty())
            .map_err(|e| format!("Request build error: {}", e))?;

        let response = sender
            .send_request(request)
            .await
            .map_err(|e| format!("Send request error: {}", e))?;

        let status = response.status();
        let body_bytes = to_bytes(response.into_body())
            .await
            .map_err(|e| format!("Body read error: {}", e))?;

        if status.is_success() {
            String::from_utf8(body_bytes.to_vec())
                .map_err(|e| format!("UTF-8 decode error: {}", e))
        } else {
            Err(format!("Docker API error: {} for {}", status, path))
        }
    }

    #[cfg(not(target_os = "windows"))]
    async fn named_pipe_get(
        &self,
        _pipe_name: &str,
        _path: &str,
    ) -> Result<String, String> {
        Err("Named pipe transport is only available on Windows".to_string())
    }

    pub fn get_transport_kind(&self) -> TransportKind {
        self.transport.read().unwrap().kind
    }
}
