# Context Primer: Refactor Chokidar File Watcher

## 1. Feature Goal

To refactor the existing file system watcher (`chokidar`) implementation within the PasteMax application. The primary goal is to create a **robust, reliable, centrally managed, and memory-leak-free** watcher system that accurately detects file changes (`add`, `change`, `unlink`) in the selected folder and efficiently communicates these changes to the React frontend for UI updates. This refactor aims to move the core watcher logic into a dedicated module (`electron/watcher.js`) for better separation of concerns.

## 2. Problem Statement

The current `chokidar` implementation located primarily within `electron/main.js` suffers from several critical issues:

1.  **Lifecycle Mismanagement:** The watcher (`currentWatcher`) initialization is tied inconsistently to `loadGitignore` (often only in 'automatic' ignore mode) and isn't reliably started or stopped.
2.  **Resource Leaks:** Failure to close previous watcher instances when changing folders, ignore modes, or during cancellation leads to defunct processes and potential memory leaks.
3.  **Inconsistent Behavior:** File changes are often missed or not detected until the application state is manually reset, making the feature unreliable.
4.  **Over-Reliance on Reload:** The frontend sometimes resorts to full reloads (e.g., on ignore settings change) where more granular IPC updates should suffice if the backend state/watcher were managed correctly.

## 3. Proposed Solution & Scope

**Solution:**

*   Extract all core Chokidar watcher logic (initialization, event handling, lifecycle management) into a new, dedicated module: `electron/watcher.js`.
*   Implement exported functions within `watcher.js` (`initializeWatcher`, `shutdownWatcher`) to control the watcher state externally.
*   Modify `electron/main.js` to import and utilize the `watcher.js` module, calling `initializeWatcher` and `shutdownWatcher` at the appropriate lifecycle points (folder selection completion, ignore mode change, cancellation, window close, app quit).
*   Ensure **only one** watcher instance is active at any given time.
*   Implement robust error handling and clear logging within the watcher module.
*   Use debouncing for `change` events to prevent event floods.
*   Ensure file change events correctly trigger IPC messages (`file-added`, `file-updated`, `file-removed`) with the necessary data (`FileData` or path info) for the frontend.

**In Scope:**

*   Creating `electron/watcher.js`.
*   Refactoring `electron/main.js` to delegate watcher control to `watcher.js`.
*   Modifying watcher lifecycle integration points (`request-file-list`, `set-ignore-mode`, `cancelDirectoryLoading`, window/app lifecycle handlers).
*   Ensuring correct IPC communication for file changes.
*   Implementing necessary logging (`[WatcherModule]`).
*   Minor verification/adjustments in `src/App.tsx` to ensure proper handling of watcher IPC messages (existing handlers seem mostly suitable).
*   Verification of `electron/preload.js` channel whitelisting.
*   Updating `README.md`.

**Out of Scope:**

*   Major refactoring of the file processing logic (`readFilesRecursively`, `processSingleFile`) itself, beyond ensuring `processSingleFile` is callable by the watcher.
*   Fundamental changes to the ignore logic (`ignore` library usage, `.gitignore` parsing).
*   Significant architectural changes to the frontend state management in `src/App.tsx`.
*   Adding new UI elements specifically for the watcher.

## 4. Core Requirements

### Functional Requirements:

1.  **Watcher Initialization:** The watcher MUST only be initialized by `watcher.initializeWatcher` *after* a folder has been successfully selected and its initial file list processed via `request-file-list`.
2.  **Watcher Singleton:** The system MUST ensure only one `chokidar` instance managed by `watcher.js` is active at any time. Calling `initializeWatcher` must shut down any pre-existing watcher first.
3.  **Watcher Shutdown:** The watcher MUST be reliably shut down (via `watcher.shutdownWatcher`) in the following scenarios:
    *   Before initializing a new watcher for a different folder (`request-file-list`).
    *   When the ignore mode is changed (`set-ignore-mode`).
    *   When directory loading is cancelled (`cancelDirectoryLoading`).
    *   When the main application window is closed.
    *   Before the application quits (`before-quit` or non-darwin `window-all-closed`).
4.  **File Addition Detection:** The watcher MUST detect new file additions within the selected folder (respecting ignore rules). Upon detection, it MUST:
    *   Process the file using a function equivalent to `processSingleFile`.
    *   Send an IPC message (`file-added`) to the renderer with the complete `FileData` object.
5.  **File Change Detection:** The watcher MUST detect changes to existing files (respecting ignore rules). Upon detection, it MUST:
    *   **Debounce** the event handling per file (e.g., 300-500ms delay).
    *   Process the changed file using a function equivalent to `processSingleFile`.
    *   Send an IPC message (`file-updated`) to the renderer with the updated `FileData` object.
6.  **File Deletion Detection:** The watcher MUST detect file/directory deletions (respecting ignore rules). Upon detection, it MUST:
    *   Send an IPC message (`file-removed`) to the renderer with the `{ path: string, relativePath: string }` of the removed item.
7.  **Ignore Rules:** The watcher's `ignored` logic MUST correctly utilize both the project-specific ignore patterns (`ignoreFilter`) and the application default ignore patterns (`defaultIgnoreFilterInstance`), relative to the watched `folderPath`.

### Non-Functional Requirements:

1.  **Reliability:** The watcher must operate consistently across different user actions (folder changes, mode switches, etc.).
2.  **Resource Management:** No defunct watcher processes or memory leaks should occur due to improper lifecycle management.
3.  **Error Handling:** The watcher module and its integration points must handle errors gracefully (e.g., errors during file processing for an event, errors during watcher setup) and log them without crashing the application.
4.  **Modularity:** Watcher logic MUST be encapsulated within `electron/watcher.js`.
5.  **Logging:** Clear and informative logging using a `[WatcherModule]` prefix MUST be implemented for key lifecycle events (start, stop, error) and file event detection/IPC calls.

## 5. Technical Implementation Details

*   **Module:** `electron/watcher.js`
    *   **State:** `currentWatcher` (holds the Chokidar instance), `changeDebounceMap` (Map to store per-file debounce functions).
    *   **Exports:** `async function initializeWatcher(...)`, `async function shutdownWatcher()`.
    *   `initializeWatcher` parameters: `folderPath`, `window` (for IPC), `ignoreFilter` (specific), `defaultIgnoreFilterInstance` (global defaults).
    *   **Debouncing:** Use `lodash.debounce` or a simple `setTimeout`/`clearTimeout` implementation for the 'change' event handler, managed via `changeDebounceMap`.
*   **Integration (`main.js`):**
    *   Import `watcher.js`.
    *   Call `watcher.shutdownWatcher()` at the start of `request-file-list`, `set-ignore-mode`, `cancelDirectoryLoading`, and in window/app close/quit handlers.
    *   Call `watcher.initializeWatcher(...)` *after* the file scan completes in `request-file-list`, passing the correct folder path, window object, and the relevant ignore filter instances.
*   **Helper Functions:** Ensure `processSingleFile` (or equivalent), `normalizePath`, `safeRelativePath`, etc., are correctly accessible from `watcher.js`. This might involve minor refactoring to export/import them from a shared utility location if not already done.

## 6. Key Considerations & Constraints

*   **Path Normalization:** Consistently use path normalization functions (`normalizePath`, `safeRelativePath`, `ensureAbsolutePath`) when dealing with file paths across the watcher logic and IPC communication.
*   **Ignore Filter Instances:** The correct `ignoreFilter` (loaded via `loadGitignore` or created via `createGlobalIgnoreFilter`) and the `defaultIgnoreFilterInstance` must be passed to `initializeWatcher`. The `ignored` function within `watcher.js` relies on these.
*   **`processSingleFile`:** This function (or an equivalent) is crucial for generating the `FileData` payload for `add` and `change` events. Ensure it's robust and provides all necessary data.
*   **Asynchronicity:** `shutdownWatcher` and `initializeWatcher` (due to the initial shutdown call) should be `async` and properly `await`-ed in `main.js` to prevent race conditions, especially during app quit or rapid folder changes.
*   **Debounce Strategy:** The per-file debouncing for 'change' events is important to handle rapid saves correctly. The `changeDebounceMap` approach helps manage this.
*   **Error Logging:** Comprehensive logging within `watcher.js` is vital for debugging potential issues.

## 7. Testing & Validation

*   **Manual Testing Scenarios:** Follow the detailed testing plan provided previously, covering:
    *   Folder selection/change.
    *   Ignore mode switching impacts (watcher should stop/start appropriately based on integration).
    *   Cancellation scenarios.
    *   Various file operations (add, rename, modify, delete files/folders, including ignored ones).
    *   Application quit/window close.
    *   Rapid file saves (stress test debounce).
*   **Log Verification:** Monitor the developer console for `[WatcherModule]` logs to confirm:
    *   Watcher starts and stops at the correct times.
    *   Only one watcher is active.
    *   File events (`add`, `change`, `unlink`) are logged.
    *   IPC calls for file changes are logged.
    *   Errors are logged appropriately.
*   **UI Verification:** Confirm the frontend file list updates reactively and correctly reflects the file changes detected by the watcher.

## 8. Relevant Existing Code Concepts / IPC Channels

*   **Key Functions (in `main.js` - may need export/import adjustment):** `processSingleFile`, `loadGitignore`, `createGlobalIgnoreFilter`, `normalizePath`, `safeRelativePath`, `ensureAbsolutePath`, `defaultIgnoreFilter` (variable).
*   **Core IPC Channels:**
    *   **Control (from Renderer):** `request-file-list`, `set-ignore-mode`, `cancel-directory-loading`.
    *   **Events (to Renderer):** `file-added` (payload: `FileData`), `file-updated` (payload: `FileData`), `file-removed` (payload: `{ path: string, relativePath: string }`).
*   **Ignore Logic:** The watcher needs access to the `ignore` objects created by `loadGitignore` / `createGlobalIgnoreFilter` and the patterns in `DEFAULT_PATTERNS`.