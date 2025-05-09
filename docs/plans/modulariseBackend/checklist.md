
# Modularise Backend Code Checklist

Below is a comprehensive, story-by-story breakdown to fully modularise **main.js** into three files without changing any functionality.

---

### Story 1: Extract ignore-management into `electron/ignore-manager.js`

* [x] Create new file `electron/ignore-manager.js`
* [x] Copy `DEFAULT_PATTERNS` constant from `main.js` into `ignore-manager.js`
* [x] Import `excludedFiles` from `./excluded-files.js` at top of `ignore-manager.js`
* [x] Move caches `ignoreCache`, `gitIgnoreFound`, and `defaultExcludeFilter` declarations into `ignore-manager.js`
* [x] Copy functions `shouldExcludeByDefault`, `collectGitignoreMapRecursive`, `createGlobalIgnoreFilter`, `createContextualIgnoreFilter`, `shouldIgnorePath`, and `loadGitignore` into `ignore-manager.js`
* [x] Add `const ignore = require('ignore')` and `const fs = require('fs')`, `const path = require('path')` as needed
* [x] Export at bottom of `ignore-manager.js`:

  ```js
  module.exports = { loadGitignore, shouldIgnorePath, shouldExcludeByDefault, clearCaches }
  ```
* [x] Implement and export `clearCaches()` that calls `ignoreCache.clear()` and `gitIgnoreFound.clear()`
* [x] Add JSDoc comments for each exported function and constant
* [x] Run `eslint --fix electron/ignore-manager.js` and resolve any lint errors

---

### Story 2: Extract file-processing into `electron/file-processor.js`

* [ ] Create new file `electron/file-processor.js`
* [ ] Copy constants `MAX_FILE_SIZE` and `CONCURRENT_DIRS` from `main.js` into `file-processor.js`
* [ ] Move caches `fileCache` and `fileTypeCache` into `file-processor.js`
* [ ] Copy functions `isBinaryFile`, `countTokens`, `processSingleFile`, `processDirectory`, and `readFilesRecursively` into `file-processor.js`
* [ ] Import dependencies at top:

  ```js
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { default: PQueue } = require('p-queue');
  const { binaryExtensions } = require('./excluded-files');
  const { normalizePath, ensureAbsolutePath, safeRelativePath, safePathJoin, isValidPath } = require('./utils');
  const { shouldExcludeByDefault, shouldIgnorePath } = require('./ignore-manager');
  ```
* [ ] Export at bottom of `file-processor.js`:

  ```js
  module.exports = {
    processSingleFile,
    readFilesRecursively,
    isBinaryFile,
    countTokens,
    clearCaches
  };
  ```
* [ ] Implement and export `clearCaches()` that calls `fileCache.clear()` and `fileTypeCache.clear()`
* [ ] Add JSDoc comments for each exported function and constant
* [ ] Run `eslint --fix electron/file-processor.js` and resolve any lint errors

---

### Story 3: Refactor `electron/main.js` orchestrator

* [ ] Remove all ignore-logic and file-processing code blocks from `main.js`
* [ ] Add at top:

  ```js
  const { loadGitignore, shouldIgnorePath, shouldExcludeByDefault, clearCaches: clearIgnoreCaches } = require('./ignore-manager');
  const { processSingleFile, readFilesRecursively, isBinaryFile, countTokens, clearCaches: clearFileCaches } = require('./file-processor');
  ```
* [ ] In `'clear-main-cache'` IPC handler, replace direct cache clears with:

  ```js
  clearIgnoreCaches();
  clearFileCaches();
  ```
* [ ] In `'set-ignore-mode'`, after `ignoreCache.clear()`, replace with `clearIgnoreCaches(); clearFileCaches();`
* [ ] In `'request-file-list'`, replace calls to old `loadGitignore` with `loadGitignore`, and `readFilesRecursively` import
* [ ] Ensure all other IPC handlers still reference `processSingleFile`, `readFilesRecursively`, etc., via the new imports
* [ ] Run `eslint --fix electron/main.js` and resolve any lint errors
* [ ] Manually verify that nothing else in `main.js` was altered

---

### Story 4: Update `electron/watcher.js` to use `file-processor.js`

* [ ] In `watcher.js`, change

  ```js
  const { processSingleFile } = require('./main.js');
  ```

  to

  ```js
  const { processSingleFile } = require('./file-processor');
  ```
* [ ] Remove any unused imports from `main.js` in `watcher.js`
* [ ] Run `eslint --fix electron/watcher.js` and resolve any lint errors
* [ ] Smoke-test file add/change/remove in the live app to confirm watcher still sends IPC events

---

### Story 5: Update project scripts & build config

* [ ] Open `package.json` and confirm no new dependencies are needed
* [ ] Ensure test scripts reference test files under `test/`
* [ ] Run `npm run lint` and fix any errors across `electron/` directory
* [ ] Run `npm test` (after adding tests) to confirm build passes
* [ ] Update any CI config (e.g. GitHub Actions) if it filters on file globs

---

### Story 6: Unit tests for `ignore-manager.js`

* [ ] Create test file `test/ignore-manager.test.js`
* [ ] Write test for `shouldExcludeByDefault` filtering reserved Windows names
* [ ] Write test that default patterns exclude `node_modules/` and `.git/`
* [ ] Create a temp folder with nested `.gitignore` files; test `loadGitignore` returns a filter that ignores those patterns
* [ ] Test `shouldIgnorePath` in both `automatic` and `global` mode for sample paths
* [ ] Test `clearCaches()` empties `ignoreCache` and `gitIgnoreFound`
* [ ] Run tests and verify coverage ≥ 80% for `ignore-manager.js`

---

### Story 7: Unit tests for `file-processor.js`

* [ ] Create test file `test/file-processor.test.js`
* [ ] Mock `shouldExcludeByDefault` and `shouldIgnorePath` to force inclusion/exclusion
* [ ] Test `isBinaryFile` against an array of common extensions
* [ ] Test `countTokens` fallback logic (e.g. plain text length/4)
* [ ] Create small text file on disk; test `processSingleFile` reads content, counts tokens, and returns correct metadata
* [ ] Create large dummy file > `MAX_FILE_SIZE`; test `processSingleFile` marks `isSkipped` and sets `error`
* [ ] Create dummy binary file extension; test `processSingleFile` sets `isBinary` correctly
* [ ] Build a temp directory tree; test `readFilesRecursively` returns flattened list of file metadata and respects ignore filters
* [ ] Test `clearCaches()` empties `fileCache` and `fileTypeCache`
* [ ] Run tests and verify coverage ≥ 80% for `file-processor.js`

---

### Story 8: Manual smoke-testing of refactored app

* [ ] Document steps in `TEST_PLAN.md`
* [ ] Launch Electron app, open a known repo, record “Found X files” count
* [ ] Confirm post-refactor “Found X files” matches pre-refactor
* [ ] Switch ignore mode between **automatic** and **global**; confirm file list identical
* [ ] Create a new file in watched folder; verify `file-added` IPC event arrives
* [ ] Modify an existing file; verify `file-updated` IPC event arrives
* [ ] Delete a file; verify `file-removed` IPC event arrives
* [ ] Press **ESC** during a large directory scan; confirm cancellation message appears
* [ ] Let a scan time out (>5 minutes) on a large folder; confirm timeout message appears

---

### Story 9: Performance benchmarking

* [ ] Select a large repository (\~100 000 files)
* [ ] Measure and log scan duration pre-refactor (use console timestamps)
* [ ] Repeat after refactor; log scan duration
* [ ] Compare durations and ensure post-refactor ≤ 105% of pre-refactor
* [ ] Record results in `PERFORMANCE.md`

---

### Story 10: Logging verification

* [ ] Run app in **development** mode; confirm logs from `ignore-manager` (e.g. `[Default Exclude]`, `[Automatic Mode]`) appear
* [ ] Run app in **production** mode; confirm CSP header logs and `createWindow` logs remain intact
* [ ] Spot-check that moved functions still emit their original `console.log`/`console.error` statements

---

### Story 11: Changelog update

* [ ] Open `CHANGELOG.md`
* [ ] Under `## [Unreleased] – YYYY-MM-DD`, add:

  * `Extract ignore-management logic into electron/ignore-manager.js`
  * `Extract file-processing logic into electron/file-processor.js`
  * `Refactor main.js to delegate to new modules`
* [ ] Save, commit, and tag PR with appropriate JIRA/GitHub issue number

---
