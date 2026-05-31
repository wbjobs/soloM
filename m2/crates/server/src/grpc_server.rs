use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc;
use tonic::{transport::Server, Request, Response, Status};
use common::{DataPoint, Value};
use storage::TimeSeriesEngine;
use crate::proto::tsdb::{
    write_service_server::{WriteService, WriteServiceServer},
    WriteRequest, WriteResponse,
};

#[derive(Clone)]
pub struct WriteServiceImpl {
    engine: TimeSeriesEngine,
}

#[tonic::async_trait]
impl WriteService for WriteServiceImpl {
    async fn write(
        &self,
        request: Request<WriteRequest>,
    ) -> Result<Response<WriteResponse>, Status> {
        let req = request.into_inner();
        let mut written = 0;

        for proto_point in req.points {
            let mut data_point = DataPoint::new(proto_point.measurement);
            
            if proto_point.timestamp != 0 {
                data_point = data_point.with_timestamp(proto_point.timestamp);
            }

            for tag in proto_point.tags {
                data_point = data_point.with_tag(tag.key, tag.value);
            }

            for field in proto_point.fields {
                let value = match field.value {
                    Some(v) => match v {
                        crate::proto::tsdb::field::Value::FloatValue(f) => Value::Float(f),
                        crate::proto::tsdb::field::Value::IntValue(i) => Value::Integer(i),
                        crate::proto::tsdb::field::Value::BoolValue(b) => Value::Boolean(b),
                        crate::proto::tsdb::field::Value::StringValue(s) => Value::String(s),
                    },
                    None => continue,
                };
                data_point.add_field(field.key, value);
            }

            match self.engine.write(data_point) {
                Ok(_) => written += 1,
                Err(e) => {
                    return Err(Status::internal(format!("Write error: {}", e)));
                }
            }
        }

        Ok(Response::new(WriteResponse {
            success: true,
            message: "OK".to_string(),
            written,
        }))
    }

    async fn write_stream(
        &self,
        request: Request<tonic::Streaming<WriteRequest>>,
    ) -> Result<Response<WriteResponse>, Status> {
        let mut stream = request.into_inner();
        let mut total_written = 0;

        while let Some(req) = stream.message().await? {
            for proto_point in req.points {
                let mut data_point = DataPoint::new(proto_point.measurement);
                
                if proto_point.timestamp != 0 {
                    data_point = data_point.with_timestamp(proto_point.timestamp);
                }

                for tag in proto_point.tags {
                    data_point = data_point.with_tag(tag.key, tag.value);
                }

                for field in proto_point.fields {
                    let value = match field.value {
                        Some(v) => match v {
                            crate::proto::tsdb::field::Value::FloatValue(f) => Value::Float(f),
                            crate::proto::tsdb::field::Value::IntValue(i) => Value::Integer(i),
                            crate::proto::tsdb::field::Value::BoolValue(b) => Value::Boolean(b),
                            crate::proto::tsdb::field::Value::StringValue(s) => Value::String(s),
                        },
                        None => continue,
                    };
                    data_point.add_field(field.key, value);
                }

                if self.engine.write(data_point).is_ok() {
                    total_written += 1;
                }
            }
        }

        Ok(Response::new(WriteResponse {
            success: true,
            message: "Stream write complete".to_string(),
            written: total_written,
        }))
    }
}

pub async fn start_grpc_server(
    engine: TimeSeriesEngine,
    addr: SocketAddr,
) -> Result<(), Box<dyn std::error::Error>> {
    let service = WriteServiceImpl { engine };

    Server::builder()
        .add_service(WriteServiceServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}
