// --- DOM Manipulation Functions ---
import { PROVIDER_REGISTRY, getProviderById } from './provider_registry.js';

let messageList, statusElement, providerSelect, modelSelect, customModelInput, sendButton, messageInput, saveSettingsButton, secretKeyInput, goosedUrlInput, connectButton, currentProviderNameSpan, providerFieldsContainer, saveProviderButton;
let sessionSelect, saveSessionButton, deleteSessionButton;
let settingsToggleButton; // Added for settings toggle

// Function to initialize element references (call once DOM is loaded)
export function initUIElements() {
    messageList = document.getElementById('message-list');
    statusElement = document.getElementById('status');
    providerSelect = document.getElementById('provider-select');
    modelSelect = document.getElementById('model-select');
    customModelInput = document.getElementById('custom-model-input'); // Added custom model input
    sendButton = document.getElementById('send-button');
    messageInput = document.getElementById('message-input');
    saveSettingsButton = document.getElementById('save-settings-button'); // Save LLM button
    secretKeyInput = document.getElementById('secret-key-input');
    goosedUrlInput = document.getElementById('goosed-url-input');
    connectButton = document.getElementById('connect-button');
    currentProviderNameSpan = document.getElementById('current-provider-name');
    providerFieldsContainer = document.getElementById('provider-fields');
    saveProviderButton = document.getElementById('save-provider-button');
    
    // Session management elements
    sessionSelect = document.getElementById('session-select');
    saveSessionButton = document.getElementById('save-session-button');
    deleteSessionButton = document.getElementById('delete-session-button');

    // Settings toggle button
    settingsToggleButton = document.getElementById('settings-toggle-button');
    
    // Set default secret key if empty
    if (secretKeyInput && !secretKeyInput.value) {
        secretKeyInput.value = 'goose-web-simple';
        // Add a placeholder to show this is the default
        secretKeyInput.placeholder = 'Default: goose-web-simple';
    }
    
    // Set default URL if empty
    if (goosedUrlInput && !goosedUrlInput.value) {
        goosedUrlInput.value = 'http://localhost:7878';
    }
    
    // Set default model if empty
    if (customModelInput && !customModelInput.value) {
        customModelInput.value = '';
        customModelInput.placeholder = 'Enter custom model name';
    }
}

// --- NEW: Setup Settings Toggle ---
export function setupSettingsToggle() {
    if (!settingsToggleButton) return;

    const statusArea = document.getElementById('status-area');
    if (!statusArea) return;

    settingsToggleButton.addEventListener('click', () => {
        statusArea.classList.toggle('collapsed');
        const isCollapsed = statusArea.classList.contains('collapsed');
        settingsToggleButton.textContent = isCollapsed ? 'Show Settings' : 'Hide Settings';
    });
}

function scrollToBottom() {
    if (!messageList) return;
    messageList.scrollTop = messageList.scrollHeight;
}

export function displayMessage(role, text, isError = false) {
    if (!messageList) return null;
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (isError) {
        messageElement.classList.add('error-message');
        messageElement.textContent = `Error: ${text}`;
    } else {
        messageElement.classList.add(role === 'user' ? 'user-message' : 'assistant-message');
        const textNode = document.createTextNode(text);
        messageElement.appendChild(textNode);
    }
    messageList.appendChild(messageElement);
    scrollToBottom();
    return messageElement;
}

export function appendToAssistantMessage(element, newTextChunk) {
    if (!element) return;
    element.appendChild(document.createTextNode(newTextChunk));
    scrollToBottom();
}

export function displayToolCall(parentElement, toolCallContent, onConfirm) {
    if (!parentElement) return;
    const toolCallId = toolCallContent.id;
    const toolName = toolCallContent.name;
    const toolArgs = toolCallContent.input;

    const block = document.createElement('div');
    block.classList.add('tool-call-block');
    block.dataset.toolCallId = toolCallId;

    const nameEl = document.createElement('strong');
    nameEl.textContent = `Tool Call: ${toolName}`;
    block.appendChild(nameEl);

    const argsEl = document.createElement('pre');
    argsEl.textContent = JSON.stringify(toolArgs, null, 2);
    block.appendChild(argsEl);

    const buttonsEl = document.createElement('div');
    buttonsEl.classList.add('tool-confirmation-buttons');

    const allowButton = document.createElement('button');
    allowButton.textContent = 'Allow Once';
    allowButton.classList.add('allow-button');
    allowButton.onclick = () => onConfirm(toolCallId, 'allow_once', block);

    const denyButton = document.createElement('button');
    denyButton.textContent = 'Deny';
    denyButton.classList.add('deny-button');
    denyButton.onclick = () => onConfirm(toolCallId, 'deny', block);

    buttonsEl.appendChild(allowButton);
    buttonsEl.appendChild(denyButton);
    block.appendChild(buttonsEl);

    parentElement.appendChild(block);
    scrollToBottom();
}

export function displayToolResult(parentElement, toolResultContent, pendingToolCalls) {
     if (!parentElement) return;
    const toolCallId = toolResultContent.tool_use_id;
    const output = toolResultContent.content;

    const block = document.createElement('div');
    block.classList.add('tool-result-block');

    const nameEl = document.createElement('strong');
    const originalCall = pendingToolCalls ? pendingToolCalls[toolCallId] : null;
    nameEl.textContent = `Result for: ${originalCall ? originalCall.name : 'Tool Call ' + toolCallId}`;
    block.appendChild(nameEl);

    const outputEl = document.createElement('pre');
    outputEl.textContent = JSON.stringify(output, null, 2);
    block.appendChild(outputEl);

    parentElement.appendChild(block);
    scrollToBottom();
}

export function updateToolCallBlockStatus(block, statusText) {
    if (!block) return;
    const buttons = block.querySelector('.tool-confirmation-buttons');
    if (buttons) {
        buttons.remove();
    }
    let statusEl = block.querySelector('p.confirmation-status');
    if (!statusEl) {
         statusEl = document.createElement('p');
         statusEl.className = 'confirmation-status';
         statusEl.style.fontSize = '0.9em';
         statusEl.style.marginTop = '5px';
         block.appendChild(statusEl);
    }
    statusEl.textContent = `Status: ${statusText}`;
}

export function updateStatus(text, isError = false) {
    if (!statusElement) return;
    statusElement.textContent = text;
    statusElement.style.color = isError ? 'red' : '#666';

    // Determine if a general waiting state is active (disables most controls)
    const isGenerallyWaiting = text === 'Waiting for response...'
                  || text.startsWith('Waiting for tool confirmation...')
                  || text === 'Loading settings...'
                  || text === 'Saving settings...'
                  || text === 'Saving LLM settings...'
                  || text.startsWith('Saving settings for')
                  || text === 'Refreshing backend data...'; // Added refresh state

    // Determine if a backend connection attempt is specifically active
    const isConnecting = text === 'Initializing backend...' || text === 'Connecting...';

    if(sendButton) sendButton.disabled = isGenerallyWaiting || isConnecting;
    if(messageInput) messageInput.disabled = isGenerallyWaiting || isConnecting;
    if(providerSelect) providerSelect.disabled = isGenerallyWaiting || isConnecting;
    if(modelSelect) modelSelect.disabled = isGenerallyWaiting || isConnecting || !providerSelect?.value;
    if(customModelInput) customModelInput.disabled = isGenerallyWaiting || isConnecting || !providerSelect?.value; // Disable custom input too
    if(saveSettingsButton) saveSettingsButton.disabled = isGenerallyWaiting || isConnecting;
    if(saveProviderButton) saveProviderButton.disabled = isGenerallyWaiting || isConnecting;

    // Connect button is only disabled during an active connection attempt
    if(connectButton) connectButton.disabled = isConnecting;
}

export function populateProviderSelect(availableProviders) {
    if (!providerSelect) return;
    providerSelect.innerHTML = '';
    
    // Use our provider registry instead of the dynamic backend data
    PROVIDER_REGISTRY.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        
        // Check if this provider is configured in the backend
        const isConfigured = availableProviders && availableProviders[provider.id]?.is_configured;
        
        // Add visual indicator for configured providers
        if (isConfigured) {
            option.textContent += ' ✓';
            option.classList.add('configured-provider');
        }
        
        providerSelect.appendChild(option);
    });
    
    if (providerSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No Providers Available';
        providerSelect.appendChild(option);
    }
}

export function populateModelSelect(providerId, allProvidersData) {
    if (!modelSelect || !customModelInput) return;
    modelSelect.innerHTML = '';
    modelSelect.disabled = true;
    customModelInput.value = ''; // Clear custom input when provider changes
    customModelInput.disabled = true;

    // Get models from our registry
    const providerInfo = getProviderById(providerId);
    if (!providerInfo || !providerInfo.knownModels?.length) {
        modelSelect.innerHTML = '<option value="">No models found</option>';
        customModelInput.disabled = false; // Allow custom input if no models listed
        return;
    }

    const models = providerInfo.knownModels;
    
    // Add a blank option first
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '-- Select a model --';
    modelSelect.appendChild(blankOption);
    
    // Add the models from our registry
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        
        // Mark the default model
        if (model === providerInfo.defaultModel) {
            option.textContent += ' (default)';
            option.selected = true;
        }
        
        modelSelect.appendChild(option);
    });
    
    modelSelect.disabled = false;
    customModelInput.disabled = false; // Enable custom input
    
    // Set placeholder to show default model
    customModelInput.placeholder = `Or enter custom model (default: ${providerInfo.defaultModel})`;
}

export function getSelectedProvider() {
     return providerSelect?.value || 'ollama';
}

// --- UPDATED: Prioritize custom model input --- 
export function getSelectedModel() {
     const customModel = customModelInput?.value?.trim();
     if (customModel) {
         return customModel;
     }
     
     // If dropdown has a selection, use that
     if (modelSelect?.value) {
         return modelSelect.value;
     }
     
     // Otherwise, try to get the default model for the selected provider
     const providerId = getSelectedProvider();
     const providerInfo = getProviderById(providerId);
     return providerInfo?.defaultModel || '';
}

export function setSelectedProvider(providerId) {
     if (providerSelect) providerSelect.value = providerId;
}

export function setSelectedModel(modelName) {
     if (modelSelect) modelSelect.value = modelName;
     if (customModelInput && modelName) {
        // If setting a model via dropdown, clear the custom input
         customModelInput.value = '';
     }
}

// --- NEW: Clear custom model input --- 
export function clearCustomModelInput() {
    if (customModelInput) {
        customModelInput.value = '';
    }
}

// --- NEW: Set custom model input --- 
export function setCustomModelInput(modelName) {
    if (customModelInput) {
        customModelInput.value = modelName;
    }
}

export function getSecretKey() {
    return secretKeyInput?.value.trim() || 'goose-web-simple';
}

export function setSecretKey(key) {
    if (secretKeyInput) {
        secretKeyInput.value = key;
    }
}

export function setGoosedUrlInputValue(url) {
    if (goosedUrlInput) {
        goosedUrlInput.value = url;
    }
}

export function getUserInput() {
     return messageInput?.value.trim() || '';
}

export function clearUserInput() {
     if (messageInput) messageInput.value = '';
}

// --- Provider Config Rendering ---
export function renderProviderConfigFields(providerId, providerData, currentConfigValues, onSaveHandler) {
    if (!providerFieldsContainer || !currentProviderNameSpan || !saveProviderButton) return;

    providerFieldsContainer.innerHTML = ''; // Clear previous fields
    
    // Use our provider registry instead of the dynamic backend data
    const providerInfo = getProviderById(providerId);
    
    if (!providerInfo) {
        providerFieldsContainer.innerHTML = '<p>Provider not found in registry.</p>';
        saveProviderButton.style.display = 'none';
        return;
    }
    
    currentProviderNameSpan.textContent = providerInfo.name;
    
    // Add provider description
    const descriptionEl = document.createElement('p');
    descriptionEl.textContent = providerInfo.description;
    descriptionEl.classList.add('provider-description');
    providerFieldsContainer.appendChild(descriptionEl);

    const configKeys = providerInfo.parameters || [];

    if (configKeys.length === 0) {
        providerFieldsContainer.innerHTML += '<p>No specific configuration needed for this provider.</p>';
        saveProviderButton.style.display = 'none';
        return;
    }

    // Create a form for the provider configuration
    const form = document.createElement('form');
    form.classList.add('provider-config-form');
    form.onsubmit = (e) => e.preventDefault(); // Prevent form submission
    
    configKeys.forEach(keyInfo => {
        const keyName = keyInfo.name;
        const isSecret = keyInfo.is_secret === true;
        const isRequired = keyInfo.required === true;
        const defaultValue = keyInfo.default || '';
        const currentValue = currentConfigValues[keyName] || defaultValue;
        const label = keyInfo.label || keyName;

        const fieldDiv = document.createElement('div');
        fieldDiv.classList.add('provider-config-field');

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.htmlFor = `config-input-${keyName}`;

        const input = document.createElement('input');
        input.type = isSecret ? 'password' : 'text';
        input.id = `config-input-${keyName}`;
        input.name = keyName;
        input.value = currentValue;
        input.placeholder = defaultValue ? `Default: ${defaultValue}` : (isRequired ? 'Required' : 'Optional');
        input.dataset.isSecret = isSecret.toString(); // Store secret status
        input.dataset.keyName = keyName;
        
        // Add required attribute for HTML5 validation
        if (isRequired) {
            input.required = true;
            const requiredMark = document.createElement('span');
            requiredMark.textContent = '*';
            requiredMark.classList.add('required-mark');
            labelEl.appendChild(requiredMark);
        }

        fieldDiv.appendChild(labelEl);
        fieldDiv.appendChild(input);
        form.appendChild(fieldDiv);
    });
    
    providerFieldsContainer.appendChild(form);
    
    // Add a note about required fields
    const noteEl = document.createElement('p');
    noteEl.innerHTML = '<small>* Required fields</small>';
    noteEl.classList.add('required-fields-note');
    providerFieldsContainer.appendChild(noteEl);

    saveProviderButton.style.display = 'inline-block';
    // Remove previous listener if any, then add new one
    saveProviderButton.removeEventListener('click', saveProviderButton.handler);
    saveProviderButton.handler = onSaveHandler; // Store handler reference
    saveProviderButton.addEventListener('click', saveProviderButton.handler);
}

export function getProviderConfigValues() {
    const values = {};
    if (!providerFieldsContainer) return values;

    const inputs = providerFieldsContainer.querySelectorAll('input');
    inputs.forEach(input => {
        values[input.dataset.keyName] = {
            value: input.value,
            isSecret: input.dataset.isSecret === 'true'
        };
    });
    return values;
}

// --- Session Management Functions ---

export function populateSessionSelect(sessions) {
    if (!sessionSelect) return;
    
    // Keep the "New Session" option
    sessionSelect.innerHTML = '<option value="">New Session</option>';
    
    // Add saved sessions
    if (sessions && Object.keys(sessions).length > 0) {
        Object.keys(sessions).forEach(sessionId => {
            const session = sessions[sessionId];
            const option = document.createElement('option');
            option.value = sessionId;
            
            // Create a display name with date and message count
            const date = new Date(session.timestamp);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            const messageCount = session.conversationHistory.length;
            
            if (session.name) {
                // Custom named session
                option.textContent = `${session.name} (${dateStr}, ${messageCount} msgs)`;
            } else {
                // Auto-saved session
                option.textContent = `[Auto] ${dateStr} (${messageCount} msgs)`;
            }
            
            sessionSelect.appendChild(option);
        });
    }
}

export function getSelectedSessionId() {
    return sessionSelect?.value || null;
}

export function setSelectedSessionId(sessionId) {
    if (sessionSelect && sessionId) {
        sessionSelect.value = sessionId;
    } else if (sessionSelect) {
        sessionSelect.selectedIndex = 0; // Select "New Session"
    }
}

export function clearMessageList() {
    if (messageList) {
        messageList.innerHTML = '';
    }
}