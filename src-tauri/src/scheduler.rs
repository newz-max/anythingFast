use crate::diagnostics::dev_log_error;
use crate::domain::{AppConfig, ScheduleMisfirePolicy, ScheduleMode, TaskTrigger};
use crate::storage;
use crate::triggered_execution;
use chrono::{DateTime, Datelike, Duration, Local, NaiveTime, TimeZone, Utc};
use std::collections::HashSet;
use std::sync::Mutex;
use std::thread;
use std::time::Duration as StdDuration;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct SchedulerState(Mutex<SchedulerInner>);

#[derive(Default)]
struct SchedulerInner {
    started: bool,
    registrations: Vec<ScheduledRegistration>,
    running_task_ids: HashSet<String>,
}

#[derive(Debug, Clone)]
struct ScheduledRegistration {
    task_id: String,
    trigger_index: usize,
    trigger: TaskTrigger,
    next_run_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
enum DueDecision {
    Run(ScheduledRegistration),
    SkipOverlap(ScheduledRegistration),
}

pub fn start_scheduler(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<SchedulerState>();
        let mut inner = state
            .0
            .lock()
            .map_err(|_| "无法启动周期触发调度器".to_string())?;
        if inner.started {
            return Ok(());
        }
        inner.started = true;
    }

    let app = app.clone();
    thread::spawn(move || loop {
        thread::sleep(StdDuration::from_secs(1));
        let due = due_registrations(&app);
        for decision in due {
            match decision {
                DueDecision::Run(registration) => spawn_scheduled_run(&app, registration),
                DueDecision::SkipOverlap(registration) => {
                    persist_schedule_metadata(&app, &registration, Utc::now());
                    triggered_execution::record_blocked_task_by_id(
                        &app,
                        &registration.task_id,
                        "上一次周期执行尚未结束，已跳过本次触发",
                    );
                }
            }
        }
    });
    Ok(())
}

pub fn refresh_scheduled_triggers(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let now = Utc::now();
    let registrations = scheduled_registrations(config, now);
    let state = app.state::<SchedulerState>();
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "无法刷新周期触发调度器".to_string())?;
    inner.registrations = registrations;
    inner
        .running_task_ids
        .retain(|task_id| config.tasks.iter().any(|task| &task.id == task_id));
    Ok(())
}

fn scheduled_registrations(
    config: &AppConfig,
    now: DateTime<Utc>,
) -> Vec<ScheduledRegistration> {
    let mut registrations = Vec::new();
    for task in config.tasks.iter().filter(|task| task.enabled) {
        for (index, trigger) in task.triggers.iter().enumerate() {
            let TaskTrigger::Schedule { enabled: true, .. } = trigger else {
                continue;
            };
            let Some(next_run_at) = initial_next_run_at(trigger, now) else {
                dev_log_error(
                    "Schedule registration skipped",
                    format!("invalid schedule trigger on task {}", task.id),
                );
                continue;
            };
            registrations.push(ScheduledRegistration {
                task_id: task.id.clone(),
                trigger_index: index,
                trigger: trigger.clone(),
                next_run_at,
            });
        }
    }
    registrations
}

fn due_registrations(app: &AppHandle) -> Vec<DueDecision> {
    let now = Utc::now();
    let state = app.state::<SchedulerState>();
    let Ok(mut inner) = state.0.lock() else {
        dev_log_error("Read scheduler state failed", "lock poisoned");
        return Vec::new();
    };

    let mut due = Vec::new();
    let mut to_mark_running = Vec::new();
    let running_snapshot = inner.running_task_ids.clone();
    for registration in &mut inner.registrations {
        if registration.next_run_at > now {
            continue;
        }
        let current = registration.clone();
        if let Some(next) = next_run_after(&registration.trigger, now) {
            registration.next_run_at = next;
        }

        if prevents_overlap(&current.trigger) && running_snapshot.contains(&current.task_id) {
            due.push(DueDecision::SkipOverlap(current));
            continue;
        }
        to_mark_running.push(current.task_id.clone());
        due.push(DueDecision::Run(current));
    }
    for task_id in to_mark_running {
        inner.running_task_ids.insert(task_id);
    }
    due
}

fn spawn_scheduled_run(app: &AppHandle, registration: ScheduledRegistration) {
    persist_schedule_metadata(app, &registration, Utc::now());
    let app = app.clone();
    thread::spawn(move || {
        if let Err(err) = triggered_execution::execute_unattended_task(&app, &registration.task_id) {
            dev_log_error(
                "Execute scheduled task failed",
                format!("task id: {}, error: {err}", registration.task_id),
            );
        }
        if let Ok(mut inner) = app.state::<SchedulerState>().0.lock() {
            inner.running_task_ids.remove(&registration.task_id);
        }
    });
}

fn persist_schedule_metadata(app: &AppHandle, registration: &ScheduledRegistration, fired_at: DateTime<Utc>) {
    let mut config = match storage::load_config(app) {
        Ok(config) => config,
        Err(err) => {
            dev_log_error("Load config for schedule metadata failed", &err);
            return;
        }
    };
    let Some(task) = config.tasks.iter_mut().find(|task| task.id == registration.task_id) else {
        return;
    };
    let Some(trigger) = task.triggers.get_mut(registration.trigger_index) else {
        return;
    };
    let trigger_snapshot = trigger.clone();
    if let TaskTrigger::Schedule {
        next_run_at,
        last_scheduled_at,
        ..
    } = trigger
    {
        *last_scheduled_at = Some(fired_at.to_rfc3339());
        *next_run_at = next_run_after(&trigger_snapshot, fired_at).map(|value| value.to_rfc3339());
    }
    if let Err(err) = storage::save_config(app, &config) {
        dev_log_error("Save schedule metadata failed", &err);
    }
}

fn initial_next_run_at(trigger: &TaskTrigger, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let TaskTrigger::Schedule {
        next_run_at,
        misfire_policy,
        ..
    } = trigger
    else {
        return None;
    };
    if let Some(saved) = next_run_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
    {
        if saved > now {
            return Some(saved);
        }
        if *misfire_policy == ScheduleMisfirePolicy::RunOnce {
            return Some(now);
        }
    }
    next_run_after(trigger, now)
}

pub(crate) fn next_run_after(trigger: &TaskTrigger, after: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let TaskTrigger::Schedule {
        mode,
        interval_minutes,
        time_of_day,
        weekdays,
        ..
    } = trigger
    else {
        return None;
    };

    match mode {
        ScheduleMode::Interval => {
            let minutes = i64::from(interval_minutes.unwrap_or(crate::validation::MIN_SCHEDULE_INTERVAL_MINUTES));
            Some(after + Duration::minutes(minutes))
        }
        ScheduleMode::Daily => next_daily_after(after, time_of_day.as_deref()?),
        ScheduleMode::Weekly => next_weekly_after(after, time_of_day.as_deref()?, weekdays),
    }
}

fn next_daily_after(after: DateTime<Utc>, time_of_day: &str) -> Option<DateTime<Utc>> {
    let time = NaiveTime::parse_from_str(time_of_day, "%H:%M").ok()?;
    for offset in 0..=1 {
        let local_after = after.with_timezone(&Local);
        let date = local_after.date_naive() + Duration::days(offset);
        let candidate = local_datetime(date.and_time(time))?;
        if candidate > after {
            return Some(candidate);
        }
    }
    None
}

fn next_weekly_after(after: DateTime<Utc>, time_of_day: &str, weekdays: &[u8]) -> Option<DateTime<Utc>> {
    if weekdays.is_empty() {
        return None;
    }
    let time = NaiveTime::parse_from_str(time_of_day, "%H:%M").ok()?;
    let local_after = after.with_timezone(&Local);
    for offset in 0..=7 {
        let date = local_after.date_naive() + Duration::days(offset);
        let weekday = date.weekday().number_from_monday() as u8;
        if !weekdays.contains(&weekday) {
            continue;
        }
        let candidate = local_datetime(date.and_time(time))?;
        if candidate > after {
            return Some(candidate);
        }
    }
    None
}

fn local_datetime(value: chrono::NaiveDateTime) -> Option<DateTime<Utc>> {
    Local
        .from_local_datetime(&value)
        .single()
        .or_else(|| Local.from_local_datetime(&value).earliest())
        .map(|value| value.with_timezone(&Utc))
}

fn prevents_overlap(trigger: &TaskTrigger) -> bool {
    matches!(
        trigger,
        TaskTrigger::Schedule {
            prevent_overlap: true,
            ..
        }
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interval_next_run_adds_interval() {
        let trigger = interval_trigger(30, None);
        let now = DateTime::parse_from_rfc3339("2026-07-05T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        let next = next_run_after(&trigger, now).expect("next run");

        assert_eq!(next, now + Duration::minutes(30));
    }

    #[test]
    fn missed_run_skip_moves_to_future_run() {
        let trigger = interval_trigger(30, Some("2026-07-05T09:00:00Z"));
        let now = DateTime::parse_from_rfc3339("2026-07-05T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        let next = initial_next_run_at(&trigger, now).expect("next run");

        assert_eq!(next, now + Duration::minutes(30));
    }

    #[test]
    fn missed_run_once_returns_now() {
        let mut trigger = interval_trigger(30, Some("2026-07-05T09:00:00Z"));
        if let TaskTrigger::Schedule { misfire_policy, .. } = &mut trigger {
            *misfire_policy = ScheduleMisfirePolicy::RunOnce;
        }
        let now = DateTime::parse_from_rfc3339("2026-07-05T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        let next = initial_next_run_at(&trigger, now).expect("next run");

        assert_eq!(next, now);
    }

    #[test]
    fn weekly_next_run_uses_selected_weekday() {
        let now = Utc::now();
        let local = now.with_timezone(&Local);
        let next_weekday = (local.weekday().number_from_monday() % 7 + 1) as u8;
        let trigger = TaskTrigger::Schedule {
            enabled: true,
            mode: ScheduleMode::Weekly,
            interval_minutes: None,
            time_of_day: Some("09:00".into()),
            weekdays: vec![next_weekday],
            misfire_policy: ScheduleMisfirePolicy::Skip,
            prevent_overlap: true,
            next_run_at: None,
            last_scheduled_at: None,
        };

        let next = next_run_after(&trigger, now).expect("next run");

        assert_eq!(
            next.with_timezone(&Local).weekday().number_from_monday() as u8,
            next_weekday
        );
    }

    fn interval_trigger(minutes: u32, next_run_at: Option<&str>) -> TaskTrigger {
        TaskTrigger::Schedule {
            enabled: true,
            mode: ScheduleMode::Interval,
            interval_minutes: Some(minutes),
            time_of_day: None,
            weekdays: Vec::new(),
            misfire_policy: ScheduleMisfirePolicy::Skip,
            prevent_overlap: true,
            next_run_at: next_run_at.map(str::to_string),
            last_scheduled_at: None,
        }
    }
}
