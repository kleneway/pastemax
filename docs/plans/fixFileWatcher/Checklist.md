# Checklist: Refactor Chokidar File Watcher Implementation (Modular)

**Goal:** Refactor the file watcher (`chokidar`) implementation by extracting its core logic into a dedicated module (`electron/watcher.js`). Ensure robust, reliable, centrally managed watching, free of memory leaks, with consistent file change detection and communication to the frontend (`App.tsx`).

---

### **Phase 1: Create the Watcher Module (`electron/watcher.js`)**

**Objective:** Define a new module to exclusively manage the Chokidar watcher instance and its lifecycle.

*   [x] **Create File:** Create a new file named `electron/watcher.js`.
*   [x] **Import Dependencies:** Add necessary requires at the top of `watcher.js`:
    *   `const chokidar = require('chokidar');`
    *   `const path = require('path');`
    *   `const fs = require('fs'); // If needed directly, e.g., for stat calls not in processSingleFile`
    *   `const { BrowserWindow } = require('electron'); // Potentially for type hints`
    *   `const { debounce } = require('lodash'); // Or implement simple debounce`
    *   `// Assume utility functions are importable (adjust path as needed)`
    *   `const { processSingleFile } = require('./main.js'); // OrIdeally from a dedicated utils file like './fileProcessor.js'`
    *   `const { normalizePath, safeRelativePath, ensureAbsolutePath } = require('./main.js'); // Or ideally from './pathUtils.js'`
*   [x] **Define Module State:**
    *   Declare `let currentWatcher = null;` within the module scope.
    *   Declare `let changeDebounceMap = new Map();` to manage per-file debounce functions for the 'change' event.
*   [x] **Define `shutdownWatcher` Function:**
    *   Define the exported function `async function shutdownWatcher(): Promise<void>`.
    *   Implement `shutdownWatcher`: Null Check: Check if `currentWatcher` is not null.
    *   Implement `shutdownWatcher`: Logging (Start): If `currentWatcher` exists, log `[WatcherModule] Attempting to stop existing watcher...`.
    *   Implement `shutdownWatcher`: Close Watcher: Call `await currentWatcher.close()` within a `try...catch` block.
    *   Implement `shutdownWatcher`: Logging (Success/Error): Log success or error messages.
    *   Implement `shutdownWatcher`: Clear Debounce Map: Clear the `changeDebounceMap` (`changeDebounceMap.clear();`).
    *   Implement `shutdownWatcher`: Nullify Instance: In a `finally` block, set `currentWatcher = null;`.
    *   Implement `shutdownWatcher`: Return Promise: Ensure it returns a resolved Promise.
*   [x] **Define `initializeWatcher` Function:**
    *   Define the exported function `async function initializeWatcher(folderPath: string, window: BrowserWindow, ignoreFilter: Ignore, defaultIgnoreFilterInstance: Ignore): Promise<void>`. (Note: added `defaultIgnoreFilterInstance` as a parameter). Make it `async`.
*   [x] **Implement `initializeWatcher`: Shutdown Existing:**
    *   Call `await shutdownWatcher();` at the *very beginning* of the function.
*   [x] **Implement `initializeWatcher`: Logging (Start):**
    *   Log `[WatcherModule] Attempting to start watcher for folder: ${folderPath}`.
*   [x] **Implement `initializeWatcher`: Define Chokidar Options:**
    *   Create a `watcherOptions` object.
*   [x] **Implement `initializeWatcher`: Options - `ignored` Function:**
    *   Define the `ignored` property as a function `(filePath) => { ... }`.
    *   Inside the `ignored` function:
        *   Use `try...catch` for error handling (log error, return `true`).
        *   Use `safeRelativePath` to get path relative to `folderPath`. Handle invalid paths (return `true`).
        *   Check against the passed `defaultIgnoreFilterInstance.ignores(relativePath)`. Log and return `true` if ignored.
        *   Check against the passed `ignoreFilter.ignores(relativePath)`. Return `true` if ignored.
        *   Return `false` otherwise.
*   [x] **Implement `initializeWatcher`: Options - Other Settings:**
    *   Set `ignoreInitial: true`.
    *   Set `persistent: true`.
    *   Set `awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }`.
*   [x] **Implement `initializeWatcher`: Instantiate Watcher:**
    *   Wrap `currentWatcher = chokidar.watch(folderPath, watcherOptions);` in a `try...catch` block. Log any instantiation errors. If an error occurs, ensure `currentWatcher` remains `null` and maybe call `shutdownWatcher` for safety.
*   [x] **Implement `initializeWatcher`: Error Event Handler:**
    *   Attach `currentWatcher.on('error', (error) => { ... });`. Log `[WatcherModule] Chokidar Error:`, error. Consider calling `shutdownWatcher()` on critical errors.
*   [x] **Implement `initializeWatcher`: Add Event Handler:**
    *   Attach `currentWatcher.on('add', async (filePath) => { ... });`.
    *   Inside: log `[WatcherModule] File Added: ${filePath}`. Call `processSingleFile` (passing necessary args like `folderPath`, `ignoreFilter`). If valid `fileData`, send IPC via `window.webContents.send('file-added', fileData);`. Log IPC send. Handle errors.
*   [x] **Implement `initializeWatcher`: Change Event Handler (Debounced):**
    *   Define the core change logic: `const debouncedChangeHandler = async (filePath) => { ... };`. Inside: Log change, call `processSingleFile`, check `fileData`, send `file-updated` IPC via `window.webContents`, log IPC send, handle errors.
    *   Attach `currentWatcher.on('change', (filePath) => { ... });`.
    *   Inside the `.on('change')` callback:
        *   Check if `changeDebounceMap` has `filePath`.
        *   If not, create a debounced function: `changeDebounceMap.set(filePath, debounce(debouncedChangeHandler, 500));`.
        *   Call the stored debounced function: `changeDebounceMap.get(filePath)(filePath);`.
*   [x] **Implement `initializeWatcher`: Unlink Event Handler:**
    *   Attach `currentWatcher.on('unlink', (filePath) => { ... });`.
    *   Inside: log `[WatcherModule] File Removed: ${filePath}`. Normalize path, get relative path, send `file-removed` IPC via `window.webContents` with `{ path: normalizedPath, relativePath: relativePath }`. Log IPC send.
*   [x] **Implement `initializeWatcher`: Logging (Success):**
    *   Log `[WatcherModule] Watcher started successfully for folder: ${folderPath}`.
*   [x] **Export Module Functions:** Add `module.exports = { initializeWatcher, shutdownWatcher };` at the end of `watcher.js`.

---

### **Phase 2: Integrate Watcher Module into `main.js`**

**Objective:** Modify `main.js` to use the new `watcher.js` module for all watcher operations.

*   [ ] **Remove `main.js` Watcher State/Functions:**
    *   Delete the global `let currentWatcher = null;` variable.
    *   Delete the `startWatcher` function implementation.
    *   Delete the `stopWatcher` function implementation.
*   [ ] **Import Watcher Module in `main.js`:**
    *   Add `const watcher = require('./watcher.js');` near the top of `main.js`.
*   [ ] **Refactor `request-file-list` Handler:**
    *   Replace the call to `await stopWatcher();` at the beginning with `await watcher.shutdownWatcher();`.
    *   Locate the point *after* successful file scan and *before* sending `file-list-data`.
    *   Retrieve/determine `ignoreFilter` and `defaultIgnoreFilter` (ensure `defaultIgnoreFilter` is initialized and accessible here).
    *   Get the `window` object.
    *   Replace the call to `startWatcher(...)` with `await watcher.initializeWatcher(folderPath.folderPath, window, ignoreFilter, defaultIgnoreFilter);`. (Add `await`).
*   [ ] **Refactor `set-ignore-mode` Handler:**
    *   Replace the call to `await stopWatcher();` at the beginning with `await watcher.shutdownWatcher();`.
*   [ ] **Refactor `cancelDirectoryLoading` Function:**
    *   Replace the call to `await stopWatcher();` with `await watcher.shutdownWatcher();`.
*   [ ] **Refactor Window Close Handler:**
    *   In `mainWindow.on('closed', async () => { ... })` (ensure it's async), replace `await stopWatcher();` with `await watcher.shutdownWatcher();`.
*   [ ] **Refactor App Quit Handlers:**
    *   In `app.on('before-quit', async (event) => { ... })` (ensure it's async), replace potential `stopWatcher` calls with `await watcher.shutdownWatcher();`.
    *   In `app.on('window-all-closed', async () => { ... })` for non-darwin (ensure it's async), replace `await stopWatcher();` with `await watcher.shutdownWatcher();` before `app.quit()`.
*   [ ] **Remove Watcher Code from `loadGitignore`:**
    *   Double-check that *all* `chokidar.watch` related code was removed from `loadGitignore` as per the original plan. Its sole purpose is loading ignore patterns.
*   [ ] **Make Helper Functions Accessible:**
    *   Ensure functions like `processSingleFile`, `normalizePath`, `safeRelativePath`, `ensureAbsolutePath`, etc., are either correctly imported in `watcher.js` (preferred, implies they might need extraction to utils) or are still accessible if `watcher.js` requires `main.js` (less ideal due to potential circular dependencies). *Decision: Assume they will be refactored or are correctly imported.*
*   [ ] **Verify `defaultIgnoreFilter` Handling:**
    *   Ensure `defaultIgnoreFilter` is initialized in `main.js` before it might be needed by `watcher.initializeWatcher` and is passed correctly as an argument.

---

### **Phase 3: Verify Frontend, Preload, and Documentation**

**Objective:** Confirm communication paths are correct and documentation is updated. (These steps remain largely the same as the original plan).

*   [ ] **Verify `preload.js`: Whitelist Channels:** Confirm `file-added`, `file-updated`, `file-removed` are allowed.
*   [ ] **Verify `App.tsx`: IPC Listener Setup:** Confirm listeners exist for the watcher events.
*   [ ] **Verify `App.tsx`: `handleFileAdded` Logic:** Confirm state update logic is correct.
*   [ ] **Verify `App.tsx`: `handleFileUpdated` Logic:** Confirm state update logic is correct.
*   [ ] **Verify `App.tsx`: `handleFileRemoved` Logic:** Confirm state update logic is correct.
*   [ ] **Review `App.tsx`: Reload on Ignore Change:** Acknowledge backend handles watcher stop reliably now.
*   [ ] **Update `README.md`: Features Section:** Update watcher description for reliability.
*   [ ] **Update `README.md`: Troubleshooting Section:** Remove/update obsolete watcher issue points.

---

**Final Check:** Perform manual testing as outlined in the original plan (folder selection, changes, ignore modes, cancellation, file ops, quit/close, stress test). Monitor console logs for `[WatcherModule]` prefixes to confirm correct operation within the new module.