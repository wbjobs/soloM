use anyhow::{anyhow, Context, Result};
use arrow_array::RecordBatch;
use clap::Parser;
use datafusion::arrow::datatypes::DataType;
use datafusion::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long, value_name = "SQL")]
    sql: String,

    #[arg(short, long, default_value = "http://127.0.0.1:8000/visualize")]
    server: String,

    #[arg(long, default_value = "line")]
    chart_type: String,

    #[arg(long)]
    x_axis: Option<String>,

    #[arg(long)]
    y_axis: Option<String>,

    #[arg(long, default_value = "Query Result")]
    title: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct VisualizeRequest {
    columns: Vec<String>,
    data: Vec<Vec<Value>>,
    chart_type: String,
    x_axis: Option<String>,
    y_axis: Option<String>,
    title: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct VisualizeResponse {
    success: bool,
    image_url: Option<String>,
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    let csv_file = extract_csv_filename(&args.sql)
        .ok_or_else(|| anyhow!("无法从 SQL 中提取 CSV 文件名。示例: SELECT * FROM data.csv"))?;

    let ctx = SessionContext::new();

    ctx.register_csv(
        &csv_file.replace('.', "_"),
        &csv_file,
        CsvReadOptions::new().has_header(true),
    )
    .await
    .with_context(|| format!("无法读取 CSV 文件: {}", csv_file))?;

    let sql = rewrite_sql(&args.sql, &csv_file)?;

    println!("执行 SQL: {}\n", sql);

    let df = ctx.sql(&sql).await.with_context(|| "SQL 执行失败")?;

    let results: Vec<RecordBatch> = df.collect().await.with_context(|| "收集结果失败")?;

    if results.is_empty() {
        println!("查询结果为空");
        return Ok(());
    }

    let (columns, data) = record_batches_to_json(&results)?;

    print_results(&columns, &data);

    let request = VisualizeRequest {
        columns: columns.clone(),
        data: data.clone(),
        chart_type: args.chart_type.clone(),
        x_axis: args.x_axis.clone(),
        y_axis: args.y_axis.clone(),
        title: args.title.clone(),
    };

    println!("\n发送数据到可视化服务: {}", args.server);

    let client = reqwest::Client::new();
    let response = client
        .post(&args.server)
        .json(&request)
        .send()
        .await
        .with_context(|| "无法连接到可视化服务")?;

    if response.status().is_success() {
        let viz_response: VisualizeResponse = response.json().await?;
        if viz_response.success {
            if let Some(url) = viz_response.image_url {
                println!("\n✅ 可视化成功!");
                println!("📊 图片 URL: {}", url);
            }
        } else if let Some(err) = viz_response.error {
            println!("\n❌ 可视化失败: {}", err);
        }
    } else {
        println!(
            "\n❌ HTTP 请求失败: {} - {}",
            response.status(),
            response.text().await?
        );
    }

    Ok(())
}

fn extract_csv_filename(sql: &str) -> Option<String> {
    let re = Regex::new(r"(?i)FROM\s+([a-zA-Z0-9_\-]+\.csv)").ok()?;
    let caps = re.captures(sql)?;
    Some(caps.get(1)?.as_str().to_string())
}

fn rewrite_sql(sql: &str, csv_file: &str) -> Result<String> {
    let table_name = csv_file.replace('.', "_");
    let re = Regex::new(&format!(r"(?i)FROM\s+{}", regex::escape(csv_file)))?;
    Ok(re.replace(sql, format!("FROM {}", table_name)).to_string())
}

fn record_batches_to_json(batches: &[RecordBatch]) -> Result<(Vec<String>, Vec<Vec<Value>>)> {
    let schema = batches[0].schema();
    let columns: Vec<String> = schema
        .fields()
        .iter()
        .map(|f| f.name().clone())
        .collect();

    let mut all_rows = Vec::new();

    for batch in batches {
        let num_rows = batch.num_rows();
        let num_cols = batch.num_columns();

        for row_idx in 0..num_rows {
            let mut row = Vec::with_capacity(num_cols);
            for col_idx in 0..num_cols {
                let field = schema.field(col_idx);
                let col = batch.column(col_idx);
                let value = arrow_value_to_json(col, field.data_type(), row_idx)?;
                row.push(value);
            }
            all_rows.push(row);
        }
    }

    Ok((columns, all_rows))
}

fn arrow_value_to_json(
    col: &dyn arrow_array::Array,
    data_type: &DataType,
    row_idx: usize,
) -> Result<Value> {
    use arrow_array::*;

    if col.is_null(row_idx) {
        return Ok(Value::Null);
    }

    match data_type {
        DataType::Int8 => {
            let arr = col.as_any().downcast_ref::<Int8Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Int16 => {
            let arr = col.as_any().downcast_ref::<Int16Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Int32 => {
            let arr = col.as_any().downcast_ref::<Int32Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Int64 => {
            let arr = col.as_any().downcast_ref::<Int64Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::UInt8 => {
            let arr = col.as_any().downcast_ref::<UInt8Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::UInt16 => {
            let arr = col.as_any().downcast_ref::<UInt16Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::UInt32 => {
            let arr = col.as_any().downcast_ref::<UInt32Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::UInt64 => {
            let arr = col.as_any().downcast_ref::<UInt64Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Float32 => {
            let arr = col.as_any().downcast_ref::<Float32Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Float64 => {
            let arr = col.as_any().downcast_ref::<Float64Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Boolean => {
            let arr = col.as_any().downcast_ref::<BooleanArray>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Utf8 => {
            let arr = col.as_any().downcast_ref::<StringArray>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::LargeUtf8 => {
            let arr = col.as_any().downcast_ref::<LargeStringArray>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        DataType::Date32 => {
            let arr = col.as_any().downcast_ref::<Date32Array>().unwrap();
            Ok(json!(arr.value(row_idx)))
        }
        _ => Ok(Value::String(format!("{:?}", col.as_any()))),
    }
}

fn print_results(columns: &[String], data: &[Vec<Value>]) {
    println!("查询结果 ({} 行):", data.len());
    println!();

    let mut col_widths: HashMap<usize, usize> = HashMap::new();
    for (i, col) in columns.iter().enumerate() {
        col_widths.insert(i, col.len());
    }

    for row in data {
        for (i, val) in row.iter().enumerate() {
            let s = match val {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                Value::Null => "NULL".to_string(),
                _ => format!("{:?}", val),
            };
            let width = col_widths.entry(i).or_insert(0);
            if s.len() > *width {
                *width = s.len();
            }
        }
    }

    let header: Vec<String> = columns
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{:<width$}", c, width = col_widths[&i]))
        .collect();
    println!("| {} |", header.join(" | "));

    let separator: Vec<String> = columns
        .iter()
        .enumerate()
        .map(|(i, _)| format!("{:-<width$}", "", width = col_widths[&i]))
        .collect();
    println!("| {} |", separator.join(" | "));

    for row in data {
        let formatted: Vec<String> = row
            .iter()
            .enumerate()
            .map(|(i, val)| {
                let s = match val {
                    Value::String(s) => s.clone(),
                    Value::Number(n) => n.to_string(),
                    Value::Bool(b) => b.to_string(),
                    Value::Null => "NULL".to_string(),
                    _ => format!("{:?}", val),
                };
                format!("{:<width$}", s, width = col_widths[&i])
            })
            .collect();
        println!("| {} |", formatted.join(" | "));
    }
}
