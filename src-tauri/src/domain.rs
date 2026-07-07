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
    #[serde(default)]
    pub output_binding: Option<TaskActionOutputBinding>,
    #[serde(default)]
    pub condition: Option<ActionCondition>,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskActionOutputBinding {
    pub stdout_variable: Option<String>,
    pub stderr_variable: Option<String>,
    pub exit_code_variable: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ActionCondition {
    Always,
    FileExists {
        path: String,
    },
    FolderExists {
        path: String,
    },
    VariableEquals {
        variable: String,
        value: String,
    },
    VariableNotEmpty {
        variable: String,
    },
    PreviousActionStatus {
        status: PreviousActionStatusConditionValue,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PreviousActionStatusConditionValue {
    Success,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub description: Option<String>,
    #[serde(default)]
    pub variables: Vec<TaskVariable>,
    pub actions: Vec<TaskAction>,
    pub risk_level: RiskLevel,
    pub enabled: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    #[serde(default = "default_task_triggers")]
    pub triggers: Vec<TaskTrigger>,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskVariable {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub default_value: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum TaskTrigger {
    #[serde(rename = "manual")]
    Manual { enabled: bool },
    #[serde(rename = "shortcut")]
    Shortcut { enabled: bool, shortcut: String },
    #[serde(rename = "schedule")]
    Schedule {
        enabled: bool,
        #[serde(default = "default_schedule_mode")]
        mode: ScheduleMode,
        #[serde(default)]
        interval_minutes: Option<u32>,
        #[serde(default)]
        time_of_day: Option<String>,
        #[serde(default)]
        weekdays: Vec<u8>,
        #[serde(default = "default_schedule_misfire_policy")]
        misfire_policy: ScheduleMisfirePolicy,
        #[serde(default = "default_prevent_overlap")]
        prevent_overlap: bool,
        #[serde(default)]
        next_run_at: Option<String>,
        #[serde(default)]
        last_scheduled_at: Option<String>,
    },
}

fn default_task_triggers() -> Vec<TaskTrigger> {
    vec![TaskTrigger::Manual { enabled: true }]
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleMode {
    Interval,
    Daily,
    Weekly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleMisfirePolicy {
    Skip,
    RunOnce,
}

fn default_schedule_mode() -> ScheduleMode {
    ScheduleMode::Daily
}

fn default_schedule_misfire_policy() -> ScheduleMisfirePolicy {
    ScheduleMisfirePolicy::Skip
}

fn default_prevent_overlap() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTag {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplateAction {
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub name: Option<String>,
    pub params: Value,
    pub enabled: bool,
    pub timeout_ms: Option<u64>,
    pub continue_on_error: Option<bool>,
    #[serde(default)]
    pub output_binding: Option<TaskActionOutputBinding>,
    #[serde(default)]
    pub condition: Option<ActionCondition>,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplate {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub description: Option<String>,
    #[serde(default)]
    pub variables: Vec<TaskVariable>,
    pub actions: Vec<TaskTemplateAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub global_shortcut: String,
    #[serde(default = "default_app_theme")]
    pub theme: AppTheme,
    #[serde(default)]
    pub launch_on_startup: bool,
    pub config_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub shortcut: String,
    pub registered: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeybindingOverride {
    pub command: String,
    pub key: Option<String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeybindingsLoadResult {
    pub overrides: Vec<KeybindingOverride>,
    pub path: String,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AppTheme {
    Light,
    Dark,
    System,
}

fn default_app_theme() -> AppTheme {
    AppTheme::Dark
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u32,
    pub tasks: Vec<TaskItem>,
    #[serde(default)]
    pub tags: Vec<TaskTag>,
    #[serde(default)]
    pub templates: Vec<TaskTemplate>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskExportBundle {
    pub schema_version: u32,
    pub exported_at: String,
    pub source_app: String,
    pub tasks: Vec<TaskItem>,
    #[serde(default)]
    pub templates: Vec<TaskTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundleRequest {
    #[serde(default)]
    pub task_ids: Vec<String>,
    #[serde(default)]
    pub template_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub schema_version: u32,
    pub valid_task_count: usize,
    pub template_count: usize,
    pub total_action_count: usize,
    pub risk_summary: ImportRiskSummary,
    pub conflict_summary: ImportConflictSummary,
    pub path_hints: Vec<ImportPathHint>,
    pub tasks: Vec<ImportTaskPreview>,
    pub templates: Vec<ImportTemplatePreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRiskSummary {
    pub low: usize,
    pub medium: usize,
    pub high: usize,
    pub command_actions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportConflictSummary {
    pub task_ids_regenerated: usize,
    pub action_ids_regenerated: usize,
    pub template_ids_regenerated: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPathHint {
    pub owner_id: String,
    pub owner_name: String,
    pub action_name: String,
    pub field: String,
    pub path: String,
    pub exists: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTaskPreview {
    pub id: String,
    pub original_id: String,
    pub name: String,
    pub action_types: Vec<ActionType>,
    pub action_count: usize,
    pub risk_level: RiskLevel,
    pub command_action_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTemplatePreview {
    pub id: String,
    pub original_id: String,
    pub name: String,
    pub category: Option<String>,
    pub keywords: Vec<String>,
    pub action_types: Vec<ActionType>,
    pub action_count: usize,
    pub risk_level: RiskLevel,
    pub command_action_count: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionScope {
    Task,
    Action,
}

fn default_execution_scope() -> ExecutionScope {
    ExecutionScope::Task
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionExecutionResult {
    pub action_id: String,
    pub action_name: String,
    pub action_type: ActionType,
    pub status: ExecutionStatus,
    pub message: Option<String>,
    pub skip_reason: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskExecutionSummary {
    pub task_id: String,
    pub task_name: String,
    #[serde(default = "default_execution_scope")]
    pub scope: ExecutionScope,
    pub action_id: Option<String>,
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
    #[serde(default = "default_execution_scope")]
    pub scope: ExecutionScope,
    pub action_id: Option<String>,
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
            version: 2,
            tasks: Vec::new(),
            tags: Vec::new(),
            templates: Vec::new(),
            settings: AppSettings {
                global_shortcut: "Alt+Space".to_string(),
                theme: AppTheme::Dark,
                launch_on_startup: false,
                config_path: None,
            },
        }
    }
}
