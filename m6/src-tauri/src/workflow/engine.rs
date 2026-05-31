use super::models::*;
use crate::config::models::ScriptType;
use crate::logger::LogCollector;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;
use uuid::Uuid;

pub struct WorkflowEngine {
    logger: LogCollector,
    running: Arc<parking_lot::Mutex<bool>>,
}

impl WorkflowEngine {
    pub fn new(logger: LogCollector) -> Self {
        Self {
            logger,
            running: Arc::new(parking_lot::Mutex::new(false)),
        }
    }

    pub async fn execute(&self, workflow: &Workflow) -> Result<WorkflowExecutionState> {
        *self.running.lock() = true;

        let mut state = WorkflowExecutionState {
            workflow_id: workflow.id.clone(),
            current_node_id: None,
            status: WorkflowStatus::Running,
            output: String::new(),
            variables: HashMap::new(),
        };

        self.logger.info(&workflow.name, &format!("Starting workflow: {}", workflow.name));

        let adjacency = self.build_adjacency_map(&workflow.edges);
        let node_map = self.build_node_map(&workflow.nodes);

        let start_node = workflow.nodes.iter()
            .find(|n| matches!(n.node_type, NodeType::Start))
            .context("Workflow has no Start node")?;

        let mut current_id = start_node.id.clone();

        loop {
            if !*self.running.lock() {
                state.status = WorkflowStatus::Cancelled;
                self.logger.warn(&workflow.name, "Workflow cancelled");
                break;
            }

            let node = match node_map.get(&current_id) {
                Some(n) => n.clone(),
                None => {
                    state.status = WorkflowStatus::Failed;
                    state.output.push_str(&format!("Node not found: {}\n", current_id));
                    break;
                }
            };

            state.current_node_id = Some(node.id.clone());
            self.logger.info(&workflow.name, &format!("Executing node: {}", node.label));

            match node.node_type {
                NodeType::Start | NodeType::End => {
                    if matches!(node.node_type, NodeType::End) {
                        state.status = WorkflowStatus::Success;
                        self.logger.info(&workflow.name, "Workflow completed");
                        break;
                    }
                }
                NodeType::Script => {
                    if let NodeConfig::ScriptConfig { script_type, script_content, working_dir, env } = &node.config {
                        let result = self.execute_script(
                            &workflow.name,
                            *script_type,
                            script_content,
                            working_dir,
                            env,
                        ).await;

                        match result {
                            Ok(output) => {
                                state.output.push_str(&output);
                            }
                            Err(e) => {
                                state.status = WorkflowStatus::Failed;
                                state.output.push_str(&format!("Script failed: {}\n", e));
                                self.logger.error(&workflow.name, &format!("Script failed: {}", e));
                                break;
                            }
                        }
                    }
                }
                NodeType::Condition => {
                    if let NodeConfig::ConditionConfig { condition, true_branch, false_branch } = &node.config {
                        let result = self.evaluate_condition(condition).await;
                        let next_id = match result {
                            Ok(true) => true_branch.as_deref(),
                            Ok(false) => false_branch.as_deref(),
                            Err(e) => {
                                state.status = WorkflowStatus::Failed;
                                state.output.push_str(&format!("Condition failed: {}\n", e));
                                break;
                            }
                        };

                        if let Some(next) = next_id {
                            current_id = next.to_string();
                            continue;
                        }
                    }
                }
                NodeType::Delay => {
                    if let NodeConfig::DelayConfig { milliseconds } = &node.config {
                        self.logger.info(&workflow.name, &format!("Delaying for {}ms", milliseconds));
                        tokio::time::sleep(tokio::time::Duration::from_millis(*milliseconds)).await;
                    }
                }
                NodeType::Loop => {
                    if let NodeConfig::LoopConfig { iterations, loop_var } = &node.config {
                        let var_name = loop_var.as_deref().unwrap_or("i");
                        for i in 0..*iterations {
                            if !*self.running.lock() {
                                state.status = WorkflowStatus::Cancelled;
                                break;
                            }
                            state.variables.insert(var_name.to_string(), i.to_string());

                            let loop_nodes = adjacency.get(&node.id);
                            if let Some(targets) = loop_nodes {
                                for (target_id, _) in targets {
                                    if let Some(loop_node) = node_map.get(target_id) {
                                        let loop_result = self.execute_single_node(
                                            &workflow.name,
                                            loop_node,
                                            &mut state,
                                        ).await;

                                        if let Err(e) = loop_result {
                                            state.status = WorkflowStatus::Failed;
                                            state.output.push_str(&format!("Loop iteration {} failed: {}\n", i, e));
                                            break;
                                        }
                                    }
                                }
                            }

                            if matches!(state.status, WorkflowStatus::Failed | WorkflowStatus::Cancelled) {
                                break;
                            }
                        }
                    }
                }
                NodeType::Variable => {
                    if let NodeConfig::VariableConfig { var_name, var_value } = &node.config {
                        let resolved = self.resolve_variables(var_value, &state.variables);
                        state.variables.insert(var_name.clone(), resolved);
                        self.logger.info(&workflow.name, &format!("Set variable {} = {}", var_name, var_value));
                    }
                }
                NodeType::Output => {
                    if let NodeConfig::OutputConfig { format_string } = &node.config {
                        let resolved = self.resolve_variables(format_string, &state.variables);
                        state.output.push_str(&resolved);
                        state.output.push('\n');
                    }
                }
            }

            if matches!(state.status, WorkflowStatus::Failed | WorkflowStatus::Cancelled) {
                break;
            }

            let next = adjacency.get(&current_id)
                .and_then(|targets| targets.first())
                .map(|(id, _)| id.clone());

            match next {
                Some(id) => current_id = id,
                None => {
                    state.status = WorkflowStatus::Success;
                    break;
                }
            }
        }

        *self.running.lock() = false;
        Ok(state)
    }

    pub fn stop(&self) {
        *self.running.lock() = false;
    }

    fn build_adjacency_map(&self, edges: &[WorkflowEdge]) -> HashMap<String, Vec<(String, Option<String>)>> {
        let mut map: HashMap<String, Vec<(String, Option<String>)>> = HashMap::new();
        for edge in edges {
            map.entry(edge.source.clone())
                .or_default()
                .push((edge.target.clone(), edge.label.clone()));
        }
        map
    }

    fn build_node_map(&self, nodes: &[WorkflowNode]) -> HashMap<String, &WorkflowNode> {
        nodes.iter().map(|n| (n.id.clone(), n)).collect()
    }

    async fn execute_script(
        &self,
        workflow_name: &str,
        script_type: ScriptType,
        script_content: &str,
        working_dir: &str,
        env: &Option<HashMap<String, String>>,
    ) -> Result<String> {
        let temp_file = self.create_temp_script(script_type, script_content)?;

        let mut cmd = match script_type {
            ScriptType::Shell => {
                if cfg!(windows) {
                    let mut cmd = Command::new("powershell");
                    cmd.arg("-ExecutionPolicy").arg("Bypass");
                    cmd.arg("-File").arg(&temp_file);
                    cmd
                } else {
                    let mut cmd = Command::new("sh");
                    cmd.arg(&temp_file);
                    cmd
                }
            }
            ScriptType::Python => {
                let mut cmd = Command::new("python3");
                cmd.arg(&temp_file);
                cmd
            }
        };

        cmd.current_dir(working_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(env_vars) = env {
            for (k, v) in env_vars {
                cmd.env(k, v);
            }
        }

        let output = cmd.output().await
            .with_context(|| "Failed to execute script")?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !stdout.is_empty() {
            self.logger.info(workflow_name, &stdout);
        }
        if !stderr.is_empty() {
            self.logger.error(workflow_name, &stderr);
        }

        if !output.status.success() {
            anyhow::bail!("Script exited with code: {}", output.status.code().unwrap_or(-1));
        }

        let _ = std::fs::remove_file(&temp_file);
        Ok(stdout)
    }

    async fn evaluate_condition(&self, condition: &str) -> Result<bool> {
        let mut cmd = if cfg!(windows) {
            let mut cmd = Command::new("powershell");
            cmd.arg("-Command").arg(condition);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.arg("-c").arg(condition);
            cmd
        };

        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.output().await
            .with_context(|| "Failed to evaluate condition")?;

        Ok(output.status.success())
    }

    async fn execute_single_node(
        &self,
        workflow_name: &str,
        node: &WorkflowNode,
        state: &mut WorkflowExecutionState,
    ) -> Result<()> {
        match &node.config {
            NodeConfig::ScriptConfig { script_type, script_content, working_dir, env } => {
                let result = self.execute_script(workflow_name, *script_type, script_content, working_dir, env).await?;
                state.output.push_str(&result);
            }
            NodeConfig::DelayConfig { milliseconds } => {
                tokio::time::sleep(tokio::time::Duration::from_millis(*milliseconds)).await;
            }
            NodeConfig::VariableConfig { var_name, var_value } => {
                let resolved = self.resolve_variables(var_value, &state.variables);
                state.variables.insert(var_name.clone(), resolved);
            }
            NodeConfig::OutputConfig { format_string } => {
                let resolved = self.resolve_variables(format_string, &state.variables);
                state.output.push_str(&resolved);
                state.output.push('\n');
            }
            _ => {}
        }
        Ok(())
    }

    fn resolve_variables(&self, input: &str, variables: &HashMap<String, String>) -> String {
        let mut result = input.to_string();
        for (key, value) in variables {
            result = result.replace(&format!("{{{{{}}}}}", key), value);
        }
        result
    }

    fn create_temp_script(&self, script_type: ScriptType, content: &str) -> Result<PathBuf> {
        let ext = match script_type {
            ScriptType::Shell => if cfg!(windows) { "ps1" } else { "sh" },
            ScriptType::Python => "py",
        };

        let temp_dir = std::env::temp_dir();
        let file_name = format!("hotkey_workflow_{}.{}", Uuid::new_v4(), ext);
        let file_path = temp_dir.join(file_name);

        std::fs::write(&file_path, content)
            .with_context(|| format!("Failed to create temp script file: {:?}", file_path))?;

        Ok(file_path)
    }
}
