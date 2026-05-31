use std::collections::BTreeMap;
use common::{Tags, Result, Value as DataValue};
use storage::TimeSeriesEngine;
use crate::ast::*;
use crate::parser::evaluate_time_expression;

#[derive(Debug, Clone, serde::Serialize)]
pub struct QueryResult {
    pub series: Vec<SeriesResult>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SeriesResult {
    pub series_key: String,
    pub tags: Tags,
    pub values: Vec<(i64, DataValue)>,
    pub aggregates: BTreeMap<String, AggregateResult>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(untagged)]
pub enum AggregateResult {
    Float(f64),
    Integer(i64),
    Null,
}

impl From<f64> for AggregateResult {
    fn from(v: f64) -> Self {
        AggregateResult::Float(v)
    }
}

impl From<i64> for AggregateResult {
    fn from(v: i64) -> Self {
        AggregateResult::Integer(v)
    }
}

pub struct QueryExecutor {
    engine: TimeSeriesEngine,
}

impl QueryExecutor {
    pub fn new(engine: TimeSeriesEngine) -> Self {
        QueryExecutor { engine }
    }

    pub fn execute(&self, query: &Query) -> Result<QueryResult> {
        let (start_time, end_time, tag_filters) = self.extract_time_range(query)?;

        let mut series_results = Vec::new();

        for func in &query.select.functions {
            let field = match func {
                AggregateFunction::Mean(f) => f,
                AggregateFunction::Sum(f) => f,
                AggregateFunction::Count(f) => f,
                AggregateFunction::Min(f) => f,
                AggregateFunction::Max(f) => f,
                AggregateFunction::First(f) => f,
                AggregateFunction::Last(f) => f,
                AggregateFunction::Field(f) => f,
            };

            let results = self.engine.query_range(
                &query.select.measurement,
                tag_filters.as_ref(),
                field,
                start_time,
                end_time,
            )?;

            for (series_key, data_points) in results {
                let aggregates = self.apply_aggregate(func, &data_points);

                series_results.push(SeriesResult {
                    series_key: series_key.to_string(),
                    tags: series_key.tags.clone(),
                    values: data_points,
                    aggregates,
                });
            }
        }

        Ok(QueryResult {
            series: series_results,
        })
    }

    fn extract_time_range(&self, query: &Query) -> Result<(i64, i64, Option<Tags>)> {
        let mut start_time = i64::MIN;
        let mut end_time = i64::MAX;
        let mut tag_filters = Tags::new();

        if let Some(where_clause) = &query.where_clause {
            for condition in &where_clause.conditions {
                if condition.field == "time" {
                    match &condition.value {
                        Value::TimeExpression(ref expr) => {
                            let ts = evaluate_time_expression(expr);
                            match condition.operator {
                                Operator::Gt | Operator::Ge => start_time = ts,
                                Operator::Lt | Operator::Le => end_time = ts,
                                _ => {}
                            }
                        }
                        Value::Now => {
                            let now = chrono::Utc::now().timestamp_millis();
                            match condition.operator {
                                Operator::Gt | Operator::Ge => start_time = now,
                                Operator::Lt | Operator::Le => end_time = now,
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                } else {
                    if let Value::String(ref v) = &condition.value {
                        tag_filters.insert(condition.field.clone(), v.clone());
                    }
                }
            }
        }

        let tag_filters = if tag_filters.is_empty() {
            None
        } else {
            Some(tag_filters)
        };

        Ok((start_time, end_time, tag_filters))
    }

    fn apply_aggregate(
        &self,
        func: &AggregateFunction,
        data: &[(i64, DataValue)],
    ) -> BTreeMap<String, AggregateResult> {
        let mut result = BTreeMap::new();

        match func {
            AggregateFunction::Mean(field) => {
                let sum: f64 = data
                    .iter()
                    .filter_map(|(_, v)| v.as_float())
                    .sum();
                let count = data.iter().filter(|(_, v)| v.as_float().is_some()).count();
                let mean = if count > 0 { sum / count as f64 } else { 0.0 };
                result.insert(format!("mean({})", field), mean.into());
            }
            AggregateFunction::Sum(field) => {
                let sum: f64 = data
                    .iter()
                    .filter_map(|(_, v)| v.as_float())
                    .sum();
                result.insert(format!("sum({})", field), sum.into());
            }
            AggregateFunction::Count(field) => {
                result.insert(format!("count({})", field), (data.len() as i64).into());
            }
            AggregateFunction::Min(field) => {
                let min = data
                    .iter()
                    .filter_map(|(_, v)| v.as_float())
                    .fold(f64::INFINITY, f64::min);
                result.insert(format!("min({})", field), min.into());
            }
            AggregateFunction::Max(field) => {
                let max = data
                    .iter()
                    .filter_map(|(_, v)| v.as_float())
                    .fold(f64::NEG_INFINITY, f64::max);
                result.insert(format!("max({})", field), max.into());
            }
            AggregateFunction::First(field) => {
                if let Some((_, v)) = data.first() {
                    if let Some(f) = v.as_float() {
                        result.insert(format!("first({})", field), f.into());
                    }
                }
            }
            AggregateFunction::Last(field) => {
                if let Some((_, v)) = data.last() {
                    if let Some(f) = v.as_float() {
                        result.insert(format!("last({})", field), f.into());
                    }
                }
            }
            AggregateFunction::Field(_field) => {}
        }

        result
    }
}
