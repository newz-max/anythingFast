use crate::domain::{
    ActionType, AppConfig, ExportBundleRequest, ImportConflictSummary, ImportPathHint,
    ImportPreview, ImportRiskSummary, ImportTaskPreview, ImportTemplatePreview, RiskLevel,
    TaskAction, TaskExportBundle, TaskItem, TaskTemplate, TaskTemplateAction, TaskTrigger,
};
use crate::risk::{derive_action_risk, derive_task_risk};
use crate::validation::{normalize_task, validate_config_model, validate_task_model};
use chrono::Utc;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use uuid::Uuid;

const BUNDLE_SCHEMA_VERSION: u32 = 1;
const SOURCE_APP: &str = "anything-fast";

#[derive(Debug, Clone)]
pub struct ProcessedImport {
    pub bundle: TaskExportBundle,
    pub preview: ImportPreview,
}

pub fn create_export_bundle(
    config: &AppConfig,
    request: ExportBundleRequest,
) -> Result<TaskExportBundle, String> {
    let task_ids: HashSet<&str> = request.task_ids.iter().map(String::as_str).collect();
    let template_ids: HashSet<&str> = request.template_ids.iter().map(String::as_str).collect();

    let tasks: Vec<TaskItem> = config
        .tasks
        .iter()
        .filter(|task| task_ids.contains(task.id.as_str()))
        .cloned()
        .map(sanitize_task_for_export)
        .collect();
    let templates: Vec<TaskTemplate> = config
        .templates
        .iter()
        .filter(|template| template_ids.contains(template.id.as_str()))
        .cloned()
        .map(normalize_template)
        .collect();

    if tasks.len() != task_ids.len() {
        return Err("部分事项不存在，无法导出".to_string());
    }
    if templates.len() != template_ids.len() {
        return Err("部分模板不存在，无法导出".to_string());
    }

    Ok(TaskExportBundle {
        schema_version: BUNDLE_SCHEMA_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        source_app: SOURCE_APP.to_string(),
        tasks,
        templates,
    })
}

pub fn bundle_to_json(bundle: &TaskExportBundle) -> Result<String, String> {
    serde_json::to_string_pretty(bundle).map_err(|err| format!("无法序列化导出 JSON：{err}"))
}

pub fn read_bundle_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|err| format!("无法读取导入文件：{err}"))
}

pub fn write_bundle_file(path: &str, bundle: &TaskExportBundle) -> Result<(), String> {
    let content = bundle_to_json(bundle)?;
    fs::write(path, content).map_err(|err| format!("无法写入导出文件：{err}"))
}

pub fn process_import(bundle_json: &str, config: &AppConfig) -> Result<ProcessedImport, String> {
    let parsed: TaskExportBundle =
        serde_json::from_str(bundle_json).map_err(|err| format!("导入 JSON 格式无效：{err}"))?;
    if parsed.schema_version != BUNDLE_SCHEMA_VERSION {
        return Err(format!(
            "不支持的导入 schemaVersion：{}",
            parsed.schema_version
        ));
    }

    let mut used_task_ids: HashSet<String> =
        config.tasks.iter().map(|task| task.id.clone()).collect();
    let mut used_task_names: HashSet<String> = config
        .tasks
        .iter()
        .map(|task| task.name.trim().to_string())
        .collect();
    let mut used_template_ids: HashSet<String> = config
        .templates
        .iter()
        .map(|template| template.id.clone())
        .collect();
    let mut conflict_summary = ImportConflictSummary::default();
    let now = Utc::now().to_rfc3339();

    let tasks: Vec<TaskItem> = parsed
        .tasks
        .into_iter()
        .map(|task| {
            let task =
                normalize_imported_task(task, &mut used_task_ids, &mut conflict_summary, &now);
            task_with_unique_name(task, &mut used_task_names)
        })
        .collect();

    let templates: Vec<TaskTemplate> = parsed
        .templates
        .into_iter()
        .map(|template| {
            normalize_imported_template(template, &mut used_template_ids, &mut conflict_summary)
        })
        .collect();

    let normalized = TaskExportBundle {
        schema_version: BUNDLE_SCHEMA_VERSION,
        exported_at: parsed.exported_at,
        source_app: parsed.source_app,
        tasks,
        templates,
    };
    let preview = build_preview(&normalized, conflict_summary);

    Ok(ProcessedImport {
        bundle: normalized,
        preview,
    })
}

pub fn confirm_import(bundle_json: &str, config: &AppConfig) -> Result<AppConfig, String> {
    let processed = process_import(bundle_json, config)?;
    let mut next_config = config.clone();
    next_config.tasks.extend(processed.bundle.tasks);
    next_config.templates.extend(processed.bundle.templates);

    let config_issues = validate_config_model(&next_config);
    if !config_issues.is_empty() {
        return Err(config_issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.field, issue.message))
            .collect::<Vec<_>>()
            .join("; "));
    }

    let mut issues = Vec::new();
    for task in &next_config.tasks {
        let validation = validate_task_model(task, &next_config.tasks);
        if !validation.valid {
            issues.extend(validation.issues);
        }
    }
    if !issues.is_empty() {
        return Err(issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.field, issue.message))
            .collect::<Vec<_>>()
            .join("; "));
    }

    Ok(next_config)
}

pub fn template_to_task(template: &TaskTemplate) -> TaskItem {
    let timestamp = Utc::now().to_rfc3339();
    let actions: Vec<TaskAction> = template
        .actions
        .iter()
        .map(|action| template_action_to_task_action(action, new_id("action")))
        .collect();
    let task = TaskItem {
        id: new_id("task"),
        name: template.name.clone(),
        category: template.category.clone(),
        keywords: template.keywords.clone(),
        description: template.description.clone(),
        variables: Vec::new(),
        actions,
        risk_level: RiskLevel::Low,
        enabled: true,
        favorite: false,
        tag_ids: Vec::new(),
        triggers: vec![TaskTrigger::Manual { enabled: true }],
        last_run_at: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    normalize_task(task)
}

pub fn template_risk(template: &TaskTemplate) -> RiskLevel {
    template
        .actions
        .iter()
        .filter(|action| action.enabled)
        .map(|action| {
            derive_action_risk(&template_action_to_task_action(action, "template".into()))
        })
        .max_by_key(risk_weight)
        .unwrap_or(RiskLevel::Low)
}

fn normalize_imported_task(
    mut task: TaskItem,
    used_task_ids: &mut HashSet<String>,
    conflict_summary: &mut ImportConflictSummary,
    now: &str,
) -> TaskItem {
    if !used_task_ids.insert(task.id.clone()) {
        task.id = new_id("task");
        used_task_ids.insert(task.id.clone());
        conflict_summary.task_ids_regenerated += 1;
    }

    let mut used_action_ids = HashSet::new();
    task.actions = task
        .actions
        .into_iter()
        .map(|mut action| {
            if action.id.trim().is_empty() || !used_action_ids.insert(action.id.clone()) {
                action.id = new_id("action");
                used_action_ids.insert(action.id.clone());
                conflict_summary.action_ids_regenerated += 1;
            }
            action.risk_level = derive_action_risk(&action);
            action
        })
        .collect();
    task.last_run_at = None;
    task.created_at = now.to_string();
    task.updated_at = now.to_string();
    normalize_task(task)
}

fn task_with_unique_name(mut task: TaskItem, used_task_names: &mut HashSet<String>) -> TaskItem {
    let base_name = if task.name.trim().is_empty() {
        "导入事项".to_string()
    } else {
        task.name.trim().to_string()
    };
    if used_task_names.insert(base_name.clone()) {
        task.name = base_name;
        return task;
    }

    let mut index = 1;
    loop {
        let candidate = format!("{base_name} 导入 {index}");
        if used_task_names.insert(candidate.clone()) {
            task.name = candidate;
            return task;
        }
        index += 1;
    }
}

fn normalize_imported_template(
    mut template: TaskTemplate,
    used_template_ids: &mut HashSet<String>,
    conflict_summary: &mut ImportConflictSummary,
) -> TaskTemplate {
    if !used_template_ids.insert(template.id.clone()) {
        template.id = new_id("template");
        used_template_ids.insert(template.id.clone());
        conflict_summary.template_ids_regenerated += 1;
    }
    normalize_template(template)
}

pub fn normalize_template(mut template: TaskTemplate) -> TaskTemplate {
    template.category = Some(
        template
            .category
            .unwrap_or_else(|| "未分类".into())
            .trim()
            .to_string(),
    );
    template.keywords = Some(template.keywords.unwrap_or_default());
    template.description = Some(template.description.unwrap_or_default());
    template.actions = template
        .actions
        .into_iter()
        .map(|mut action| {
            let task_action = template_action_to_task_action(&action, "template".into());
            action.risk_level = derive_action_risk(&task_action);
            action
        })
        .collect();
    template
}

fn sanitize_task_for_export(mut task: TaskItem) -> TaskItem {
    task.last_run_at = None;
    normalize_task(task)
}

fn build_preview(
    bundle: &TaskExportBundle,
    conflict_summary: ImportConflictSummary,
) -> ImportPreview {
    let tasks: Vec<ImportTaskPreview> = bundle
        .tasks
        .iter()
        .map(|task| ImportTaskPreview {
            id: task.id.clone(),
            original_id: task.id.clone(),
            name: task.name.clone(),
            action_types: task
                .actions
                .iter()
                .map(|action| action.action_type.clone())
                .collect(),
            action_count: task.actions.len(),
            risk_level: derive_task_risk(task),
            command_action_count: task
                .actions
                .iter()
                .filter(|action| action.action_type == ActionType::RunCommand)
                .count(),
        })
        .collect();
    let templates: Vec<ImportTemplatePreview> = bundle
        .templates
        .iter()
        .map(|template| ImportTemplatePreview {
            id: template.id.clone(),
            original_id: template.id.clone(),
            name: template.name.clone(),
            category: template.category.clone(),
            keywords: template.keywords.clone().unwrap_or_default(),
            action_types: template
                .actions
                .iter()
                .map(|action| action.action_type.clone())
                .collect(),
            action_count: template.actions.len(),
            risk_level: template_risk(template),
            command_action_count: template
                .actions
                .iter()
                .filter(|action| action.action_type == ActionType::RunCommand)
                .count(),
        })
        .collect();
    let path_hints = collect_path_hints(bundle);
    let risk_summary = summarize_risk(bundle);
    let total_action_count = bundle
        .tasks
        .iter()
        .map(|task| task.actions.len())
        .sum::<usize>()
        + bundle
            .templates
            .iter()
            .map(|template| template.actions.len())
            .sum::<usize>();

    ImportPreview {
        schema_version: bundle.schema_version,
        valid_task_count: bundle.tasks.len(),
        template_count: bundle.templates.len(),
        total_action_count,
        risk_summary,
        conflict_summary,
        path_hints,
        tasks,
        templates,
    }
}

fn summarize_risk(bundle: &TaskExportBundle) -> ImportRiskSummary {
    let mut summary = ImportRiskSummary {
        low: 0,
        medium: 0,
        high: 0,
        command_actions: 0,
    };
    for task in &bundle.tasks {
        match derive_task_risk(task) {
            RiskLevel::Low => summary.low += 1,
            RiskLevel::Medium => summary.medium += 1,
            RiskLevel::High => summary.high += 1,
        }
        summary.command_actions += task
            .actions
            .iter()
            .filter(|action| action.action_type == ActionType::RunCommand)
            .count();
    }
    for template in &bundle.templates {
        match template_risk(template) {
            RiskLevel::Low => summary.low += 1,
            RiskLevel::Medium => summary.medium += 1,
            RiskLevel::High => summary.high += 1,
        }
        summary.command_actions += template
            .actions
            .iter()
            .filter(|action| action.action_type == ActionType::RunCommand)
            .count();
    }
    summary
}

fn collect_path_hints(bundle: &TaskExportBundle) -> Vec<ImportPathHint> {
    let mut hints = Vec::new();
    for task in &bundle.tasks {
        for action in &task.actions {
            collect_action_path_hints(&mut hints, &task.id, &task.name, action);
        }
    }
    for template in &bundle.templates {
        for action in &template.actions {
            let task_action = template_action_to_task_action(action, "template".into());
            collect_action_path_hints(&mut hints, &template.id, &template.name, &task_action);
        }
    }
    hints
}

fn collect_action_path_hints(
    hints: &mut Vec<ImportPathHint>,
    owner_id: &str,
    owner_name: &str,
    action: &TaskAction,
) {
    match action.action_type {
        ActionType::OpenProgram | ActionType::OpenFile | ActionType::OpenFolder => {
            push_path_hint(hints, owner_id, owner_name, action, "path");
        }
        ActionType::RunCommand => {
            push_path_hint(hints, owner_id, owner_name, action, "workingDir");
            if string_param(action, "source") == "script" {
                push_path_hint(hints, owner_id, owner_name, action, "scriptPath");
            }
        }
        ActionType::OpenUrl | ActionType::Delay => {}
    }
}

fn push_path_hint(
    hints: &mut Vec<ImportPathHint>,
    owner_id: &str,
    owner_name: &str,
    action: &TaskAction,
    field: &str,
) {
    let path = string_param(action, field).trim();
    if path.is_empty() {
        return;
    }
    let exists = Path::new(path).exists();
    hints.push(ImportPathHint {
        owner_id: owner_id.to_string(),
        owner_name: owner_name.to_string(),
        action_name: action.name.clone().unwrap_or_else(|| "未命名动作".into()),
        field: field.to_string(),
        path: path.to_string(),
        exists,
        message: if exists {
            "路径可用".to_string()
        } else {
            "当前机器上未找到该路径".to_string()
        },
    });
}

fn template_action_to_task_action(action: &TaskTemplateAction, id: String) -> TaskAction {
    TaskAction {
        id,
        action_type: action.action_type.clone(),
        name: action.name.clone(),
        params: action.params.clone(),
        enabled: action.enabled,
        timeout_ms: action.timeout_ms,
        continue_on_error: action.continue_on_error,
        output_binding: action.output_binding.clone(),
        risk_level: action.risk_level.clone(),
    }
}

fn string_param<'a>(action: &'a TaskAction, key: &str) -> &'a str {
    action
        .params
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}

fn risk_weight(risk: &RiskLevel) -> u8 {
    match risk {
        RiskLevel::Low => 1,
        RiskLevel::Medium => 2,
        RiskLevel::High => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::risk::analyze_task_risk;
    use serde_json::json;

    fn sample_task(id: &str, action_id: &str) -> TaskItem {
        TaskItem {
            id: id.into(),
            name: format!("事项 {id}"),
            category: Some("未分类".into()),
            keywords: Some(Vec::new()),
            description: Some(String::new()),
            variables: Vec::new(),
            actions: vec![TaskAction {
                id: action_id.into(),
                action_type: ActionType::RunCommand,
                name: Some("命令".into()),
                params: json!({
                    "source": "inline",
                    "command": "Remove-Item -Recurse dist",
                    "workingDir": "Z:\\missing",
                    "shell": "powershell"
                }),
                enabled: true,
                timeout_ms: None,
                continue_on_error: None,
                output_binding: None,
                risk_level: RiskLevel::Low,
            }],
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Manual { enabled: true }],
            last_run_at: Some("2026-07-01T00:00:00Z".into()),
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        }
    }

    fn sample_url_task(id: &str, action_id: &str, url: &str) -> TaskItem {
        TaskItem {
            id: id.into(),
            name: format!("事项 {id}"),
            category: Some("未分类".into()),
            keywords: Some(Vec::new()),
            description: Some(String::new()),
            variables: Vec::new(),
            actions: vec![TaskAction {
                id: action_id.into(),
                action_type: ActionType::OpenUrl,
                name: Some("打开网页".into()),
                params: json!({ "url": url }),
                enabled: true,
                timeout_ms: None,
                continue_on_error: None,
                output_binding: None,
                risk_level: RiskLevel::Low,
            }],
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Manual { enabled: true }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn rejects_unsupported_schema_version() {
        let config = AppConfig::default();
        let content = json!({
            "schemaVersion": 99,
            "exportedAt": "2026-07-01T00:00:00Z",
            "sourceApp": SOURCE_APP,
            "tasks": [],
            "templates": []
        })
        .to_string();

        assert!(process_import(&content, &config).is_err());
    }

    #[test]
    fn regenerates_conflicting_task_id_and_recalculates_risk() {
        let mut config = AppConfig::default();
        config.tasks.push(sample_task("task-a", "action-a"));
        let bundle = TaskExportBundle {
            schema_version: BUNDLE_SCHEMA_VERSION,
            exported_at: "2026-07-01T00:00:00Z".into(),
            source_app: SOURCE_APP.into(),
            tasks: vec![sample_task("task-a", "action-a")],
            templates: Vec::new(),
        };
        let content = serde_json::to_string(&bundle).unwrap();

        let processed = process_import(&content, &config).unwrap();

        assert_ne!(processed.bundle.tasks[0].id, "task-a");
        assert_eq!(processed.bundle.tasks[0].risk_level, RiskLevel::High);
        assert!(processed.bundle.tasks[0].last_run_at.is_none());
        assert_eq!(processed.preview.conflict_summary.task_ids_regenerated, 1);
    }

    #[test]
    fn reports_missing_path_without_rejecting_preview() {
        let config = AppConfig::default();
        let bundle = TaskExportBundle {
            schema_version: BUNDLE_SCHEMA_VERSION,
            exported_at: "2026-07-01T00:00:00Z".into(),
            source_app: SOURCE_APP.into(),
            tasks: vec![sample_task("task-a", "action-a")],
            templates: Vec::new(),
        };
        let content = serde_json::to_string(&bundle).unwrap();

        let processed = process_import(&content, &config).unwrap();

        assert!(processed.preview.path_hints.iter().any(|hint| !hint.exists));
    }

    #[test]
    fn confirms_imported_export_as_new_task_after_source_removed() {
        let source_config = AppConfig {
            tasks: vec![sample_url_task("task-a", "action-a", "https://example.com")],
            ..AppConfig::default()
        };
        let bundle = create_export_bundle(
            &source_config,
            ExportBundleRequest {
                task_ids: vec!["task-a".into()],
                template_ids: Vec::new(),
            },
        )
        .unwrap();
        let content = serde_json::to_string(&bundle).unwrap();
        let empty_config = AppConfig::default();

        let imported = confirm_import(&content, &empty_config).unwrap();

        assert_eq!(imported.tasks.len(), 1);
        assert_eq!(imported.tasks[0].name, "事项 task-a");
        assert_eq!(imported.tasks[0].actions.len(), 1);
    }

    #[test]
    fn batch_import_preserves_action_order_and_regenerates_conflicting_ids() {
        let mut existing_config = AppConfig::default();
        existing_config.tasks.push(sample_url_task(
            "task-a",
            "action-existing",
            "https://local.example",
        ));

        let mut imported_task = sample_url_task("task-a", "action-dup", "https://first.example");
        imported_task.actions.push(TaskAction {
            id: "action-dup".into(),
            action_type: ActionType::OpenUrl,
            name: Some("第二个网页".into()),
            params: json!({ "url": "https://second.example" }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            risk_level: RiskLevel::Low,
        });
        let bundle = TaskExportBundle {
            schema_version: BUNDLE_SCHEMA_VERSION,
            exported_at: "2026-07-01T00:00:00Z".into(),
            source_app: SOURCE_APP.into(),
            tasks: vec![imported_task],
            templates: Vec::new(),
        };
        let content = serde_json::to_string(&bundle).unwrap();

        let imported = confirm_import(&content, &existing_config).unwrap();
        let imported_task = imported
            .tasks
            .iter()
            .find(|task| task.name.starts_with("事项 task-a") && task.id != "task-a")
            .unwrap();

        assert_ne!(imported_task.id, "task-a");
        assert_ne!(imported_task.actions[0].id, imported_task.actions[1].id);
        assert_eq!(
            imported_task.actions[0].params["url"],
            json!("https://first.example")
        );
        assert_eq!(
            imported_task.actions[1].params["url"],
            json!("https://second.example")
        );
    }

    #[test]
    fn imported_high_risk_command_requires_confirmation() {
        let config = AppConfig::default();
        let bundle = TaskExportBundle {
            schema_version: BUNDLE_SCHEMA_VERSION,
            exported_at: "2026-07-01T00:00:00Z".into(),
            source_app: SOURCE_APP.into(),
            tasks: vec![sample_task("task-a", "action-a")],
            templates: Vec::new(),
        };
        let content = serde_json::to_string(&bundle).unwrap();

        let imported = confirm_import(&content, &config).unwrap();
        let risk = analyze_task_risk(&imported.tasks[0]);

        assert_eq!(imported.tasks[0].risk_level, RiskLevel::High);
        assert!(risk.requires_confirmation);
    }
}
