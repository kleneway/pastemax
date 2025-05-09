const chokidar = require('chokidar');
const { debounce } = require('lodash');

const { normalizePath, safeRelativePath } = require('./utils.js');
const { removeFileCacheEntry } = require('./file-processor.js'); // Changed import

let currentWatcher = null;
let changeDebounceMap = new Map();

async function shutdownWatcher() {
  if (!currentWatcher) return;

  console.log('[WatcherModule] Attempting to stop existing watcher...');

  try {
    await currentWatcher.close();
    console.log('[WatcherModule] Existing watcher stopped successfully.');
  } catch (error) {
    console.error('[WatcherModule] Error stopping watcher:', error);
  } finally {
    changeDebounceMap.clear();
    currentWatcher = null;
  }
}

async function initializeWatcher(
  rootDir, // Parameter name is rootDir
  window,
  ignoreFilter,
  defaultIgnoreFilterInstance,
  processSingleFileCallback
) {
  // Shutdown existing watcher (Checklist Item 36)
  await shutdownWatcher();

  // Logging start attempt (Checklist Item 38)
  console.log(`[WatcherModule] Attempting to start watcher for folder: ${rootDir}`);

  // Define Chokidar options (Checklist Item 40)
  const watcherOptions = {
    // Implement ignored function (Checklist Items 41-48)
    ignored: (filePath) => {
      try {
        const relativePath = safeRelativePath(rootDir, filePath);
        if (!relativePath) {
          console.warn(`[WatcherModule] Could not get relative path for: ${filePath}`);
          return true;
        }

        // Check default ignores
        if (defaultIgnoreFilterInstance && defaultIgnoreFilterInstance.ignores(relativePath)) {
          /* console.log(`[WatcherModule] Ignored by default: ${relativePath}`); */
          return true;
        }

        // Check specific ignores
        if (ignoreFilter && ignoreFilter.ignores(relativePath)) {
          /* console.log(`[WatcherModule] Ignored by specific filter: ${relativePath}`); */
          return true;
        }

        return false;
      } catch (error) {
        console.error('[WatcherModule] Error in ignored function:', error);
        return true;
      }
    },
    // Set other options (Checklist Items 50-52)
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  };

  // Instantiate watcher (Checklist Item 54)
  try {
    currentWatcher = chokidar.watch(rootDir, watcherOptions);
  } catch (error) {
    console.error('[WatcherModule] Chokidar watch instantiation failed:', error);
    currentWatcher = null;
    await shutdownWatcher();
    return;
  }

  // Error event handler (Checklist Item 56)
  currentWatcher.on('error', (error) => {
    console.error('[WatcherModule] Chokidar Error:', error);
  });

  // Add event handler (Checklist Items 58-59)
  currentWatcher.on('add', async (filePath) => {
    console.log(`[WatcherModule] File Added: ${filePath}`);
    try {
      removeFileCacheEntry(filePath); // Use new function name
      console.log(`[WatcherModule] Processing 'add' for: ${filePath}`);
      // processSingleFileCallback (which is processSingleFile) will read fresh and update the cache.
      const fileData = await processSingleFileCallback(filePath, rootDir, ignoreFilter);
      if (fileData && window && !window.isDestroyed()) {
        console.log(`[WatcherModule][IPC] Sending 'file-added' for: ${fileData.relativePath}. Data:`, JSON.stringify(fileData));
        window.webContents.send('file-added', fileData);
      } else {
        console.log(`[WatcherModule] 'file-added' event for ${filePath} - no fileData or window invalid.`);
      }
    } catch (error) {
      console.error(`[WatcherModule] Error processing added file ${filePath}:`, error);
    }
  });

  // Change event handler (debounced) (Checklist Items 60-66)
  const debouncedChangeHandler = async (filePath) => {
    console.log(`[WatcherModule] File Changed (debounced): ${filePath}`);
    try {
      removeFileCacheEntry(filePath); // Use new function name
      console.log(`[WatcherModule] Processing 'change' for: ${filePath}`);
      // processSingleFileCallback (which is processSingleFile) will read fresh and update the cache.
      const fileData = await processSingleFileCallback(filePath, rootDir, ignoreFilter);
      if (fileData && window && !window.isDestroyed()) {
        console.log(`[WatcherModule][IPC] Sending 'file-updated' for: ${fileData.relativePath}. Data:`, JSON.stringify(fileData));
        window.webContents.send('file-updated', fileData);
      } else {
        console.log(`[WatcherModule] 'file-updated' event for ${filePath} - no fileData or window invalid.`);
      }
    } catch (error) {
      console.error(`[WatcherModule] Error processing changed file ${filePath}:`, error);
    }
  };

  currentWatcher.on('change', (filePath) => {
    if (!changeDebounceMap.has(filePath)) {
      changeDebounceMap.set(filePath, debounce(debouncedChangeHandler, 500));
    }
    changeDebounceMap.get(filePath)(filePath);
  });

  // Unlink event handler (Checklist Items 68-69)
  currentWatcher.on('unlink', (filePath) => {
    console.log(`[WatcherModule] File Removed: ${filePath}`);
    try {
      removeFileCacheEntry(filePath); // Use new function name
      const normalizedPath = normalizePath(filePath);
      const relativePath = safeRelativePath(rootDir, normalizedPath);
      const eventData = { path: normalizedPath, relativePath: relativePath };
      if (window && !window.isDestroyed() && relativePath) {
        console.log(`[WatcherModule][IPC] Sending 'file-removed' for: ${relativePath}. Data:`, JSON.stringify(eventData));
        window.webContents.send('file-removed', eventData);
      } else {
        console.log(`[WatcherModule] 'file-removed' event for ${filePath} - no relativePath or window invalid.`);
      }
    } catch (error) {
      console.error(`[WatcherModule] Error processing removed file ${filePath}:`, error);
    }
  });

  // Logging success (Checklist Item 71)
  console.log(`[WatcherModule] Watcher started successfully for folder: ${rootDir}`);
}

// Exports
module.exports = { initializeWatcher, shutdownWatcher };
