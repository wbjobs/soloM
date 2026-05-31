use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::config::models::ScriptType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub node_type: NodeType,
    pub label: String,
    pub position: NodePosition,
    pub config: NodeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    Start,
    End,
    Script,
    Condition,
    Delay,
    Loop,
    Output,
    Variable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum NodeConfig {
    ScriptConfig {
        script_type: ScriptType,
        script_content: String,
        working_dir: String,
        env: Option<HashMap<String, String>>,
    },
    ConditionConfig {
        condition: String,
        true_branch: Option<String>,
        false_branch: Option<String>,
    },
    DelayConfig {
        milliseconds: u64,
    },
    LoopConfig {
        iterations: u32,
        loop_var: Option<String>,
    },
    OutputConfig {
        format_string: String,
    },
    VariableConfig {
        var_name: String,
        var_value: String,
    },
    StartConfig,
    EndConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecutionState {
    pub workflow_id: String,
    pub current_node_id: Option<String>,
    pub status: WorkflowStatus,
    pub output: String,
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowStatus {
    Idle,
    Running,
    Success,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Shell,
    Python,
    Cli,
}
