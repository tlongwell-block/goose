// Additional tests for PLATFORM_MANAGE_SCHEDULE_TOOL_NAME covering more actions and error handling.
// Placed in separate module to keep agent.rs lighter.
#![cfg(test)]

use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use mcp_core::{Content, ToolError};
use serde_json::json;

use crate::agents::agent::Agent;
use crate::agents::platform_tools::PLATFORM_MANAGE_SCHEDULE_TOOL_NAME;
use crate::scheduler::{ScheduledJob, SchedulerError};
use crate::scheduler_trait::SchedulerTrait;
use crate::session::storage::SessionMetadata;

// Helper to create a temporary valid recipe file and return its path as PathBuf
fn create_temp_recipe() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("test_recipe_{}.yaml", Utc::now().timestamp_nanos()));
    let contents = r#"version: \"0.1.0\"\ntitle: \"Temp\"\ndescription: \"Temp Desc\"\n"#;
    std::fs::write(&path, contents).expect("write temp recipe");
    path
}

// Mock Scheduler with minimal behavior for tests
struct MockScheduler {
    jobs: tokio::sync::Mutex<Vec<ScheduledJob>>,
    pauses: tokio::sync::Mutex<std::collections::HashMap<String, bool>>,
}

impl MockScheduler {
    fn new() -> Self {
        Self {
            jobs: tokio::sync::Mutex::new(Vec::new()),
            pauses: tokio::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
}

#[async_trait]
impl SchedulerTrait for MockScheduler {
    async fn add_scheduled_job(&self, job: ScheduledJob) -> Result<(), SchedulerError> {
        let mut jobs = self.jobs.lock().await;
        if jobs.iter().any(|j| j.id == job.id) {
            return Err(SchedulerError::JobIdExists(job.id));
        }
        jobs.push(job);
        Ok(())
    }

    async fn list_scheduled_jobs(&self) -> Result<Vec<ScheduledJob>, SchedulerError> {
        Ok(self.jobs.lock().await.clone())
    }

    async fn remove_scheduled_job(&self, id: &str) -> Result<(), SchedulerError> {
        let mut jobs = self.jobs.lock().await;
        if let Some(pos) = jobs.iter().position(|j| j.id == id) {
            jobs.remove(pos);
            Ok(())
        } else {
            Err(SchedulerError::JobNotFound(id.to_string()))
        }
    }

    async fn pause_schedule(&self, id: &str) -> Result<(), SchedulerError> {
        self.pauses.lock().await.insert(id.to_string(), true);
        Ok(())
    }

    async fn unpause_schedule(&self, id: &str) -> Result<(), SchedulerError> {
        self.pauses.lock().await.insert(id.to_string(), false);
        Ok(())
    }

    async fn run_now(&self, id: &str) -> Result<String, SchedulerError> {
        Ok(format!("{}_session", id))
    }

    async fn sessions(&self, sched_id: &str, _limit: usize) -> Result<Vec<(String, SessionMetadata)>, SchedulerError> {
        Ok(vec![
            (
                format!("{}_session1", sched_id),
                SessionMetadata {
                    message_count: 4,
                    working_dir: PathBuf::from("/tmp"),
                },
            ),
        ])
    }

    async fn update_schedule(&self, _sched_id: &str, _new_cron: String) -> Result<(), SchedulerError> {
        Ok(())
    }

    async fn kill_running_job(&self, _sched_id: &str) -> Result<(), SchedulerError> {
        Ok(())
    }

    async fn get_running_job_info(&self, sched_id: &str) -> Result<Option<(String, DateTime<Utc>)>, SchedulerError> {
        if sched_id == "running_job" {
            Ok(Some(("running_session".to_string(), Utc::now())))
        } else {
            Ok(None)
        }
    }
}

#[tokio::test]
async fn test_create_job_success() {
    let agent = Agent::new();
    let scheduler = Arc::new(MockScheduler::new());
    agent.set_scheduler(scheduler); // clone inside

    let recipe_path = create_temp_recipe();

    let args = json!({
        "action": "create",
        "recipe_path": recipe_path.to_string_lossy(),
        "cron_expression": "0 5 * * * *"
    });

    let res = agent.handle_schedule_management(args, "req".to_string()).await;
    assert!(res.is_ok(), "unexpected err: {res:?}");
    let text = match &res.unwrap()[0] { Content::Text(t) => &t.text, _ => panic!() };
    assert!(text.contains("Successfully created scheduled job"));
}

#[tokio::test]
async fn test_create_job_invalid_recipe_path() {
    let agent = Agent::new();
    let scheduler = Arc::new(MockScheduler::new());
    agent.set_scheduler(scheduler);

    let args = json!({
        "action": "create",
        "recipe_path": "/does/not/exist.yaml",
        "cron_expression": "0 5 * * * *"
    });

    let res = agent.handle_schedule_management(args, "req".to_string()).await;
    assert!(matches!(res, Err(ToolError::ExecutionError(_))));
}

#[tokio::test]
async fn test_pause_unpause_delete_cycle() {
    let agent = Agent::new();
    let scheduler = Arc::new(MockScheduler::new());
    agent.set_scheduler(scheduler.clone());
    // create
    let recipe_path = create_temp_recipe();
    let create_args = json!({
        "action": "create",
        "recipe_path": recipe_path.to_string_lossy(),
        "cron_expression": "0 5 * * * *"
    });
    let create_res = agent.handle_schedule_management(create_args, "req".to_string()).await.unwrap();
    let id_text = if let Content::Text(t) = &create_res[0] { t.text.clone() } else { panic!() };
    // extract id substring starting at 'agent_created'
    let id_start = id_text.find("agent_created").unwrap();
    let job_id = &id_text[id_start..].split_whitespace().next().unwrap();

    // pause
    let pause_res = agent.handle_schedule_management(json!({"action": "pause", "job_id": job_id}), "req".to_string()).await;
    assert!(pause_res.is_ok());

    // unpause
    let unpause_res = agent.handle_schedule_management(json!({"action": "unpause", "job_id": job_id}), "req".to_string()).await;
    assert!(unpause_res.is_ok());

    // delete
    let delete_res = agent.handle_schedule_management(json!({"action": "delete", "job_id": job_id}), "req".to_string()).await;
    assert!(delete_res.is_ok());
}

#[tokio::test]
async fn test_kill_inspect_sessions_flow() {
    let agent = Agent::new();
    let scheduler = Arc::new(MockScheduler::new());
    agent.set_scheduler(scheduler.clone());

    // kill action
    let kill_res = agent.handle_schedule_management(json!({"action": "kill", "job_id": "any"}), "req".to_string()).await;
    assert!(kill_res.is_ok());

    // inspect non-running
    let insp_res = agent.handle_schedule_management(json!({"action": "inspect", "job_id": "none"}), "req".to_string()).await.unwrap();
    let insp_text = if let Content::Text(t) = &insp_res[0] { &t.text } else { panic!() };
    assert!(insp_text.contains("not currently running"));

    // inspect running
    let insp_run_res = agent.handle_schedule_management(json!({"action": "inspect", "job_id": "running_job"}), "req".to_string()).await.unwrap();
    let i_text = if let Content::Text(t) = &insp_run_res[0] { &t.text } else { panic!() };
    assert!(i_text.contains("is currently running"));

    // sessions
    let sess_res = agent.handle_schedule_management(json!({"action": "sessions", "job_id": "job1", "limit": 5}), "req".to_string()).await.unwrap();
    let s_text = if let Content::Text(t) = &sess_res[0] { &t.text } else { panic!() };
    assert!(s_text.contains("Sessions for job 'job1'"));
}
