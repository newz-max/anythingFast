use crate::domain::{
    ActionCondition, ActionType, FieldIssue, TaskAction, TaskActionOutputBinding, TaskItem,
    TaskVariable,
};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

const MASK: &str = "••••";

#[derive(Debug, Clone)]
pub struct RuntimeVariableContext {
    values: HashMap<String, String>,
    secret_keys: HashSet<String>,
}

impl RuntimeVariableContext {
    pub fn from_task(
        task: &TaskItem,
        runtime_values: &HashMap<String, String>,
    ) -> Result<Self, String> {
        let issues = validate_task_variables(task);
        if !issues.is_empty() {
            return Err(join_issues(issues));
        }

        let definitions: HashSet<&str> = task
            .variables
            .iter()
            .map(|variable| variable.key.as_str())
            .collect();
        let mut values = HashMap::new();
        let mut secret_keys = HashSet::new();

        for variable in &task.variables {
            if variable.secret {
                secret_keys.insert(variable.key.clone());
            }
            if !variable.default_value.is_empty() {
                values.insert(variable.key.clone(), variable.default_value.clone());
            }
        }

        for (key, value) in runtime_values {
            if !is_valid_variable_key(key) {
                return Err(format!("变量 key 无效：{key}"));
            }
            if !definitions.contains(key.as_str()) {
                return Err(format!("运行时变量未在事项中定义：{key}"));
            }
            values.insert(key.clone(), value.clone());
        }

        for variable in &task.variables {
            if (variable.required || variable.default_value.is_empty())
                && !values
                    .get(&variable.key)
                    .map(|value| !value.is_empty())
                    .unwrap_or(false)
            {
                return Err(format!("缺少变量值：{}", variable.key));
            }
        }

        Ok(Self {
            values,
            secret_keys,
        })
    }

    pub fn bind_output(
        &mut self,
        action: &TaskAction,
        output: &ActionOutputSnapshot,
    ) -> Result<(), String> {
        match action.action_type {
            ActionType::RunCommand => {
                let Some(binding) = &action.output_binding else {
                    return Ok(());
                };
                self.bind_optional(&binding.stdout_variable, output.stdout.clone())?;
                self.bind_optional(&binding.stderr_variable, output.stderr.clone())?;
                self.bind_optional(
                    &binding.exit_code_variable,
                    output.exit_code.map(|code| code.to_string()),
                )?;
            }
            ActionType::ReadClipboard => {
                let key = action
                    .params
                    .get("targetVariable")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|key| !key.is_empty())
                    .ok_or_else(|| "缺少参数：targetVariable".to_string())?;
                let value = output
                    .clipboard_text
                    .clone()
                    .ok_or_else(|| "读取剪贴板未返回文本".to_string())?;
                self.bind_secret(key, value)?;
            }
            _ => {}
        }
        Ok(())
    }

    pub fn mask_text(&self, value: &str) -> String {
        let mut masked = value.to_string();
        for (key, secret_value) in self.secret_values() {
            if secret_value.is_empty() {
                continue;
            }
            masked = masked.replace(secret_value, MASK);
            masked = masked.replace(&format!("{{{{{key}}}}}"), MASK);
        }
        masked
    }

    pub fn mask_optional_text(&self, value: Option<String>) -> Option<String> {
        value.map(|text| self.mask_text(&text))
    }

    pub fn resolve_text(&self, value: &str) -> Result<String, String> {
        resolve_template(value, self)
    }

    pub fn value(&self, key: &str) -> Option<&str> {
        self.values.get(key).map(String::as_str)
    }

    fn bind_optional(
        &mut self,
        target: &Option<String>,
        value: Option<String>,
    ) -> Result<(), String> {
        let Some(key) = target
            .as_deref()
            .map(str::trim)
            .filter(|key| !key.is_empty())
        else {
            return Ok(());
        };
        if !is_valid_variable_key(key) {
            return Err(format!("输出绑定变量 key 无效：{key}"));
        }
        self.values
            .insert(key.to_string(), value.unwrap_or_default());
        Ok(())
    }

    fn bind_secret(&mut self, key: &str, value: String) -> Result<(), String> {
        if !is_valid_variable_key(key) {
            return Err(format!("输出绑定变量 key 无效：{key}"));
        }
        self.secret_keys.insert(key.to_string());
        self.values.insert(key.to_string(), value);
        Ok(())
    }

    fn secret_values(&self) -> impl Iterator<Item = (&str, &str)> {
        self.secret_keys.iter().filter_map(|key| {
            self.values
                .get(key)
                .map(|value| (key.as_str(), value.as_str()))
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct ActionOutputSnapshot {
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub clipboard_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VariableReference {
    pub field: String,
    pub key: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ActionVariableReferenceScan {
    pub text_references: Vec<VariableReference>,
    pub condition_variable_keys: Vec<VariableReference>,
    pub output_binding_keys: Vec<VariableReference>,
    pub produced_variable_keys: Vec<VariableReference>,
}

pub fn is_valid_variable_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

pub fn validate_task_variables(task: &TaskItem) -> Vec<FieldIssue> {
    let mut issues = Vec::new();
    let mut keys = HashSet::new();
    for (index, variable) in task.variables.iter().enumerate() {
        let field = |name: &str| format!("variables.{index}.{name}");
        let key = variable.key.trim();
        if !is_valid_variable_key(key) {
            issues.push(issue(
                &field("key"),
                "变量 key 只能包含字母、数字和下划线，且不能以数字开头",
            ));
        }
        if !keys.insert(key.to_string()) {
            issues.push(issue(&field("key"), "变量 key 不能重复"));
        }
        if variable.label.trim().is_empty() {
            issues.push(issue(&field("label"), "变量标签不能为空"));
        }
    }
    issues
}

pub fn validate_action_output_binding(action: &TaskAction) -> Vec<FieldIssue> {
    let mut issues = Vec::new();
    let Some(binding) = &action.output_binding else {
        return issues;
    };
    validate_binding_key(
        &mut issues,
        "outputBinding.stdoutVariable",
        &binding.stdout_variable,
    );
    validate_binding_key(
        &mut issues,
        "outputBinding.stderrVariable",
        &binding.stderr_variable,
    );
    validate_binding_key(
        &mut issues,
        "outputBinding.exitCodeVariable",
        &binding.exit_code_variable,
    );
    issues
}

pub fn resolve_action(
    action: &TaskAction,
    context: &RuntimeVariableContext,
) -> Result<TaskAction, String> {
    let mut resolved = action.clone();
    match resolved.action_type {
        ActionType::OpenProgram => {
            resolve_string_param(&mut resolved.params, "path", context)?;
            resolve_string_param(&mut resolved.params, "workingDir", context)?;
            resolve_string_array_param(&mut resolved.params, "args", context)?;
        }
        ActionType::OpenUrl => {
            resolve_string_param(&mut resolved.params, "url", context)?;
            resolve_string_param(&mut resolved.params, "browser", context)?;
        }
        ActionType::OpenFile | ActionType::OpenFolder => {
            resolve_string_param(&mut resolved.params, "path", context)?;
        }
        ActionType::RunCommand => {
            resolve_string_param(&mut resolved.params, "command", context)?;
            resolve_string_param(&mut resolved.params, "workingDir", context)?;
            resolve_string_param(&mut resolved.params, "scriptPath", context)?;
            resolve_string_array_param(&mut resolved.params, "scriptArgs", context)?;
            resolve_env_param(&mut resolved.params, context)?;
        }
        ActionType::WriteClipboard => {
            resolve_string_param(&mut resolved.params, "text", context)?;
        }
        ActionType::ShowNotification => {
            resolve_string_param(&mut resolved.params, "title", context)?;
            resolve_string_param(&mut resolved.params, "body", context)?;
        }
        ActionType::WaitForPort => {
            resolve_string_param(&mut resolved.params, "host", context)?;
        }
        ActionType::ReadClipboard | ActionType::Delay => {}
    }
    Ok(resolved)
}

pub fn command_has_variable_reference(action: &TaskAction) -> bool {
    if action.action_type != ActionType::RunCommand {
        return false;
    }
    let mut values = Vec::new();
    collect_string_param(&action.params, "command", &mut values);
    collect_string_param(&action.params, "workingDir", &mut values);
    collect_string_param(&action.params, "scriptPath", &mut values);
    collect_string_array_param(&action.params, "scriptArgs", &mut values);
    values
        .iter()
        .any(|value| value.contains("{{") || value.contains("}}"))
}

pub fn empty_runtime_values() -> HashMap<String, String> {
    HashMap::new()
}

pub fn collect_action_string_values(action: &TaskAction) -> Vec<(String, String)> {
    let mut values = Vec::new();
    match action.action_type {
        ActionType::OpenProgram => {
            collect_owned_string_param(&action.params, "path", &mut values);
            collect_owned_string_param(&action.params, "workingDir", &mut values);
            collect_owned_string_array_param(&action.params, "args", &mut values);
        }
        ActionType::OpenUrl => {
            collect_owned_string_param(&action.params, "url", &mut values);
            collect_owned_string_param(&action.params, "browser", &mut values);
        }
        ActionType::OpenFile | ActionType::OpenFolder => {
            collect_owned_string_param(&action.params, "path", &mut values);
        }
        ActionType::RunCommand => {
            collect_owned_string_param(&action.params, "command", &mut values);
            collect_owned_string_param(&action.params, "workingDir", &mut values);
            collect_owned_string_param(&action.params, "scriptPath", &mut values);
            collect_owned_string_array_param(&action.params, "scriptArgs", &mut values);
            collect_owned_env_values(&action.params, &mut values);
        }
        ActionType::WriteClipboard => {
            collect_owned_string_param(&action.params, "text", &mut values);
        }
        ActionType::ShowNotification => {
            collect_owned_string_param(&action.params, "title", &mut values);
            collect_owned_string_param(&action.params, "body", &mut values);
        }
        ActionType::WaitForPort => {
            collect_owned_string_param(&action.params, "host", &mut values);
        }
        ActionType::ReadClipboard | ActionType::Delay => {}
    }
    values
}

pub fn collect_condition_string_values(
    condition: &Option<ActionCondition>,
) -> Vec<(String, String)> {
    let mut values = Vec::new();
    match condition {
        Some(ActionCondition::FileExists { path })
        | Some(ActionCondition::FolderExists { path }) => {
            values.push(("condition.path".to_string(), path.clone()));
        }
        Some(ActionCondition::VariableEquals { value, .. }) => {
            values.push(("condition.value".to_string(), value.clone()));
        }
        Some(ActionCondition::Always)
        | Some(ActionCondition::VariableNotEmpty { .. })
        | Some(ActionCondition::PreviousActionStatus { .. })
        | None => {}
    }
    values
}

pub fn collect_condition_variable_keys(
    condition: &Option<ActionCondition>,
) -> Vec<VariableReference> {
    match condition {
        Some(ActionCondition::VariableEquals { variable, .. })
        | Some(ActionCondition::VariableNotEmpty { variable }) => vec![VariableReference {
            field: "condition.variable".to_string(),
            key: variable.trim().to_string(),
        }],
        _ => Vec::new(),
    }
}

pub fn collect_output_binding_keys(action: &TaskAction) -> Vec<VariableReference> {
    let Some(binding) = &action.output_binding else {
        return Vec::new();
    };
    [
        ("outputBinding.stdoutVariable", &binding.stdout_variable),
        ("outputBinding.stderrVariable", &binding.stderr_variable),
        (
            "outputBinding.exitCodeVariable",
            &binding.exit_code_variable,
        ),
    ]
    .into_iter()
    .filter_map(|(field, value)| {
        value
            .as_deref()
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .map(|key| VariableReference {
                field: field.to_string(),
                key: key.to_string(),
            })
    })
    .collect()
}

pub fn collect_action_produced_variable_keys(action: &TaskAction) -> Vec<VariableReference> {
    if action.action_type == ActionType::ReadClipboard {
        return action
            .params
            .get("targetVariable")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .map(|key| VariableReference {
                field: "targetVariable".to_string(),
                key: key.to_string(),
            })
            .into_iter()
            .collect();
    }
    collect_output_binding_keys(action)
}

pub fn scan_action_variable_references(
    action: &TaskAction,
) -> Result<ActionVariableReferenceScan, String> {
    let mut text_references = Vec::new();
    let values = collect_action_string_values(action)
        .into_iter()
        .chain(collect_condition_string_values(&action.condition));
    for (field, value) in values {
        for key in extract_variable_references(&value)? {
            text_references.push(VariableReference {
                field: field.clone(),
                key,
            });
        }
    }
    Ok(ActionVariableReferenceScan {
        text_references,
        condition_variable_keys: collect_condition_variable_keys(&action.condition),
        output_binding_keys: collect_output_binding_keys(action),
        produced_variable_keys: collect_action_produced_variable_keys(action),
    })
}

pub fn infer_missing_input_variable_keys(
    actions: &[TaskAction],
    variables: &[TaskVariable],
) -> Vec<String> {
    let mut available_keys: HashSet<String> = variables
        .iter()
        .map(|variable| variable.key.trim().to_string())
        .filter(|key| !key.is_empty())
        .collect();
    let mut missing_keys = Vec::new();

    for action in actions {
        if let Ok(scan) = scan_action_variable_references(action) {
            for reference in scan.text_references {
                add_missing_input_key(&mut available_keys, &mut missing_keys, &reference.key);
            }
            for reference in scan.condition_variable_keys {
                add_missing_input_key(&mut available_keys, &mut missing_keys, &reference.key);
            }
            if action.enabled {
                for reference in scan.produced_variable_keys {
                    if is_valid_variable_key(&reference.key) {
                        available_keys.insert(reference.key);
                    }
                }
            }
            continue;
        }

        for reference in collect_condition_variable_keys(&action.condition) {
            add_missing_input_key(&mut available_keys, &mut missing_keys, &reference.key);
        }
        if action.enabled {
            for reference in collect_action_produced_variable_keys(action) {
                if is_valid_variable_key(&reference.key) {
                    available_keys.insert(reference.key);
                }
            }
        }
    }

    missing_keys
}

pub fn extract_variable_references(value: &str) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut refs = Vec::new();
    let mut rest = value;
    while let Some(start) = rest.find("{{") {
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("}}") else {
            return Err(format!("变量引用语法无效：{value}"));
        };
        let key = after_start[..end].trim();
        if !is_valid_variable_key(key) {
            return Err(format!("变量引用 key 无效：{key}"));
        }
        if seen.insert(key.to_string()) {
            refs.push(key.to_string());
        }
        rest = &after_start[end + 2..];
    }
    if rest.contains("}}") {
        return Err(format!("变量引用语法无效：{value}"));
    }
    Ok(refs)
}

fn add_missing_input_key(
    available_keys: &mut HashSet<String>,
    missing_keys: &mut Vec<String>,
    key: &str,
) {
    if !is_valid_variable_key(key) || available_keys.contains(key) {
        return;
    }
    available_keys.insert(key.to_string());
    missing_keys.push(key.to_string());
}

fn resolve_string_param(
    params: &mut Value,
    key: &str,
    context: &RuntimeVariableContext,
) -> Result<(), String> {
    let Some(value) = params.get(key).and_then(|value| value.as_str()) else {
        return Ok(());
    };
    let resolved = resolve_template(value, context)?;
    if let Some(object) = params.as_object_mut() {
        object.insert(key.to_string(), Value::String(resolved));
    }
    Ok(())
}

fn resolve_string_array_param(
    params: &mut Value,
    key: &str,
    context: &RuntimeVariableContext,
) -> Result<(), String> {
    let Some(values) = params.get(key).and_then(|value| value.as_array()) else {
        return Ok(());
    };
    let resolved = values
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(|text| resolve_template(text, context).map(Value::String))
                .unwrap_or_else(|| Ok(value.clone()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if let Some(object) = params.as_object_mut() {
        object.insert(key.to_string(), Value::Array(resolved));
    }
    Ok(())
}

fn resolve_env_param(params: &mut Value, context: &RuntimeVariableContext) -> Result<(), String> {
    let Some(env) = params.get("env").and_then(|value| value.as_object()) else {
        return Ok(());
    };
    let mut resolved = serde_json::Map::new();
    for (key, value) in env {
        if let Some(text) = value.as_str() {
            resolved.insert(key.clone(), Value::String(resolve_template(text, context)?));
        } else {
            resolved.insert(key.clone(), value.clone());
        }
    }
    if let Some(object) = params.as_object_mut() {
        object.insert("env".to_string(), Value::Object(resolved));
    }
    Ok(())
}

fn resolve_template(value: &str, context: &RuntimeVariableContext) -> Result<String, String> {
    let mut output = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("{{") {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("}}") else {
            return Err(format!("变量引用语法无效：{value}"));
        };
        let key = after_start[..end].trim();
        if !is_valid_variable_key(key) {
            return Err(format!("变量引用 key 无效：{key}"));
        }
        let replacement = context
            .values
            .get(key)
            .ok_or_else(|| format!("变量未定义或尚未绑定：{key}"))?;
        output.push_str(replacement);
        rest = &after_start[end + 2..];
    }
    if rest.contains("}}") {
        return Err(format!("变量引用语法无效：{value}"));
    }
    output.push_str(rest);
    Ok(output)
}

fn validate_binding_key(issues: &mut Vec<FieldIssue>, field: &str, value: &Option<String>) {
    let Some(key) = value
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
    else {
        return;
    };
    if !is_valid_variable_key(key) {
        issues.push(issue(field, "输出绑定变量 key 无效"));
    }
}

fn collect_string_param<'a>(params: &'a Value, key: &str, values: &mut Vec<&'a str>) {
    if let Some(value) = params.get(key).and_then(|value| value.as_str()) {
        values.push(value);
    }
}

fn collect_string_array_param<'a>(params: &'a Value, key: &str, values: &mut Vec<&'a str>) {
    if let Some(array) = params.get(key).and_then(|value| value.as_array()) {
        values.extend(array.iter().filter_map(|value| value.as_str()));
    }
}

fn collect_owned_string_param(params: &Value, key: &str, values: &mut Vec<(String, String)>) {
    if let Some(value) = params.get(key).and_then(Value::as_str) {
        values.push((key.to_string(), value.to_string()));
    }
}

fn collect_owned_string_array_param(params: &Value, key: &str, values: &mut Vec<(String, String)>) {
    if let Some(array) = params.get(key).and_then(Value::as_array) {
        values.extend(array.iter().enumerate().filter_map(|(index, value)| {
            value
                .as_str()
                .map(|text| (format!("{key}.{index}"), text.to_string()))
        }));
    }
}

fn collect_owned_env_values(params: &Value, values: &mut Vec<(String, String)>) {
    let Some(env) = params.get("env").and_then(Value::as_object) else {
        return;
    };
    values.extend(env.iter().filter_map(|(key, value)| {
        value
            .as_str()
            .map(|text| (format!("env.{key}"), text.to_string()))
    }));
}

fn join_issues(issues: Vec<FieldIssue>) -> String {
    issues
        .into_iter()
        .map(|issue| format!("{}: {}", issue.field, issue.message))
        .collect::<Vec<_>>()
        .join("; ")
}

fn issue(field: &str, message: &str) -> FieldIssue {
    FieldIssue {
        field: field.to_string(),
        message: message.to_string(),
    }
}

#[allow(dead_code)]
fn _binding_used(_: &TaskActionOutputBinding) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{RiskLevel, TaskVariable};
    use serde_json::json;

    #[test]
    fn deserializes_legacy_task_without_variables_or_output_binding() {
        let task: TaskItem = serde_json::from_value(json!({
            "id": "task-1",
            "name": "Legacy",
            "actions": [{
                "id": "action-1",
                "type": "openFolder",
                "params": { "path": "D:\\Project" },
                "enabled": true,
                "riskLevel": "low"
            }],
            "riskLevel": "low",
            "enabled": true,
            "favorite": false,
            "tagIds": [],
            "triggers": [{ "type": "manual", "enabled": true }],
            "createdAt": "2026-07-01T00:00:00Z",
            "updatedAt": "2026-07-01T00:00:00Z"
        }))
        .expect("legacy task");

        assert!(task.variables.is_empty());
        assert!(task.actions[0].output_binding.is_none());
    }

    #[test]
    fn resolves_project_dir_across_supported_string_fields() {
        let task = task_with_variables(vec![TaskVariable {
            key: "projectDir".into(),
            label: "项目目录".into(),
            default_value: "D:\\Project\\anythingFast".into(),
            required: true,
            secret: false,
        }]);
        let context = RuntimeVariableContext::from_task(&task, &HashMap::new()).expect("context");

        let folder = resolve_action(
            &action(ActionType::OpenFolder, json!({ "path": "{{projectDir}}" })),
            &context,
        )
        .expect("folder");
        let command = resolve_action(
            &action(
                ActionType::RunCommand,
                json!({
                    "command": "dir",
                    "workingDir": "{{projectDir}}",
                    "shell": "powershell"
                }),
            ),
            &context,
        )
        .expect("command");
        let file = resolve_action(
            &action(
                ActionType::OpenFile,
                json!({ "path": "{{projectDir}}\\README.md" }),
            ),
            &context,
        )
        .expect("file");

        assert_eq!(folder.params["path"], json!("D:\\Project\\anythingFast"));
        assert_eq!(
            command.params["workingDir"],
            json!("D:\\Project\\anythingFast")
        );
        assert_eq!(
            file.params["path"],
            json!("D:\\Project\\anythingFast\\README.md")
        );
    }

    #[test]
    fn rejects_missing_required_or_unknown_variables() {
        let task = task_with_variables(vec![TaskVariable {
            key: "projectDir".into(),
            label: "项目目录".into(),
            default_value: String::new(),
            required: true,
            secret: false,
        }]);

        assert!(RuntimeVariableContext::from_task(&task, &HashMap::new()).is_err());

        let mut runtime = HashMap::new();
        runtime.insert("projectDir".into(), "D:\\Project".into());
        let context = RuntimeVariableContext::from_task(&task, &runtime).expect("context");
        let err = resolve_action(
            &action(ActionType::OpenFolder, json!({ "path": "{{missing}}" })),
            &context,
        )
        .unwrap_err();

        assert!(err.contains("missing"));
    }

    #[test]
    fn does_not_interpolate_non_string_fields() {
        let task = task_with_variables(vec![TaskVariable {
            key: "duration".into(),
            label: "Duration".into(),
            default_value: "5000".into(),
            required: false,
            secret: false,
        }]);
        let context = RuntimeVariableContext::from_task(&task, &HashMap::new()).expect("context");
        let resolved = resolve_action(
            &action(ActionType::Delay, json!({ "durationMs": 1000 })),
            &context,
        )
        .expect("delay");

        assert_eq!(resolved.params["durationMs"], json!(1000));
    }

    #[test]
    fn command_output_binding_can_feed_later_action_without_persisting_default() {
        let task = task_with_variables(vec![TaskVariable {
            key: "generatedPath".into(),
            label: "Generated".into(),
            default_value: String::new(),
            required: false,
            secret: false,
        }]);
        let mut context = RuntimeVariableContext::from_task(
            &task,
            &HashMap::from([("generatedPath".to_string(), "pending".to_string())]),
        )
        .expect("context");
        let mut command = action(
            ActionType::RunCommand,
            json!({
                "command": "Write-Output path",
                "workingDir": "D:\\Project",
                "shell": "powershell"
            }),
        );
        command.output_binding = Some(TaskActionOutputBinding {
            stdout_variable: Some("generatedPath".into()),
            stderr_variable: None,
            exit_code_variable: Some("lastExitCode".into()),
        });

        context
            .bind_output(
                &command,
                &ActionOutputSnapshot {
                    exit_code: Some(0),
                    stdout: Some("D:\\Generated".into()),
                    stderr: None,
                    clipboard_text: None,
                },
            )
            .expect("bind");
        let later = resolve_action(
            &action(
                ActionType::OpenFolder,
                json!({ "path": "{{generatedPath}}" }),
            ),
            &context,
        )
        .expect("later action");

        assert_eq!(later.params["path"], json!("D:\\Generated"));
        assert_eq!(task.variables[0].default_value, "");
    }

    #[test]
    fn clipboard_output_is_secret_and_available_only_after_its_action() {
        let task = task_with_variables(Vec::new());
        let mut context = RuntimeVariableContext::from_task(&task, &HashMap::new()).expect("context");
        let read = action(ActionType::ReadClipboard, json!({ "targetVariable": "clipboardText" }));

        context
            .bind_output(
                &read,
                &ActionOutputSnapshot {
                    clipboard_text: Some("private clipboard value".into()),
                    ..Default::default()
                },
            )
            .expect("bind clipboard output");
        let later = resolve_action(
            &action(
                ActionType::OpenUrl,
                json!({ "url": "https://example.test/?q={{clipboardText}}" }),
            ),
            &context,
        )
        .expect("resolve later action");

        assert_eq!(later.params["url"], json!("https://example.test/?q=private clipboard value"));
        assert_eq!(context.mask_text("private clipboard value"), MASK);
    }

    #[test]
    fn extracts_variable_references_in_first_occurrence_order() {
        let references =
            extract_variable_references("{{second}} {{ first }} {{second}}").expect("refs");

        assert_eq!(references, vec!["second", "first"]);
    }

    #[test]
    fn scans_condition_variables_and_output_binding_keys() {
        let mut command = action(
            ActionType::RunCommand,
            json!({
                "command": "echo {{input}}",
                "workingDir": "D:\\Project",
                "shell": "powershell"
            }),
        );
        command.condition = Some(ActionCondition::VariableEquals {
            variable: "status".into(),
            value: "{{expectedStatus}}".into(),
        });
        command.output_binding = Some(TaskActionOutputBinding {
            stdout_variable: Some("generatedPath".into()),
            stderr_variable: None,
            exit_code_variable: Some("lastExitCode".into()),
        });

        let scan = scan_action_variable_references(&command).expect("scan");

        assert_eq!(
            scan.text_references,
            vec![
                VariableReference {
                    field: "command".into(),
                    key: "input".into(),
                },
                VariableReference {
                    field: "condition.value".into(),
                    key: "expectedStatus".into(),
                },
            ]
        );
        assert_eq!(
            scan.condition_variable_keys,
            vec![VariableReference {
                field: "condition.variable".into(),
                key: "status".into(),
            }]
        );
        assert_eq!(
            scan.output_binding_keys,
            vec![
                VariableReference {
                    field: "outputBinding.stdoutVariable".into(),
                    key: "generatedPath".into(),
                },
                VariableReference {
                    field: "outputBinding.exitCodeVariable".into(),
                    key: "lastExitCode".into(),
                },
            ]
        );
        assert_eq!(scan.produced_variable_keys, scan.output_binding_keys);
    }

    fn task_with_variables(variables: Vec<TaskVariable>) -> TaskItem {
        TaskItem {
            id: "task-1".into(),
            name: "Task".into(),
            category: None,
            keywords: None,
            description: None,
            variables,
            actions: Vec::new(),
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![crate::domain::TaskTrigger::Manual { enabled: true }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        }
    }

    fn action(action_type: ActionType, params: Value) -> TaskAction {
        TaskAction {
            id: "action-1".into(),
            action_type,
            name: None,
            params,
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Low,
        }
    }
}
