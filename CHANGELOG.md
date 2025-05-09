## [1.0.2] - 2025-05-07

### Refactor

- **Core Logic Modularization:** Initiated a significant refactor to modularize the backend logic previously concentrated in `electron/main.js`.
  - Extracted file system interaction, file processing, and token counting logic into a new dedicated module: `electron/file-processor.js`.
  - Extracted all ignore logic (handling `.gitignore` files, default patterns, global ignores, and contextual filtering) into a new dedicated module: `electron/ignore-manager.js`.
- **Ignore Logic Enhancements (`electron/ignore-manager.js`):**
  - Renamed several functions and internal variables for improved clarity and consistency. Key renames include:
    - `defaultIgnoreFilter` (global variable) to `systemDefaultFilter`
    - `ignorePatternsCache` (global variable) to `rawGitignorePatternsCache`
    - `shouldExcludeByDefault()` to `isPathExcludedByDefaults()`
    - `shouldIgnorePath()` to `isPathIgnoredByActiveFilter()`
    - `loadGitignore()` to `loadAutomaticModeIgnoreFilter()`
    - `createGlobalIgnores()` to `createGlobalIgnoreFilter()`
  - Ensured all exported functions and variables use the new naming convention.
- **Integration Updates:**
  - Updated `electron/main.js` to import and utilize functions from the new `electron/file-processor.js` and `electron/ignore-manager.js` modules, reducing its direct responsibilities.
  - Updated `electron/file-processor.js` to correctly import and use the refactored functions and variables from `electron/ignore-manager.js`.

### Changed

- Improved separation of concerns in the Electron main process, leading to more maintainable and testable code.
- Enhanced clarity of ignore handling mechanisms through explicit function naming in `ignore-manager.js`.
