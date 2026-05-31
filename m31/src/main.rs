use tsdb_gateway::config::Config;
use tsdb_gateway::gateway::run_gateway;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt::init();

    let config = Config::default_config();
    run_gateway(config).await?;

    Ok(())
}
