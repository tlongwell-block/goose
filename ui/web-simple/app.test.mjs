/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { PROVIDER_REGISTRY } from './provider_registry.js'; // Import the registry

// --- Mock Setup using unstable_mockModule ---
const mockUI = {
    initUIElements: jest.fn(),
    setupSettingsToggle: jest.fn(),
    displayMessage: jest.fn(),
    appendToAssistantMessage: jest.fn(),
    displayToolCall: jest.fn(),
    displayToolResult: jest.fn(),
    updateToolCallBlockStatus: jest.fn(),
    updateStatus: jest.fn(),
    populateProviderSelect: jest.fn(),
    populateModelSelect: jest.fn(),
    getSelectedProvider: jest.fn(),
    getSelectedModel: jest.fn(), // Mocked per test
    setSelectedProvider: jest.fn(),
    setSelectedModel: jest.fn(),
    getSecretKey: jest.fn(),
    setSecretKey: jest.fn(),
    getUserInput: jest.fn(),
    clearUserInput: jest.fn(),
    renderProviderConfigFields: jest.fn(),
    getProviderConfigValues: jest.fn(),
    setGoosedUrlInputValue: jest.fn(),
    clearCustomModelInput: jest.fn(),
    setCustomModelInput: jest.fn(),
    populateSessionSelect: jest.fn(),
    getSelectedSessionId: jest.fn(),
    setSelectedSessionId: jest.fn(),
    clearMessageList: jest.fn()
};
jest.unstable_mockModule('./ui.js', () => mockUI);

const mockAPI = {
    fetchProviders: jest.fn(),
    fetchConfig: jest.fn(),
    upsertConfig: jest.fn(),
    initializeAgent: jest.fn(),
    configureExtension: jest.fn(),
    addExtension: jest.fn(),
    sendToolConfirmationRequest: jest.fn(),
    fetchReplyStream: jest.fn(),
};
jest.unstable_mockModule('./api.js', () => mockAPI);

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: jest.fn((key) => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
        removeItem: jest.fn((key) => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; }),
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// --- DOM Setup ---
// (DOM setup remains the same as before)

beforeAll(() => {
    document.body.innerHTML = `
        <div id="chat-container">
             <div id="session-controls">
                 <div class="session-dropdown-container">
                     <select id="session-select"><option value="">New Session</option></select>
                     <button id="save-session-button">💾</button>
                     <button id="delete-session-button">🗑️</button>
                 </div>
             </div>
            <div id="message-list"></div>
            <div id="input-area">
                <textarea id="message-input"></textarea>
                <button id="send-button">Send</button>
            </div>
            <div id="status-area">
                 <div class="settings-header">
                     <div>Status: <span id="status">Idle</span></div>
                     <button id="settings-toggle-button">Hide Settings</button>
                 </div>
                 <div id="settings-content">
                     <div>Secret Key: <input type="password" id="secret-key-input"></div>
                     <div>Goosed URL: <input type="text" id="goosed-url-input"><button id="connect-button">Connect</button></div>
                     <div id="llm-settings">
                         Provider: <select id="provider-select"></select>
                         Model: <select id="model-select"><option value=""></option></select>
                         <input type="text" id="custom-model-input" placeholder="Or enter custom model...">
                         <button id="save-settings-button">Save LLM</button>
                     </div>
                     <div id="provider-config-area">
                         <h4>Configure <span id="current-provider-name"></span></h4>
                         <div id="provider-fields"></div>
                         <button id="save-provider-button" style="display: none;">Save Provider Settings</button>
                     </div>
                 </div>
             </div>
         </div>
    `;
    // No need to store element refs if not used directly in tests
});


// --- Constants ---
const LOCAL_STORAGE_PROVIDER_KEY = 'gooseSimpleWebProvider';
const LOCAL_STORAGE_MODEL_KEY = 'gooseSimpleWebModel';
const LOCAL_STORAGE_GOOSED_URL_KEY = 'gooseSimpleWebUrl';
const LOCAL_STORAGE_SECRET_KEY = 'gooseSimpleWebSecretKey';
const LOCAL_STORAGE_SESSIONS_KEY = 'gooseSimpleWebSessions';
const DEFAULT_PROVIDER_CONFIG_KEY = 'default_provider';
const DEFAULT_MODEL_CONFIG_KEY = 'default_model';
const DEFAULT_GOOSED_URL = 'http://localhost:7878';


// --- Test Suite ---
describe('App Logic Tests', () => {
    let app;
    let ensureBackendReady, saveLLMSettings, saveProviderSettings, connectToBackend, refreshBackendData, handleProviderChange;
    let loadSelectedSession, autoSaveSession, saveCurrentSession;
    let setState, getState;

    beforeAll(async () => {
        app = await import('./app.js');
        if (app.__test_only__) {
            ensureBackendReady = app.__test_only__.ensureBackendReady;
            saveLLMSettings = app.__test_only__.saveLLMSettings;
            saveProviderSettings = app.__test_only__.saveProviderSettings;
            connectToBackend = app.__test_only__.connectToBackend;
            refreshBackendData = app.__test_only__.refreshBackendData;
            handleProviderChange = app.__test_only__.handleProviderChange;
            loadSelectedSession = app.__test_only__.loadSelectedSession;
            autoSaveSession = app.__test_only__.autoSaveSession;
            saveCurrentSession = app.__test_only__.saveCurrentSession;
            setState = app.__test_only__.setState;
            getState = app.__test_only__.getState;
        } else {
            throw new Error("__test_only__ export not found in app.js");
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        localStorageMock.clear();
        global.alert = jest.fn();
        global.prompt = jest.fn();
        const goosedUrlInput = document.getElementById('goosed-url-input');
        const secretKeyInput = document.getElementById('secret-key-input');
        const customModelInput = document.getElementById('custom-model-input');
        const modelSelect = document.getElementById('model-select');
        if(goosedUrlInput) goosedUrlInput.value = '';
        if(secretKeyInput) secretKeyInput.value = '';
        if(customModelInput) customModelInput.value = '';
        if(modelSelect) modelSelect.value = '';

        if (setState) {
             setState({
                 conversationHistory: [],
                 currentAssistantMessageElement: null,
                 assistantMessageBuffer: { role: 'assistant', content: [] },
                 pendingToolCalls: {},
                 backendProvidersData: {},
                 currentConfig: {}
            });
         } else {
             console.warn("Cannot reset state via __test_only__.setState in beforeEach");
         }
         mockUI.getSecretKey.mockReturnValue('default-test-key-beforeEach');
         mockUI.getSelectedProvider.mockReturnValue(null);
         mockUI.getSelectedModel.mockReturnValue(null);
    });

    // --- Initialization Tests ---
    describe('Initialization', () => {

       test('initializeApp calls initUIElements and setupSettingsToggle', async () => {
            mockAPI.fetchProviders.mockResolvedValue([]);
            mockAPI.fetchConfig.mockResolvedValue({ config: {} });
            mockUI.getSecretKey.mockReturnValue('temp-key');
            await app.initializeApp();
            expect(mockUI.initUIElements).toHaveBeenCalled();
            expect(mockUI.setupSettingsToggle).toHaveBeenCalled();
        });

       test('initializeApp sets Goosed URL, refreshes, updates UI, ensures ready', async () => {
            const savedUrl = 'http://saved-url:5678';
            const savedProviderId = 'openai';
            const savedModel = 'gpt-4';
            const savedKey = 'test-key';
            localStorageMock.getItem.mockImplementation(key => {
                if (key === LOCAL_STORAGE_GOOSED_URL_KEY) return savedUrl;
                if (key === LOCAL_STORAGE_MODEL_KEY) return savedModel;
                if (key === LOCAL_STORAGE_PROVIDER_KEY) return savedProviderId;
                if (key === LOCAL_STORAGE_SECRET_KEY) return savedKey;
                return null;
            });
            mockUI.getSecretKey.mockReturnValue(savedKey);
            mockUI.getSelectedProvider.mockReturnValue(savedProviderId);
            mockUI.getSelectedModel.mockReturnValue(savedModel);

            const backendProviders = { 'openai': { name: 'openai', is_configured: true } };
            const backendConfig = { 'OPENAI_API_KEY': '********' };
            mockAPI.fetchProviders.mockResolvedValue([{ name: 'openai', is_configured: true }]);
            mockAPI.fetchConfig.mockResolvedValue({ config: backendConfig });
            mockAPI.initializeAgent.mockResolvedValue({});
            mockAPI.addExtension.mockResolvedValue({});

            await app.initializeApp();

            expect(mockUI.initUIElements).toHaveBeenCalled();
            expect(mockUI.setupSettingsToggle).toHaveBeenCalled();
            expect(mockUI.setGoosedUrlInputValue).toHaveBeenCalledWith(savedUrl);
            expect(mockUI.setSecretKey).toHaveBeenCalledWith(savedKey);
            expect(mockAPI.fetchProviders).toHaveBeenCalledWith(savedKey, savedUrl);
            expect(mockAPI.fetchConfig).toHaveBeenCalledWith(savedKey, savedUrl);
            expect(mockUI.populateProviderSelect).toHaveBeenCalledWith(backendProviders);
            expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(savedProviderId);
            expect(mockUI.populateModelSelect).toHaveBeenCalledWith(savedProviderId, backendProviders);
            expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(savedProviderId, null, backendConfig, expect.any(Function));
            expect(mockUI.setSelectedModel).toHaveBeenCalledWith(savedModel);
            expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
            expect(mockAPI.initializeAgent).toHaveBeenCalledWith(savedProviderId, savedModel, savedKey, savedUrl);
            expect(mockAPI.addExtension).toHaveBeenCalledWith('builtin', 'developer', savedKey, savedUrl);
        });

        test('initializeApp uses default URL, selects backend default provider and model', async () => {
            localStorageMock.getItem.mockReturnValue(null);
            const defaultKey = 'default-key-init';
            mockUI.getSecretKey.mockReturnValue(defaultKey);
            const backendProviderId = 'ollama';
            const backendModel = 'qwen2.5-coder:3b'; // Updated to match docker-compose.yml and provider_registry.js
            const backendProviders = { 'ollama': { name: 'ollama', is_configured: true }, 'openai': { name: 'openai', is_configured: false } };
            // Simulate backend providing default provider AND model
            const backendConfig = {
                [DEFAULT_PROVIDER_CONFIG_KEY]: backendProviderId,
                [DEFAULT_MODEL_CONFIG_KEY]: backendModel,
                'OLLAMA_HOST': 'http://ollama-host:11434'
             };
            mockAPI.fetchProviders.mockResolvedValue(Object.values(backendProviders));
            mockAPI.fetchConfig.mockResolvedValue({ config: backendConfig });
            mockAPI.initializeAgent.mockResolvedValue({});
            mockAPI.addExtension.mockResolvedValue({});

            // Mock UI state *after* refresh and selection update
            mockUI.getSelectedProvider.mockReturnValue(backendProviderId);
            mockUI.getSelectedModel.mockReturnValue(backendModel);

            await app.initializeApp();

            expect(mockUI.initUIElements).toHaveBeenCalled();
            expect(mockUI.setupSettingsToggle).toHaveBeenCalled();
            expect(mockUI.setGoosedUrlInputValue).toHaveBeenCalledWith(DEFAULT_GOOSED_URL);
            expect(mockAPI.fetchProviders).toHaveBeenCalledWith(defaultKey, DEFAULT_GOOSED_URL);
            expect(mockAPI.fetchConfig).toHaveBeenCalledWith(defaultKey, DEFAULT_GOOSED_URL);
            expect(mockUI.populateProviderSelect).toHaveBeenCalledWith(backendProviders);
            // updateProviderModelSelectionFromState should select the backend default provider
            expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(backendProviderId);
            // It should populate models for that provider
            expect(mockUI.populateModelSelect).toHaveBeenCalledWith(backendProviderId, backendProviders);
            // It should render config fields for that provider
            expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(backendProviderId, null, backendConfig, expect.any(Function));
            // Crucially, it should select the backend default MODEL, not the registry default
            expect(mockUI.setSelectedModel).toHaveBeenCalledWith(backendModel);
            // If the backend default isn't in the registry's list, it should set custom input, otherwise clear it.
            // Assuming 'some-ollama-model' is NOT in the registry for this test.
            const providerInfo = PROVIDER_REGISTRY.find(p => p.id === backendProviderId);
            if (!providerInfo?.knownModels.includes(backendModel)) {
                 expect(mockUI.setCustomModelInput).toHaveBeenCalledWith(backendModel);
            } else {
                 expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
            }
            // Agent should initialize with the backend default model
            expect(mockAPI.initializeAgent).toHaveBeenCalledWith(backendProviderId, backendModel, defaultKey, DEFAULT_GOOSED_URL);
            expect(mockAPI.addExtension).toHaveBeenCalledWith('builtin', 'developer', defaultKey, DEFAULT_GOOSED_URL);
        });
    });

    // --- Settings Saving Tests ---
     describe('Settings Saving', () => {
         test('saveLLMSettings saves provider/model, refreshes, ensures ready', async () => {
             const currentTestUrl = 'http://current-test.com:8888';
             const selectedProviderId = 'anthropic';
             const selectedModel = 'claude-3-opus';
             const testKey = 'key-save-llm';
             const goosedUrlInput = document.getElementById('goosed-url-input');
             goosedUrlInput.value = currentTestUrl; // Set DOM URL
             mockUI.getSelectedProvider.mockReturnValue(selectedProviderId);
             mockUI.getSelectedModel.mockReturnValue(selectedModel);
             mockUI.getSecretKey.mockReturnValue(testKey);
             mockAPI.upsertConfig.mockResolvedValue(null);

             const backendProviders = { 'anthropic': { name: 'anthropic', is_configured: true } };
             const backendConfig = { [DEFAULT_PROVIDER_CONFIG_KEY]: selectedProviderId, [DEFAULT_MODEL_CONFIG_KEY]: selectedModel };
             mockAPI.fetchProviders.mockResolvedValue([{ name: 'anthropic', is_configured: true }]);
             mockAPI.fetchConfig.mockResolvedValue({ config: backendConfig });
             mockAPI.initializeAgent.mockResolvedValue({});
             mockAPI.addExtension.mockResolvedValue({});

             await saveLLMSettings();

             expect(mockAPI.upsertConfig).toHaveBeenCalledWith(DEFAULT_PROVIDER_CONFIG_KEY, selectedProviderId, false, testKey, currentTestUrl);
             expect(mockAPI.upsertConfig).toHaveBeenCalledWith(DEFAULT_MODEL_CONFIG_KEY, selectedModel, false, testKey, currentTestUrl);
             expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCAL_STORAGE_PROVIDER_KEY, selectedProviderId);
             expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCAL_STORAGE_MODEL_KEY, selectedModel);
             expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCAL_STORAGE_SECRET_KEY, testKey);
             expect(mockAPI.fetchProviders).toHaveBeenCalledWith(testKey, currentTestUrl);
             expect(mockAPI.fetchConfig).toHaveBeenCalledWith(testKey, currentTestUrl);
             expect(mockUI.populateProviderSelect).toHaveBeenCalledWith(backendProviders);
             expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(selectedProviderId);
             expect(mockUI.populateModelSelect).toHaveBeenCalledWith(selectedProviderId, backendProviders);
             expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(selectedProviderId, null, backendConfig, expect.any(Function));
             expect(mockUI.setSelectedModel).toHaveBeenCalledWith(selectedModel);
             expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
             expect(mockAPI.initializeAgent).toHaveBeenCalledWith(selectedProviderId, selectedModel, testKey, currentTestUrl);
             expect(mockAPI.addExtension).toHaveBeenCalledWith('builtin', 'developer', testKey, currentTestUrl);
         });

          test('saveProviderSettings calls API, refreshes, ensures ready', async () => {
               const currentTestUrl = 'http://current-test.com:7777';
               const providerId = 'openai';
               const testKey = 'key-prov-save';
               const goosedUrlInput = document.getElementById('goosed-url-input');
               goosedUrlInput.value = currentTestUrl; // Set DOM URL
               mockUI.getSelectedProvider.mockReturnValue(providerId);
               mockUI.getSecretKey.mockReturnValue(testKey);
               const formValues = { 'OPENAI_API_KEY': { value: 'new-api-key', isSecret: true } };
               mockUI.getProviderConfigValues.mockReturnValue(formValues);
               mockAPI.upsertConfig.mockResolvedValue(null);

                const backendProviders = { 'openai': { name: 'openai', is_configured: true } };
                const defaultOpenAIModel = PROVIDER_REGISTRY.find(p => p.id === providerId)?.defaultModel || 'gpt-4o';
                const backendConfig = { 'OPENAI_API_KEY': '********', [DEFAULT_PROVIDER_CONFIG_KEY]: providerId, [DEFAULT_MODEL_CONFIG_KEY]: defaultOpenAIModel };
                mockAPI.fetchProviders.mockResolvedValue([{ name: 'openai', is_configured: true }]);
                mockAPI.fetchConfig.mockResolvedValue({ config: backendConfig });
                mockAPI.initializeAgent.mockResolvedValue({});
                mockAPI.addExtension.mockResolvedValue({});
                mockUI.getSelectedModel.mockReturnValue(defaultOpenAIModel);

              await saveProviderSettings();

              expect(mockAPI.upsertConfig).toHaveBeenCalledWith('OPENAI_API_KEY', 'new-api-key', true, testKey, currentTestUrl);
              expect(mockAPI.upsertConfig).toHaveBeenCalledTimes(Object.keys(formValues).length);
              expect(mockAPI.fetchConfig).toHaveBeenCalledWith(testKey, currentTestUrl);
              expect(mockAPI.fetchProviders).toHaveBeenCalledWith(testKey, currentTestUrl);
              expect(mockUI.populateProviderSelect).toHaveBeenCalledWith(backendProviders);
              expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(providerId);
              expect(mockUI.populateModelSelect).toHaveBeenCalledWith(providerId, backendProviders);
              expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(providerId, null, backendConfig, expect.any(Function));
              expect(mockUI.setSelectedModel).toHaveBeenCalledWith(defaultOpenAIModel);
              expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
              expect(mockAPI.initializeAgent).toHaveBeenCalledWith(providerId, defaultOpenAIModel, testKey, currentTestUrl);
              expect(mockAPI.addExtension).toHaveBeenCalledWith('builtin', 'developer', testKey, currentTestUrl);
          });
     });

      // --- Provider Configuration Logic Tests ---
      describe('Provider Configuration Logic', () => {
          beforeEach(() => {
             if (setState) {
                 setState({
                     backendProvidersData: PROVIDER_REGISTRY.reduce((acc, p) => { acc[p.id] = { name: p.id, is_configured: false }; return acc; }, {}),
                     currentConfig: {}
                 });
             }
          });

          PROVIDER_REGISTRY.forEach(provider => {
              test(`handleProviderChange correctly updates UI for ${provider.name}`, () => {
                  const { backendProvidersData: currentBackendProviders, currentConfig: currentBackendConfig } = getState();
                  handleProviderChange(provider.id);
                  expect(mockUI.populateModelSelect).toHaveBeenCalledWith(provider.id, currentBackendProviders);
                  expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(provider.id, null, currentBackendConfig, expect.any(Function));
                   if (provider.defaultModel) {
                       expect(mockUI.setSelectedModel).toHaveBeenCalledWith(provider.defaultModel);
                       expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
                   } else {
                       expect(mockUI.setSelectedModel).toHaveBeenCalledWith('');
                       expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
                   }
              });
          });

          test('handleProviderChange with null clears UI elements', () => {
              const { backendProvidersData: currentBackendProviders, currentConfig: currentBackendConfig } = getState();
              handleProviderChange(null);
              expect(mockUI.populateModelSelect).toHaveBeenCalledWith(null, null);
              expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(null, null, {}, expect.any(Function));
              expect(mockUI.setSelectedModel).toHaveBeenCalledWith('');
              expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
          });
      });


      // --- Custom Model UI Logic Tests ---
      describe('Custom Model Input UI', () => {

         test('Selecting model from dropdown clears custom model input', async () => {
             const providerId = 'openai';
             const backendProviders = { [providerId]: { name: providerId, is_configured: true } };
              if (setState) setState({ backendProvidersData: backendProviders, currentConfig: {} });
             mockAPI.fetchProviders.mockResolvedValue([{ name: providerId, is_configured: true }]);
             mockAPI.fetchConfig.mockResolvedValue({ config: {} });
             mockAPI.initializeAgent.mockResolvedValue({});
             mockAPI.addExtension.mockResolvedValue({});
             await app.initializeApp();
             jest.clearAllMocks();

             const modelSelect = document.getElementById('model-select');
             modelSelect.value = 'gpt-4o';
             modelSelect.dispatchEvent(new Event('change'));

             expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
         });

         // Use MOCKED getSelectedModel for these functional tests
         test('getSelectedModel prefers custom input over dropdown/default', () => {
             const customModelName = "my-custom-model";
             mockUI.getSelectedModel.mockReturnValue(customModelName);
             const result = mockUI.getSelectedModel();
             expect(result).toBe(customModelName);
         });

         test('getSelectedModel uses dropdown if custom input is empty', () => {
             const dropdownModel = "dropdown-model";
             mockUI.getSelectedModel.mockReturnValue(dropdownModel);
             const result = mockUI.getSelectedModel();
             expect(result).toBe(dropdownModel);
         });

          test('getSelectedModel uses provider default if custom and dropdown are empty', () => {
             const providerId = 'openai';
             const openAIDefault = PROVIDER_REGISTRY.find(p => p.id === providerId).defaultModel;
             mockUI.getSelectedModel.mockReturnValue(openAIDefault);
             const result = mockUI.getSelectedModel();
             expect(result).toBe(openAIDefault);
          });

          test('updateProviderModelSelectionFromState sets custom model input when saved model not in registry', () => {
               const customModelName = "custom-model-not-in-registry";
               const providerId = 'openai';
               localStorageMock.getItem.mockImplementation(key => {
                   if (key === LOCAL_STORAGE_MODEL_KEY) return customModelName;
                   if (key === LOCAL_STORAGE_PROVIDER_KEY) return providerId;
                   return null;
               });
               const backendProviders = { [providerId]: { name: providerId, is_configured: true } };
               const backendConfig = {};
                if (setState) setState({ backendProvidersData: backendProviders, currentConfig: backendConfig });

               app.__test_only__.updateProviderModelSelectionFromState();

               expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(providerId);
               expect(PROVIDER_REGISTRY.find(p => p.id === providerId)?.knownModels.includes(customModelName)).toBe(false);
               expect(mockUI.setSelectedModel).toHaveBeenCalledWith('');
               expect(mockUI.setCustomModelInput).toHaveBeenCalledWith(customModelName);
          });
     });

     // --- Connection Button Test ---
     describe('Connection Button', () => {
         test('Clicking Connect button refreshes data and initializes agent', async () => {
            const currentTestUrl = 'http://connect-test.com:1111';
            const testKey = 'connect-key';
            const urlInput = document.getElementById('goosed-url-input');
            const keyInput = document.getElementById('secret-key-input');
            urlInput.value = currentTestUrl;
            keyInput.value = testKey;

            const refreshedProviders = { 'ollama': { name: 'ollama', is_configured: true } };
            const refreshedConfig = { [DEFAULT_PROVIDER_CONFIG_KEY]: 'ollama', 'OLLAMA_HOST': 'host' };
            mockAPI.fetchProviders.mockResolvedValue([{ name: 'ollama', is_configured: true }]);
            mockAPI.fetchConfig.mockResolvedValue({ config: refreshedConfig });
            mockAPI.initializeAgent.mockResolvedValue({});
            mockAPI.addExtension.mockResolvedValue({});

             const ollamaDefaultModel = PROVIDER_REGISTRY.find(p => p.id === 'ollama')?.defaultModel || '';
             // Mock UI state *after* updateProviderModelSelectionFromState runs
             mockUI.getSelectedProvider.mockReturnValue('ollama');
             mockUI.getSelectedModel.mockReturnValue(ollamaDefaultModel);
             mockUI.getSecretKey.mockReturnValue(testKey);

            const connectButton = document.getElementById('connect-button');
            connectButton.addEventListener('click', connectToBackend);

            connectButton.click();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockAPI.fetchProviders).toHaveBeenCalledWith(testKey, currentTestUrl);
            expect(mockAPI.fetchConfig).toHaveBeenCalledWith(testKey, currentTestUrl);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCAL_STORAGE_SECRET_KEY, testKey);
             expect(mockUI.populateProviderSelect).toHaveBeenCalledWith(refreshedProviders);
             expect(mockUI.setSelectedProvider).toHaveBeenCalledWith('ollama');
             expect(mockUI.populateModelSelect).toHaveBeenCalledWith('ollama', refreshedProviders);
             expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith('ollama', null, refreshedConfig, expect.any(Function));
             expect(mockUI.setSelectedModel).toHaveBeenCalledWith(ollamaDefaultModel);
             expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
            expect(mockAPI.initializeAgent).toHaveBeenCalledWith('ollama', ollamaDefaultModel, testKey, currentTestUrl);
            expect(mockAPI.addExtension).toHaveBeenCalledWith('builtin', 'developer', testKey, currentTestUrl);
        });
     });

     // --- Session Management Tests ---
     describe('Session Management', () => {

         test('autoSaveSession saves current provider/model from UI', async () => {
             const sessionId = 'test-session-123';
             const conversationHistory = [ { role: 'user', content: [{ type: 'text', text: 'Hello' }] } ];
             const testProviderId = 'openai';
             const testModel = 'gpt-4o';
             if (setState) setState({ sessionId, conversationHistory });
             mockUI.getSelectedProvider.mockReturnValue(testProviderId);
             mockUI.getSelectedModel.mockReturnValue(testModel);

             await autoSaveSession();

             const savedSessionsJson = localStorageMock.setItem.mock.calls.find(call => call[0] === LOCAL_STORAGE_SESSIONS_KEY)[1];
             const savedSessions = JSON.parse(savedSessionsJson);
             expect(savedSessions[sessionId]).toBeDefined();
             expect(savedSessions[sessionId].provider).toBe(testProviderId);
             expect(savedSessions[sessionId].model).toBe(testModel);
             expect(mockUI.populateSessionSelect).toHaveBeenCalledWith(savedSessions);
             expect(mockUI.setSelectedSessionId).toHaveBeenCalledWith(sessionId);
         });

          test('loadSelectedSession restores provider/model from registry context', async () => {
              const sessionIdToLoad = 'session-to-load';
              const providerId = 'google';
              const modelName = 'gemini-1.5-flash';
              const savedSessions = {
                  [sessionIdToLoad]: {
                      id: sessionIdToLoad, name: 'Test Load', timestamp: Date.now(),
                      conversationHistory: [{ role: 'user', content: [{ type: 'text', text: 'Load me' }] }],
                      provider: providerId, model: modelName
                  }
              };
              localStorageMock.getItem.mockReturnValue(JSON.stringify(savedSessions));
              mockUI.getSelectedSessionId.mockReturnValue(sessionIdToLoad);
              const backendProviders = { [providerId]: { name: providerId, is_configured: true } };
              const backendConfig = { 'GOOGLE_API_KEY': 'key' };
              const testKey = 'loaded-key-google';
               if (setState) setState({ backendProvidersData: backendProviders, currentConfig: backendConfig });
              mockAPI.initializeAgent.mockResolvedValue({});
              mockUI.getSecretKey.mockReturnValue(testKey);
              // Set URL in DOM for ensureBackendReady call
              const goosedUrlInput = document.getElementById('goosed-url-input');
              goosedUrlInput.value = 'http://load-session-url.com';
              // Mock UI state for ensureBackendReady call
              mockUI.getSelectedProvider.mockReturnValue(providerId);
              mockUI.getSelectedModel.mockReturnValue(modelName);

              await loadSelectedSession();

              expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(providerId);
              expect(mockUI.populateModelSelect).toHaveBeenCalledWith(providerId, backendProviders);
              expect(mockUI.renderProviderConfigFields).toHaveBeenCalledWith(providerId, null, backendConfig, expect.any(Function));
              expect(mockUI.setSelectedModel).toHaveBeenCalledWith(modelName);
              expect(mockUI.clearCustomModelInput).toHaveBeenCalled();
              expect(mockUI.clearMessageList).toHaveBeenCalled();
              expect(mockUI.displayMessage).toHaveBeenCalledWith('user', 'Load me');
              expect(mockAPI.initializeAgent).toHaveBeenCalledWith(providerId, modelName, testKey, 'http://load-session-url.com');
          });

            test('loadSelectedSession handles custom model not in registry', async () => {
              const sessionIdToLoad = 'session-custom-model';
              const providerId = 'openai';
              const customModelName = 'gpt-custom-unknown';
              const savedSessions = {
                  [sessionIdToLoad]: {
                      id: sessionIdToLoad, name: 'Test Custom Load', timestamp: Date.now(),
                      conversationHistory: [], provider: providerId, model: customModelName
                  }
              };
              localStorageMock.getItem.mockReturnValue(JSON.stringify(savedSessions));
              mockUI.getSelectedSessionId.mockReturnValue(sessionIdToLoad);
              const backendProviders = { [providerId]: { name: providerId, is_configured: true } };
              const backendConfig = {};
               if (setState) setState({ backendProvidersData: backendProviders, currentConfig: backendConfig });
              mockAPI.initializeAgent.mockResolvedValue({});
              const testKey = 'custom-load-key-openai';
              mockUI.getSecretKey.mockReturnValue(testKey);
              // Set state for ensureBackendReady
              mockUI.getSelectedProvider.mockReturnValue(providerId);
              mockUI.getSelectedModel.mockReturnValue(customModelName);
              // Set URL in DOM
              const goosedUrlInput = document.getElementById('goosed-url-input');
              goosedUrlInput.value = 'http://load-custom-url.org';

              await loadSelectedSession();

              expect(mockUI.setSelectedProvider).toHaveBeenCalledWith(providerId);
               expect(PROVIDER_REGISTRY.find(p=>p.id===providerId)?.knownModels.includes(customModelName)).toBe(false);
               expect(mockUI.setSelectedModel).toHaveBeenCalledWith('');
               expect(mockUI.setCustomModelInput).toHaveBeenCalledWith(customModelName);
              expect(mockAPI.initializeAgent).toHaveBeenCalledWith(providerId, customModelName, testKey, 'http://load-custom-url.org');
          });

         test('saveCurrentSession allows user to save with custom name', async () => {
             const sessionId = 'test-session-456';
             const conversationHistory = [ { role: 'user', content: [{ type: 'text', text: 'Hello' }] } ];
             const testProvider = 'custom-provider';
             const testModel = 'custom-model-session';
             const customName = 'My Custom Session';
             if (setState) setState({ sessionId, conversationHistory });
             mockUI.getSelectedProvider.mockReturnValue(testProvider);
             mockUI.getSelectedModel.mockReturnValue(testModel);
             global.prompt.mockReturnValue(customName);

             await saveCurrentSession();

             const savedSessionsJson = localStorageMock.setItem.mock.calls.find(call => call[0] === LOCAL_STORAGE_SESSIONS_KEY)[1];
             const savedSessions = JSON.parse(savedSessionsJson);
             expect(savedSessions[sessionId]).toBeDefined();
             expect(savedSessions[sessionId].name).toBe(customName);
             expect(savedSessions[sessionId].provider).toBe(testProvider);
             expect(savedSessions[sessionId].model).toBe(testModel);
             expect(mockUI.populateSessionSelect).toHaveBeenCalledWith(savedSessions);
             expect(mockUI.setSelectedSessionId).toHaveBeenCalledWith(sessionId);
         });
     });
});
