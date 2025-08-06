use goose::agents::todo_tools::{TODO_READ_TOOL_NAME, TODO_WRITE_TOOL_NAME};
use goose::agents::Agent;
use mcp_core::tool::ToolCall;
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn test_todo_tools_in_agent_list() {
    let agent = Agent::new();
    let tools = agent.list_tools(None).await;

    // Check that todo tools are present
    let todo_read = tools.iter().find(|t| t.name == TODO_READ_TOOL_NAME);
    let todo_write = tools.iter().find(|t| t.name == TODO_WRITE_TOOL_NAME);

    assert!(
        todo_read.is_some(),
        "Todo read tool should be in agent's tool list"
    );
    assert!(
        todo_write.is_some(),
        "Todo write tool should be in agent's tool list"
    );
}

#[tokio::test]
async fn test_todo_write_and_read() {
    let agent = Agent::new();

    // Write to the todo list
    let write_call = ToolCall {
        name: TODO_WRITE_TOOL_NAME.to_string(),
        arguments: json!({
            "content": "1. Buy milk\n2. Walk the dog\n3. Review code"
        }),
    };

    let (_, write_result) = agent
        .dispatch_tool_call(write_call, "test-write-1".to_string(), None)
        .await;
    assert!(write_result.is_ok(), "Write should succeed");

    // Read from the todo list
    let read_call = ToolCall {
        name: TODO_READ_TOOL_NAME.to_string(),
        arguments: json!({}),
    };

    let (_, read_result) = agent
        .dispatch_tool_call(read_call, "test-read-1".to_string(), None)
        .await;
    assert!(read_result.is_ok(), "Read should succeed");

    // Verify the content matches what we wrote
    if let Ok(result) = read_result {
        let content_future = result.result;
        let content_result = content_future.await;

        if let Ok(contents) = content_result {
            assert!(!contents.is_empty(), "Should have content");
            let text = contents[0].as_text().map(|t| t.text.as_str()).unwrap_or("");
            assert_eq!(text, "1. Buy milk\n2. Walk the dog\n3. Review code");
        } else {
            panic!("Failed to get content from read result");
        }
    }
}

#[tokio::test]
async fn test_todo_empty_initially() {
    let agent = Agent::new();

    // Read from empty todo list
    let read_call = ToolCall {
        name: TODO_READ_TOOL_NAME.to_string(),
        arguments: json!({}),
    };

    let (_, read_result) = agent
        .dispatch_tool_call(read_call, "test-read-empty".to_string(), None)
        .await;
    assert!(read_result.is_ok(), "Read should succeed even when empty");

    if let Ok(result) = read_result {
        let content_future = result.result;
        let content_result = content_future.await;

        if let Ok(contents) = content_result {
            assert!(!contents.is_empty(), "Should have content");
            let text = contents[0].as_text().map(|t| t.text.as_str()).unwrap_or("");
            assert_eq!(text, "", "Empty todo list should return empty string");
        }
    }
}

#[tokio::test]
async fn test_todo_overwrite() {
    let agent = Agent::new();

    // Write initial content
    let write_call1 = ToolCall {
        name: TODO_WRITE_TOOL_NAME.to_string(),
        arguments: json!({
            "content": "Initial todo list"
        }),
    };
    agent
        .dispatch_tool_call(write_call1, "test-write-1".to_string(), None)
        .await;

    // Overwrite with new content
    let write_call2 = ToolCall {
        name: TODO_WRITE_TOOL_NAME.to_string(),
        arguments: json!({
            "content": "Completely new todo list"
        }),
    };
    agent
        .dispatch_tool_call(write_call2, "test-write-2".to_string(), None)
        .await;

    // Read and verify it was overwritten
    let read_call = ToolCall {
        name: TODO_READ_TOOL_NAME.to_string(),
        arguments: json!({}),
    };

    let (_, read_result) = agent
        .dispatch_tool_call(read_call, "test-read-2".to_string(), None)
        .await;

    if let Ok(result) = read_result {
        let content_future = result.result;
        let content_result = content_future.await;

        if let Ok(contents) = content_result {
            let text = contents[0].as_text().map(|t| t.text.as_str()).unwrap_or("");
            assert_eq!(
                text, "Completely new todo list",
                "Content should be overwritten"
            );
        }
    }
}

#[tokio::test]
async fn test_todo_concurrent_access() {
    let agent = Arc::new(Agent::new());

    // Spawn multiple concurrent writes
    let mut handles = vec![];

    for i in 0..10 {
        let agent_clone = agent.clone();
        let handle = tokio::spawn(async move {
            let write_call = ToolCall {
                name: TODO_WRITE_TOOL_NAME.to_string(),
                arguments: json!({
                    "content": format!("Todo list {}", i)
                }),
            };
            agent_clone
                .dispatch_tool_call(write_call, format!("concurrent-{}", i), None)
                .await
        });
        handles.push(handle);
    }

    // Wait for all writes to complete
    for handle in handles {
        handle.await.unwrap();
    }

    // Read the final state
    let read_call = ToolCall {
        name: TODO_READ_TOOL_NAME.to_string(),
        arguments: json!({}),
    };

    let (_, read_result) = agent
        .dispatch_tool_call(read_call, "final-read".to_string(), None)
        .await;

    if let Ok(result) = read_result {
        let content_future = result.result;
        let content_result = content_future.await;

        if let Ok(contents) = content_result {
            let text = contents[0].as_text().map(|t| t.text.as_str()).unwrap_or("");
            // The last write wins - we just verify it's one of the valid values
            assert!(
                text.starts_with("Todo list "),
                "Should have valid todo content"
            );
        }
    }
}

#[tokio::test]
async fn test_todo_large_content() {
    let agent = Agent::new();

    // Create a large todo list (100KB)
    let large_content = "X".repeat(100_000);

    let write_call = ToolCall {
        name: TODO_WRITE_TOOL_NAME.to_string(),
        arguments: json!({
            "content": large_content.clone()
        }),
    };

    let (_, write_result) = agent
        .dispatch_tool_call(write_call, "large-write".to_string(), None)
        .await;
    assert!(write_result.is_ok(), "Should handle large content");

    // Read it back
    let read_call = ToolCall {
        name: TODO_READ_TOOL_NAME.to_string(),
        arguments: json!({}),
    };

    let (_, read_result) = agent
        .dispatch_tool_call(read_call, "large-read".to_string(), None)
        .await;

    if let Ok(result) = read_result {
        let content_future = result.result;
        let content_result = content_future.await;

        if let Ok(contents) = content_result {
            let text = contents[0].as_text().map(|t| t.text.as_str()).unwrap_or("");
            assert_eq!(
                text.len(),
                large_content.len(),
                "Large content should be preserved"
            );
        }
    }
}

#[tokio::test]
async fn test_todo_unicode_content() {
    let agent = Agent::new();

    let unicode_content = "📝 Todo List:\n✅ Task 1\n⭐ Task 2\n🔥 Urgent: Task 3\n日本語のタスク";

    let write_call = ToolCall {
        name: TODO_WRITE_TOOL_NAME.to_string(),
        arguments: json!({
            "content": unicode_content
        }),
    };

    agent
        .dispatch_tool_call(write_call, "unicode-write".to_string(), None)
        .await;

    let read_call = ToolCall {
        name: TODO_READ_TOOL_NAME.to_string(),
        arguments: json!({}),
    };

    let (_, read_result) = agent
        .dispatch_tool_call(read_call, "unicode-read".to_string(), None)
        .await;

    if let Ok(result) = read_result {
        let content_future = result.result;
        let content_result = content_future.await;

        if let Ok(contents) = content_result {
            let text = contents[0].as_text().map(|t| t.text.as_str()).unwrap_or("");
            assert_eq!(text, unicode_content, "Unicode content should be preserved");
        }
    }
}
