use crate::aggregator::Aggregator;
use crate::backend::{BackendNode, ConnectionPool, WriteTask};
use crate::config::Config;
use crate::protocol::{Parser, Point};
use crate::router::Router;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router as AxumRouter,
};
use bytes::Bytes;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::signal;
use tokio::time::Duration;

struct AppState {
    config: Config,
    parser: Parser,
    router: Router,
    pool: ConnectionPool,
    aggregator: Aggregator,
    started_at: SystemTime,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    uptime: String,
    started_at: String,
    version: String,
}

#[derive(Serialize)]
struct WriteResponse {
    total_points: usize,
    direct_points: usize,
    aggregated_points: usize,
    routed_to_nodes: HashMap<String, usize>,
    status: String,
}

#[derive(Serialize)]
struct QueryResponse {
    measurement: String,
    node: String,
    count: usize,
    points: Vec<Point>,
}

#[derive(Serialize)]
struct StatsResponse {
    gateway: GatewayInfo,
    pool: crate::backend::PoolStats,
    nodes: HashMap<String, crate::backend::NodeStats>,
    aggregator: crate::aggregator::AggregatorStats,
}

#[derive(Serialize)]
struct GatewayInfo {
    uptime: String,
    http_port: u16,
    hash_replicas: usize,
}

#[derive(Serialize)]
struct NodesResponse {
    nodes: Vec<NodeInfo>,
    hash_ring: HashRingInfo,
}

#[derive(Serialize)]
struct NodeInfo {
    name: String,
    stats: crate::backend::NodeStats,
    measurements: HashMap<String, usize>,
}

#[derive(Serialize)]
struct HashRingInfo {
    node_count: usize,
    replicas: usize,
}

pub async fn run_gateway(config: Config) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let parser = Parser::new();

    let router = Router::new(&config.backend_nodes, config.hash_replicas)
        .map_err(|e| format!("failed to create router: {}", e))?;

    let pool = ConnectionPool::new(
        &config.backend_nodes,
        config.async_queue_size,
        config.worker_count,
    )
    .await?;

    let aggregator = Aggregator::new(config.aggregation.clone());

    let started_at = SystemTime::now();

    let state = Arc::new(AppState {
        config: config.clone(),
        parser,
        router,
        pool,
        aggregator,
        started_at,
    });

    let app = AxumRouter::new()
        .route("/health", get(health_handler))
        .route("/write", post(write_handler))
        .route("/api/v2/write", post(write_handler))
        .route("/query", get(query_handler))
        .route("/stats", get(stats_handler))
        .route("/nodes", get(nodes_handler))
        .route("/aggregation/flush", post(force_flush_handler))
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.http_port)).await?;

    println!("TSDB Gateway starting on port {}...", config.http_port);
    println!("Backend nodes: {:?}", config.backend_nodes);
    println!("Hash replicas: {}", config.hash_replicas);
    println!("Worker count: {}", config.worker_count);
    println!("Async queue size: {}", config.async_queue_size);
    println!("Aggregation enabled: {}", config.aggregation.enabled);
    if config.aggregation.enabled {
        println!("  Threshold: {}s", config.aggregation.threshold_secs);
        println!("  Interval: {}s", config.aggregation.interval_secs);
        println!("  Method: {:?}", config.aggregation.method);
        println!("  Flush interval: {}s", config.aggregation.flush_interval_secs);
    }
    println!("Hash ring:");
    println!("{}", state.router);

    let server = axum::serve(listener, app);

    let shutdown = async {
        signal::ctrl_c().await.expect("failed to listen for event");
        println!("\nShutting down gateway...");
    };

    tokio::select! {
        result = server => {
            if let Err(e) = result {
                eprintln!("server error: {}", e);
            }
        }
        _ = shutdown => {
            println!("Flushing aggregator...");
            let _ = state.aggregator.close().await;
            println!("Waiting for queue to drain...");
            let _ = state.pool.wait_for_drain(Duration::from_secs(5)).await;
            let _ = state.pool.close().await;
            println!("Gateway shutdown complete");
        }
    }

    Ok(())
}

async fn health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let uptime = state.started_at.elapsed().unwrap_or_default();
    let started_at_secs = state
        .started_at
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Json(HealthResponse {
        status: "ok".to_string(),
        uptime: format!("{:?}", uptime),
        started_at: format!("{}", started_at_secs),
        version: "1.0.0".to_string(),
    })
}

async fn write_handler(
    State(state): State<Arc<AppState>>,
    body: Bytes,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let points = state
        .parser
        .parse(&body)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("parse error: {}", e)))?;

    let total_count = points.len();

    let mut direct_points = Vec::new();
    let mut aggregated_buffer = Vec::new();

    state
        .aggregator
        .ingest(&points, &mut direct_points, &mut aggregated_buffer)
        .await;

    let direct_count = direct_points.len();
    let aggregated_count = aggregated_buffer.len();

    let all_points: Vec<Point> = direct_points.into_iter().chain(aggregated_buffer.into_iter()).collect();

    if all_points.is_empty() {
        return Ok(Json(WriteResponse {
            total_points: total_count,
            direct_points: direct_count,
            aggregated_points: aggregated_count,
            routed_to_nodes: HashMap::new(),
            status: "accepted".to_string(),
        }));
    }

    let healthy_nodes = state.pool.get_healthy_nodes().await;

    let routed = if healthy_nodes.is_empty() {
        state
            .router
            .route(&all_points)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("routing error: {}", e)))?
    } else {
        state
            .router
            .route_with_healthy_nodes(&all_points, &healthy_nodes)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("routing error: {}", e)))?
    };

    for (node_name, node_points) in &routed {
        let task = WriteTask {
            node_name: node_name.clone(),
            points: node_points.clone(),
        };
        if let Err(e) = state.pool.async_write(task).await {
            eprintln!("Async write error for node {}: {}", node_name, e);
        }
    }

    let mut routing_info = HashMap::new();
    for (node_name, node_points) in &routed {
        routing_info.insert(node_name.clone(), node_points.len());
    }

    Ok(Json(WriteResponse {
        total_points: total_count,
        direct_points: direct_count,
        aggregated_points: aggregated_count,
        routed_to_nodes: routing_info,
        status: "accepted".to_string(),
    }))
}

async fn query_handler(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let measurement = params
        .get("measurement")
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "measurement parameter required".to_string()))?;

    let node_name = state
        .router
        .get_node_for_measurement(measurement)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("routing error: {}", e)))?;

    let node = state
        .pool
        .get_node(&node_name)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("node not found: {}", e)))?;

    let points = node
        .query(measurement)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("query error: {}", e)))?;

    Ok(Json(QueryResponse {
        measurement: measurement.clone(),
        node: node_name,
        count: points.len(),
        points,
    }))
}

async fn stats_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let uptime = state.started_at.elapsed().unwrap_or_default();
    let node_stats = state.pool.stats().await;
    let pool_stats = state.pool.pool_stats();
    let aggregator_stats = state.aggregator.stats();

    Json(StatsResponse {
        gateway: GatewayInfo {
            uptime: format!("{:?}", uptime),
            http_port: state.config.http_port,
            hash_replicas: state.config.hash_replicas,
        },
        pool: pool_stats,
        nodes: node_stats,
        aggregator: aggregator_stats,
    })
}

async fn nodes_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut nodes_info = Vec::new();

    for node_name in state.pool.node_names().await {
        if let Ok(node) = state.pool.get_node(&node_name).await {
            let mut measurements = HashMap::new();

            if let Some(cache_node) = node
                .as_any()
                .downcast_ref::<crate::backend::MemoryCacheNode>()
            {
                for m in cache_node.get_all_measurements() {
                    if let Ok(points) = cache_node.query(&m) {
                        measurements.insert(m, points.len());
                    }
                }
            }

            nodes_info.push(NodeInfo {
                name: node_name,
                stats: node.stats(),
                measurements,
            });
        }
    }

    Json(NodesResponse {
        nodes: nodes_info,
        hash_ring: HashRingInfo {
            node_count: state.router.node_count(),
            replicas: state.config.hash_replicas,
        },
    })
}

#[derive(Serialize)]
struct FlushResponse {
    flushed_points: usize,
    status: String,
}

async fn force_flush_handler(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, (StatusCode, String)> {
    match state.aggregator.flush_all().await {
        Ok(points) => {
            let count = points.len();

            if !points.is_empty() {
                let healthy_nodes = state.pool.get_healthy_nodes().await;

                let routed = if healthy_nodes.is_empty() {
                    state.router.route(&points).map_err(|e| {
                        (StatusCode::INTERNAL_SERVER_ERROR, format!("routing error: {}", e))
                    })?
                } else {
                    state.router.route_with_healthy_nodes(&points, &healthy_nodes).map_err(|e| {
                        (StatusCode::INTERNAL_SERVER_ERROR, format!("routing error: {}", e))
                    })?
                };

                for (node_name, node_points) in &routed {
                    let task = WriteTask {
                        node_name: node_name.clone(),
                        points: node_points.clone(),
                    };
                    if let Err(e) = state.pool.async_write(task).await {
                        eprintln!("Flush write error for node {}: {}", node_name, e);
                    }
                }
            }

            Ok(Json(FlushResponse {
                flushed_points: count,
                status: "ok".to_string(),
            }))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("flush error: {}", e))),
    }
}
