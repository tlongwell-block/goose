// --- API Communication Functions ---

// Generic Fetch Helper (internal)
async function makeApiRequest(endpoint, method = 'GET', body = null, secretKey = '', ignoreKeyError = false, goosedUrl = 'http://localhost:7878') {
    if (!secretKey && !ignoreKeyError && endpoint !== '/config' && endpoint !== '/config/providers') {
        throw new Error('Secret Key is required for this operation.');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (secretKey) {
        headers['X-Secret-Key'] = secretKey;
    }

    const options = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const requestUrl = `${goosedUrl.replace(/\/$/, '')}${endpoint}`; // Ensure no double slash
    console.debug(`API Request: ${method} ${requestUrl}`); // Log request details
    const response = await fetch(requestUrl, options);

    if (!response.ok) {
        let errorText = `HTTP error! Status: ${response.status}`;
        try {
            errorText += ` - ${await response.text()}`;
        } catch (e) { /* ignore */ }
        if (response.status === 401 && ignoreKeyError) {
            throw new Error('Unauthorized (401). Check Secret Key.');
        }
        throw new Error(errorText);
    }

    const contentType = response.headers.get("content-type");
    if (response.status === 204 || !contentType || !contentType.includes("application/json")) {
        if (response.status === 200 && response.ok) return null;
        if (response.ok) return null;
        throw new Error(`Unexpected response type: ${contentType || 'none'}`);
    }

    return response.json();
}

// Exported API functions
export function fetchProviders(secretKey, goosedUrl) {
    return makeApiRequest('/config/providers', 'GET', null, secretKey, false, goosedUrl);
}

export function fetchConfig(secretKey, goosedUrl) {
    return makeApiRequest('/config', 'GET', null, secretKey, false, goosedUrl);
}

export function upsertConfig(key, value, isSecret, secretKey, goosedUrl) {
     return makeApiRequest('/config/upsert', 'POST', { key, value, is_secret: isSecret }, secretKey, true, goosedUrl);
}

export function initializeAgent(provider, model, secretKey, goosedUrl) {
     return makeApiRequest('/agent/update_provider', 'POST', { provider, model: model || null }, secretKey, true, goosedUrl);
}

export function configureExtension(extensionConfig, secretKey, goosedUrl) {
     return makeApiRequest('/config/extensions', 'POST', extensionConfig, secretKey, true, goosedUrl);
}

export function addExtension(extensionType, extensionName, secretKey, goosedUrl) {
     return makeApiRequest('/extensions/add', 'POST', { type: extensionType, name: extensionName }, secretKey, true, goosedUrl);
}

export function sendToolConfirmationRequest(toolCallId, action, secretKey, goosedUrl) {
     return makeApiRequest('/confirm', 'POST', { id: toolCallId, action, principal_type: 'Tool' }, secretKey, true, goosedUrl);
}

// Special function for the streaming reply endpoint
export async function fetchReplyStream(payload, secretKey, goosedUrl) {
     const requestUrl = `${goosedUrl.replace(/\/$/, '')}/reply`;
     console.debug(`API Stream Request: POST ${requestUrl}`); 
     const response = await fetch(requestUrl, {
         method: 'POST',
         headers: {
             'Content-Type': 'application/json',
             'X-Secret-Key': secretKey,
             'Accept': 'text/event-stream'
         },
         body: JSON.stringify(payload)
     });

     if (!response.ok) {
         let errorText = `HTTP error! Status: ${response.status}`;
         try {
             errorText += ` - ${await response.text()}`;
         } catch (e) { /* ignore */ }
         throw new Error(errorText);
     }

     if (!response.body) {
         throw new Error('Response body is null for stream');
     }

     return response.body.getReader(); // Return the stream reader directly
}
