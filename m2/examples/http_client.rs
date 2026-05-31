use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();

    let health_resp = client
        .get("http://localhost:8080/health")
        .send()
        .await?;
    
    println!("Health Response: {}", health_resp.text().await?);

    let query = "SELECT mean(value) FROM cpu WHERE time > now() - 1h";
    let query_resp = client
        .post("http://localhost:8080/query")
        .json(&json!({ "q": query }))
        .send()
        .await?;
    
    println!("\nQuery Response:");
    println!("{}", serde_json::to_string_pretty(&query_resp.json::<serde_json::Value>().await?)?);

    let measurements_resp = client
        .get("http://localhost:8080/measurements")
        .send()
        .await?;
    
    println!("\nMeasurements Response:");
    println!("{}", serde_json::to_string_pretty(&measurements_resp.json::<serde_json::Value>().await?)?);

    println!("\n=== Continuous Query API Examples ===");

    println!("\n1. Creating a CQ (cpu_mean_1m)...");
    let create_cq_resp = client
        .post("http://localhost:8080/cq")
        .json(&json!({
            "name": "cpu_mean_1m",
            "source_measurement": "cpu",
            "target_measurement": "cpu_mean_1m",
            "field": "value",
            "aggregate": "mean",
            "interval_value": 1,
            "interval_unit": "m",
            "tags": ["host"]
        }))
        .send()
        .await?;
    println!("Create CQ Response: {}", serde_json::to_string_pretty(&create_cq_resp.json::<serde_json::Value>().await?)?);

    println!("\n2. Creating another CQ (cpu_max_1m)...");
    let create_cq_resp2 = client
        .post("http://localhost:8080/cq")
        .json(&json!({
            "name": "cpu_max_1m",
            "source_measurement": "cpu",
            "target_measurement": "cpu_max_1m",
            "field": "value",
            "aggregate": "max",
            "interval_value": 1,
            "interval_unit": "m",
            "tags": ["host"]
        }))
        .send()
        .await?;
    println!("Create CQ Response: {}", serde_json::to_string_pretty(&create_cq_resp2.json::<serde_json::Value>().await?)?);

    println!("\n3. Listing all CQs...");
    let list_cq_resp = client
        .get("http://localhost:8080/cq")
        .send()
        .await?;
    println!("List CQs Response: {}", serde_json::to_string_pretty(&list_cq_resp.json::<serde_json::Value>().await?)?);

    println!("\n4. Getting CQ statuses...");
    let status_resp = client
        .get("http://localhost:8080/cq/status")
        .send()
        .await?;
    println!("CQ Statuses: {}", serde_json::to_string_pretty(&status_resp.json::<serde_json::Value>().await?)?);

    println!("\n5. Disabling cpu_max_1m...");
    let disable_resp = client
        .post("http://localhost:8080/cq/cpu_max_1m/disable")
        .send()
        .await?;
    println!("Disable CQ Response: {}", serde_json::to_string_pretty(&disable_resp.json::<serde_json::Value>().await?)?);

    println!("\n6. Getting CQ statuses after disable...");
    let status_resp2 = client
        .get("http://localhost:8080/cq/status")
        .send()
        .await?;
    println!("CQ Statuses: {}", serde_json::to_string_pretty(&status_resp2.json::<serde_json::Value>().await?)?);

    println!("\n7. Deleting cpu_max_1m...");
    let delete_resp = client
        .delete("http://localhost:8080/cq/cpu_max_1m")
        .send()
        .await?;
    println!("Delete CQ Response: {}", serde_json::to_string_pretty(&delete_resp.json::<serde_json::Value>().await?)?);

    println!("\n8. Listing CQs after delete...");
    let list_cq_resp2 = client
        .get("http://localhost:8080/cq")
        .send()
        .await?;
    println!("List CQs Response: {}", serde_json::to_string_pretty(&list_cq_resp2.json::<serde_json::Value>().await?)?);

    Ok(())
}
