# AI-Powered Features in PasteMax

This document outlines the suite of AI-powered features recently integrated into PasteMax, enhancing its capabilities for code analysis, generation, and contextual understanding. These features aim to provide a seamless and powerful interface for interacting with various Large Language Models (LLMs).

## 1. Core AI Chat

### Purpose
The Core AI Chat provides the primary interface for users to engage in conversations with configured LLMs. It supports various providers and allows for real-time interaction, making it a versatile tool for coding assistance, knowledge retrieval, and content generation.

### How it Works
-   **Interface**: The chat functionality is primarily managed within the `ChatView.tsx` component, which presents a modal for the chat interface.
-   **Message Handling**: User messages are sent via the `handleSendMessage` function in `App.tsx`. This function constructs the payload, including message history and the current system prompt.
-   **LLM Interaction**:
    -   IPC (Inter-Process Communication) is used to send prompts to the backend service `electron/llmService.js`.
    -   `llmService.js` is responsible for making the actual API calls to the selected LLM provider (e.g., OpenRouter, Mistral, Gemini, Groq).
    -   The service handles provider-specific logic and API key management.
-   **State Management**: `App.tsx` manages crucial chat states:
    -   `chatMessages`: An array of `ChatMessage` objects for the currently active session.
    -   `isLlmLoading`: Boolean to indicate if a response is being awaited.
    -   `llmError`: Stores any error messages from the LLM interaction.
    -   `selectedModelId`: Tracks the globally or session-specifically selected LLM.
-   **Dynamic Content**: The chat view dynamically updates with user messages and AI responses, including support for loading indicators and error display.

### Key Changes
-   Integration of `ChatView.tsx` as the central hub for AI interactions.
-   Robust `handleSendMessage` logic in `App.tsx` to prepare and dispatch LLM requests.
-   Clear separation of concerns with `llmService.js` handling backend LLM communication.
-   Stateful updates for a responsive user experience.

## 2. Persistent Chat History

### Purpose
To ensure that user conversations with the AI are not lost when the chat modal is closed or the application is restarted. This allows users to refer back to previous discussions, resume conversations, and maintain context over time.

### How it Works
-   **State Management**: The `chatSessions` array in `App.tsx` holds all chat sessions. Each `ChatSession` object includes:
    -   `id`: A unique identifier for the session.
    -   `title`: A display title for the session (often derived from the first user message or target).
    -   `messages`: An array of `ChatMessage` objects.
    -   `lastUpdated`: Timestamp of the last interaction.
    -   `targetType`, `targetName`, `targetContent`: Information about the context of the chat (file, selection, or general).
    -   `modelId`, `providerConfig`: The LLM model and configuration used for that session.
    -   `isLoading`, `llmError`: Session-specific loading and error states.
-   **Persistence**:
    -   Chat sessions are saved to `localStorage` under the key `STORAGE_KEYS.CHAT_HISTORY`.
    -   Sessions are loaded from `localStorage` when the application starts.
    -   The `updateCurrentSession` function in `App.tsx` is responsible for updating the active session in `chatSessions` as new messages are added.
-   **User Control**: Users can delete individual chat sessions via the Chat Sidebar. This aligns with the user rule: "Persist Chat Context... chats should remain stored until the user explicitly deletes them."

### Key Changes
-   Implemented `ChatSession` data structure to encapsulate all necessary information for a conversation.
-   Robust `localStorage` integration for saving and loading chat history.
-   Logic in `App.tsx` to manage the lifecycle of chat sessions (creation, selection, updating, deletion).

## 3. Chat Sidebar (Session Management)

### Purpose
The Chat Sidebar, integrated within the `ChatView` modal, provides users with an organized way to manage and navigate their chat conversations.

### How it Works
-   **Display**: Lists all available `chatSessions` loaded from `localStorage`.
-   **Session Selection**:
    -   Allows users to click on a session to load its messages and context into the main chat area.
    -   Handled by the `selectChatSession` function in `App.tsx`.
-   **New Chat Creation**:
    -   Includes a "New Chat" button (or similar functionality) that triggers `handleCreateNewChat` in `App.tsx`.
    -   This function initializes a new, empty `ChatSession` and sets it as active.
-   **Session Deletion**:
    -   Provides an option to delete individual chat sessions, which calls `deleteChatSession` in `App.tsx`.
-   **Active Session Indication**: Visually indicates the currently active chat session.

### Key Changes
-   Seamless integration within `ChatView.tsx` for a unified chat experience.
-   Dedicated handler functions in `App.tsx` for all session management actions.

## 4. LLM Settings Configuration

### Purpose
To provide a centralized location for users to configure API keys, base URLs (if applicable), and other parameters for the various LLM providers supported by PasteMax.

### How it Works
-   **Interface**: `LlmSettingsModal.tsx` provides the user interface for these settings.
-   **Configuration Storage**:
    -   `App.tsx` fetches all LLM configurations using `window.llmApi.getAllConfigs()` from the backend (`llmService.js`).
    -   When settings are saved, `App.tsx` calls `window.llmApi.setAllConfigs(configs)` to persist them in the backend.
    -   The `electron/llmService.js` is responsible for the actual storage of these configurations (e.g., in Electron's `store` or a configuration file).
-   **State Management**:
    -   `allLlmConfigs` state in `App.tsx` holds the configurations for all providers.
    -   This state is passed to `LlmSettingsModal.tsx` and `ModelDropdown.tsx` to inform them of available models and their configurations.
-   **Dynamic Updates**: The application checks for API key presence before enabling chat features or sending requests, guiding users to the settings modal if keys are missing.

### Key Changes
-   Development of the `LlmSettingsModal.tsx` component.
-   Clear API between frontend (`App.tsx`) and backend (`llmService.js`) for getting and setting LLM configurations.
-   Ensured that the availability of API keys influences UI elements like the main chat button.

## 5. System Prompt Editor

### Purpose
To empower users to customize the AI's behavior, tone, and role by creating, editing, selecting, and deleting system prompts.

### How it Works
-   **Interface**: `SystemPromptEditor.tsx` provides the modal UI for managing system prompts.
-   **State Management**:
    -   `systemPrompts`: An array in `App.tsx` storing all `SystemPrompt` objects (ID, name, content, isDefault).
    -   `selectedSystemPromptId`: Tracks the currently active system prompt in `App.tsx`.
-   **Persistence**:
    -   System prompts are saved to `localStorage` under `STORAGE_KEYS.SYSTEM_PROMPTS`.
    -   Default prompts (`DEFAULT_SYSTEM_PROMPTS`) are included and merged with user-defined prompts on load.
-   **Functionality**:
    -   `handleOpenSystemPromptEditor`: Opens the editor modal.
    -   `handleSaveSystemPrompt`: Adds a new prompt or updates an existing one.
    -   `handleDeleteSystemPrompt`: Removes a custom system prompt.
    -   `handleAddNewSystemPrompt`: Initializes a new prompt object for editing.
    -   The selected system prompt's content is used by `handleSendMessage` when constructing the messages for the LLM.
-   **Default Prompts**: Users can modify the content of default prompts, but the default prompts themselves (their IDs and names) cannot be deleted, ensuring a baseline is always available.

### Key Changes
-   Creation of `SystemPromptEditor.tsx` for a dedicated management experience.
-   Robust logic in `App.tsx` for CRUD operations on system prompts and `localStorage` persistence.
-   Integration with the core chat logic to ensure the selected system prompt is used by the AI.
-   Refinement: An unused `handleResetSystemPrompt` function was removed from `App.tsx`, as the editor now manages its own UI for resetting to default content if needed.

## 6. "Send to AI" Button (Full Context Submission)

### Purpose
To enable users to send the entire content of their selected files, along with any specific instructions, directly to the AI for comprehensive analysis or processing.

### How it Works
-   **Trigger**: The "Send to AI" button is typically located within or near the `UserInstructions.tsx` component.
-   **Handler**: `handleSendInstructionsToAI` in `App.tsx` orchestrates this feature.
-   **Context Aggregation**:
    -   It retrieves the `cachedBaseContentString` from `App.tsx`, which contains the formatted content of all currently selected files (including file tree and binary paths if toggled).
    -   It combines this with the text entered in the "User Instructions" input field.
-   **Session Creation**: A new, general-purpose chat session is created specifically for this interaction.
-   **Message Sending**:
    -   The combined content is sent as the primary message content.
    -   The original user instructions (the shorter text from the input field) are passed as `originalQuestion` to `handleSendMessage`.
    -   The `isFullContextSubmission: true` flag is used to differentiate this type of message, allowing for specific display handling (e.g., showing only the user instructions part prominently in the chat UI while the full context is in the message payload).
-   **UI Indication**: The chat view opens, displaying the AI's response to the comprehensive context.

### Key Changes
-   A dedicated function (`handleSendInstructionsToAI`) in `App.tsx` to manage this specific workflow.
-   Leverages existing `cachedBaseContentString` and `userInstructions` state.
-   Modifications to `handleSendMessage` to accept and process the `isFullContextSubmission` and `originalQuestion` options for tailored UI display.

## 7. "Chat About This File"

### Purpose
To provide a quick and convenient way for users to initiate an AI chat specifically about the content of a single file selected from the file list.

### How it Works
-   **Trigger**: A button or context menu option associated with each file in the `FileList.tsx` component.
-   **Handler**: Clicking this option calls `handleChatAboutFile(filePath)` in `App.tsx`.
-   **Targeted Context**:
    -   `handleChatAboutFile` retrieves the `FileData` for the specified file.
    -   It creates a `ChatTarget` object of type `'file'`, including the file's path, name, and its full content.
-   **Session Initiation**:
    -   `handleOpenChatView(chatTarget)` is called.
    -   This function attempts to find an existing chat session for that specific file.
    -   If no existing session is found, a new `ChatSession` is created, specifically targeted to this file.
-   **Initial Message**: When the user sends their first message in this file-specific chat, the file's content is automatically prepended to the user's query before being sent to the LLM, ensuring the AI has the necessary context. The system prompt is also tailored for file discussion.

### Key Changes
-   Addition of the `handleChatAboutFile` function in `App.tsx`.
-   Enhanced `ChatTarget` and `ChatSession` types to accommodate file-specific information.
-   Logic within `handleOpenChatView` and `handleSendMessage` to correctly initialize and use the context of a file-specific chat.

## General Refinements

Throughout the implementation of these AI features, several parts of the codebase were reviewed and improved:

-   **`App.tsx` Refactoring**: Significant work was done to manage the new states and complex logic required for the AI features, including numerous `useState`, `useEffect`, and `useCallback` hooks for state management, IPC handling, and side effects.
-   **Code Cleanup**:
    -   Removed the unused `getDisplayableMessageContent` function from `src/components/ChatView.tsx`.
    -   Removed the `isSafeMode` state and its associated logic from `App.tsx` as it was unused.
    -   Commented out and later removed unused constants (`VERY_LONG_CONTENT_THRESHOLD`, `PREVIEW_LENGTH`, etc.) within the `handleSendMessage` function in `App.tsx`, as their logic was either superseded or not applicable.
    -   Removed an unused `handleBackendModeUpdateIPC` function and its IPC listener from `App.tsx`.
-   **CSS Fixes**: Addressed linter warnings in `src/styles/modals/ChatView.css` by removing empty CSS rulesets.
-   **State Normalization**: Ensured paths are consistently normalized (e.g., using `normalizePath`) for state like `selectedFolder` and `selectedFiles` to improve reliability across platforms.
-   **IPC Handling**: Improved the setup and cleanup of IPC listeners in `App.tsx` for better stability.

These enhancements contribute to a more robust, maintainable, and user-friendly application. 