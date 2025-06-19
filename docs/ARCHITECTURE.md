# PasteMax Architecture

This document provides a high-level overview of the PasteMax application's architecture, data flow, and core components.

## Core Technologies

- **Framework:** [Electron](https://www.electronjs.org/) for cross-platform desktop application development.
- **Frontend:** [React](https://reactjs.org/) with [TypeScript](https://www.typescriptlang.org/) for building the user interface.
- **Build Tool:** [Vite](https://vitejs.dev/) for fast development and optimized production builds.
- **Tokenizer:** [Tiktoken](https://github.com/openai/tiktoken) for accurate language model token counting.
- **File Watching:** [Chokidar](https://github.com/paulmillr/chokidar) for efficient file system monitoring.

## Application Structure

The application is divided into three main parts:

1.  **Electron Main Process (`electron/`)**: The backend of the application, running in a Node.js environment. It manages the application lifecycle, windows, and native operating system interactions (like file dialogs). It's also responsible for all heavy lifting, such as file system scanning and processing.
2.  **Preload Script (`electron/preload.js`)**: A secure bridge that exposes a limited, controlled API from the Main Process to the Renderer Process via `contextBridge`. This is crucial for maintaining Electron's security model.
3.  **Renderer Process (`src/`)**: The frontend of the application, running in a browser-like environment (Chromium). This is where the React application lives, handling all UI rendering and user interactions.

## Key Architectural Concepts

### 1. Lazy Loading & On-Demand Processing

To handle large repositories efficiently, PasteMax uses a lazy-loading approach:

-   **Initial Scan:** When a folder is selected, the Main Process performs a **lightweight scan**. It only gathers file metadata (path, name, size) and calculates an *estimated* token count based on file extension and size, without reading file content. This makes the initial load extremely fast.
-   **On-Demand Processing:** The actual file content is only read and tokenized when a file is selected by the user in the UI. The Renderer sends an IPC request (`process-selected-files`) to the Main Process, which then reads the file, calculates the precise token count, and sends the updated data back.
-   **User Feedback:** The UI clearly indicates when a file has an estimated token count (`~123 est`) and shows a loading spinner next to files that are being processed on-demand.

### 2. IPC (Inter-Process Communication)

Communication between the Main and Renderer processes is handled exclusively through IPC channels defined in `electron/main.js` and exposed via `electron/preload.js`.

-   **Renderer to Main (`invoke`):** For actions that require a response, like fetching data (`get-ignore-patterns`, `process-selected-files`).
-   **Main to Renderer (`send`):** For pushing updates to the UI, such as file system changes from the watcher (`file-added`, `file-updated`, `file-removed`) or processing status updates.

### 3. Ignore Logic (`electron/ignore-manager.js`)

PasteMax supports two modes for ignoring files:

-   **Automatic Mode:** Respects `.gitignore` files found within the project directory. It traverses the directory structure, applying rules hierarchically.
-   **Global Mode:** Uses a predefined set of global ignore patterns (e.g., `node_modules`, build artifacts) and any custom patterns defined by the user.

This logic is centralized in `ignore-manager.js` to ensure consistent filtering during both initial scans and file watching.

### 4. File System Watcher (`electron/watcher.js`)

-   A single, persistent `chokidar` instance monitors the selected folder for changes.
-   It is initialized *after* the initial file scan is complete.
-   It uses the same ignore logic as the initial scan to avoid processing ignored files.
-   Events (`add`, `change`, `unlink`) are debounced and trigger IPC messages to the Renderer, which then updates the UI reactively.
-   The watcher's lifecycle is carefully managed to prevent resource leaks, shutting down and restarting when the user selects a new folder or changes ignore settings.

### 5. State Management (Frontend)

-   The primary application state is managed within the `App.tsx` component using React hooks (`useState`, `useEffect`, `useCallback`).
-   Stateful logic is further modularized into custom hooks:
    -   `useWorkspaces`: Manages workspace creation, selection, and persistence.
    -   `useIgnorePatterns`: Manages ignore mode and custom ignore patterns.
    -   `useModels`: Manages fetching and selecting LLM models.
-   State related to the user's session (e.g., selected folder, files, UI settings) is persisted to `localStorage`.

This architecture ensures a responsive user experience by deferring heavy work, provides a secure communication channel between the frontend and backend, and organizes code into maintainable, single-responsibility modules.