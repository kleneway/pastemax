// Preload script
const { contextBridge, ipcRenderer } = require('electron');

// Helper function to ensure data is serializable
function ensureSerializable(data) {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitive types directly
  if (typeof data !== 'object') {
    return data;
  }

  // For arrays, map each item
  if (Array.isArray(data)) {
    return data.map(ensureSerializable);
  }

  // For objects, create a new object with serializable properties
  const result = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      // Skip functions or symbols which are not serializable
      if (typeof data[key] === 'function' || typeof data[key] === 'symbol') {
        continue;
      }
      // Recursively process nested objects
      result[key] = ensureSerializable(data[key]);
    }
  }
  return result;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  /**
   * Invokes the main process to check for application updates.
   * @returns {Promise<object>} A promise that resolves to an object containing update status.
   * Expected format: { isUpdateAvailable: boolean, currentVersion: string, latestVersion?: string, releaseUrl?: string, error?: string }
   */
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  send: (channel, data) => {
    // whitelist channels
    const validChannels = [
      'open-folder',
      'request-file-list',
      'debug-file-selection',
      'cancel-directory-loading',
      'set-ignore-mode',
    ];
    if (validChannels.includes(channel)) {
      // Ensure data is serializable before sending
      const serializedData = ensureSerializable(data);
      ipcRenderer.send(channel, serializedData);
    }
  },
  receive: (channel, func) => {
    const validChannels = [
      'folder-selected',
      'file-list-data',
      'file-processing-status',
      'startup-mode',
      'file-added',
      'file-updated',
      'file-removed',
    ];
    if (validChannels.includes(channel)) {
      // Remove any existing listeners to avoid duplicates
      ipcRenderer.removeAllListeners(channel);
      // Add the new listener
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // For backward compatibility (but still ensure serialization)
  ipcRenderer: {
    send: (channel, data) => {
      const serializedData = ensureSerializable(data);
      ipcRenderer.send(channel, serializedData);
    },
    on: (channel, func) => {
      const wrapper = (event, ...args) => {
        try {
          // Don't pass the event object to the callback, only pass the serialized args
          const serializedArgs = args.map(ensureSerializable);
          func(...serializedArgs); // Only pass the serialized args, not the event
        } catch (err) {
          console.error(`Error in IPC handler for channel ${channel}:`, err);
        }
      };
      ipcRenderer.on(channel, wrapper);
      // Store the wrapper function for removal later
      return wrapper;
    },
    removeListener: (channel, func) => {
      const validChannels = [
        'folder-selected',
        'file-list-data',
        'file-processing-status',
        'startup-mode',
        'file-added',
        'file-updated',
        'file-removed',
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, (event, ...args) => func(...args));
      }
    },
    // PATCH: Allow invoke for 'check-for-updates' as well as 'get-ignore-patterns'
    invoke: (channel, data) => {
      const validChannels = [
        'get-ignore-patterns',
        'check-for-updates',
        'get-token-count',
        'fetch-models',
        'llm:get-config',
        'llm:set-config',
        'llm:send-prompt',
        'llm:cancel-request',
      ]; // Added LLM channels
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, data);
      }
      // Optionally, you could add a console.warn or throw an error for unhandled channels
      console.warn(`[preload.js] Attempted to invoke unhandled channel: ${channel}`);
      return Promise.reject(new Error(`Unhandled IPC invoke channel: ${channel}`));
    },
  },
});

// Expose LLM API to renderer process
contextBridge.exposeInMainWorld('llmApi', {
  /**
   * Gets the current LLM configuration
   * @returns {Promise<import('../src/types/llmTypes').AllLlmConfigs>}
   */
  getAllConfigs: () => ipcRenderer.invoke('llm:get-config'),

  /**
   * Sets the LLM configuration
   * @param {import('../src/types/llmTypes').AllLlmConfigs} configs - The AllLlmConfigs object
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  setAllConfigs: (configs) => ipcRenderer.invoke('llm:set-config', ensureSerializable(configs)),

  /**
   * Sends a prompt to the LLM
   * @param {Object} params - Parameters for the prompt
   * @param {Array} params.messages - Array of message objects with role and content
   * @param {string} params.requestId - A unique ID for this request
   * @returns {Promise<{content: string, error?: string, cancelled?: boolean}>}
   */
  sendPrompt: (params) => {
    console.log(
      '[Preload] llmApi.sendPrompt - params.messages:',
      JSON.stringify(params.messages, null, 2)
    ); // Log messages
    return ipcRenderer.invoke('llm:send-prompt', ensureSerializable(params));
  },

  /**
   * Cancels an ongoing LLM request.
   * @param requestId The ID of the request to cancel.
   * @returns A promise that resolves to an object indicating success or failure.
   */
  cancelLlmRequest: (requestId) => ipcRenderer.invoke('llm:cancel-request', requestId),
});
