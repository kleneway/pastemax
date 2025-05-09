// ======================
// IMPORTS AND CONSTANTS
// ======================
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const watcher = require('./watcher.js');
const { excludedFiles } = require('./excluded-files');

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
const {
  normalizePath,
  ensureAbsolutePath,
} = require('./utils.js');


// ======================
// IGNORE MANAGEMENT
// ======================
const {
  defaultIgnoreFilter, // Pre-compiled default ignore filter
  loadGitignore, // for Automatic Mode
  createGlobalIgnoreFilter, // for Global Mode
  shouldExcludeByDefault, // Utils
  ignoreCache, // Cache for ignore filters
  clearIgnoreCaches, // clear ignore caches
} = require('./ignore-manager.js');


// ======================
// FILE PROCESSING
// ======================
const { readFilesRecursively, clearFileCaches} = require('./file-processor.js');


// ======================
// DIRECTORY LOADING MANAGEMENT
// ======================
function setupDirectoryLoadingTimeout(window, folderPath) {
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
  }

  loadingTimeoutId = setTimeout(() => {
    console.log(
      `Directory loading timed out after ${MAX_DIRECTORY_LOAD_TIME / 1000} seconds: ${folderPath}`
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

ipcMain.on('open-folder', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
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
        return {
          patterns: {
            global: [...defaultIgnoreFilter, ...excludedFiles, ...(customIgnores || [])],
          },
        };
      }

      try {
        let patterns;
        const normalizedPath = ensureAbsolutePath(folderPath);

        if (mode === 'global') {
          patterns = { global: [...excludedFiles, ...(customIgnores || [])] };
          const cacheKey = `${normalizedPath}:global:${JSON.stringify(customIgnores?.sort() || [])}`;
          ignoreCache.set(cacheKey, {
            ig: createGlobalIgnoreFilter(customIgnores),
            patterns,
          });
        } else {
          await loadGitignore(normalizedPath);
          const cacheKey = `${normalizedPath}:automatic`;
          patterns = ignoreCache.get(cacheKey)?.patterns || { gitignoreMap: {} };
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

ipcMain.on('request-file-list', async (event, folderPath) => {
  console.log('Received request-file-list payload:', folderPath); // Log the entire payload

  if (isLoadingDirectory) {
    console.log('Already processing a directory, ignoring new request for:', folderPath);
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
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), folderPath);

    event.sender.send('file-processing-status', {
      status: 'processing',
      message: 'Scanning directory structure... (Press ESC to cancel)',
    });

    currentProgress = { directories: 0, files: 0 };

    // Clear ignore cache if ignore settings were modified
    if (folderPath.ignoreSettingsModified) {
      console.log('Clearing ignore cache due to modified ignore settings');
      clearIgnoreCaches();
    }

    console.log(
      `Loading ignore patterns for: ${folderPath.folderPath} in mode: ${folderPath.ignoreMode}`
    );
    let ignoreFilter;
    if (folderPath.ignoreMode === 'global') {
      console.log('Using global ignore filter with custom ignores:', folderPath.customIgnores);
      ignoreFilter = createGlobalIgnoreFilter(folderPath.customIgnores);
    } else {
      // Default to automatic
      console.log('Using automatic ignore filter (loading .gitignore)');
      ignoreFilter = await loadGitignore(
        folderPath.folderPath,
        BrowserWindow.fromWebContents(event.sender)
      );
    }
    if (!ignoreFilter) {
      throw new Error('Failed to load ignore patterns');
    }
    console.log('Ignore patterns loaded successfully');

    const { results: files } = await readFilesRecursively(
      folderPath.folderPath,
      folderPath.folderPath,
      ignoreFilter,
      BrowserWindow.fromWebContents(event.sender),
      currentProgress,
      folderPath.folderPath,
      folderPath?.ignoreMode ?? currentIgnoreMode
    );

    if (!isLoadingDirectory) {
      return;
    }

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
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
          excluded: shouldExcludeByDefault(file.path, folderPath.folderPath),
          content: file.content,
          tokenCount: file.tokenCount,
          isBinary: file.isBinary,
          isSkipped: file.isSkipped,
          error: file.error,
        };
      });

    event.sender.send('file-list-data', serializedFiles);
  } catch (err) {
    console.error('Error processing file list:', err);
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
    isLoadingDirectory = false;
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
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
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none';",
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

  // Set up window event handlers
  mainWindow.on('closed', async () => {
    await watcher.shutdownWatcher();
    mainWindow = null; // Now allowed since mainWindow is let
  });

  app.on('before-quit', async () => {
    await watcher.shutdownWatcher();
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

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('startup-mode', {
      safeMode: isSafeMode,
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
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
