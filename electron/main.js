// ======================
// IMPORTS AND CONSTANTS
// ======================
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const watcher = require('./watcher.js');
const { getUpdateStatus, resetUpdateSessionState } = require('./update-manager');
const {
  getAllLlmConfigsFromStore,
  setAllLlmConfigsInStore,
  sendPromptToLlm,
  cancelLlmRequestInService,
} = require('./llmService');
// GlobalModeExclusion is now in ignore-manager.js

// Configuration constants
const MAX_DIRECTORY_LOAD_TIME = 300000; // 5 minutes timeout for large repositories

// ======================
// GLOBAL STATE
// ======================
/** runtime ignore-mode */
/** @type {'automatic' | 'global'} */
let currentIgnoreMode = 'automatic';
let isLoadingDirectory = false;
let loadingTimeoutId = null;
/**
 * @typedef {Object} DirectoryLoadingProgress
 * @property {number} directories - Number of directories processed
 * @property {number} files - Number of files processed
 */
let currentProgress = { directories: 0, files: 0 };

// ======================
// PATH UTILITIES
// ======================
const { normalizePath, ensureAbsolutePath } = require('./utils.js');

// ======================
// IGNORE MANAGEMENT
// ======================
// Import static pattern arrays directly from their source
const { DEFAULT_PATTERNS, GlobalModeExclusion } = require('./excluded-files.js');
// Import ignore logic functions
const {
  loadAutomaticModeIgnoreFilter, // for Automatic Mode
  createGlobalIgnoreFilter, // for Global Mode
  isPathExcludedByDefaults, // Utils
  compiledIgnoreFilterCache, // Cache for ignore filters
  clearIgnoreCaches, // clear ignore caches
} = require('./ignore-manager.js');

// ======================
// FILE PROCESSING
// ======================
const {
  readFilesRecursively,
  clearFileCaches,
  startFileProcessing,
  stopFileProcessing,
  countTokens, // Added countTokens
} = require('./file-processor.js');

// ======================
// DIRECTORY LOADING MANAGEMENT
// ======================
function setupDirectoryLoadingTimeout(window, folderPath) {
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
  }

  loadingTimeoutId = setTimeout(() => {
    console.log(
      `Directory loading timed out after ${MAX_DIRECTORY_LOAD_TIME / 1000} seconds: ${
        folderPath && typeof folderPath === 'object' ? folderPath.folderPath : folderPath
      }`
    );
    console.log(
      `Stats at timeout: Processed ${currentProgress.directories} directories and ${currentProgress.files} files`
    );
    cancelDirectoryLoading(window, 'timeout');
  }, MAX_DIRECTORY_LOAD_TIME);

  currentProgress = { directories: 0, files: 0 };
}

async function cancelDirectoryLoading(window, reason = 'user') {
  await watcher.shutdownWatcher();
  if (!isLoadingDirectory) return;

  console.log(`Cancelling directory loading process (Reason: ${reason})`);
  console.log(
    `Stats at cancellation: Processed ${currentProgress.directories} directories and ${currentProgress.files} files`
  );

  stopFileProcessing(); // Stop file processor state
  isLoadingDirectory = false;

  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }

  currentProgress = { directories: 0, files: 0 };

  if (window && window.webContents && !window.webContents.isDestroyed()) {
    const message =
      reason === 'timeout'
        ? 'Directory loading timed out after 5 minutes. Try clearing data and retrying.'
        : 'Directory loading cancelled';

    window.webContents.send('file-processing-status', {
      status: 'cancelled',
      message: message,
    });
  } else {
    console.log('Window not available to send cancellation status.');
  }
}

// ======================
// IPC HANDLERS
// ======================

// LLM Service Handlers
ipcMain.handle('llm:get-config', async () => {
  try {
    const configs = await getAllLlmConfigsFromStore();
    return configs;
  } catch (error) {
    console.error('Error getting LLM configs:', error);
    return { error: error.message };
  }
});

ipcMain.handle('llm:set-config', async (_event, configs) => {
  try {
    await setAllLlmConfigsInStore(configs);
    return { success: true };
  } catch (error) {
    console.error('Error setting LLM configs:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('llm:send-prompt', async (_event, params) => {
  try {
    console.log(
      '[Main IPC Handler] llm:send-prompt - received params.messages:',
      JSON.stringify(params.messages, null, 2)
    ); // Log messages
    return await sendPromptToLlm(params);
  } catch (error) {
    console.error('Error sending prompt to LLM:', error);
    return { error: error.message };
  }
});

ipcMain.handle('llm:cancel-request', async (_event, requestId) => {
  try {
    return await cancelLlmRequestInService(requestId);
  } catch (error) {
    console.error('Error cancelling LLM request:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-for-updates', async (event) => {
  console.log("Main Process: IPC 'check-for-updates' handler INVOKED.");
  try {
    const updateStatus = await getUpdateStatus();
    console.log('Main Process: getUpdateStatus result:', updateStatus);
    return updateStatus;
  } catch (error) {
    console.error('Main Process: IPC Error in check-for-updates:', error);
    return {
      isUpdateAvailable: false,
      currentVersion: app.getVersion(),
      error: error.message || 'An IPC error occurred while processing the update check.',
      debugLogs: error.stack || null,
    };
  }
});

ipcMain.on('clear-main-cache', () => {
  console.log('Clearing main process caches');
  clearIgnoreCaches();
  clearFileCaches();
  console.log('Main process caches cleared');
});

ipcMain.on('clear-ignore-cache', () => {
  console.log('Clearing ignore cache due to ignore settings change');
  clearIgnoreCaches();
});

// --- WSL-aware folder picker ---
const { exec } = require('child_process');
const { isWSLPath } = require('./utils.js');
ipcMain.on('open-folder', async (event, arg) => {
  let defaultPath = undefined;
  let lastSelectedFolder = arg && arg.lastSelectedFolder ? arg.lastSelectedFolder : undefined;

  // Only attempt WSL detection on Windows
  if (process.platform === 'win32') {
    try {
      // List WSL distributions
      const wslList = await new Promise((resolve) => {
        exec('wsl.exe --list --quiet', { timeout: 2000 }, (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const distros = stdout
            .split('\n')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
          resolve(distros);
        });
      });

      // Only set defaultPath to \\wsl$\ if last selected folder was a WSL path
      if (
        Array.isArray(wslList) &&
        wslList.length > 0 &&
        lastSelectedFolder &&
        isWSLPath(lastSelectedFolder)
      ) {
        defaultPath = '\\\\wsl$\\';
      }
    } catch (e) {
      // Ignore errors, fallback to default dialog
    }
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
  });

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    const rawPath = result.filePaths[0];
    const normalizedPath = normalizePath(rawPath);
    try {
      console.log('Sending folder-selected event with normalized path:', normalizedPath);
      event.sender.send('folder-selected', normalizedPath);
    } catch (err) {
      console.error('Error sending folder-selected event:', err);
      event.sender.send('folder-selected', normalizedPath);
    }
  }
});

if (!ipcMain.eventNames().includes('get-ignore-patterns')) {
  ipcMain.handle(
    'get-ignore-patterns',
    async (event, { folderPath, mode = 'automatic', customIgnores = [] } = {}) => {
      if (!folderPath) {
        console.log('get-ignore-patterns called without folderPath - returning default patterns');
        // Note: defaultIgnoreFilter is an ignore() instance, not an array.
        // For this fallback, we should use DEFAULT_PATTERNS array from ignore-manager,
        // or construct a similar list if that's not directly exported/desired.
        // However, the original code used defaultIgnoreFilter here, which is incorrect for spreading.
        // Assuming the intent was to provide a comprehensive list for a "default global" view.
        // For now, sticking to the structure but using GlobalModeExclusion correctly.
        // A more robust fallback might involve DEFAULT_PATTERNS.
        // For the UI, when no folder is selected, show all patterns that would form a base global ignore set.
        const effectiveGlobalPatternsNoFolder = [
          ...DEFAULT_PATTERNS,
          ...GlobalModeExclusion,
          ...(customIgnores || []),
        ];
        return {
          patterns: {
            global: effectiveGlobalPatternsNoFolder,
          },
        };
      }

      try {
        let patterns;
        const normalizedPath = ensureAbsolutePath(folderPath);

        if (mode === 'global') {
          // For UI display consistency, include DEFAULT_PATTERNS here as well.
          // The actual createGlobalIgnoreFilter used for filtering already includes them.
          const effectiveGlobalPatternsWithFolder = [
            ...DEFAULT_PATTERNS,
            ...GlobalModeExclusion,
            ...(customIgnores || []),
          ];
          patterns = { global: effectiveGlobalPatternsWithFolder };
          const cacheKey = `${normalizedPath}:global:${JSON.stringify(customIgnores?.sort() || [])}`;
          compiledIgnoreFilterCache.set(cacheKey, {
            ig: createGlobalIgnoreFilter(customIgnores),
            patterns,
          });
        } else {
          await loadAutomaticModeIgnoreFilter(normalizedPath);
          const cacheKey = `${normalizedPath}:automatic`;
          patterns = compiledIgnoreFilterCache.get(cacheKey)?.patterns || { gitignoreMap: {} };
        }

        return { patterns };
      } catch (err) {
        console.error(`Error getting ignore patterns for ${folderPath}:`, err);
        return { error: err.message };
      }
    }
  );
}

ipcMain.on('cancel-directory-loading', (event) => {
  cancelDirectoryLoading(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.on('debug-file-selection', (event, data) => {
  console.log('DEBUG - File Selection:', data);
});

if (!ipcMain.eventNames().includes('set-ignore-mode')) {
  /**
   * Handles ignore mode changes. Validates the mode, clears caches,
   * resets the watcher, and notifies renderer windows of the change.
   * @param {string} mode - The new ignore mode ('automatic' or 'global')
   */
  ipcMain.on('set-ignore-mode', async (_event, mode) => {
    if (mode !== 'automatic' && mode !== 'global') {
      console.warn(`[IgnoreMode] Received invalid mode: ${mode}`);
      return;
    }

    currentIgnoreMode = mode;
    console.log(`[IgnoreMode] switched -> ${mode}`);
    console.log('[IgnoreMode] DEBUG - Current mode set to:', currentIgnoreMode);

    clearIgnoreCaches();
    clearFileCaches();

    // Watcher cleanup is now handled by the watcher module itself

    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && win.webContents) {
        win.webContents.send('ignore-mode-updated', mode);
      }
    });
  });
}

// IPC Handler for getting token count
ipcMain.handle('get-token-count', async (event, textToTokenize) => {
  if (typeof textToTokenize !== 'string') {
    console.error('[IPC:get-token-count] Invalid textToTokenize received:', textToTokenize);
    return { error: 'Invalid input: textToTokenize must be a string.' };
  }
  try {
    const tokenCount = countTokens(textToTokenize);
    return { tokenCount };
  } catch (error) {
    console.error('[IPC:get-token-count] Error counting tokens:', error);
    return { error: `Error counting tokens: ${error.message}` };
  }
});

ipcMain.on('request-file-list', async (event, payload) => {
  console.log('Received request-file-list payload:', payload); // Log the entire payload

  // Always clear file caches before scanning
  clearFileCaches();

  if (isLoadingDirectory) {
    console.log('Already processing a directory, ignoring new request for:', payload);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window.webContents && !window.webContents.isDestroyed()) {
      window.webContents.send('file-processing-status', {
        status: 'busy',
        message: 'Already processing another directory. Please wait.',
      });
    }
    return;
  }

  try {
    isLoadingDirectory = true;
    startFileProcessing(); // Start file processor state
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), payload.folderPath);

    event.sender.send('file-processing-status', {
      status: 'processing',
      message: 'Scanning directory structure... (Press ESC to cancel)',
    });

    currentProgress = { directories: 0, files: 0 };

    // Clear ignore cache if ignore settings were modified
    if (payload.ignoreSettingsModified) {
      console.log('Clearing ignore cache due to modified ignore settings');
      clearIgnoreCaches();
    }

    console.log(
      `Loading ignore patterns for: ${payload.folderPath} in mode: ${payload.ignoreMode}`
    );
    let ignoreFilter;
    if (payload.ignoreMode === 'global') {
      console.log('Using global ignore filter with custom ignores:', payload.customIgnores);
      ignoreFilter = createGlobalIgnoreFilter(payload.customIgnores);
    } else {
      // Default to automatic
      console.log('Using automatic ignore filter (loading .gitignore)');
      ignoreFilter = await loadAutomaticModeIgnoreFilter(
        payload.folderPath,
        BrowserWindow.fromWebContents(event.sender)
      );
    }
    if (!ignoreFilter) {
      throw new Error('Failed to load ignore patterns');
    }
    console.log('Ignore patterns loaded successfully');

    const { results: files } = await readFilesRecursively(
      payload.folderPath,
      payload.folderPath, // rootDir is the same as the initial dir for top-level call
      ignoreFilter,
      BrowserWindow.fromWebContents(event.sender),
      currentProgress,
      payload.folderPath, // currentDir is also the same for top-level
      payload?.ignoreMode ?? currentIgnoreMode,
      null, // fileQueue
      watcher.shutdownWatcher,
      watcher.initializeWatcher
    );

    if (!isLoadingDirectory) {
      return;
    }

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
    stopFileProcessing(); // Stop file processor state
    isLoadingDirectory = false;

    event.sender.send('file-processing-status', {
      status: 'complete',
      message: `Found ${files.length} files`,
    });

    const serializedFiles = files
      .filter((file) => {
        if (typeof file?.path !== 'string') {
          console.warn('Invalid file object in files array:', file);
          return false;
        }
        return true;
      })
      .map((file) => {
        return {
          path: file.path,
          relativePath: file.relativePath,
          name: file.name,
          size: file.size,
          isDirectory: file.isDirectory,
          extension: path.extname(file.name).toLowerCase(),
          excluded: isPathExcludedByDefaults(
            file.path,
            payload.folderPath,
            payload.ignoreMode ?? currentIgnoreMode
          ),
          content: file.content,
          tokenCount: file.tokenCount,
          isBinary: file.isBinary,
          isSkipped: file.isSkipped,
          error: file.error,
        };
      });

    event.sender.send('file-list-data', serializedFiles);

    // After sending file-list-data, start watcher for the root folder
    // Use the same ignoreFilter as used for the scan
    // Pass rootDir as payload.folderPath
    watcher.initializeWatcher(
      payload.folderPath, // rootDir
      BrowserWindow.fromWebContents(event.sender),
      ignoreFilter,
      // For defaultIgnoreFilterInstance, use the system default filter
      require('./ignore-manager.js').systemDefaultFilter,
      // processSingleFileCallback
      (filePath) =>
        require('./file-processor.js').processSingleFile(
          filePath,
          payload.folderPath,
          ignoreFilter,
          payload?.ignoreMode ?? currentIgnoreMode
        )
    );
  } catch (err) {
    console.error('Error processing file list:', err);
    stopFileProcessing(); // Stop file processor state
    isLoadingDirectory = false;

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }

    event.sender.send('file-processing-status', {
      status: 'error',
      message: `Error: ${err.message}`,
    });
  } finally {
    stopFileProcessing(); // Ensure file processor state is reset
    isLoadingDirectory = false;
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
  }
});

// Handle fetch-models request from renderer
ipcMain.handle('fetch-models', async () => {
  try {
    const fetch = require('node-fetch');
    console.log('Fetching models from OpenRouter API in main process...');
    const response = await fetch('https://openrouter.ai/api/v1/models');

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const apiResponse = await response.json();

    if (apiResponse && Array.isArray(apiResponse.data)) {
      console.log(`Successfully fetched ${apiResponse.data.length} models from main process.`);

      // Map API response to expected ModelInfo structure
      const models = apiResponse.data.map((apiModel) => ({
        id: apiModel.id,
        name: apiModel.name || apiModel.id,
        description: apiModel.description || '',
        context_length: apiModel.context_length || 0,
        pricing: apiModel.pricing || '',
        available: apiModel.available !== false,
      }));

      return models;
    } else {
      console.error(
        "Error fetching models: Invalid response format. Expected object with 'data' array.",
        apiResponse
      );
      return null;
    }
  } catch (error) {
    console.error('Error fetching models in main process:', error);
    return null;
  }
});

// ======================
// ELECTRON WINDOW SETUP
// ======================
console.log('--- createWindow() ENTERED ---');
let mainWindow;
function createWindow() {
  const isSafeMode = process.argv.includes('--safe-mode');

  // Set CSP header for all environments
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:* ws://localhost:* https://openrouter.ai/*; object-src 'none';",
        ],
      },
    });
  });
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: {
        isDevToolsExtension: false,
        htmlFullscreen: false,
      },
      // Always enable security
      // Disable manually for testing
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Open external links in user's default browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (mainWindow.webContents.getURL() !== url) {
        event.preventDefault();
        shell.openExternal(url);
      }
    }
  });

  // Handle requests to open a new window (e.g., target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Set up window event handlers
  mainWindow.on('closed', async () => {
    await watcher.shutdownWatcher();
    mainWindow = null; // Now allowed since mainWindow is let
  });

  app.on('before-quit', async () => {
    await watcher.shutdownWatcher();
  });

  app.on('will-quit', () => {
    resetUpdateSessionState();
  });

  app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
      await watcher.shutdownWatcher();
      app.quit();
    }
  });

  // handle Escape locally (only when focused), not globally
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // only intercept Esc when our window is focused and a load is in progress
    if (input.key === 'Escape' && isLoadingDirectory) {
      cancelDirectoryLoading(mainWindow);
      event.preventDefault(); // stop further in-app handling
    }
  });

  // Only verify file existence in production mode
  if (process.env.NODE_ENV !== 'development') {
    // Verify file exists before loading
    const prodPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Production path:', prodPath);
    try {
      fs.accessSync(prodPath, fs.constants.R_OK);
      console.log('File exists and is readable');
    } catch (err) {
      console.error('File access error:', err);
    }
  }

  // Clean up watcher when window is closed
  mainWindow.on('closed', () => {
    // Watcher cleanup is now handled by the watcher module itself
  });

  mainWindow.webContents.once('did-finish-load', async () => {
    mainWindow.webContents.send('startup-mode', {
      safeMode: isSafeMode,
    });
    // Automatic update check on app launch (skip in development mode)
    if (process.env.NODE_ENV !== 'development') {
      try {
        const { getUpdateStatus } = require('./update-manager');
        const updateStatus = await getUpdateStatus();
        mainWindow.webContents.send('initial-update-status', updateStatus);
      } catch (err) {
        mainWindow.webContents.send('initial-update-status', {
          isUpdateAvailable: false,
          currentVersion: app.getVersion(),
          error: err?.message || 'Failed to check for updates on launch',
          isLoading: false,
        });
      }
    } else {
      // In development mode, just send a "no update" status immediately
      mainWindow.webContents.send('initial-update-status', {
        isUpdateAvailable: false,
        currentVersion: app.getVersion(),
        isLoading: false,
        error: undefined,
      });
    }
  });

  if (process.env.NODE_ENV === 'development') {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173'; // Use env var, fallback if not set
    console.log(`[Main Process] Development mode: Loading URL: ${devUrl}`);
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    const prodPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
      : path.join(__dirname, 'dist', 'index.html');

    console.log('--- PRODUCTION LOAD ---');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('app.isPackaged:', app.isPackaged);
    console.log('__dirname:', __dirname);
    console.log('Resources Path:', process.resourcesPath);
    console.log('Attempting to load file:', prodPath);
    console.log('File exists:', fs.existsSync(prodPath));

    mainWindow
      .loadFile(prodPath)
      .then(() => {
        console.log('Successfully loaded index.html');
        mainWindow.webContents.on('did-finish-load', () => {
          console.log('Finished loading all page resources');
        });
      })
      .catch((err) => {
        console.error('Failed to load index.html:', err);
        // Fallback to showing error page
        mainWindow.loadURL(
          `data:text/html,<h1>Loading Error</h1><p>${encodeURIComponent(err.message)}</p>`
        );
      });
  }
}

// ======================
// APP LIFECYCLE
// ======================
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
