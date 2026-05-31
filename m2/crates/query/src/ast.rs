#[derive(Debug, Clone, PartialEq)]
pub enum AggregateFunction {
    Mean(String),
    Sum(String),
    Count(String),
    Min(String),
    Max(String),
    First(String),
    Last(String),
    Field(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectClause {
    pub functions: Vec<AggregateFunction>,
    pub measurement: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Operator {
    Eq,
    Ne,
    Gt,
    Lt,
    Ge,
    Le,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    String(String),
    Number(f64),
    TimeExpression(TimeExpression),
    Now,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Duration {
    pub value: i64,
    pub unit: TimeUnit,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TimeUnit {
    Milliseconds,
    Seconds,
    Minutes,
    Hours,
    Days,
    Weeks,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TimeExpression {
    NowMinus(Duration),
    NowPlus(Duration),
    Timestamp(i64),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Condition {
    pub field: String,
    pub operator: Operator,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WhereClause {
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub select: SelectClause,
    pub where_clause: Option<WhereClause>,
    pub group_by: Option<Vec<String>>,
}

impl Query {
    pub fn new(select: SelectClause) -> Self {
        Query {
            select,
            where_clause: None,
            group_by: None,
        }
    }

    pub fn with_where(mut self, where_clause: WhereClause) -> Self {
        self.where_clause = Some(where_clause);
        self
    }

    pub fn with_group_by(mut self, fields: Vec<String>) -> Self {
        self.group_by = Some(fields);
        self
    }
}
