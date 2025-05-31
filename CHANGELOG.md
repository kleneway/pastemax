## [1.1.1] - 2025-05-23

### Added

- **Sidebar Folder Navigation:**
  - Added "Collapse All" and "Expand All" buttons to the file tree sidebar for easier navigation of folder structures, using `FolderMinus` and `FolderPlus` icons respectively.
  - Implemented functionality to recursively collapse or expand all directory nodes.

### Improved

- **Changed all main button in Header and Sidebar to use Lucide React Icons:**
  - Adjusted the buttons used in the header and sidebar to use Lucide React Icons for a more modern and consistent look.
- **UI Consistency for Selected Folder Display:**
  - The header area that displays the selected folder path now consistently uses the `.selected-folder` class.
  - When no folder is selected, the text "No Folder Selected" is displayed within the same styled `div`, ensuring visual consistency with when a folder path is shown.
  - When no folder is selected the message "Select Folder" is now using the folder icon from Lucide React Icons.
- **Sidebar Action Button States:**
  - Differentiated `:hover`, `:focus`, and `:active` CSS states for sidebar action buttons (`.sidebar-action-btn`) to prevent the "stuck" hover appearance after clicking and improve visual feedback.

## [1.1.0] - 2025-05-18

### Features Added

- **Automatic Folder Selection for New Workspaces:**

  - When no folder is selected and the user creates a new workspace, the folder selector now automatically opens, prompting the user to choose a folder for the newly created workspace.

- **Prompt to Use Current Folder for New Workspace:**

  - If a folder is already loaded, creating a new workspace now prompts the user to confirm whether they want to use the currently selected folder as the workspace folder.

- **Opt-Out Option for Folder Reuse:**

  - Users can opt out of reusing the current folder. If they choose not to reuse it, the folder selector will open as usual to let them pick a folder for the new workspace.

- **Workspace Folder Override:**

  - Once a folder is selected for a workspace, it overrides the currently loaded folder with the newly assigned workspace folder.

- **Proper Workspace Clearing on "Clear All":**

  - Performing a "Clear All" action in @/src/App.tsx now fully clears the current workspace state, ensuring the user is not left in any workspace.
  - This prevents accidental overwrites when reselecting a folder without properly assigning it to a workspace.

- **Complete UI Overhaul:**
  - Improved UI consistencies throughout the application
  - Completely revamped copy settings section
  - Made overall interface look neater and more professional

## [1.0.12] - 2025-05-18

### Features

- **Model Contest Limit:**
  - Added model token limit visualization in the UI
  - Dropwdown for selecting models with token limits
  - Added clear indicators when exceeding token limits
- **Copy History:**
  - Implemented a system to track and display copied content history
- **Full Context View:**
  - Added ability to see full context of copied content in history
- **Resizable User Instructions:**
  - Added vertical, horizontal, and corner resizing handles with min/max constraints and persistence via localStorage

### Implementation Details

- User Instructions now maintain size preferences between sessions
- Copy History modal displays recent copies with timestamps
- Full context view allows users to see the complete copied content
- Added token limit visualization with warning levels

## [1.0.10] - 2025-05-18

### Improved

- **WSL Path Handling and Folder Picker Experience:**
  - Fixed all path normalization and comparison logic for WSL folders, ensuring consistent selection, deselection, and file tree operations for WSL paths.
  - Updated `src/utils/pathUtils.ts` and `electron/utils.js` to always normalize WSL paths to a consistent `//wsl.localhost/` or `//wsl$/` prefix.
  - Improved folder picker dialog logic:
    - On Windows, the folder picker now only defaults to the WSL root (`\\wsl$\`) if the last selected folder was a WSL path. Otherwise, it opens to the standard Windows location.
    - Users can now browse and select WSL folders directly from the dialog, but Windows users who primarily use local folders are not forced into the WSL view.
    - The renderer now sends the last selected folder to the main process for context-aware dialog behavior.
  - Refactored `open-folder` IPC handler in `electron/main.js` to support this smarter logic and use the new `isWSLPath` utility.

### Fixed

- **WSL File Selection:**
  - Resolved an issue where selecting or deselecting files/folders in WSL directories would fail with "No selectable files found in folder" due to inconsistent path normalization.
  - Fixed edge cases where WSL paths with different slashes or UNC prefixes were not recognized as equivalent.

### Technical

- Added/updated utility functions in both frontend and backend for robust cross-platform path handling.
- Improved code comments and maintainability for all path-related logic.
- Updated CHANGELOG.md to reflect all improvements and fixes.

---

## [1.0.9] - 2025-05-17

### Added

- **Automatic Update Checker:**

  - Automatically check for new updates from the latest GitHub release.
  - The update checker is fired up on app launch and can be triggered manually from the header.
  - The update status is displayed in a modal with clear download links for the latest release.

- **Update Checker UI Enhancements:**
  - The update check button in the header now uses the same base styles as the modal's `.check-updates-button` (from `UpdateModal.css`) when no update is available.
  - When an update is available, the button's background and text color are overridden to use `backgroundColor: var(--color-accent, #0e639c)` and `color: var(--color-accent, #ffffff)`.
  - The "Update Available!" label is now positioned directly below the update button and styled for visibility.

### Changed

- **Update Checker Behavior:**
  - The automatic update check on app launch is now disabled in development mode (`process.env.NODE_ENV === 'development'`). In dev, the renderer receives a "no update" status immediately.
  - The update check button's style logic in `src/App.tsx` was refactored to conditionally apply override styles only when an update is available.

### Fixed

- **UI Consistency:**
  - Ensured the update check button in the header matches the modal's button style when no update is available.
  - Fixed the position of the "Update Available!" label so it always appears directly below the update button.

## [1.0.8] - 2025-05-17

### Changed

- **CSS Modularization:**
  - Broke down the large `src/styles/index.css` into smaller, component-specific and layout-specific `.css` files organized in subdirectories (`header`, `sidebar`, `contentarea`, `modals`, `base`).
  - `index.css` now primarily contains CSS variables (Design System), global resets, and base styles.
  - Legacy styles remain in their respective files; future CSS work should use modular files for new components and features.
  - All `.css` files are imported in `src/main.tsx` for global availability.
  - A backup of the original `index.css` is stored at `src/styles/backup/index.css.bak`.
  - Guidance for future contributions and modularization strategy documented in `src/styles/README.md`.

## [1.0.7] - 2025-05-16

### Added

- `WorkspaceManager.tsx` feature:
  - Allows users to create and manage multiple workspaces
  - Each workspace can have its own set of folders and files
  - Users can switch between workspaces easily
  - Workspace data is persisted between sessions

### Improved

- **UI Improvements**:
  - Enhanced workspace manager modal with clear visual hierarchy
  - Improved action buttons with distinct colors for better visibility
  - Fixed styling issues with workspace item display

## [1.0.6] - 2025-05-13

### Added:

- `TaskTypeSelector.tsx` feature:

  - Allows users to select and manage task types
  - Users can create custom task types with specific prompts
  - Task types are stored in localStorage for persistence
  - UI improvements for better user experience

- `CustomTaskTypeModal.tsx` feature:

  - Modal for creating and editing custom task types
  - Users can define task type names and associated prompts
  - Improved error handling for invalid inputs

- Task type selection dropdown in the sidebar
- Default task types (None, Feature, Refactor, Question, Debug)
- Custom task type creation and management
- Persistent storage of task types in localStorage
- Task-specific prompts that automatically populate the instructions area
- UI improvements and error handling for the task type system

### Technical Details:

- Added `TaskTypeSelector` component to manage task type selection
- Created `CustomTaskTypeModal` for adding/editing custom task types
- Implemented proper state management for task types
- Fixed error handling to prevent undefined object references
- Added localStorage integration for persistence across sessions

## [1.0.5] - 2025-05-10

### Improved

- **Tokenization Accuracy and Consistency:**
  - Standardized token counting to use the `o200k_base` encoding across the application.
  - The displayed token count now accurately reflects the entire formatted output, including file contents, file tree (if enabled), user instructions, and all formatting tags.

### Fixed

- Resolved an issue where the token count was not accurately reflecting the entire formatted output.

### Changed

- Refactored token counting mechanism:
  - The renderer process (`src/App.tsx`) now prepares the complete string for copying.
  - This string is then sent to the main process (`electron/main.js`) via an IPC channel (`get-token-count`).
  - The main process performs the tokenization using the `countTokens` function from `electron/file-processor.js`, ensuring consistent use of the `o200k_base` encoder.

## [1.0.4] - 2025-05-09

### Added

- **Update Checker Feature:**
  - Introduced an in-app Update Checker accessible from the main UI.
  - Added `UpdateModal` React component for update status and Github release download links.
  - Implemented backend GitHub release integration (`electron/update-checker.js`).
  - Added session-based caching in `electron/update-manager.js` to prevent repeated API calls.
  - IPC integration for renderer/main process communication.

### Fixed

- **Update Checker Robustness:**
  - Prevented repeated GitHub API calls by caching update results for the session.
  - Removed retry/re-check buttons from the modal to avoid rate limiting and UI confusion.
  - Ensured update status is consistent and only one API call is made per session.
  - Fixed TypeScript type error in update modal state logic.

## [1.0.3] - 2025-05-09

### Fixed

- **File Watching Improvements:**
  - Resolved issues with watched folder synchronization:
    - File removal now properly triggers updates
    - New file additions are correctly detected
    - File content changes are now reflected immediately after refreshing
  - Added refresh button to refresh when files are added, removed, or modified
  - Resolved circular dependency issues in the `electron/main.js` file, improving stability and performance.

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

## [Unreleased]

### Added

- Direct Send User Instructions to AI Chat: Added a "Send to AI" button in the User Instructions panel to allow sending the current instructions directly to the AI chat as a user message.

### Changed

- ...

### Fixed

- ...

### Removed

- ...
