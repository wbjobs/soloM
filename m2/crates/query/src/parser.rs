use pest::Parser;
use pest_derive::Parser;
use chrono::Utc;
use crate::ast::*;
use common::{TsdbError, Result};

#[derive(Parser)]
#[grammar = "grammar.pest"]
struct TsqlParser;

pub struct QueryParser;

impl QueryParser {
    pub fn parse(query: &str) -> Result<Query> {
        let query = query.trim();
        
        let mut pairs = TsqlParser::parse(Rule::query, query)
            .map_err(|e| TsdbError::QueryParse(e.to_string()))?;

        let query_pair = pairs.next().unwrap();

        let mut select_clause = None;
        let mut where_clause = None;
        let mut group_by = None;

        for pair in query_pair.into_inner() {
            match pair.as_rule() {
                Rule::select_clause => {
                    select_clause = Some(Self::parse_select_clause(pair)?);
                }
                Rule::where_clause => {
                    where_clause = Some(Self::parse_where_clause(pair)?);
                }
                Rule::group_by_clause => {
                    group_by = Some(Self::parse_group_by_clause(pair)?);
                }
                _ => {}
            }
        }

        let mut query = Query::new(select_clause.unwrap());
        if let Some(w) = where_clause {
            query = query.with_where(w);
        }
        if let Some(g) = group_by {
            query = query.with_group_by(g);
        }

        Ok(query)
    }

    fn parse_select_clause(pair: pest::iterators::Pair<Rule>) -> Result<SelectClause> {
        let mut measurement = String::new();
        let mut functions = Vec::new();

        for inner in pair.into_inner() {
            match inner.as_rule() {
                Rule::select_list => {
                    for item in inner.into_inner() {
                        match item.as_rule() {
                            Rule::aggregate_function => {
                                functions.push(Self::parse_aggregate_function(item)?);
                            }
                            Rule::field_ref => {
                                let field = item.as_str().to_string();
                                functions.push(AggregateFunction::Field(field));
                            }
                            _ => {}
                        }
                    }
                }
                Rule::identifier => {
                    measurement = inner.as_str().to_string();
                }
                _ => {}
            }
        }

        Ok(SelectClause {
            functions,
            measurement,
        })
    }

    fn parse_aggregate_function(pair: pest::iterators::Pair<Rule>) -> Result<AggregateFunction> {
        let mut func_name = String::new();
        let mut field = String::new();

        for inner in pair.into_inner() {
            match inner.as_rule() {
                Rule::function_name => {
                    func_name = inner.as_str().to_lowercase();
                }
                Rule::field_ref => {
                    field = inner.as_str().to_string();
                }
                _ => {}
            }
        }

        match func_name.as_str() {
            "mean" => Ok(AggregateFunction::Mean(field)),
            "sum" => Ok(AggregateFunction::Sum(field)),
            "count" => Ok(AggregateFunction::Count(field)),
            "min" => Ok(AggregateFunction::Min(field)),
            "max" => Ok(AggregateFunction::Max(field)),
            "first" => Ok(AggregateFunction::First(field)),
            "last" => Ok(AggregateFunction::Last(field)),
            _ => Err(TsdbError::QueryParse(format!("Unknown function: {}", func_name))),
        }
    }

    fn parse_where_clause(pair: pest::iterators::Pair<Rule>) -> Result<WhereClause> {
        let mut conditions = Vec::new();

        for inner in pair.into_inner() {
            if inner.as_rule() == Rule::condition_list {
                for condition in inner.into_inner() {
                    if condition.as_rule() == Rule::condition {
                        conditions.push(Self::parse_condition(condition)?);
                    }
                }
            }
        }

        Ok(WhereClause { conditions })
    }

    fn parse_condition(pair: pest::iterators::Pair<Rule>) -> Result<Condition> {
        let mut field = String::new();
        let mut operator = Operator::Eq;
        let mut value = Value::Number(0.0);

        for inner in pair.into_inner() {
            match inner.as_rule() {
                Rule::identifier => {
                    field = inner.as_str().to_string();
                }
                Rule::operator => {
                    operator = Self::parse_operator(inner.as_str());
                }
                Rule::value => {
                    for v in inner.into_inner() {
                        value = Self::parse_value(v)?;
                    }
                }
                _ => {}
            }
        }

        Ok(Condition {
            field,
            operator,
            value,
        })
    }

    fn parse_operator(op: &str) -> Operator {
        match op {
            "=" => Operator::Eq,
            "!=" => Operator::Ne,
            ">" => Operator::Gt,
            "<" => Operator::Lt,
            ">=" => Operator::Ge,
            "<=" => Operator::Le,
            _ => Operator::Eq,
        }
    }

    fn parse_value(pair: pest::iterators::Pair<Rule>) -> Result<Value> {
        match pair.as_rule() {
            Rule::string => {
                let s = pair.as_str().trim_matches('\'').to_string();
                Ok(Value::String(s))
            }
            Rule::number => {
                let n: f64 = pair.as_str().parse().unwrap();
                Ok(Value::Number(n))
            }
            Rule::time_expr => {
                let mut is_minus = false;
                let mut duration = Duration {
                    value: 0,
                    unit: TimeUnit::Milliseconds,
                };

                for inner in pair.into_inner() {
                    match inner.as_rule() {
                        Rule::time_op => {
                            is_minus = inner.as_str() == "-";
                        }
                        Rule::duration => {
                            duration = Self::parse_duration(inner);
                        }
                        _ => {}
                    }
                }

                let time_expr = if is_minus {
                    TimeExpression::NowMinus(duration)
                } else {
                    TimeExpression::NowPlus(duration)
                };

                Ok(Value::TimeExpression(time_expr))
            }
            Rule::now => Ok(Value::Now),
            _ => Err(TsdbError::QueryParse("Invalid value".to_string())),
        }
    }

    fn parse_duration(pair: pest::iterators::Pair<Rule>) -> Duration {
        let mut value = 0;
        let mut unit = TimeUnit::Milliseconds;

        for inner in pair.into_inner() {
            match inner.as_rule() {
                Rule::number => {
                    value = inner.as_str().parse::<f64>().unwrap() as i64;
                }
                Rule::time_unit => {
                    unit = Self::parse_time_unit(inner.as_str());
                }
                _ => {}
            }
        }

        Duration { value, unit }
    }

    fn parse_time_unit(unit: &str) -> TimeUnit {
        match unit {
            "ms" => TimeUnit::Milliseconds,
            "s" => TimeUnit::Seconds,
            "m" => TimeUnit::Minutes,
            "h" => TimeUnit::Hours,
            "d" => TimeUnit::Days,
            "w" => TimeUnit::Weeks,
            _ => TimeUnit::Milliseconds,
        }
    }

    fn parse_group_by_clause(pair: pest::iterators::Pair<Rule>) -> Result<Vec<String>> {
        let mut fields = Vec::new();

        for inner in pair.into_inner() {
            if inner.as_rule() == Rule::group_by_list {
                for field in inner.into_inner() {
                    if field.as_rule() == Rule::identifier {
                        fields.push(field.as_str().to_string());
                    }
                }
            }
        }

        Ok(fields)
    }
}

pub fn evaluate_time_expression(expr: &TimeExpression) -> i64 {
    let now = Utc::now().timestamp_millis();

    match expr {
        TimeExpression::NowMinus(duration) => {
            let ms = duration_to_ms(duration);
            now - ms
        }
        TimeExpression::NowPlus(duration) => {
            let ms = duration_to_ms(duration);
            now + ms
        }
        TimeExpression::Timestamp(ts) => *ts,
    }
}

fn duration_to_ms(duration: &Duration) -> i64 {
    let multiplier = match duration.unit {
        TimeUnit::Milliseconds => 1,
        TimeUnit::Seconds => 1000,
        TimeUnit::Minutes => 60 * 1000,
        TimeUnit::Hours => 60 * 60 * 1000,
        TimeUnit::Days => 24 * 60 * 60 * 1000,
        TimeUnit::Weeks => 7 * 24 * 60 * 60 * 1000,
    };
    duration.value * multiplier
}
