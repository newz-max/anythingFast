use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActionType {
    OpenProgram,
    OpenUrl,
    OpenFile,
    OpenFolder,
    RunCommand,
    Delay,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskAction {
    pub id: String,
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub name: Option<String>,
    pub params: Value,
    pub enabled: bool,
    pub timeout_ms: Option<u64>,
    pub continue_on_error: Option<bool>,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub description: Option<String>,
    pub actions: Vec<TaskAction>,
    pub risk_level: RiskLevel,
    pub enabled: bool,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub global_shortcut: String,
    pub config_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u32,
    pub tasks: Vec<TaskItem>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldIssue {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub issues: Vec<FieldIssue>,
    pub risk_level: Option<RiskLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskActionSummary {
    pub action_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub risk_level: RiskLevel,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskAnalysis {
    pub task_id: String,
    pub requires_confirmation: bool,
    pub reasons: Vec<String>,
    pub high_risk_actions: Vec<RiskActionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionStatus {
    Pending,
    Running,
    Success,
    Failed,
    Skipped,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionExecutionResult {
    pub action_id: String,
    pub action_name: String,
    pub action_type: ActionType,
    pub status: ExecutionStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskExecutionSummary {
    pub task_id: String,
    pub task_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub status: ExecutionStatus,
    pub actions: Vec<ActionExecutionResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionLogSummary {
    pub id: String,
    pub task_id: String,
    pub task_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub status: ExecutionStatus,
    pub actions: Vec<ActionExecutionResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAction {
    pub label: String,
    pub detail: String,
    pub risk_level: RiskLevel,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            tasks: Vec::new(),
            settings: AppSettings {
                global_shortcut: "Alt+Space".to_string(),
                config_path: None,
            },
        }
    }
}
