# Goose Simple Web UI

This directory contains a **Simple Goose Web UI**, a basic demonstration project showcasing how to interact with a remote `goosed` (Goose daemon) instance from any standard web browser using vanilla JavaScript.

It is intended as a minimal example of building a client application for Goose.

## Application Summary

The `web-simple` app provides a chat interface allowing users to:

*   Connect to a specified `goosed` backend URL using a secret key.
*   Select LLM providers (OpenAI, Ollama, etc.) and models.
*   Configure provider settings (like API keys) via the UI, which are saved by the backend.
*   Send messages and receive streamed responses from the LLM via `goosed`.
*   Handle tool calls requiring user confirmation (Allow/Deny).
*   Manage chat sessions (auto-save, manual save/load/delete) using browser Local Storage.

## Architecture

The web application uses vanilla JavaScript (ES Modules), HTML, and CSS. It features a modular structure:

*   **`index.html`**: Defines the basic HTML layout and includes the main script.
*   **`style.css`**: Provides basic styling (not detailed in this summary).
*   **`main.js`**: Entry point, initializes the application.
*   **`app.js`**: Core application logic, state management (conversation history, session ID, etc.), event handling orchestration.
*   **`ui.js`**: Handles all direct DOM manipulation, rendering messages, tool calls, provider configuration forms, and status updates.
*   **`api.js`**: Manages all HTTP/SSE communication with the `goosed` backend API endpoints (`/reply`, `/config`, `/confirm`, etc.).
*   **`provider_registry.js`**: Contains a *static, client-side* registry defining known LLM providers, their parameters (for UI rendering), known models, and default models. This dictates the structure of the settings UI.

## Testing with Docker

Testing for the JavaScript code is facilitated using Docker:

*   **`Dockerfile.ci`**: Defines a dedicated container environment based on Node.js. It installs dependencies using `npm ci` and copies source and test files (`*.test.mjs`, `jest.config.mjs`).
*   **Execution**: The CI Dockerfile is configured to run `npm test` as its default command, which executes the test suite (likely Jest). This ensures tests run in a consistent, isolated environment.

## Quickstart (Docker Compose)

This provides the simplest way to run the UI alongside the `goosed` backend.

**Prerequisites:**

*   Docker & Docker Compose v2 installed.
*   An Ollama instance running directly on your **host machine** and accessible at `http://localhost:11434` (required by the default `goosed` configuration in `docker-compose.yml`).

**Steps:**

1.  Ensure you are in the `ui/web-simple` directory.
2.  Run:
    ```bash
    docker-compose up --build -d
    ```
3.  Access the UI in your browser at: <http://localhost:8080>
4.  The UI should automatically connect to the `goosed` service using the default URL (`http://localhost:7878`, mapped by Compose) and the default secret key (`goose-web-simple`), which are pre-configured in the `docker-compose.yml` for the `goosed` service. The backend service itself is configured to use your host's Ollama instance by default.

