The goal is to refactor the ignore pattern handling logic in `main.js` to clearly separate the 'automatic' (.gitignore scanning) and 'global' (static list + custom ignores) modes.

**Context:**

- **Problem:** The current `loadGitignore` function handles both 'automatic' and 'global' modes. Attempts to use it for the 'global' mode during file listing (`request-file-list` -> `readFilesRecursively`) have failed because `readFilesRecursively` was incorrectly falling back to calling `loadGitignore` with default ('automatic') settings, overriding the intended 'global' mode and custom ignores (like 'docs').
- **User Requirement:** The user wants `loadGitignore` to be dedicated to the 'automatic' mode. A _new_, separate function should handle the 'global' mode logic.
- **Previous Attempt:** A previous fix tried to force `loadGitignore` to use 'global' mode within `readFilesRecursively`, but this was incorrect and didn't work.
- **Missing Information:** The `request-file-list` IPC handler currently doesn't receive the active `mode` ('automatic' or 'global') or the `customIgnores` list from the renderer process. The refactor needs to account for this.
- **`main.js` Content:** (The full content was provided in the initial request that triggered this workflow).
- **`excluded-files.js`:** This file exports the `excludedFiles` array used for default/global ignores.

**Task:**

1.  **Create New Function:** Implement a new asynchronous function, e.g., `createGlobalIgnoreFilter(customIgnores = [])`, that:
    - Takes an array of `customIgnores` as input.
    - Creates an `ignore` instance.
    - Adds patterns from the `excludedFiles` array (imported from `./excluded-files.js`).
    - Adds the provided `customIgnores`.
    - Returns the configured `ignore` instance (the filter).
    - This function should _not_ scan the filesystem for `.gitignore` files.
2.  **Refactor `loadGitignore`:** Modify the existing `loadGitignore` function:
    - Remove the `mode` and `customIgnores` parameters from its signature.
    - Remove all logic related to the 'global' mode.
    - Ensure it _only_ implements the 'automatic' mode logic: scanning for `.gitignore` files recursively downwards, combining found patterns with a set of default patterns (like `.git`, `node_modules`, etc., potentially reusing the `defaultPatterns` array already present or refining it), and returning the configured `ignore` instance.
    - Update the caching logic (`ignoreCache`) within this function to only cache results for the 'automatic' mode, using `rootDir` as the key.
3.  **Update `get-ignore-patterns` Handler:** Modify the `ipcMain.handle("get-ignore-patterns", ...)` handler:
    - Based on the incoming `mode` parameter:
      - If `mode === 'global'`, call the new `createGlobalIgnoreFilter(customIgnores)` function. Return its patterns appropriately (e.g., `{ patterns: { global: [...excludedFiles, ...customIgnores] } }`). Implement caching based on `rootDir`, `mode`, and `customIgnores`.
      - If `mode === 'automatic'`, call the refactored `loadGitignore(folderPath)` function. Return its patterns appropriately (e.g., `{ patterns: { gitignoreMap: ... } }`). Use the cache within `loadGitignore`.
4.  **Update `request-file-list` Handler:** Modify the `ipcMain.on("request-file-list", ...)` handler:
    - **Assumption:** Assume this handler will receive the current `mode` and `customIgnores` from the renderer via the event data (e.g., `event, { folderPath, mode, customIgnores }`). **Add a clear comment** indicating that `mode` and `customIgnores` need to be passed from the renderer.
    - Inside the `try` block, _before_ calling `readFilesRecursively`:
      - Determine which ignore function to call based on the _assumed_ `mode`.
      - Call either `createGlobalIgnoreFilter(customIgnores)` or `loadGitignore(folderPath)` to get the `ignoreFilter`.
      - Pass this obtained `ignoreFilter` explicitly to the `readFilesRecursively` call.
5.  **Update `readFilesRecursively` Function:** Modify the `readFilesRecursively` function:
    - It must now _require_ the `ignoreFilter` to be passed as a parameter.
    - Remove the fallback logic (around line 689) where it calls `loadGitignore` itself (`ignoreFilter = ignoreFilter || await loadGitignore(rootDir);`).

**Deliverable:**

- Provide the necessary modifications to `main.js` as a diff against the original file content provided earlier.
- Use the `attempt_completion` tool. The `result` should summarize the refactoring performed, highlighting the new function, the changes to existing functions/handlers, and **explicitly mention the assumption made about `mode` and `customIgnores` being passed to `request-file-list`**.

**Constraint:** Only perform the refactoring described. Do not introduce other functional changes. These instructions supersede any conflicting general instructions for the Refactor Specialist mode.
