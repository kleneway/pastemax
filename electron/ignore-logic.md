# PasteMax Ignore Logic

## Introduction

This document outlines the ignore logic used within PasteMax to filter files during directory processing and for display purposes. Understanding this logic is crucial for debugging and extending file filtering capabilities. PasteMax supports two main ignore modes: "Automatic" and "Global".

## Core Ignore Pattern Lists

These are foundational lists of patterns used by the ignore system.

1. **`DEFAULT_PATTERNS`**

   - **Location:** `electron/ignore-manager.js`
   - **Purpose:** A universal baseline set of ignore patterns (e.g., `.git`, `node_modules`, common build artifacts, OS-specific files).
   - **Applied:** Always, in both "Automatic" and "Global" modes. These patterns form the very first layer of filtering.

2. **`GlobalModeExclusion`**

   - **Location:** `electron/ignore-manager.js` (moved from `electron/excluded-files.js`)
   - **Purpose:** Contains additional common project/build-related file patterns that should be ignored _specifically_ when PasteMax is operating in "Global" ignore mode. These supplement `DEFAULT_PATTERNS`.
   - **Applied:** Only in "Global" mode, in addition to `DEFAULT_PATTERNS`.

3. **`binaryExtensions`**

   - **Location:** `electron/excluded-files.js`
   - **Purpose:** Defines a list of file extensions that are always treated as binary. This affects their selectability in the UI and how their content is processed (or not processed).
   - **Applied:** Universally, regardless of the ignore mode.

## User-Provided Ignores

These patterns come from the user's project or direct input.

1. **`.gitignore` files**

   - **Source:** Standard `.gitignore` files found within the selected project directory and its subdirectories.
   - **Applied:** Only in "Automatic" mode. PasteMax processes these files hierarchically, meaning rules in a subdirectory's `.gitignore` can override or add to rules from parent directories, up to the project root.

2. **`customIgnores`**

   - **Source:** User input via the "Ignore Patterns Viewer" modal in the UI. These are stored in `localStorage` (managed by the `useIgnorePatterns` hook in `src/hooks/useIgnorePatterns.ts`).
   - **Applied:** Only in "Global" mode. These are added to `DEFAULT_PATTERNS` and `GlobalModeExclusion` to form the complete global ignore set.

## Filter Construction & Application

The way ignore filters are built and used differs between the two modes:

### Automatic Mode

- **Primary Filter Construction (for `readFilesRecursively`):**

  1. Starts with `DEFAULT_PATTERNS`.
  2. Recursively scans the selected directory for `.gitignore` files.
  3. Patterns from found `.gitignore` files are added, respecting their hierarchical nature (e.g., a pattern in `./src/.gitignore` applies within `./src` and its subdirectories).

  - The `loadGitignore` function in `electron/ignore-manager.js` handles the initial collection for the root, and `createContextualIgnoreFilter` refines this for subdirectories during recursion in `electron/file-processor.js`.

- **`shouldExcludeByDefault` (determines the `excluded` flag for UI display):**

  - In Automatic mode, a file is flagged as `excludedByDefault` if it matches `DEFAULT_PATTERNS` or certain OS-specific/reserved path checks.
  - `.gitignore` rules and `GlobalModeExclusion` do _not_ influence this specific flag in Automatic mode.

### Global Mode

- **Primary Filter Construction (for `readFilesRecursively`):**

  1. Combines `DEFAULT_PATTERNS`, `GlobalModeExclusion`, and any user-defined `customIgnores`.

  - This is handled by the `createGlobalIgnoreFilter` function in `electron/ignore-manager.js`.
  - `.gitignore` files are _not_ read or used in this mode.

- **`shouldExcludeByDefault` (determines the `excluded` flag for UI display):**

  - In Global mode, a file is flagged as `excludedByDefault` if it matches `DEFAULT_PATTERNS`, `GlobalModeExclusion`, or OS-specific/reserved path checks.
  - `customIgnores` do _not_ influence this specific flag (though they do affect actual filtering).

## Key Functions & Modules

- **`electron/ignore-manager.js`:**

  - `DEFAULT_PATTERNS`, `GlobalModeExclusion`: Core pattern arrays.
  - `defaultIgnoreFilter`: Pre-compiled `ignore` instance for `DEFAULT_PATTERNS`.
  - `loadGitignore()`: Builds the main ignore filter for Automatic Mode.
  - `createGlobalIgnoreFilter()`: Builds the main ignore filter for Global Mode.
  - `createContextualIgnoreFilter()`: Refines ignore filters for subdirectories in Automatic Mode.
  - `shouldExcludeByDefault()`: Determines the UI `excluded` flag based on mode.
  - `shouldIgnorePath()`: Checks if a path should be ignored by a given filter instance.

- **`electron/main.js`:**

  - `request-file-list` IPC handler: Sets up the initial `ignoreFilter` based on `payload.ignoreMode` and passes it to `readFilesRecursively`.
  - `get-ignore-patterns` IPC handler: Provides pattern lists to the UI (`IgnorePatternsViewer.tsx`) for display. Includes `DEFAULT_PATTERNS`, `GlobalModeExclusion`, and `customIgnores` for Global mode display, and `gitignoreMap` for Automatic mode.

- **`electron/file-processor.js`:**

  - `processDirectory()`: In Automatic mode, calls `createContextualIgnoreFilter` to get the correct filter for the current subdirectory.
  - `readFilesRecursively()`: Applies the determined `ignoreFilter` to files and directories.

- **`src/hooks/useIgnorePatterns.ts`:**

  - Manages `ignoreMode` and `customIgnores` state on the frontend.
  - Fetches patterns from the backend via `get-ignore-patterns` for display.

- **`src/components/IgnorePatternsViewer.tsx`:**

  - Displays the fetched ignore patterns.
  - Allows users to switch `ignoreMode` and manage `customIgnores`.

## Caching

- `ignoreCache` (in `electron/ignore-manager.js`): Caches compiled `ignore` filter instances, keyed by root directory and mode (e.g., `"/path/to/project:automatic"` or `"/path/to/project:global:customHash"`). This speeds up subsequent loads for the same directory and settings.
- `gitIgnoreFound` (in `electron/ignore-manager.js`): Caches the raw patterns read from individual `.gitignore` files to avoid re-reading them during a single recursive scan.
- `clearIgnoreCaches()`: Function to invalidate these caches, typically called when ignore settings change or a full refresh is needed.

This documentation should provide a clear overview of how ignore patterns are managed and applied in PasteMax.
