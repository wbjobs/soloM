use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use clap::Parser;
use tracing::info;
use common::{DataPoint, Value};
use storage::{TimeSeriesEngine, ContinuousQueryManager};
use server::{start_grpc_server, start_http_server};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long, default_value = "./data")]
    data_dir: String,

    #[arg(short, long, default_value = "50051")]
    grpc_port: u16,

    #[arg(short, long, default_value = "8080")]
    http_port: u16,

    #[arg(long)]
    demo: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let args = Args::parse();

    if args.demo {
        run_demo(&args.data_dir).await?;
        return Ok(());
    }

    let engine = TimeSeriesEngine::new(Path::new(&args.data_dir))?;
    info!("Time Series Engine initialized at: {}", args.data_dir);

    let cq_manager = Arc::new(ContinuousQueryManager::new(
        engine.clone(),
        Path::new(&args.data_dir),
    )?);
    info!("Continuous Query Manager initialized");

    let grpc_addr: SocketAddr = format!("0.0.0.0:{}", args.grpc_port).parse()?;
    let http_addr: SocketAddr = format!("0.0.0.0:{}", args.http_port).parse()?;

    let grpc_engine = engine.clone();
    let grpc_handle = tokio::spawn(async move {
        info!("gRPC server starting on {}", grpc_addr);
        if let Err(e) = start_grpc_server(grpc_engine, grpc_addr).await {
            eprintln!("gRPC server error: {}", e);
        }
    });

    let http_engine = engine.clone();
    let http_cq_manager = cq_manager.clone();
    let http_handle = tokio::spawn(async move {
        info!("HTTP server starting on {}", http_addr);
        if let Err(e) = start_http_server(http_engine, http_cq_manager, http_addr).await {
            eprintln!("HTTP server error: {}", e);
        }
    });

    let cq_handle = tokio::spawn(async move {
        cq_manager.start().await;
    });

    info!("TSDB Server started!");
    info!("  gRPC endpoint: {}", grpc_addr);
    info!("  HTTP endpoint: {}", http_addr);
    info!("  Continuous Query Manager: running");

    tokio::try_join!(grpc_handle, http_handle, cq_handle)?;

    Ok(())
}

async fn run_demo(data_dir: &str) -> anyhow::Result<()> {
    info!("Running demo...");

    let engine = TimeSeriesEngine::new(Path::new(data_dir))?;
    info!("Engine initialized");

    info!("Writing test data...");
    let now = chrono::Utc::now().timestamp_millis();

    for i in 0..10 {
        let ts = now - (10 - i) * 60 * 1000;
        
        let point = DataPoint::new("cpu".to_string())
            .with_tag("host".to_string(), "server1".to_string())
            .with_tag("region".to_string(), "us-west".to_string())
            .with_timestamp(ts)
            .with_field("value".to_string(), Value::Float(45.0 + i as f64 * 2.5));
        
        engine.write(point)?;

        let point2 = DataPoint::new("cpu".to_string())
            .with_tag("host".to_string(), "server2".to_string())
            .with_tag("region".to_string(), "us-east".to_string())
            .with_timestamp(ts)
            .with_field("value".to_string(), Value::Float(50.0 + i as f64 * 1.5));
        
        engine.write(point2)?;
    }

    info!("Data written successfully!");

    let query_str = "SELECT mean(value) FROM cpu WHERE time > now() - 1h";
    info!("Executing query: {}", query_str);

    let parsed_query = query::QueryParser::parse(query_str)?;
    info!("Parsed query: {:?}", parsed_query);

    let executor = query::QueryExecutor::new(engine.clone());
    let result = executor.execute(&parsed_query)?;
    
    info!("Query result: {}", serde_json::to_string_pretty(&result)?);

    let query_str2 = "SELECT max(value) FROM cpu WHERE host = 'server1' AND time > now() - 1h";
    info!("Executing query: {}", query_str2);
    
    let parsed_query2 = query::QueryParser::parse(query_str2)?;
    let result2 = executor.execute(&parsed_query2)?;
    
    info!("Query result: {}", serde_json::to_string_pretty(&result2)?);

    engine.flush()?;
    info!("Demo completed successfully!");

    Ok(())
}
