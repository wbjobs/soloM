use std::time::SystemTime;
use tonic::Request;
use server::proto::tsdb::{
    write_service_client::WriteServiceClient,
    DataPoint, Field, Tag, WriteRequest,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = WriteServiceClient::connect("http://[::1]:50051").await?;

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)?
        .as_millis() as i64;

    let mut points = Vec::new();

    for i in 0..5 {
        let timestamp = now - (5 - i) * 1000;
        
        let point = DataPoint {
            measurement: "cpu".to_string(),
            tags: vec![
                Tag {
                    key: "host".to_string(),
                    value: "server1".to_string(),
                },
                Tag {
                    key: "region".to_string(),
                    value: "cn-north".to_string(),
                },
            ],
            timestamp,
            fields: vec![
                Field {
                    key: "value".to_string(),
                    value: Some(server::proto::tsdb::field::Value::FloatValue(50.0 + i as f64 * 5.0)),
                },
            ],
        };
        points.push(point);
    }

    let request = Request::new(WriteRequest { points });
    let response = client.write(request).await?;

    println!("Write Response: {:?}", response.into_inner());

    Ok(())
}
