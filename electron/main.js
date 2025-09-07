// ======================
// IMPORTS AND CONSTANTS
// ======================
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const watcher = require('./watcher.js');
const { getUpdateStatus, resetUpdateSessionState } = require('./update-manager');
// GlobalModeExclusion is now in ignore-manager.js

// Configuration constants
const MAX_DIRECTORY_LOAD_TIME = 300000; // 5 minutes timeout for large repositories

// Token estimation based on file extension and size
function estimateTokens(fileName, fileSize) {
  const path = require('path');
  const ext = path.extname(fileName).toLowerCase();
  
  // Binary/media files have 0 tokens
  const binaryExtensions = [
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.tiff', '.tif',
    // Videos
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v',
    // Audio
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a',
    // Archives
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
    // Executables
    '.exe', '.dll', '.so', '.dylib', '.bin', '.app', '.deb', '.rpm',
    // Fonts
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    // Documents (binary format)
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // Other binary
    '.sqlite', '.db', '.lock'
  ];
  
  if (binaryExtensions.includes(ext)) {
    return 0;
  }
  
  // Code files are denser (more tokens per character)
  const codeExtensions = [
    // Web technologies
    '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte', '.astro',
    // Programming languages
    '.py', '.java', '.cpp', '.c', '.h', '.hpp', '.cs', '.php', '.rb', '.go', 
    '.rs', '.swift', '.kt', '.scala', '.clj', '.cljs', '.r', '.m', '.mm',
    // Shell scripts
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    // SQL and databases
    '.sql', '.mysql', '.postgres', '.sqlite',
    // Other code
    '.dart', '.lua', '.perl', '.pl', '.haskell', '.hs', '.elm', '.nim'
  ];
  
  if (codeExtensions.includes(ext)) {
    return Math.ceil(fileSize / 3); // ~3 chars per token for code
  }
  
  // Text/config files
  const textExtensions = [
    // Documentation
    '.txt', '.md', '.rst', '.adoc', '.tex',
    // Config files
    '.json', '.xml', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.config',
    // Environment and build
    '.env', '.gitignore', '.gitattributes', '.dockerfile', '.dockerignore',
    '.makefile', '.cmake', '.gradle', '.maven',
    // Data files
    '.csv', '.tsv', '.log', '.logs',
    // License and readme files
    'license', 'readme', 'changelog', 'contributing'
  ];
  
  if (textExtensions.includes(ext) || !ext) {
    return Math.ceil(fileSize / 4); // ~4 chars per token for text
  }
  
  // Files without extensions - check filename
  if (!ext) {
    const lowerName = fileName.toLowerCase();
    if (['readme', 'license', 'changelog', 'contributing', 'dockerfile', 'makefile', 'gemfile', 'procfile'].includes(lowerName)) {
      return Math.ceil(fileSize / 4);
    }
  }
  
  // Default estimation for unknown file types
  return Math.ceil(fileSize / 4);
}

// Enhanced lightweight directory scanning - gets metadata + token estimates
async function scanDirectoryLightweight(folderPath, ignoreFilter) {
  const fs = require('fs').promises;
  const path = require('path');
  const files = [];
  const maxFiles = 10000; // Limit to prevent infinite loops
  
  async function scanDir(dir, relativeTo = folderPath) {
    if (files.length > maxFiles) return;
    
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        if (files.length > maxFiles) break;
        
        const fullPath = path.join(dir, item.name);
        const relativePath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
        
        // Check if path should be ignored
        if (ignoreFilter && ignoreFilter.ignores(relativePath)) {
          continue;
        }
        
        if (item.isDirectory()) {
          // Add directory to list
          files.push({
            path: fullPath,
            relativePath: relativePath,
            name: item.name,
            isDirectory: true,
            size: 0,
            estimatedTokens: 0 // Will be calculated as sum of children
          });
          
          // Recurse into directory
          await scanDir(fullPath, relativeTo);
        } else {
          // Add file to list with basic metadata and token estimate
          try {
            const stats = await fs.stat(fullPath);
            const estimatedTokens = estimateTokens(item.name, stats.size);
            
            if (files.length < 5) { // Debug first few files
              console.log(`[TOKEN ESTIMATE DEBUG] ${item.name}: size=${stats.size}, estimated=${estimatedTokens}`);
            }
            
            files.push({
              path: fullPath,
              relativePath: relativePath,
              name: item.name,
              isDirectory: false,
              size: stats.size,
              estimatedTokens: estimatedTokens
            });
          } catch (error) {
            // Skip files we can't stat
            console.warn(`Cannot stat file ${fullPath}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Cannot read directory ${dir}:`, error.message);
    }
  }
  
  await scanDir(folderPath);
  
  // The frontend will calculate directory token totals from the file list
  // No need to calculate them here since we're filtering out directories
  
  const totalEstimatedTokens = files.reduce((sum, file) => sum + (file.estimatedTokens || 0), 0);
  console.log(`[MAIN] Lightweight scan found ${files.length} items with ~${totalEstimatedTokens} estimated tokens`);
  return files;
}

// Helper function for recursive file counting
async function countFilesRecursive(dir, depth, maxDepth, maxFiles, counters, fs, path) {
  if (depth > maxDepth || counters.fileCount > maxFiles) return;
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (counters.fileCount > maxFiles) break;
      
      // Skip common ignore patterns quickly
      if (item.name.startsWith('.git') || 
          item.name === 'node_modules' || 
          item.name === 'dist' || 
          item.name === '__pycache__' ||
          item.name === '.venv' ||
          item.name === 'venv') {
        continue;
      }
      
      if (item.isDirectory()) {
        counters.dirCount++;
        await countFilesRecursive(path.join(dir, item.name), depth + 1, maxDepth, maxFiles, counters, fs, path);
      } else {
        counters.fileCount++;
      }
    }
  } catch (error) {
    // Skip directories we can't read
    console.warn(`Cannot read directory ${dir}:`, error.message);
  }
}

// Quick folder size estimation function
async function getEstimatedFileCount(folderPath) {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const counters = { fileCount: 0, dirCount: 0 };
    const maxDepth = 5; // Limit depth to avoid deep recursion
    const maxFiles = 50000; // Stop counting after this many files
    
    await countFilesRecursive(folderPath, 0, maxDepth, maxFiles, counters, fs, path);
    console.log(`[MAIN] Quick scan found ~${counters.fileCount} files in ${counters.dirCount} directories`);
    return { 
      fileCount: counters.fileCount > maxFiles ? -1 : counters.fileCount, // -1 indicates too many files to count
      dirCount: counters.dirCount
    };
  } catch (error) {
    console.error('Error estimating folder size:', error);
    return { fileCount: 0, dirCount: 0 }; // Return 0s on error to allow normal processing
  }
}

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

// State to hold large folder data while waiting for user confirmation
let pendingLargeFolderData = null;

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

  // Validate payload structure
  if (!payload || typeof payload !== 'object') {
    console.error('Invalid payload received in request-file-list:', payload);
    event.sender.send('file-processing-status', {
      status: 'error',
      message: 'Invalid request format. Please try again.',
    });
    return;
  }

  if (!payload.folderPath || typeof payload.folderPath !== 'string') {
    console.error('Invalid or missing folderPath in payload:', payload);
    event.sender.send('file-processing-status', {
      status: 'error',
      message: 'Invalid folder path. Please select a folder again.',
    });
    return;
  }

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

    // Quick folder size check before full processing
    console.log(`[MAIN] Performing quick folder size check for ${payload.folderPath}`);
    try {
      const { fileCount: estimatedFileCount, dirCount } = await getEstimatedFileCount(payload.folderPath);
      console.log(`[MAIN] Estimated file count: ${estimatedFileCount}, directories: ${dirCount}`);
      
      // If estimated file count is high OR we found many directories (indicating complex repo structure), show modal immediately
      const shouldShowModal = estimatedFileCount > 1000 || 
                             estimatedFileCount === -1 || 
                             dirCount > 200; // Many directories indicate complex structure
      
      if (shouldShowModal) {
        console.log(`[MAIN] Large/complex directory detected (${estimatedFileCount} files, ${dirCount} dirs), showing modal immediately`);
        
        // Store minimal data for the modal
        pendingLargeFolderData = { 
          folderPath: payload.folderPath, 
          files: [], // Empty for now, will be populated if user chooses to proceed
          ignoreFilter: ignoreFilter,
          payload: payload
        };
        
        event.sender.send('large-folder-warning', { 
          totalTokens: estimatedFileCount === -1 ? 50000000 : estimatedFileCount * 2000, // More realistic estimate: ~2000 tokens per file
          folderPath: payload.folderPath,
          isEstimate: true
        });
        
        // Stop further execution until user responds
        isLoadingDirectory = false;
        stopFileProcessing();
        if (loadingTimeoutId) {
          clearTimeout(loadingTimeoutId);
          loadingTimeoutId = null;
        }
        return; // IMPORTANT: Stop here.
      }
    } catch (error) {
      console.error('Error during folder size estimation:', error);
      // Continue with normal processing if estimation fails
    }

    // Always use lightweight scan for initial load (per TASKS_2.md)
    console.log(`[MAIN] Performing lightweight scan for ${payload.folderPath}`);
    const lightweightFiles = await scanDirectoryLightweight(
      payload.folderPath,
      ignoreFilter
    );
    
    // Convert lightweight files to the expected format
    const files = lightweightFiles
      .filter(file => !file.isDirectory) // Only include actual files
      .map((file) => ({
        path: file.path,
        relativePath: file.relativePath,
        name: file.name,
        size: file.size || 0,
        isDirectory: false,
        extension: path.extname(file.name).toLowerCase(),
        excluded: isPathExcludedByDefaults(
          file.path,
          payload.folderPath,
          payload.ignoreMode ?? currentIgnoreMode
        ),
        content: '', // Empty content for lightweight mode
        tokenCount: file.estimatedTokens || 0,
        isTokenEstimate: true, // Flag to indicate this is an estimate
        isBinary: false, // Will be determined later if file is selected
        isSkipped: false,
        error: null,
      }));
    
    console.log(`[MAIN] Lightweight scan completed: ${files.length} files found`);

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

    console.log(`[MAIN] Starting serialization of ${files.length} files for ${payload.folderPath}`);
    
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

    // Calculate total token count
    const totalTokens = serializedFiles.reduce((sum, file) => sum + (file.tokenCount || 0), 0);
    const TOKEN_THRESHOLD = 500000;

    console.log(`[MAIN] Token count check: ${totalTokens} tokens, threshold: ${TOKEN_THRESHOLD}`);

    // Check if folder exceeds token threshold
    if (totalTokens > TOKEN_THRESHOLD) {
      // Store the large folder data temporarily
      pendingLargeFolderData = { 
        folderPath: payload.folderPath, 
        files: serializedFiles,
        ignoreFilter: ignoreFilter,
        payload: payload
      };
      
      console.log(`[MAIN] Sending large-folder-warning for ${payload.folderPath} with ${totalTokens} tokens`);
      // Send warning to renderer
      event.sender.send('large-folder-warning', { totalTokens, folderPath: payload.folderPath });
      
      // Do NOT send file-list-data yet - wait for user's choice
    } else {
      console.log(`[MAIN] Sending file-list-data for ${payload.folderPath} with ${totalTokens} tokens`);
      // Send data as an object with a 'selectAll' flag
      event.sender.send('file-list-data', { files: serializedFiles, selectAll: true });

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
    }
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

// Handler to proceed with full selection for large folders
ipcMain.on('proceed-with-large-folder', async (event, folderPath) => {
  if (!pendingLargeFolderData) {
    console.error('No pending large folder data available');
    event.sender.send('file-processing-status', { 
      status: 'error', 
      message: 'Large folder data is no longer available. Please try selecting the folder again.' 
    });
    return;
  }
  
  if (pendingLargeFolderData.folderPath === folderPath) {
    console.log('[MAIN] User chose to proceed with large folder, performing FULL scan with actual token counts:', folderPath);
    
    // User explicitly chose "Proceed Anyway" - perform full processing with actual token counts
    isLoadingDirectory = true;
    startFileProcessing();
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), folderPath);

    event.sender.send('file-processing-status', {
      status: 'processing',
      message: 'Reading files and calculating exact token counts...',
    });

    try {
      // Use full file processing to get actual token counts (not estimates)
      const result = await readFilesRecursively(
        pendingLargeFolderData.folderPath, // dir
        pendingLargeFolderData.folderPath, // rootDir
        pendingLargeFolderData.ignoreFilter, // ignoreFilter
        BrowserWindow.fromWebContents(event.sender), // window
        currentProgress, // progress
        pendingLargeFolderData.folderPath, // currentDir
        pendingLargeFolderData.payload?.ignoreMode ?? currentIgnoreMode, // ignoreMode
        null // fileQueue
      );
      
      const files = result.results;
      
      pendingLargeFolderData.files = files;
      
    } catch (error) {
      console.error('Error during confirmed large folder scan:', error);
      event.sender.send('file-processing-status', { 
        status: 'error', 
        message: `Error scanning folder: ${error.message}` 
      });
      
      // Clean up loading state on error
      isLoadingDirectory = false;
      stopFileProcessing();
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
      }
      pendingLargeFolderData = null;
      return;
    } finally {
      isLoadingDirectory = false;
      stopFileProcessing();
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
      }
    }
    
    // Check if pendingLargeFolderData still exists
    if (!pendingLargeFolderData) {
      console.error('pendingLargeFolderData is null when trying to proceed with large folder');
      event.sender.send('file-processing-status', { 
        status: 'error', 
        message: 'Large folder data is no longer available. Please try selecting the folder again.' 
      });
      return;
    }
    
    // Send the data with selectAll: true
    event.sender.send('file-list-data', { files: pendingLargeFolderData.files, selectAll: true });
    
    // Initialize watcher after sending data
    console.log('Large folder data sent with selectAll: true');
    
    // Initialize watcher for the large folder
    try {
      // Store references before clearing pendingLargeFolderData
      const folderPath = pendingLargeFolderData.folderPath;
      const ignoreFilter = pendingLargeFolderData.ignoreFilter;
      
      await watcher.initializeWatcher(
        folderPath, // rootDir
        BrowserWindow.fromWebContents(event.sender),
        ignoreFilter,
        // For defaultIgnoreFilterInstance, use the system default filter
        require('./ignore-manager.js').systemDefaultFilter,
        // processSingleFileCallback
        (filePath) =>
          require('./file-processor.js').processSingleFile(
            filePath,
            folderPath, // Use stored folderPath, not pendingLargeFolderData.folderPath
            ignoreFilter // Use stored ignoreFilter, not pendingLargeFolderData.ignoreFilter
          )
      );
      console.log('[MAIN] Watcher initialized for large folder (selectAll: true)');
    } catch (error) {
      console.error('[MAIN] Failed to initialize watcher for large folder:', error);
    }
    
    // Clear the pending data
    pendingLargeFolderData = null;
  }
});

// Handler to load files but keep them deselected
ipcMain.on('load-large-folder-deselected', async (event, folderPath) => {
  if (!pendingLargeFolderData) {
    console.error('No pending large folder data available');
    event.sender.send('file-processing-status', { 
      status: 'error', 
      message: 'Large folder data is no longer available. Please try selecting the folder again.' 
    });
    return;
  }
  
  if (pendingLargeFolderData.folderPath === folderPath) {
    console.log('[MAIN] User chose to load large folder with files deselected, starting lightweight scan:', folderPath);
    
    // Always perform lightweight scan for large folders (per TASKS_4.md)
    isLoadingDirectory = true;
    startFileProcessing();
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), folderPath);

    event.sender.send('file-processing-status', {
      status: 'processing',
      message: 'Scanning file structure (lightweight mode)...',
    });

    try {
      const lightweightFiles = await scanDirectoryLightweight(
        pendingLargeFolderData.folderPath,
        pendingLargeFolderData.ignoreFilter
      );
      
      const files = lightweightFiles.filter(file => !file.isDirectory).map(file => ({
        path: file.path,
        relativePath: file.relativePath,
        name: file.name,
        size: file.size || 0,
        isDirectory: false,
        extension: path.extname(file.name).toLowerCase(),
        excluded: isPathExcludedByDefaults(
          file.path,
          pendingLargeFolderData.payload.folderPath,
          pendingLargeFolderData.payload.ignoreMode ?? currentIgnoreMode
        ),
        content: '', // Empty content for lightweight mode
        tokenCount: file.estimatedTokens || 0,
        isTokenEstimate: true, // Flag to indicate this is an estimate
        isBinary: false, // Will be determined later if file is selected
        isSkipped: false,
        error: null,
      }));
      
      pendingLargeFolderData.files = files;
      
      const fileCount = files.length;
      const totalItems = lightweightFiles.length;
      const dirCount = totalItems - fileCount;
      console.log(`[MAIN] Lightweight scan completed: ${fileCount} files found (${dirCount} directories excluded from file list)`);
      
    } catch (error) {
      console.error('Error during confirmed large folder scan:', error);
      event.sender.send('file-processing-status', { 
        status: 'error', 
        message: `Error scanning folder: ${error.message}` 
      });
      
      // Clean up loading state on error
      isLoadingDirectory = false;
      stopFileProcessing();
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
      }
      pendingLargeFolderData = null;
      return;
    } finally {
      isLoadingDirectory = false;
      stopFileProcessing();
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
      }
    }
    
    // Check if pendingLargeFolderData still exists
    if (!pendingLargeFolderData) {
      console.error('pendingLargeFolderData is null when trying to proceed with large folder');
      event.sender.send('file-processing-status', { 
        status: 'error', 
        message: 'Large folder data is no longer available. Please try selecting the folder again.' 
      });
      return;
    }
    
    // Send the data with selectAll: false
    event.sender.send('file-list-data', { files: pendingLargeFolderData.files, selectAll: false });
    
    // Initialize watcher after sending data
    console.log('Large folder data sent with selectAll: false');
    
    // Initialize watcher for the large folder
    try {
      // Store references before clearing pendingLargeFolderData
      const folderPath = pendingLargeFolderData.folderPath;
      const ignoreFilter = pendingLargeFolderData.ignoreFilter;
      
      await watcher.initializeWatcher(
        folderPath, // rootDir
        BrowserWindow.fromWebContents(event.sender),
        ignoreFilter,
        // For defaultIgnoreFilterInstance, use the system default filter
        require('./ignore-manager.js').systemDefaultFilter,
        // processSingleFileCallback
        (filePath) =>
          require('./file-processor.js').processSingleFile(
            filePath,
            folderPath, // Use stored folderPath, not pendingLargeFolderData.folderPath
            ignoreFilter // Use stored ignoreFilter, not pendingLargeFolderData.ignoreFilter
          )
      );
      console.log('[MAIN] Watcher initialized for large folder (selectAll: false)');
    } catch (error) {
      console.error('[MAIN] Failed to initialize watcher for large folder:', error);
    }
    
    // Clear the pending data
    pendingLargeFolderData = null;
  }
});

// Handler to cancel the large folder load
ipcMain.on('cancel-large-folder-load', () => {
  // Clear the pending data
  pendingLargeFolderData = null;
  console.log('Large folder load cancelled by user');
});

// Handler for on-demand file processing when files are selected
ipcMain.handle('process-selected-files', async (event, filePaths) => {
  console.log(`[MAIN] Processing ${filePaths.length} selected files for real tokenization...`);
  
  const fileProcessor = require('./file-processor');
  const processedFiles = [];
  
  try {
    for (const filePath of filePaths) {
      try {
        // Process each file individually to get real content and tokens
        // Create a minimal ignore filter for individual file processing
        const { createGlobalIgnoreFilter } = require('./ignore-manager');
        const minimalIgnoreFilter = createGlobalIgnoreFilter([]);
        
        const processedFile = await fileProcessor.processSingleFile(
          filePath,
          require('path').dirname(filePath), // Use file's directory as rootDir
          minimalIgnoreFilter, // Use minimal ignore filter
          'automatic' // Default ignore mode
        );
        
        if (processedFile) {
          processedFiles.push({
            path: filePath,
            ...processedFile,
            isTokenEstimate: false // Mark as real tokenization
          });
        }
      } catch (error) {
        console.warn(`Error processing file ${filePath}:`, error.message);
        // Keep the original estimated data if processing fails
      }
    }
    
    console.log(`[MAIN] Successfully processed ${processedFiles.length}/${filePaths.length} files`);
    return { success: true, processedFiles };
  } catch (error) {
    console.error('Error in process-selected-files:', error);
    return { success: false, error: error.message };
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
    const devURL = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    console.log('Loading development URL:', devURL);
    mainWindow.loadURL(devURL);
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
