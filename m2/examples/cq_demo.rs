use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use common::{
    DataPoint, Value, ContinuousQueryDefinition,
    AggregateType, Duration as CQDuration, TimeUnit,
};
use storage::{TimeSeriesEngine, ContinuousQueryManager};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let data_dir = "./data_cq_demo";
    let _ = std::fs::remove_dir_all(data_dir);

    let engine = TimeSeriesEngine::new(Path::new(data_dir))?;
    info!("Engine initialized");

    let cq_manager = Arc::new(ContinuousQueryManager::new(
        engine.clone(),
        Path::new(data_dir),
    )?);
    info!("CQ Manager initialized");

    let cq_manager_clone = cq_manager.clone();
    tokio::spawn(async move {
        cq_manager_clone.start().await;
    });

    info!("Creating continuous queries...");

    let cq_mean = ContinuousQueryDefinition::new(
        "cpu_mean_1m".to_string(),
        "cpu".to_string(),
        "cpu_mean_1m".to_string(),
        "value".to_string(),
        AggregateType::Mean,
        CQDuration { value: 1, unit: TimeUnit::Minutes },
    ).with_tags(vec!["host".to_string()]);
    cq_manager.register_query(cq_mean)?;

    let cq_max = ContinuousQueryDefinition::new(
        "cpu_max_1m".to_string(),
        "cpu".to_string(),
        "cpu_max_1m".to_string(),
        "value".to_string(),
        AggregateType::Max,
        CQDuration { value: 1, unit: TimeUnit::Minutes },
    ).with_tags(vec!["host".to_string()]);
    cq_manager.register_query(cq_max)?;

    info!("Registered CQs:");
    for cq in cq_manager.list_queries() {
        info!("  - {}: {}({}) from {} to {}",
            cq.name, cq.aggregate, cq.field,
            cq.source_measurement, cq.target_measurement
        );
    }

    info!("Writing test data...");
    let now = chrono::Utc::now().timestamp_millis();

    for i in 0..120 {
        let ts = now - (120 - i) * 1000;

        let point = DataPoint::new("cpu".to_string())
            .with_tag("host".to_string(), "server1".to_string())
            .with_tag("region".to_string(), "us-west".to_string())
            .with_timestamp(ts)
            .with_field("value".to_string(), Value::Float(45.0 + (i as f64 % 30) * 1.5));
        engine.write(point)?;

        let point2 = DataPoint::new("cpu".to_string())
            .with_tag("host".to_string(), "server2".to_string())
            .with_tag("region".to_string(), "us-east".to_string())
            .with_timestamp(ts)
            .with_field("value".to_string(), Value::Float(50.0 + (i as f64 % 20) * 1.0));
        engine.write(point2)?;

        if i % 30 == 0 {
            info!("  Written {} seconds of data...", i);
        }
    }

    info!("Data written, waiting for CQ to execute...");
    tokio::time::sleep(Duration::from_secs(3)).await;

    info!("CQ Status:");
    for status in cq_manager.get_all_statuses() {
        info!(
            "  - {}: enabled={}, runs={}, errors={}, last_run={:?}",
            status.name, status.enabled, status.run_count,
            status.error_count, status.last_run
        );
    }

    engine.flush()?;

    info!("\nQuerying CQ results (cpu_mean_1m)...");
    let results = engine.query_range(
        "cpu_mean_1m",
        None,
        "mean_value",
        now - 300_000,
        now,
    )?;

    for (series_key, data_points) in results {
        info!("  Series: {:?}", series_key.tags);
        for (ts, val) in data_points {
            let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ts)
                .unwrap()
                .format("%H:%M:%S");
            info!("    {}: {:?}", dt, val);
        }
    }

    info!("\nDemo completed successfully!");
    Ok(())
}
