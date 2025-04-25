// --- Core Application Logic ---
import * as UI from './ui.js';
import * as API from './api.js';
import { getProviderById } from './provider_registry.js'; // Import from registry

// --- State ---
let conversationHistory = [];
let currentAssistantMessageElement = null;
let assistantMessageBuffer = { role: 'assistant', content: [], created: Math.floor(Date.now() / 1000) };
let sessionId = `web-simple-${Date.now()}`;
let pendingToolCalls = {};
let backendProvidersData = {}; // Renamed: Store RAW data from backend /config/providers
let currentConfig = {}; // Store current values for config keys

// --- Constants ---
const LOCAL_STORAGE_PROVIDER_KEY = 'gooseSimpleWebProvider';
const LOCAL_STORAGE_MODEL_KEY = 'gooseSimpleWebModel';
const LOCAL_STORAGE_GOOSED_URL_KEY = 'gooseSimpleWebUrl';
const LOCAL_STORAGE_SECRET_KEY = 'gooseSimpleWebSecretKey';
const LOCAL_STORAGE_SESSIONS_KEY = 'gooseSimpleWebSessions';
const DEFAULT_PROVIDER_CONFIG_KEY = 'default_provider';
const DEFAULT_MODEL_CONFIG_KEY = 'default_model';
const DEFAULT_GOOSED_URL = 'http://localhost:7878';

// --- Helper Functions ---
function getCurrentGoosedUrl() {
    const urlInput = document.getElementById('goosed-url-input');
    return urlInput?.value?.trim() || DEFAULT_GOOSED_URL;
}

// Refreshes provider and config data from the backend
async function refreshBackendData(goosedUrlToUse, secretKeyToUse) {
    UI.updateStatus('Refreshing backend data...');
    console.log(`Refreshing backend data from: ${goosedUrlToUse}`);
    let success = false;
    try {
        const [providersDataFromBackend, configData] = await Promise.all([
            API.fetchProviders(secretKeyToUse, goosedUrlToUse).catch(err => { console.warn("Could not fetch providers:", err); return null; }),
            API.fetchConfig(secretKeyToUse, goosedUrlToUse).catch(err => { console.warn("Could not fetch config:", err); return null; })
        ]);

        // Process providers data from backend
        backendProvidersData = {}; // Clear old backend data
        if (providersDataFromBackend && Array.isArray(providersDataFromBackend)) {
            providersDataFromBackend.forEach(p => { backendProvidersData[p.name] = p; });
            success = true; // At least providers loaded
        } else {
            console.warn("No provider data found or fetch failed during refresh.");
            UI.displayMessage('system', `Could not load providers from ${goosedUrlToUse}. Check URL/Key.`, true);
        }

        // Process config data
        currentConfig = configData?.config || {};

        // Update UI lists based on potentially new data
        // Pass the backend data to populateProviderSelect so it knows which ones are configured
        const previouslySelectedProviderId = UI.getSelectedProvider(); // Try to preserve selection
        UI.populateProviderSelect(backendProvidersData);

        // Try to re-select the previous provider if it exists, otherwise select the first configured or just the first in the list
        const providerToSelect = previouslySelectedProviderId || currentConfig[DEFAULT_PROVIDER_CONFIG_KEY] || Object.keys(backendProvidersData).find(p => backendProvidersData[p].is_configured) || null;

        if (providerToSelect) {
            UI.setSelectedProvider(providerToSelect);
            handleProviderChange(providerToSelect); // Update models and config fields
        } else {
             // If nothing to select (e.g., first load, no configured providers), handle gracefully
             const firstProviderInRegistry = UI.getSelectedProvider(); // Gets the first one from the populated list
             handleProviderChange(firstProviderInRegistry);
        }


        // Update status message based on success
        if (success) {
             UI.updateStatus('Backend data refreshed.');
             setTimeout(() => UI.updateStatus('Idle'), 1500);
        } else {
            UI.updateStatus('Failed to refresh backend data.', true);
        }
        return success;

    } catch (error) {
        console.error('Error during refreshBackendData:', error);
        UI.updateStatus(`Error refreshing data: ${error.message}`, true);
        UI.displayMessage('system', `Error refreshing data: ${error.message}`, true);
        return false;
    }
}

// Helper for selecting provider/model based on state
// This should be called AFTER refreshBackendData has updated state and UI lists
function updateProviderModelSelectionFromState() {
    const savedProviderId = localStorage.getItem(LOCAL_STORAGE_PROVIDER_KEY);
    const savedModel = localStorage.getItem(LOCAL_STORAGE_MODEL_KEY);
    const backendDefaultProviderId = currentConfig[DEFAULT_PROVIDER_CONFIG_KEY];
    const backendDefaultModel = currentConfig[DEFAULT_MODEL_CONFIG_KEY];

    let targetProviderId = savedProviderId || backendDefaultProviderId;
    let targetModel = savedModel || backendDefaultModel;

    let finalProviderId = null;

    // Determine the final provider: Check if the target is known and configured
    if (targetProviderId && backendProvidersData[targetProviderId]?.is_configured) {
        finalProviderId = targetProviderId;
    } else {
        // Fallback: Find the first configured provider from the backend data
        finalProviderId = Object.keys(backendProvidersData).find(p => backendProvidersData[p].is_configured) || null;
        // If no provider is configured, maybe default to the first in the registry? Let's stick with null for now.
        if (!finalProviderId) {
            // If we STILL don't have a provider, maybe just pick the first one from the registry
             finalProviderId = UI.getSelectedProvider(); // Will get the first from the dropdown
             if (!finalProviderId) { // Check if the dropdown is empty
                 handleProviderChange(null); // Clear everything
                 return;
             }
        }
    }

     // At this point, finalProviderId should be set if possible
     if (finalProviderId) {
         UI.setSelectedProvider(finalProviderId); // Ensure provider selection is correct
         handleProviderChange(finalProviderId); // Populate models & config based on registry

         // Now, determine the model based on the provider
         const providerInfo = getProviderById(finalProviderId);
         const providerKnownModels = providerInfo?.knownModels || [];

         // Check if the target model is in the registry's known models for this provider
         const isModelInKnownList = targetModel && providerKnownModels.includes(targetModel);

         if (isModelInKnownList) {
             // If model is in dropdown, select it there and clear custom input
             UI.setSelectedModel(targetModel);
             UI.clearCustomModelInput();
         } else if (targetModel) {
             // If model is not in dropdown but we have a target model, use it as custom input
             UI.setSelectedModel(''); // Clear dropdown selection
             UI.setCustomModelInput(targetModel); // Set custom input
         } else {
             // No target model, use provider registry default
             const defaultModel = providerInfo?.defaultModel || null;
             if (defaultModel) {
                 UI.setSelectedModel(defaultModel);
                 UI.clearCustomModelInput();
             } else {
                 UI.setSelectedModel(''); // Clear model selection if none found
                 UI.clearCustomModelInput();
             }
         }
     } else {
          // No provider could be determined (neither saved, nor default, nor configured)
          handleProviderChange(null); // Clear provider/model UI
     }
}


// --- Connect Button Handler ---
async function connectToBackend() {
    const currentUrl = getCurrentGoosedUrl();
    const currentKey = UI.getSecretKey();
    if (!currentKey) {
        alert("Secret Key is required to connect.");
        return;
    }
    UI.updateStatus('Connecting...');
    const refreshed = await refreshBackendData(currentUrl, currentKey);
    if (refreshed) {
        localStorage.setItem(LOCAL_STORAGE_SECRET_KEY, currentKey); // Save key on successful refresh
        updateProviderModelSelectionFromState(); // Update selection based on refreshed data & registry
        await ensureBackendReady(currentUrl); // Initialize agent if possible
    } else {
        // Keep error status from refreshBackendData
    }
}

// --- Backend Initialization ---
async function ensureBackendReady(goosedUrlToUse) {
    UI.updateStatus('Initializing backend...');
    const secretKey = UI.getSecretKey();
    const selectedProviderId = UI.getSelectedProvider();
    const selectedModel = UI.getSelectedModel(); // Gets dropdown or custom value

    // Check if the selected provider is configured according to the backend
    if (!selectedProviderId || !backendProvidersData[selectedProviderId]?.is_configured) {
        UI.updateStatus('Initialization skipped: Selected provider not configured', true);
        UI.displayMessage('system', 'Selected provider is not fully configured. Please save its settings.', true);
        setTimeout(() => UI.updateStatus('Idle'), 3000);
        return true; // Return true because it's not a fatal error, just can't init yet
    }

    if (!selectedModel) {
        UI.updateStatus('Initialization skipped: No model selected or entered', true);
        UI.displayMessage('system', 'Please select or enter a model name.', true);
        setTimeout(() => UI.updateStatus('Idle'), 3000);
        return true;
    }

    try {
        console.log(`Initializing agent with Provider: ${selectedProviderId}, Model: ${selectedModel} at ${goosedUrlToUse}`);
        await API.initializeAgent(selectedProviderId, selectedModel, secretKey, goosedUrlToUse);
        console.log('Agent initialization call completed.');

        // Developer extension setup remains the same
        console.log('Ensuring developer extension is configured...');
        try {
            await API.addExtension("builtin", "developer", secretKey, goosedUrlToUse);
            console.log('Developer extension added successfully.');
        } catch (error) {
            console.warn('Could not add developer extension using /extensions/add:', error.message);
            try {
                const devExtensionConfig = {
                    name: "developer",
                    enabled: true,
                    config: { type: "builtin", name: "developer" }
                };
                await API.configureExtension(devExtensionConfig, secretKey, goosedUrlToUse);
                console.log('Developer extension configured using fallback method.');
            } catch (configError) {
                console.error('Failed to configure developer extension:', configError);
            }
        }

        UI.updateStatus('Backend initialized. Ready.');
        setTimeout(() => UI.updateStatus('Idle'), 2000);
        return true;

    } catch (error) {
        console.error('Failed to initialize backend:', error);
        let errorMsg = `Backend initialization failed: ${error.message}`;
        if (error.message.includes("Unauthorized")) {
             errorMsg += " Please verify your Secret Key.";
        } else if (error.message.includes("Failed to fetch")) {
             errorMsg += ` Is Goosed running at ${goosedUrlToUse}?`;
        }
        UI.updateStatus(errorMsg, true);
        UI.displayMessage('system', errorMsg, true);
        return false;
    }
}

// --- Settings Management ---
async function loadInitialSettings(goosedUrlToUse) {
    UI.updateStatus('Loading settings...');
    const secretKey = UI.getSecretKey(); // Get key before refresh
    const refreshed = await refreshBackendData(goosedUrlToUse, secretKey);

    if (refreshed) {
        updateProviderModelSelectionFromState(); // Set initial selection based on state & registry
        return true;
    } else {
        // If refresh failed, still populate the provider list from the registry
        UI.populateProviderSelect({}); // Empty means none configured
        const firstProviderId = UI.getSelectedProvider(); // Get first from registry
        handleProviderChange(firstProviderId); // Show its config fields
        return false;
    }
}

// Saves the default LLM provider/model choice
async function saveLLMSettings() {
    const selectedProviderId = UI.getSelectedProvider();
    const selectedModel = UI.getSelectedModel(); // Gets custom or dropdown value
    const secretKey = UI.getSecretKey();
    const goosedUrl = getCurrentGoosedUrl();

    if (!selectedProviderId || !selectedModel) {
        alert('Please select a provider and select or enter a model name.');
        return;
    }
     if (!secretKey) {
         alert('Secret Key is required to save settings.');
         return;
     }

    UI.updateStatus('Saving LLM settings...');
    try {
        // Save default provider and model to backend config
        await API.upsertConfig(DEFAULT_PROVIDER_CONFIG_KEY, selectedProviderId, false, secretKey, goosedUrl);
        await API.upsertConfig(DEFAULT_MODEL_CONFIG_KEY, selectedModel, false, secretKey, goosedUrl);

        // Store current selection in localStorage
        localStorage.setItem(LOCAL_STORAGE_PROVIDER_KEY, selectedProviderId);
        localStorage.setItem(LOCAL_STORAGE_MODEL_KEY, selectedModel);
        localStorage.setItem(LOCAL_STORAGE_SECRET_KEY, secretKey); // Save key too

        // Refresh backend data to reflect changes (like default provider/model)
        const refreshed = await refreshBackendData(goosedUrl, secretKey);

        if (refreshed) {
            // Re-apply the selection based on what was just saved
            updateProviderModelSelectionFromState();

            // Re-initialize the agent with the potentially new settings
            if (backendProvidersData[selectedProviderId]?.is_configured) {
                await ensureBackendReady(goosedUrl);
            } else {
                 UI.updateStatus('LLM selection saved. Provider configuration needed.');
                 setTimeout(() => UI.updateStatus('Idle'), 2000);
            }
        } else {
            UI.updateStatus('LLM selection saved, but failed to refresh backend data.', true);
        }

        console.log("LLM settings saved locally and potentially on backend.");

    } catch (error) {
        console.error('Failed to save LLM settings:', error);
        UI.updateStatus(`Error saving LLM settings: ${error.message}`, true);
        UI.displayMessage('system', `Error saving LLM settings: ${error.message}`, true);
    }
}

// Saves the specific key/value settings for the currently displayed provider
async function saveProviderSettings() {
     const providerId = UI.getSelectedProvider();
     if (!providerId) {
         alert("No provider selected to save settings for.");
         return;
     }
     const secretKey = UI.getSecretKey();
     const goosedUrl = getCurrentGoosedUrl();
     if (!secretKey) {
         alert('Secret Key is required to save provider settings.');
         return;
     }

     UI.updateStatus(`Saving settings for ${providerId}...`);
     const configValuesToSave = UI.getProviderConfigValues(); // Get from UI form

     try {
         // Use Promise.all to save all keys concurrently
         const savePromises = Object.entries(configValuesToSave).map(([key, config]) => {
             console.log(`Saving config key: ${key} (secret: ${config.isSecret})`);
             // Use the API function to save each key-value pair to the backend
             return API.upsertConfig(key, config.value, config.isSecret, secretKey, goosedUrl);
         });
         await Promise.all(savePromises);

         // After saving, refresh backend data to get updated configuration status
         const refreshed = await refreshBackendData(goosedUrl, secretKey);

         if (refreshed) {
             // Re-apply selection and potentially initialize agent if now configured
             updateProviderModelSelectionFromState();
             if (backendProvidersData[providerId]?.is_configured) {
                 await ensureBackendReady(goosedUrl); // Initialize if configured
             } else {
                  UI.updateStatus(`Settings saved for ${providerId}, but may still be incomplete.`);
                  setTimeout(() => UI.updateStatus('Idle'), 2500);
             }
         } else {
              UI.updateStatus(`Settings saved for ${providerId}, but failed to refresh backend status.`, true);
         }
         console.log(`Provider settings saved for ${providerId}.`);

     } catch (error) {
         console.error(`Failed to save settings for ${providerId}:`, error);
         UI.updateStatus(`Error saving provider settings: ${error.message}`, true);
         UI.displayMessage('system', `Error saving ${providerId} settings: ${error.message}`, true);
     }
}

// Called when the provider dropdown changes (or manually)
function handleProviderChange(selectedProviderId) {
     if (!selectedProviderId) {
         // Clear model dropdown and config fields if no provider is selected
         UI.populateModelSelect(null, null); // Pass null to clear
         UI.renderProviderConfigFields(null, null, {}, saveProviderSettings); // Pass null to clear
         UI.setSelectedModel('');
         UI.clearCustomModelInput();
         return;
     }

     // Populate models based on the selected provider ID (uses registry)
     UI.populateModelSelect(selectedProviderId, backendProvidersData); // Pass backend data for context if needed

     // Render config fields based on selected provider ID (uses registry)
     // Pass current backend config values to pre-fill the form
     UI.renderProviderConfigFields(selectedProviderId, null, currentConfig, saveProviderSettings);

     // Auto-select the default model for the newly selected provider
     const providerInfo = getProviderById(selectedProviderId);
     const defaultModel = providerInfo?.defaultModel;
     if (defaultModel) {
         UI.setSelectedModel(defaultModel);
         UI.clearCustomModelInput();
     } else {
          UI.setSelectedModel(''); // Clear if no default
          UI.clearCustomModelInput();
     }
}

// --- Tool Confirmation Handling ---
// (No changes needed for tool confirmation logic)
async function handleToolConfirmation(toolCallId, action, blockElement) {
    UI.updateStatus(`Sending confirmation for ${toolCallId}...`);
    UI.updateToolCallBlockStatus(blockElement, `Sending (${action})...`);
    const secretKey = UI.getSecretKey();
    const goosedUrl = getCurrentGoosedUrl();

    try {
        await API.sendToolConfirmationRequest(toolCallId, action, secretKey, goosedUrl);
        console.log('Tool confirmation successful for:', toolCallId);
        UI.updateStatus('Tool action confirmed, waiting for response...');
        UI.updateToolCallBlockStatus(blockElement, `Confirmed (${action})`);
        if (pendingToolCalls[toolCallId]) {
             pendingToolCalls[toolCallId].confirmed = true;
        }

        // Auto-save after tool confirmation
        autoSaveSession();

    } catch (error) {
        console.error('Failed to send tool confirmation:', error);
        const errorMsg = `Error confirming tool: ${error.message}`;
        UI.updateStatus(errorMsg, true);
        UI.displayMessage('system', errorMsg, true);
        UI.updateToolCallBlockStatus(blockElement, `Failed: ${error.message}`);
        UI.updateStatus('Idle');
    }
}

// --- Sending Messages & Handling Stream ---
// (Process reply stream logic remains the same)
async function processReplyStream(reader) {
     const decoder = new TextDecoder();
     let buffer = '';
     let assistantResponseComplete = false;

     while (true) {
         const { done, value } = await reader.read();
         if (done) {
             console.log('Stream finished.');
             const waitingForConfirmation = Object.values(pendingToolCalls).some(tc => !tc.confirmed);
             if (!waitingForConfirmation) {
                 UI.updateStatus('Finished');
             } else {
                 UI.updateStatus('Waiting for tool confirmation...');
             }

             if (assistantResponseComplete && assistantMessageBuffer.content.length > 0) {
                 conversationHistory.push(JSON.parse(JSON.stringify(assistantMessageBuffer)));

                 // Auto-save after assistant response is complete
                 autoSaveSession();
             }
             break;
         }

         buffer += decoder.decode(value, { stream: true });
         let lines = buffer.split('\n\n');
         buffer = lines.pop();

         for (const line of lines) {
             if (line.startsWith('data: ')) {
                 const jsonData = line.substring(6);
                 try {
                    const data = JSON.parse(jsonData);
                    switch (data.type) {
                        case 'Message': handleStreamedMessage(data.message); break;
                        case 'Error':
                            console.error('SSE Error Event (fetch):', data.error);
                            UI.displayMessage('system', `Server Error: ${data.error}`, true);
                            UI.updateStatus(`Error: ${data.error}`, true);
                            break;
                        case 'Finish':
                            console.log('SSE Finish Event (fetch):', data.reason);
                            assistantResponseComplete = true;
                            break;
                        default: console.warn('Unknown SSE event type (fetch):', data.type);
                    }
                 } catch (e) {
                     console.error('Failed to parse SSE data (fetch):', jsonData, e);
                     UI.displayMessage('system', 'Failed to parse server response chunk.', true);
                 }
            } else if (line.trim()) {
                 console.warn("Received non-event line:", line);
            }
         }
     }
}

async function sendMessage() {
    const text = UI.getUserInput();
    if (!text) return;
    const secretKey = UI.getSecretKey();
    const goosedUrl = getCurrentGoosedUrl();

    if (!secretKey) {
         UI.displayMessage('system', 'Cannot send message: Secret Key is missing.', true);
         return;
     }
     const selectedProviderId = UI.getSelectedProvider();
     // Check backend data for configuration status
     if (!selectedProviderId || !backendProvidersData[selectedProviderId]?.is_configured) {
          UI.displayMessage('system', 'Cannot send message: The selected provider is not fully configured. Please save its settings.', true);
          return;
      }
     const selectedModel = UI.getSelectedModel();
     if (!selectedModel) {
         UI.displayMessage('system', 'Cannot send message: Please select or enter a model name.', true);
         return;
     }

    const userMessage = {
        role: 'user',
        content: [{ type: 'text', text: text }],
        created: Math.floor(Date.now() / 1000) // Add timestamp in seconds
    };

    UI.displayMessage('user', text);
    conversationHistory.push(userMessage);
    UI.clearUserInput();

    // Auto-save after user message
    autoSaveSession();

    UI.updateStatus('Waiting for response...');
    currentAssistantMessageElement = null;
    assistantMessageBuffer = { role: 'assistant', content: [], created: Math.floor(Date.now() / 1000) };
    pendingToolCalls = {};

    try {
        const payload = {
            messages: conversationHistory,
            session_id: sessionId,
            session_working_dir: '/' // Assuming root working dir for simplicity
        };
        const reader = await API.fetchReplyStream(payload, secretKey, goosedUrl);
        await processReplyStream(reader);

    } catch (error) {
        console.error('Fetch reply failed:', error);
        UI.updateStatus(`Error: ${error.message}`, true);
        UI.displayMessage('system', `Failed to send message or process response: ${error.message}`, true);
        // Don't reset status immediately if there was already an assistant message element
        if (!currentAssistantMessageElement) {
             UI.updateStatus('Idle');
         }
    }
}

// Handle streamed message parts (Text, Tool Use, Tool Result)
// (No changes needed here)
function handleStreamedMessage(message) {
    if (message.role !== 'assistant') return;

    if (!currentAssistantMessageElement) {
        currentAssistantMessageElement = UI.displayMessage('assistant', '');
    }
    if (!currentAssistantMessageElement) return; // Should not happen

    if (message.content && Array.isArray(message.content)) {
        for (const content of message.content) {
            // Add a deep copy to the buffer
             assistantMessageBuffer.content.push(JSON.parse(JSON.stringify(content)));

            switch (content.type) {
                case 'text':
                    if (content.text) {
                        UI.appendToAssistantMessage(currentAssistantMessageElement, content.text);
                    }
                    break;
                case 'tool_use':
                    pendingToolCalls[content.id] = { name: content.name, input: content.input, confirmed: false }; // Store pending tool call
                    UI.displayToolCall(currentAssistantMessageElement, content, handleToolConfirmation);
                    UI.updateStatus(`Waiting for tool confirmation: ${content.name}`);
                    break;
                case 'tool_result':
                    UI.displayToolResult(currentAssistantMessageElement, content, pendingToolCalls);
                    // Mark the corresponding tool_use as confirmed (implicitly by receiving result)
                    if (pendingToolCalls[content.tool_use_id]) {
                        pendingToolCalls[content.tool_use_id].confirmed = true;
                    }
                    // Check if any other tool calls are still pending confirmation
                    const stillWaiting = Object.values(pendingToolCalls).some(tc => !tc.confirmed);
                    if (!stillWaiting) {
                        UI.updateStatus('Received tool result, processing...');
                    }
                    break;
                default:
                    console.warn('Unhandled content type:', content.type);
            }
        }
    }
}

// --- Session Management Functions ---

// Load all saved sessions from localStorage
function loadSavedSessions() {
    try {
        const savedSessionsJson = localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY);
        return savedSessionsJson ? JSON.parse(savedSessionsJson) : {};
    } catch (error) {
        console.error('Failed to load saved sessions:', error);
        return {};
    }
}

// Auto-save the current session
function autoSaveSession() {
    if (conversationHistory.length === 0) {
        return; // Don't save empty sessions
    }

    try {
        const savedSessions = loadSavedSessions();
        const currentProviderId = UI.getSelectedProvider();
        const currentModel = UI.getSelectedModel();

        const newSession = {
            id: sessionId,
            name: null, // Auto-saved sessions have no custom name
            timestamp: Date.now(),
            conversationHistory: JSON.parse(JSON.stringify(conversationHistory)),
            provider: currentProviderId,
            model: currentModel
        };

        savedSessions[sessionId] = newSession;
        localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(savedSessions));

        // Update the sessions dropdown without changing the selection
        const currentSelectedSessionId = UI.getSelectedSessionId();
        UI.populateSessionSelect(savedSessions);
        UI.setSelectedSessionId(currentSelectedSessionId || sessionId); // Reselect current or the newly saved one

        console.log('Session auto-saved successfully.');
    } catch (error) {
        console.error('Failed to auto-save session:', error);
    }
}

// Save a session to localStorage with a custom name
async function saveCurrentSession() {
    if (conversationHistory.length === 0) {
        alert('Cannot save an empty session.');
        return;
    }

    try {
        const savedSessions = loadSavedSessions();
        const sessionName = prompt('Enter a name for this session:');

        if (sessionName === null) {
            return; // User cancelled
        }

        const currentProviderId = UI.getSelectedProvider();
        const currentModel = UI.getSelectedModel();

        const newSession = {
            id: sessionId,
            name: sessionName, // Store the name
            timestamp: Date.now(),
            conversationHistory: JSON.parse(JSON.stringify(conversationHistory)),
            provider: currentProviderId,
            model: currentModel
        };

        savedSessions[sessionId] = newSession;
        localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(savedSessions));

        UI.populateSessionSelect(savedSessions);
        UI.setSelectedSessionId(sessionId); // Select the newly saved session

        UI.updateStatus('Session saved successfully.');
        setTimeout(() => UI.updateStatus('Idle'), 1500);
    } catch (error) {
        console.error('Failed to save session:', error);
        UI.updateStatus('Failed to save session.', true);
        UI.displayMessage('system', `Failed to save session: ${error.message}`, true);
    }
}

// Delete the selected session
function deleteSelectedSession() {
    const selectedSessionIdToDelete = UI.getSelectedSessionId();
    if (!selectedSessionIdToDelete) {
        alert('No session selected to delete.');
        return;
    }

    if (selectedSessionIdToDelete === sessionId && conversationHistory.length > 0) {
        const confirmDelete = confirm('This will delete the current active session. Are you sure?');
        if (!confirmDelete) return;
    } else {
        // Optional: Confirm deletion even for non-active sessions
        // const confirmDelete = confirm(`Delete session "${selectedSessionIdToDelete}"?`);
        // if (!confirmDelete) return;
    }

    try {
        const savedSessions = loadSavedSessions();
        delete savedSessions[selectedSessionIdToDelete];
        localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(savedSessions));

        UI.populateSessionSelect(savedSessions);

        // If we deleted the current session, start a new one
        if (selectedSessionIdToDelete === sessionId) {
            startNewSession();
        } else {
             // If we deleted a different session, ensure "New Session" is selected if nothing else is
             if (!UI.getSelectedSessionId()) {
                 UI.setSelectedSessionId('');
             }
             UI.updateStatus('Session deleted.');
             setTimeout(() => UI.updateStatus('Idle'), 1500);
        }


    } catch (error) {
        console.error('Failed to delete session:', error);
        UI.updateStatus('Failed to delete session.', true);
        UI.displayMessage('system', `Failed to delete session: ${error.message}`, true);
    }
}

// Load a session from the dropdown
function loadSelectedSession() {
    const selectedSessionIdToLoad = UI.getSelectedSessionId();
    if (!selectedSessionIdToLoad) {
        startNewSession();
        return;
    }

    try {
        const savedSessions = loadSavedSessions();
        const session = savedSessions[selectedSessionIdToLoad];

        if (!session) {
            alert('Selected session not found.');
            startNewSession(); // Fallback to new session
            return;
        }

        // Clear current conversation UI
        UI.clearMessageList();

        // Set session data
        sessionId = session.id;
        conversationHistory = JSON.parse(JSON.stringify(session.conversationHistory)); // Deep copy

        // Set provider and model from the loaded session
        if (session.provider) {
            UI.setSelectedProvider(session.provider);
            handleProviderChange(session.provider); // Populate models/config

            if (session.model) {
                // Check against registry if it's a known model for this provider
                const providerInfo = getProviderById(session.provider);
                const knownModels = providerInfo?.knownModels || [];

                if (knownModels.includes(session.model)) {
                    UI.setSelectedModel(session.model);
                    UI.clearCustomModelInput();
                } else {
                    UI.setSelectedModel(''); // Clear dropdown
                    UI.setCustomModelInput(session.model); // Use as custom
                }
            } else {
                 // If no model saved, set default for the provider
                 handleProviderChange(session.provider); // This sets default model
            }
        } else {
             // If no provider saved, load defaults? Or clear? Let's clear.
             handleProviderChange(null);
        }

        // --- Display loaded messages ---
        // Need to re-render messages based on the loaded history
        conversationHistory.forEach(message => {
            if (message.role === 'user') {
                const textContent = message.content.find(c => c.type === 'text')?.text || '';
                UI.displayMessage('user', textContent);
            } else if (message.role === 'assistant') {
                const assistantElement = UI.displayMessage('assistant', '');
                if (assistantElement && message.content && Array.isArray(message.content)) {
                    message.content.forEach(content => {
                        if (content.type === 'text' && content.text) {
                            UI.appendToAssistantMessage(assistantElement, content.text);
                        } else if (content.type === 'tool_use') {
                            // Display tool call, but make buttons non-functional for loaded sessions?
                            // Or allow re-confirmation? For simplicity, just display read-only for now.
                             UI.displayToolCall(assistantElement, content, () => {}); // Empty confirm handler
                             UI.updateToolCallBlockStatus(assistantElement.querySelector(`[data-tool-call-id="${content.id}"]`), 'Loaded from history');
                        } else if (content.type === 'tool_result') {
                            // Display tool result read-only
                            UI.displayToolResult(assistantElement, content, {}); // Empty pending calls
                        }
                    });
                }
            }
        });
        // --- End Display loaded messages ---

        UI.updateStatus('Session loaded.');
        setTimeout(() => UI.updateStatus('Idle'), 1500);

        // Optional: Re-initialize agent after loading session if provider is configured
        const loadedProviderId = UI.getSelectedProvider();
        if (loadedProviderId && backendProvidersData[loadedProviderId]?.is_configured) {
            ensureBackendReady(getCurrentGoosedUrl());
        }


    } catch (error) {
        console.error('Failed to load session:', error);
        UI.updateStatus('Failed to load session.', true);
        UI.displayMessage('system', `Failed to load session: ${error.message}`, true);
        startNewSession(); // Fallback to new session on error
    }
}


// Start a new session
function startNewSession() {
    sessionId = `web-simple-${Date.now()}`;
    conversationHistory = [];
    pendingToolCalls = {}; // Clear pending calls for new session
    UI.clearMessageList();
    UI.setSelectedSessionId(''); // Select "New Session" option

    // Keep provider/model settings, just clear conversation
    // Optional: Reset provider/model to defaults? Let's keep them for now.
    // const defaultProviderId = currentConfig[DEFAULT_PROVIDER_CONFIG_KEY] || /* first from registry */;
    // UI.setSelectedProvider(defaultProviderId);
    // handleProviderChange(defaultProviderId); // This will set default model

    UI.updateStatus('New session started.');
    setTimeout(() => UI.updateStatus('Idle'), 1500);
}

// --- Initialization Sequence ---
export async function initializeApp() {
    UI.initUIElements();
    UI.setupSettingsToggle(); // Add this line

    const urlToUseOnInit = localStorage.getItem(LOCAL_STORAGE_GOOSED_URL_KEY) || DEFAULT_GOOSED_URL;
    UI.setGoosedUrlInputValue(urlToUseOnInit);

    const savedSecretKey = localStorage.getItem(LOCAL_STORAGE_SECRET_KEY);
    if (savedSecretKey) {
        UI.setSecretKey(savedSecretKey);
    }

    // Add Event Listeners
    document.getElementById('send-button')?.addEventListener('click', sendMessage);
    document.getElementById('message-input')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
    document.getElementById('provider-select')?.addEventListener('change', (event) => {
        handleProviderChange(event.target.value);
        // When provider changes, clear model selection until user picks one or saves
        // UI.setSelectedModel(''); - handleProviderChange now sets default model
        // UI.clearCustomModelInput(); - handleProviderChange now sets default model
    });
     document.getElementById('model-select')?.addEventListener('change', () => {
        UI.clearCustomModelInput(); // Clear custom input when dropdown is used
    });
    document.getElementById('goosed-url-input')?.addEventListener('change', (event) => {
         const newUrl = event.target.value.trim();
         if (newUrl) {
             localStorage.setItem(LOCAL_STORAGE_GOOSED_URL_KEY, newUrl);
             console.log(`Goosed URL saved: ${newUrl}`);
             alert("Goosed URL saved. Press 'Connect' or re-save settings to apply.");
         } else {
             localStorage.removeItem(LOCAL_STORAGE_GOOSED_URL_KEY);
             console.log("Goosed URL cleared, using default.");
         }
     });
    document.getElementById('save-settings-button')?.addEventListener('click', saveLLMSettings);
    document.getElementById('connect-button')?.addEventListener('click', connectToBackend);
    // Provider save button listener attached dynamically in UI.renderProviderConfigFields

    // Session management event listeners
    document.getElementById('save-session-button')?.addEventListener('click', saveCurrentSession);
    document.getElementById('delete-session-button')?.addEventListener('click', deleteSelectedSession);
    document.getElementById('session-select')?.addEventListener('change', loadSelectedSession);

    UI.updateStatus('Initializing...');

    // Load initial settings (fetches backend data, populates UI)
    const settingsOK = await loadInitialSettings(urlToUseOnInit);

    // Initialize agent if possible based on loaded settings
    if (settingsOK) {
        await ensureBackendReady(urlToUseOnInit);
    } else {
        // If settings load failed, we might still want to try init if defaults seem usable
        const provider = UI.getSelectedProvider();
        const model = UI.getSelectedModel();
        const key = UI.getSecretKey();
        if (provider && model && key && backendProvidersData[provider]?.is_configured) {
             console.log("Attempting agent initialization even after failed settings load...");
             await ensureBackendReady(urlToUseOnInit);
        }
    }

    // Set final status
    const currentStatus = document.getElementById('status')?.textContent || '';
    if (!currentStatus.startsWith('Error') && !currentStatus.startsWith('Initialization skipped')) {
         UI.updateStatus('Ready.');
         setTimeout(() => UI.updateStatus('Idle'), 1500);
     }

    console.log('Simple Goose UI Initialized. Session ID:', sessionId);
    console.log(`Using Goosed URL: ${getCurrentGoosedUrl()}`);

    // Load and populate saved sessions dropdown
    const savedSessions = loadSavedSessions();
    UI.populateSessionSelect(savedSessions);

    // Auto-initialization attempt (removed, now handled by loadInitialSettings/ensureBackendReady flow)
    // ...
}

// Export for testing (if needed)
export const __test_only__ = {
     loadInitialSettings,
     ensureBackendReady,
     saveLLMSettings,
     saveProviderSettings,
     sendMessage,
     handleToolConfirmation,
     processReplyStream,
     handleStreamedMessage,
     handleProviderChange,
     connectToBackend,
     refreshBackendData,
     updateProviderModelSelectionFromState,
     loadSavedSessions,
     saveCurrentSession,
     autoSaveSession,
     deleteSelectedSession,
     loadSelectedSession,
     startNewSession,
     getState: () => ({ conversationHistory, currentAssistantMessageElement, assistantMessageBuffer, sessionId, pendingToolCalls, backendProvidersData, currentConfig }),
     setState: (newState) => {
         if (newState.conversationHistory !== undefined) conversationHistory = newState.conversationHistory;
         if (newState.currentAssistantMessageElement !== undefined) currentAssistantMessageElement = newState.currentAssistantMessageElement;
         if (newState.assistantMessageBuffer !== undefined) assistantMessageBuffer = newState.assistantMessageBuffer;
         if (newState.sessionId !== undefined) sessionId = newState.sessionId;
         if (newState.pendingToolCalls !== undefined) pendingToolCalls = newState.pendingToolCalls;
         if (newState.backendProvidersData !== undefined) backendProvidersData = newState.backendProvidersData;
         if (newState.currentConfig !== undefined) currentConfig = newState.currentConfig;
     }
 };
