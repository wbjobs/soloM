use std::net::SocketAddr;
use std::sync::Arc;
use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use common::{
    Result, ContinuousQueryDefinition, ContinuousQueryStatus,
    AggregateType, Duration, TimeUnit,
};
use storage::{TimeSeriesEngine, ContinuousQueryManager};
use query::{QueryParser, QueryExecutor};

#[derive(Clone)]
struct AppState {
    engine: TimeSeriesEngine,
    cq_manager: Arc<ContinuousQueryManager>,
}

#[derive(Debug, Deserialize)]
struct QueryRequest {
    q: String,
}

#[derive(Debug, Serialize)]
struct QueryResponse {
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[derive(Debug, Deserialize)]
struct CreateCQRequest {
    name: String,
    source_measurement: String,
    target_measurement: String,
    field: String,
    aggregate: String,
    interval_value: i64,
    interval_unit: String,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct CQListResponse {
    success: bool,
    queries: Vec<ContinuousQueryDefinition>,
}

#[derive(Debug, Serialize)]
struct CQStatusListResponse {
    success: bool,
    statuses: Vec<ContinuousQueryStatus>,
}

#[derive(Debug, Serialize)]
struct CQActionResponse {
    success: bool,
    message: String,
}

fn parse_time_unit(unit: &str) -> Option<TimeUnit> {
    match unit.to_lowercase().as_str() {
        "ms" | "milliseconds" => Some(TimeUnit::Milliseconds),
        "s" | "seconds" => Some(TimeUnit::Seconds),
        "m" | "minutes" => Some(TimeUnit::Minutes),
        "h" | "hours" => Some(TimeUnit::Hours),
        "d" | "days" => Some(TimeUnit::Days),
        "w" | "weeks" => Some(TimeUnit::Weeks),
        _ => None,
    }
}

fn parse_aggregate_type(agg: &str) -> Option<AggregateType> {
    match agg.to_lowercase().as_str() {
        "mean" => Some(AggregateType::Mean),
        "sum" => Some(AggregateType::Sum),
        "count" => Some(AggregateType::Count),
        "min" => Some(AggregateType::Min),
        "max" => Some(AggregateType::Max),
        "first" => Some(AggregateType::First),
        "last" => Some(AggregateType::Last),
        _ => None,
    }
}

async fn health() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: "0.1.0".to_string(),
    })
}

async fn create_cq(
    State(state): State<AppState>,
    Json(req): Json<CreateCQRequest>,
) -> impl IntoResponse {
    let interval_unit = match parse_time_unit(&req.interval_unit) {
        Some(u) => u,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(CQActionResponse {
                success: false,
                message: format!("Invalid interval unit: {}", req.interval_unit),
            }),
        ),
    };

    let aggregate = match parse_aggregate_type(&req.aggregate) {
        Some(a) => a,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(CQActionResponse {
                success: false,
                message: format!("Invalid aggregate type: {}", req.aggregate),
            }),
        ),
    };

    let definition = ContinuousQueryDefinition::new(
        req.name.clone(),
        req.source_measurement,
        req.target_measurement,
        req.field,
        aggregate,
        Duration {
            value: req.interval_value,
            unit: interval_unit,
        },
    ).with_tags(req.tags);

    match state.cq_manager.register_query(definition) {
        Ok(_) => (
            StatusCode::CREATED,
            Json(CQActionResponse {
                success: true,
                message: format!("Continuous query '{}' created", req.name),
            }),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(CQActionResponse {
                success: false,
                message: e.to_string(),
            }),
        ),
    }
}

async fn list_cqs(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let queries = state.cq_manager.list_queries();
    Json(CQListResponse {
        success: true,
        queries,
    })
}

async fn get_cq_statuses(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let statuses = state.cq_manager.get_all_statuses();
    Json(CQStatusListResponse {
        success: true,
        statuses,
    })
}

async fn delete_cq(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match state.cq_manager.unregister_query(&name) {
        Ok(true) => (
            StatusCode::OK,
            Json(CQActionResponse {
                success: true,
                message: format!("Continuous query '{}' deleted", name),
            }),
        ),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(CQActionResponse {
                success: false,
                message: format!("Continuous query '{}' not found", name),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(CQActionResponse {
                success: false,
                message: e.to_string(),
            }),
        ),
    }
}

async fn enable_cq(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match state.cq_manager.enable_query(&name) {
        Ok(true) => (
            StatusCode::OK,
            Json(CQActionResponse {
                success: true,
                message: format!("Continuous query '{}' enabled", name),
            }),
        ),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(CQActionResponse {
                success: false,
                message: format!("Continuous query '{}' not found", name),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(CQActionResponse {
                success: false,
                message: e.to_string(),
            }),
        ),
    }
}

async fn disable_cq(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match state.cq_manager.disable_query(&name) {
        Ok(true) => (
            StatusCode::OK,
            Json(CQActionResponse {
                success: true,
                message: format!("Continuous query '{}' disabled", name),
            }),
        ),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(CQActionResponse {
                success: false,
                message: format!("Continuous query '{}' not found", name),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(CQActionResponse {
                success: false,
                message: e.to_string(),
            }),
        ),
    }
}

async fn query(
    State(state): State<AppState>,
    Json(req): Json<QueryRequest>,
) -> impl IntoResponse {
    let engine = state.engine.clone();
    let executor = QueryExecutor::new(engine);

    match QueryParser::parse(&req.q) {
        Ok(parsed_query) => {
            match executor.execute(&parsed_query) {
                Ok(result) => {
                    match serde_json::to_value(result) {
                        Ok(json) => (
                            StatusCode::OK,
                            Json(QueryResponse {
                                success: true,
                                data: Some(json),
                                error: None,
                            }),
                        ),
                        Err(e) => (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(QueryResponse {
                                success: false,
                                data: None,
                                error: Some(format!("Serialization error: {}", e)),
                            }),
                        ),
                    }
                }
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(QueryResponse {
                        success: false,
                        data: None,
                        error: Some(format!("Query execution error: {}", e)),
                    }),
                ),
            }
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(QueryResponse {
                success: false,
                data: None,
                error: Some(format!("Query parse error: {}", e)),
            }),
        ),
    }
}

async fn measurements(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let measurements = state.engine.list_measurements();
    Json(serde_json::json!({
        "success": true,
        "measurements": measurements,
    }))
}

pub async fn start_http_server(
    engine: TimeSeriesEngine,
    cq_manager: Arc<ContinuousQueryManager>,
    addr: SocketAddr,
) -> Result<()> {
    let state = AppState { engine, cq_manager };

    let app = Router::new()
        .route("/health", get(health))
        .route("/query", post(query))
        .route("/measurements", get(measurements))
        .route("/cq", post(create_cq))
        .route("/cq", get(list_cqs))
        .route("/cq/status", get(get_cq_statuses))
        .route("/cq/:name", delete(delete_cq))
        .route("/cq/:name/enable", post(enable_cq))
        .route("/cq/:name/disable", post(disable_cq))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
