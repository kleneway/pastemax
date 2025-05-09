const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const { debounce } = require('lodash');

const {
  processSingleFile,
  normalizePath,
  safeRelativePath,
  ensureAbsolutePath
} = require('./utils.js');

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

async function initializeWatcher(folderPath, window, ignoreFilter, defaultIgnoreFilterInstance) {
  // Shutdown existing watcher (Checklist Item 36)
  await shutdownWatcher();

  // Logging start attempt (Checklist Item 38)
  console.log(`[WatcherModule] Attempting to start watcher for folder: ${folderPath}`);

  // Define Chokidar options (Checklist Item 40)
  const watcherOptions = {
    // Implement ignored function (Checklist Items 41-48)
    ignored: (filePath) => {
      try {
        const relativePath = safeRelativePath(folderPath, filePath);
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
      pollInterval: 100
    }
  };

  // Instantiate watcher (Checklist Item 54)
  try {
    currentWatcher = chokidar.watch(folderPath, watcherOptions);
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
      const fileData = await processSingleFile(filePath, folderPath, ignoreFilter);
      if (fileData && window && !window.isDestroyed()) {
        window.webContents.send('file-added', fileData);
        console.log(`[WatcherModule] Sent IPC file-added for: ${fileData.relativePath}`);
      }
    } catch (error) {
      console.error('[WatcherModule] Error processing added file:', error);
    }
  });

  // Change event handler (debounced) (Checklist Items 60-66)
  const debouncedChangeHandler = async (filePath) => {
    console.log(`[WatcherModule] File Changed (debounced): ${filePath}`);
    try {
      const fileData = await processSingleFile(filePath, folderPath, ignoreFilter);
      if (fileData && window && !window.isDestroyed()) {
        window.webContents.send('file-updated', fileData);
        console.log(`[WatcherModule] Sent IPC file-updated for: ${fileData.relativePath}`);
      }
    } catch (error) {
      console.error('[WatcherModule] Error processing changed file:', error);
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
      const normalizedPath = normalizePath(filePath);
      const relativePath = safeRelativePath(folderPath, normalizedPath);
      if (window && !window.isDestroyed() && relativePath) {
        window.webContents.send('file-removed', {
          path: normalizedPath,
          relativePath: relativePath
        });
        console.log(`[WatcherModule] Sent IPC file-removed for: ${relativePath}`);
      }
    } catch (error) {
      console.error('[WatcherModule] Error processing removed file:', error);
    }
  });

  // Logging success (Checklist Item 71)
  console.log(`[WatcherModule] Watcher started successfully for folder: ${folderPath}`);
}

module.exports = { initializeWatcher, shutdownWatcher };