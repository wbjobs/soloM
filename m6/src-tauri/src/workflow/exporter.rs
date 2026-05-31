use super::models::*;
use anyhow::Result;
use std::collections::HashMap;

pub struct WorkflowExporter;

impl WorkflowExporter {
    pub fn export(workflow: &Workflow, format: ExportFormat) -> Result<String> {
        match format {
            ExportFormat::Shell => Self::export_shell(workflow),
            ExportFormat::Python => Self::export_python(workflow),
            ExportFormat::Cli => Self::export_cli(workflow),
        }
    }

    fn export_shell(workflow: &Workflow) -> Result<String> {
        let mut script = String::new();
        script.push_str("#!/bin/bash\n\n");

        for node in &workflow.nodes {
            match &node.config {
                NodeConfig::ScriptConfig { script_content, .. } => {
                    script.push_str(&format!("node_{}() {{\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("{}\n", script_content));
                    script.push_str("}\n\n");
                }
                NodeConfig::ConditionConfig { condition, .. } => {
                    script.push_str(&format!("node_{}() {{\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("{}\n", condition));
                    script.push_str("}\n\n");
                }
                NodeConfig::DelayConfig { milliseconds } => {
                    let secs = *milliseconds as f64 / 1000.0;
                    script.push_str(&format!("node_{}() {{\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("sleep {}\n", secs));
                    script.push_str("}\n\n");
                }
                NodeConfig::LoopConfig { iterations, loop_var } => {
                    let var = loop_var.as_deref().unwrap_or("i");
                    script.push_str(&format!("node_{}() {{\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("local {}=0\n", var));
                    script.push_str(&format!("for {} in $(seq 0 $(({}-1))); do\n", var, iterations));
                    script.push_str("    LOOP_BODY \"$@\"\n");
                    script.push_str("done\n");
                    script.push_str("}\n\n");
                }
                NodeConfig::VariableConfig { var_name, var_value } => {
                    script.push_str(&format!("node_{}() {{\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("{}=\"{}\"\n", var_name, var_value));
                    script.push_str("}\n\n");
                }
                NodeConfig::OutputConfig { format_string } => {
                    script.push_str(&format!("node_{}() {{\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("echo \"{}\"\n", format_string));
                    script.push_str("}\n\n");
                }
                NodeConfig::StartConfig | NodeConfig::EndConfig => {
                    script.push_str(&format!("node_{}() {\n", sanitize_identifier(&node.id)));
                    script.push_str("    :\n");
                    script.push_str("}\n\n");
                }
            }
        }

        script.push_str("main() {\n");

        let adjacency = build_adjacency(workflow);
        let start_node = workflow.nodes.iter()
            .find(|n| matches!(n.node_type, NodeType::Start));

        if let Some(start) = start_node {
            script.push_str(&format!("    node_{}\n", sanitize_identifier(&start.id)));

            if let Some(targets) = adjacency.get(&start.id) {
                for (target_id, _) in targets {
                    script.push_str(&format!("    node_{}\n", sanitize_identifier(target_id)));
                }
            }
        }

        script.push_str("}\n\n");
        script.push_str("main \"$@\"\n");

        Ok(script)
    }

    fn export_python(workflow: &Workflow) -> Result<String> {
        let mut script = String::new();
        script.push_str("#!/usr/bin/env python3\n\n");
        script.push_str("import subprocess\n");
        script.push_str("import time\n");
        script.push_str("import sys\n\n");

        for node in &workflow.nodes {
            match &node.config {
                NodeConfig::ScriptConfig { script_content, .. } => {
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("    subprocess.run({:?}, shell=True, check=True)\n\n", script_content));
                }
                NodeConfig::ConditionConfig { condition, .. } => {
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("    result = subprocess.run({:?}, shell=True)\n", condition));
                    script.push_str("    return result.returncode == 0\n\n");
                }
                NodeConfig::DelayConfig { milliseconds } => {
                    let secs = *milliseconds as f64 / 1000.0;
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("    time.sleep({})\n\n", secs));
                }
                NodeConfig::LoopConfig { iterations, loop_var } => {
                    let var = loop_var.as_deref().unwrap_or("i");
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("    for {} in range({}):\n", var, iterations));
                    script.push_str("        pass\n\n");
                }
                NodeConfig::VariableConfig { var_name, var_value } => {
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("    global {}\n", var_name));
                    script.push_str(&format!("    {} = {!r}\n\n", var_name, var_value));
                }
                NodeConfig::OutputConfig { format_string } => {
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str(&format!("    print({:?})\n\n", format_string));
                }
                NodeConfig::StartConfig | NodeConfig::EndConfig => {
                    script.push_str(&format!("def node_{}():\n", sanitize_identifier(&node.id)));
                    script.push_str("    pass\n\n");
                }
            }
        }

        script.push_str("def main():\n");

        let adjacency = build_adjacency(workflow);
        let start_node = workflow.nodes.iter()
            .find(|n| matches!(n.node_type, NodeType::Start));

        if let Some(start) = start_node {
            script.push_str(&format!("    node_{}()\n", sanitize_identifier(&start.id)));

            if let Some(targets) = adjacency.get(&start.id) {
                for (target_id, _) in targets {
                    script.push_str(&format!("    node_{}()\n", sanitize_identifier(target_id)));
                }
            }
        }

        script.push_str("\nif __name__ == \"__main__\":\n");
        script.push_str("    main()\n");

        Ok(script)
    }

    fn export_cli(workflow: &Workflow) -> Result<String> {
        let cli_config = serde_json::json!({
            "version": "1.0",
            "name": workflow.name,
            "description": workflow.description,
            "id": workflow.id,
            "nodes": workflow.nodes.iter().map(|n| {
                serde_json::json!({
                    "id": n.id,
                    "type": match n.node_type {
                        NodeType::Start => "start",
                        NodeType::End => "end",
                        NodeType::Script => "script",
                        NodeType::Condition => "condition",
                        NodeType::Delay => "delay",
                        NodeType::Loop => "loop",
                        NodeType::Output => "output",
                        NodeType::Variable => "variable",
                    },
                    "label": n.label,
                    "config": match &n.config {
                        NodeConfig::ScriptConfig { script_type, script_content, working_dir, env } => serde_json::json!({
                            "script_type": script_type.to_string(),
                            "script_content": script_content,
                            "working_dir": working_dir,
                            "env": env,
                        }),
                        NodeConfig::ConditionConfig { condition, true_branch, false_branch } => serde_json::json!({
                            "condition": condition,
                            "true_branch": true_branch,
                            "false_branch": false_branch,
                        }),
                        NodeConfig::DelayConfig { milliseconds } => serde_json::json!({
                            "milliseconds": milliseconds,
                        }),
                        NodeConfig::LoopConfig { iterations, loop_var } => serde_json::json!({
                            "iterations": iterations,
                            "loop_var": loop_var,
                        }),
                        NodeConfig::OutputConfig { format_string } => serde_json::json!({
                            "format_string": format_string,
                        }),
                        NodeConfig::VariableConfig { var_name, var_value } => serde_json::json!({
                            "var_name": var_name,
                            "var_value": var_value,
                        }),
                        NodeConfig::StartConfig => serde_json::json!({}),
                        NodeConfig::EndConfig => serde_json::json!({}),
                    },
                })
            }).collect::<Vec<_>>(),
            "edges": workflow.edges.iter().map(|e| {
                serde_json::json!({
                    "id": e.id,
                    "source": e.source,
                    "target": e.target,
                    "label": e.label,
                })
            }).collect::<Vec<_>>(),
        });

        Ok(serde_json::to_string_pretty(&cli_config)?)
    }
}

fn sanitize_identifier(id: &str) -> String {
    id.replace('-', "_").replace(' ', "_")
}

fn build_adjacency(workflow: &Workflow) -> HashMap<String, Vec<(String, Option<String>)>> {
    let mut map: HashMap<String, Vec<(String, Option<String>)>> = HashMap::new();
    for edge in &workflow.edges {
        map.entry(edge.source.clone())
            .or_default()
            .push((edge.target.clone(), edge.label.clone()));
    }
    map
}
