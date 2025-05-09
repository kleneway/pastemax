**Creating PRD for modularisation**

A plan for modularising `main.js` into up to three files without affecting the existing functionality. I'll break the Product Requirements Document (PRD) plan into the following sections:

1. **High-Level Objective**: Keep functionality intact while splitting `main.js`.
2. **Method Changes**: Describe the modularisation process and how to test for consistency.
3. **Files Made**: Outline the three separate files.
4. **Self Validation**: Steps to verify the code works without changes.
5. **Changelog Update**: Provide the necessary updates for the changelog.

**Modularising main.js**

The user wants to split the large `main.js` into at most three files while keeping functionality intact. The breakdown I’m considering includes:

1. **ignore.js**: Logic for ignoring files.
2. **processor.js**: Handles file processing and directory scanning.
3. **main.js**: Manages app lifecycle, window creation, and IPC handlers.

Alternatively, I could have:

* `config.js` (for constants),
* `ignore.js`,
* `processor.js`.
  But they want no more than 3 files for `main.js`, limiting possible additional files.

**Drafting PRD for modularisation**

The user wants a detailed PRD to modularise `main.js` into three files to improve maintainability without changing functionality.

I'll break it down as follows:

* **High Level Objective**: Improve maintainability by modularising `main.js` into separate modules for ignore logic and file processing while preserving functionality and performance.
* **Method changes**: Draft steps to divide functions into logic groups, update paths, imports, and ensure tests for functionality.
* **Files Made**: Create `ignore-manager.js` and `file-processor.js`. Keep `main.js` for bootstrapping and IPC.
* **Self Validation**: Plan for integration and manual tests to ensure functionality remains unchanged.
* **Changelog Update**: Document changes like "Added ignore-manager.js" and "Refactored main.js."


Thought for 15 seconds


**High Level Objective**
Modularise the existing **main.js** into three focused modules—**main.js**, **ignore-manager.js**, and **file-processor.js**—to improve readability, maintainability, and testability without altering any existing functionality or behavior of the Electron backend.

---

**Method Changes**

1. **Audit & Identify Responsibilities**

   * **Ignore logic**: all functions and caches around default patterns, `.gitignore` parsing, contextual/global filters.
   * **File processing**: token counting, binary detection, single‐file and recursive directory traversal, error handling, throttling, concurrency.
   * **Application orchestration**: Electron app lifecycle, window creation, IPC handlers, directory‐loading management (timeouts, cancellation), watcher integration.

2. **Create `ignore-manager.js`**

   * **Move out of `main.js`**:

     * `DEFAULT_PATTERNS`, `ignoreCache`, `gitIgnoreFound`, `defaultExcludeFilter`
     * Functions: `shouldExcludeByDefault`, `collectGitignoreMapRecursive`, `createGlobalIgnoreFilter`, `createContextualIgnoreFilter`, `shouldIgnorePath`, `loadGitignore`
   * **Exports**:

     ```js
     module.exports = {
       loadGitignore,
       shouldIgnorePath,
       shouldExcludeByDefault
     };
     ```

3. **Create `file-processor.js`**

   * **Move out of `main.js`**:

     * Constants: `MAX_FILE_SIZE`, `CONCURRENT_DIRS`
     * Caches: `fileCache`, `fileTypeCache`
     * Functions: `isBinaryFile`, `countTokens`, `processSingleFile`, `processDirectory`, `readFilesRecursively`
   * **Dependencies**: require `p-queue`, `fs`, `path`, the new `ignore-manager.js`, and existing `utils.js` & `excluded-files.js`.
   * **Exports**:

     ```js
     module.exports = {
       processSingleFile,
       readFilesRecursively,
       isBinaryFile,
       countTokens
     };
     ```

4. **Refactor `main.js`**

   * **Top‐level imports** now only bring in Electron (`app`, `BrowserWindow`, `ipcMain`, etc.), `ignore-manager.js`, `file-processor.js`, `watcher.js`, plus shared `utils.js`.
   * **Remove** all moved constants, caches, and functions.
   * **IPC handlers** for `'request-file-list'`, `'clear-main-cache'`, `'set-ignore-mode'`, etc., delegate to the new modules.
   * **Directory‐loading management** (`setupDirectoryLoadingTimeout` / `cancelDirectoryLoading`) and **window setup** remain here.
   * **Update watcher.js** import of `processSingleFile` to pull from `file-processor.js` instead of `main.js`.

5. **Dependency & Build**

   * No new third‐party dependencies.
   * Update any test or build scripts if they explicitly reference relocated functions.

---

**File Made**

* **ignore-manager.js**
  Encapsulates every aspect of ignore‐pattern handling and caching.
* **file-processor.js**
  Encapsulates file‐scanning, token‐counting, binary detection, and recursive directory traversal with concurrency control.
* **main.js** (refactored)
  Serves as the orchestrator: Electron lifecycle, IPC routing, directory‐loading management, watcher integration.

---

**Self Validation**

1. **Automated Tests**

   * **Unit tests** for `ignore-manager.js`: verify default excludes, `.gitignore` map recursion, contextual vs. global filtering.
   * **Unit tests** for `file-processor.js`: process known text/binary files, token counts, size limits, error conditions.
2. **Manual Smoke Tests**

   * Open a representative project folder; compare “Found X files” count and listing before/after refactor.
   * Toggle ignore modes (automatic/global); confirm identical filtered results.
   * Test file addition/change/removal events are still emitted by watcher.
   * Trigger timeout and ESC‐cancel; verify UI messages match pre‐refactor behavior.
3. **Performance Benchmark**

   * Time directory load for a large repo; ensure no regression in throughput or responsiveness.
4. **Logging & Debug**

   * Confirm logs from moved functions still appear (e.g., “\[Automatic Mode] Added…”).
   * Run in both dev and production modes; ensure `mainWindow.loadFile` and CSP setup behave unchanged.

---

**Changelog Update**

```markdown
## [Unreleased] – YYYY-MM-DD
### Refactoring
- **Extract** ignore‐pattern logic into `ignore-manager.js`
- **Extract** file processing logic into `file-processor.js`
- **Refactor** `main.js` to delegate to new modules, preserving all existing functionality
```

---