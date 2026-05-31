use super::types::{Field, FieldValue, Point};
use std::collections::HashMap;
use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Default)]
pub struct Parser;

impl Parser {
    pub fn new() -> Self {
        Self
    }

    pub fn parse(&self, data: &[u8]) -> Result<Vec<Point>, Box<dyn Error + Send + Sync>> {
        let text = String::from_utf8_lossy(data);
        let mut points = Vec::new();

        for (i, line) in text.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let point = self
                .parse_line(line)
                .map_err(|e| format!("line {}: {}", i + 1, e))?;
            points.push(point);
        }

        if points.is_empty() {
            return Err("no valid points found".into());
        }

        Ok(points)
    }

    fn parse_line(&self, line: &str) -> Result<Point, Box<dyn Error + Send + Sync>> {
        let mut unescaped = line.replace(r"\,", "\x00");
        unescaped = unescaped.replace(r"\ ", "\x01");
        unescaped = unescaped.replace(r"\=", "\x02");

        let parts: Vec<&str> = unescaped.splitn(3, ' ').collect();
        if parts.len() < 2 {
            return Err(format!("invalid line format: {}", line).into());
        }

        let measurement_part = parts[0];
        let field_part = parts[1];
        let timestamp_str = if parts.len() == 3 {
            Some(parts[2])
        } else {
            None
        };

        let meas_and_tags: Vec<&str> = measurement_part.splitn(2, ',').collect();
        let measurement = restore_escapes(meas_and_tags[0]);

        let mut tags = HashMap::new();
        if meas_and_tags.len() == 2 {
            let tag_pairs = meas_and_tags[1].split(',');
            for pair in tag_pairs {
                let kv: Vec<&str> = pair.splitn(2, '=').collect();
                if kv.len() != 2 {
                    return Err(format!("invalid tag: {}", pair).into());
                }
                let key = restore_escapes(kv[0]);
                let value = restore_escapes(kv[1]);
                tags.insert(key, value);
            }
        }

        let field_pairs = field_part.split(',');
        let mut fields = Vec::new();
        for pair in field_pairs {
            let kv: Vec<&str> = pair.splitn(2, '=').collect();
            if kv.len() != 2 {
                return Err(format!("invalid field: {}", pair).into());
            }
            let key = restore_escapes(kv[0]);
            let value_str = kv[1];

            let value = parse_field_value(value_str)
                .map_err(|e| format!("invalid field value {}: {}", value_str, e))?;
            fields.push(Field { key, value });
        }

        let timestamp = if let Some(ts_str) = timestamp_str {
            let ts: i64 = ts_str
                .parse()
                .map_err(|_| format!("invalid timestamp: {}", ts_str))?;
            UNIX_EPOCH + std::time::Duration::from_nanos(ts as u64)
        } else {
            SystemTime::now()
        };

        Ok(Point {
            measurement,
            tags,
            fields,
            timestamp,
            raw_line: line.to_string(),
        })
    }
}

fn restore_escapes(s: &str) -> String {
    let mut result = s.replace('\x00', ",");
    result = result.replace('\x01', " ");
    result = result.replace('\x02', "=");
    result
}

fn parse_field_value(s: &str) -> Result<FieldValue, Box<dyn Error + Send + Sync>> {
    if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
        return Ok(FieldValue::String(s[1..s.len() - 1].to_string()));
    }

    if s.ends_with('i') {
        if let Ok(n) = s[..s.len() - 1].parse::<i64>() {
            return Ok(FieldValue::Integer(n));
        }
    }

    match s {
        "t" | "T" | "true" | "TRUE" | "True" => return Ok(FieldValue::Boolean(true)),
        "f" | "F" | "false" | "FALSE" | "False" => return Ok(FieldValue::Boolean(false)),
        _ => {}
    }

    if let Ok(f) = s.parse::<f64>() {
        return Ok(FieldValue::Float(f));
    }

    Err(format!("cannot parse value: {}", s).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic() {
        let parser = Parser::new();
        let data = b"cpu,host=server01,region=us-east value=0.64,count=2i 1434055562000000000";

        let points = parser.parse(data).unwrap();
        assert_eq!(points.len(), 1);

        let point = &points[0];
        assert_eq!(point.measurement, "cpu");
        assert_eq!(point.tags.get("host").unwrap(), "server01");
        assert_eq!(point.tags.get("region").unwrap(), "us-east");
        assert_eq!(point.fields.len(), 2);
        assert_eq!(point.fields[0].key, "value");
        assert!(matches!(point.fields[0].value, FieldValue::Float(v) if v == 0.64));
        assert_eq!(point.fields[1].key, "count");
        assert!(matches!(point.fields[1].value, FieldValue::Integer(v) if v == 2));
    }

    #[test]
    fn test_parse_multiple_lines() {
        let parser = Parser::new();
        let data = b"cpu,host=server01 value=0.64\nmemory,host=server01 value=42.5\ndisk,host=server02 value=100";

        let points = parser.parse(data).unwrap();
        assert_eq!(points.len(), 3);
        assert_eq!(points[0].measurement, "cpu");
        assert_eq!(points[1].measurement, "memory");
        assert_eq!(points[2].measurement, "disk");
    }

    #[test]
    fn test_parse_field_types() {
        let parser = Parser::new();
        let data = b"test int_value=42i,float_value=3.14,bool_true=t,bool_false=false,str_value=\"hello\"";

        let points = parser.parse(data).unwrap();
        let fields = &points[0].fields;

        for field in fields {
            match field.key.as_str() {
                "int_value" => assert!(matches!(field.value, FieldValue::Integer(42))),
                "float_value" => assert!(matches!(field.value, FieldValue::Float(v) if v == 3.14)),
                "bool_true" => assert!(matches!(field.value, FieldValue::Boolean(true))),
                "bool_false" => assert!(matches!(field.value, FieldValue::Boolean(false))),
                "str_value" => assert!(matches!(field.value, FieldValue::String(ref s) if s == "hello")),
                _ => panic!("unexpected field: {}", field.key),
            }
        }
    }

    #[test]
    fn test_parse_no_tags() {
        let parser = Parser::new();
        let data = b"cpu value=0.64";

        let points = parser.parse(data).unwrap();
        assert!(points[0].tags.is_empty());
    }

    #[test]
    fn test_parse_no_timestamp() {
        let parser = Parser::new();
        let data = b"cpu value=0.64";

        let points = parser.parse(data).unwrap();
        assert!(!points[0].timestamp
            .duration_since(UNIX_EPOCH)
            .is_err());
    }

    #[test]
    fn test_parse_invalid() {
        let parser = Parser::new();

        let test_cases = vec!["", "cpu", "cpu value", "cpu,host value=1", "cpu value=invalid"];

        for tc in test_cases {
            let result = parser.parse(tc.as_bytes());
            assert!(result.is_err(), "expected error for: {}", tc);
        }
    }

    #[test]
    fn test_parse_escaped_characters() {
        let parser = Parser::new();
        let data = b"cpu,host=server\\ 01,region=us\\,east value=0.64";

        let points = parser.parse(data).unwrap();
        assert_eq!(points[0].tags.get("host").unwrap(), "server 01");
        assert_eq!(points[0].tags.get("region").unwrap(), "us,east");
    }
}
