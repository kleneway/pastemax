/* ============================== IMPORTS ============================== */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConfirmUseFolderModal from './components/ConfirmUseFolderModal';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import { FileData, IgnoreMode } from './types/FileTypes';
import { ThemeProvider } from './context/ThemeContext';
import IgnoreListModal from './components/IgnoreListModal';
import ThemeToggle from './components/ThemeToggle';
import UpdateModal from './components/UpdateModal';
import { useIgnorePatterns } from './hooks/useIgnorePatterns';
import UserInstructions from './components/UserInstructions';
import {
  DownloadCloud,
  ArrowDownUp,
  FolderKanban,
  MessageSquare,
  FolderOpen,
  XCircle,
  RefreshCw,
  FilterX,
} from 'lucide-react';
import CustomTaskTypeModal from './components/CustomTaskTypeModal';
import TaskTypeSelector from './components/TaskTypeSelector';
import WorkspaceManager from './components/WorkspaceManager';
import { Workspace } from './types/WorkspaceTypes';
import CopyHistoryModal, { CopyHistoryItem } from './components/CopyHistoryModal';
import CopyHistoryButton from './components/CopyHistoryButton';
import ModelDropdown from './components/ModelDropdown';
import ToggleSwitch from './components/base/ToggleSwitch';
import LlmSettingsModal from './components/LlmSettingsModal';
import ChatView from './components/ChatView';
import ChatButton from './components/ChatButton';
import {
  AllLlmConfigs,
  ChatMessage,
  ChatTarget,
  LlmProvider,
  ProviderSpecificConfig,
  LlmApiWindow,
  MessageRole,
  SystemPrompt,
} from './types/llmTypes';
import SystemPromptEditor from './components/SystemPromptEditor';
import { ChatSession } from './components/ChatHistorySidebar';
import { normalizePath, arePathsEqual, isSubPath, dirname } from './utils/pathUtils';
import { formatBaseFileContent, formatUserInstructionsBlock } from './utils/contentFormatUtils';
import type { UpdateDisplayState } from './types/UpdateTypes';
import { isChatSession, isWorkspace } from './utils/typeguards';
import { DEFAULT_SYSTEM_PROMPTS } from './config/defaultSystemPrompts';

// Augment the Window interface
declare global {
  interface Window {
    electron: any;
    llmApi: LlmApiWindow['llmApi'];
  }
}

const STORAGE_KEYS = {
  SELECTED_FOLDER: 'pastemax-selected-folder',
  INCLUDE_FILE_TREE: 'pastemax-include-file-tree',
  INCLUDE_BINARY_PATHS: 'pastemax-include-binary-paths',
  SELECTED_FILES: 'pastemax-selected-files',
  SORT_ORDER: 'pastemax-sort-order',
  SEARCH_TERM: 'pastemax-search-term',
  USER_INSTRUCTIONS: 'pastemax-user-instructions',
  EXPANDED_NODES: 'pastemax-expanded-nodes',
  IGNORE_MODE: 'pastemax-ignore-mode',
  IGNORE_SETTINGS_MODIFIED: 'pastemax-ignore-settings-modified',
  THEME: 'pastemax-theme',
  RECENT_FOLDERS: 'pastemax-recent-folders',
  WORKSPACES: 'pastemax-workspaces',
  CURRENT_WORKSPACE: 'pastemax-current-workspace',
  WINDOW_SIZES: 'pastemax-window-sizes',
  TASK_TYPE: 'pastemax-task-type',
  COPY_HISTORY: 'pastemax-copy-history',
  CHAT_HISTORY: 'pastemax-chat-history',
  CURRENT_CHAT_SESSION: 'pastemax-current-chat-session',
  SYSTEM_PROMPTS: 'pastemax-system-prompts',
  SELECTED_SYSTEM_PROMPT_ID: 'pastemax-selected-system-prompt-id',
};

const App = (): JSX.Element => {
  const savedFolder = localStorage.getItem(STORAGE_KEYS.SELECTED_FOLDER);
  const [selectedFolder, setSelectedFolder] = useState(
    savedFolder ? normalizePath(savedFolder) : null
  );
  const isElectron = window.electron !== undefined;
  const [allFiles, setAllFiles] = useState<FileData[]>([]);
  // ... other non-LLM state initializations from your App.tsx file ...
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    localStorage.getItem(STORAGE_KEYS.CURRENT_WORKSPACE)
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const savedWorkspaces = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
      if (savedWorkspaces) {
        const parsedWorkspaces = JSON.parse(savedWorkspaces);
        if (Array.isArray(parsedWorkspaces)) {
          const validWorkspaces = parsedWorkspaces.filter((ws) => {
            if (isWorkspace(ws)) {
              return true;
            }
            console.warn('Invalid workspace object found in localStorage:', ws);
            return false;
          });
          return validWorkspaces;
        }
      }
    } catch (error) {
      console.error('Error loading or validating workspaces from localStorage:', error);
    }
    return [];
  });
  const [isConfirmUseFolderModalOpen, setIsConfirmUseFolderModalOpen] = useState(false);
  const [confirmFolderModalDetails, setConfirmFolderModalDetails] = useState<{
    workspaceId: string | null;
    workspaceName: string;
    folderPath: string;
  }>({ workspaceId: null, workspaceName: '', folderPath: '' });
  const {
    isIgnoreViewerOpen,
    ignorePatterns,
    ignorePatternsError,
    handleViewIgnorePatterns,
    closeIgnoreViewer,
    ignoreMode,
    customIgnores,
    ignoreSettingsModified,
    resetIgnoreSettingsModified,
  } = useIgnorePatterns(selectedFolder, isElectron);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(
    localStorage.getItem(STORAGE_KEYS.SELECTED_FILES)
      ? JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_FILES)!).map(normalizePath)
      : []
  );
  const [sortOrder, setSortOrder] = useState<string>(
    localStorage.getItem(STORAGE_KEYS.SORT_ORDER) || 'tokens-desc'
  );
  const [searchTerm, setSearchTerm] = useState<string>(
    localStorage.getItem(STORAGE_KEYS.SEARCH_TERM) || ''
  );
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [displayedFiles, setDisplayedFiles] = useState<FileData[]>([]);
  const [processingStatus, setProcessingStatus] = useState<{
    status: 'idle' | 'processing' | 'complete' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  const [includeFileTree, setIncludeFileTree] = useState(false);
  const [includeBinaryPaths, setIncludeBinaryPaths] = useState(
    localStorage.getItem(STORAGE_KEYS.INCLUDE_BINARY_PATHS) === 'true'
  );
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState<string>('');
  const [isCustomTaskTypeModalOpen, setIsCustomTaskTypeModalOpen] = useState(false);
  const [userInstructions, setUserInstructions] = useState<string>('');
  const [totalFormattedContentTokens, setTotalFormattedContentTokens] = useState(0);
  const [cachedBaseContentString, setCachedBaseContentString] = useState('');
  const [cachedBaseContentTokens, setCachedBaseContentTokens] = useState(0);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const lastSentIgnoreSettingsModifiedRef = useRef<boolean | null>(null);
  const [copyHistory, setCopyHistory] = useState<CopyHistoryItem[]>(() => {
    try {
      const savedHistory = localStorage.getItem(STORAGE_KEYS.COPY_HISTORY);
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory)) {
          // Optional: Validate each item in parsedHistory if necessary
          return parsedHistory;
        }
      }
    } catch (error) {
      console.error('Error loading copy history from localStorage:', error);
    }
    return []; // Default to empty array if nothing saved or error occurs
  });
  const [isCopyHistoryModalOpen, setIsCopyHistoryModalOpen] = useState(false);

  // LLM and Chat State
  const [allLlmConfigs, setAllLlmConfigs] = useState<AllLlmConfigs | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    localStorage.getItem('pastemax-selected-model') || ''
  );
  const [recentModels, setRecentModels] = useState<{ [key: string]: string[] }>({});
  const [isLlmSettingsModalOpen, setIsLlmSettingsModalOpen] = useState(false);
  const [isChatViewOpen, setIsChatViewOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTarget, setChatTarget] = useState<ChatTarget | undefined>(undefined);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    console.log(
      `[App.tsx Init] Attempting to load chat sessions from localStorage key: ${STORAGE_KEYS.CHAT_HISTORY}`
    );
    try {
      const savedSessions = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      console.log(
        `[App.tsx Init] Raw savedSessions from localStorage:`,
        savedSessions ? savedSessions.substring(0, 100) + '...' : 'null'
      );
      if (savedSessions) {
        const parsedSessions = JSON.parse(savedSessions);
        console.log(
          `[App.tsx Init] Parsed sessions (first item if array):`,
          Array.isArray(parsedSessions) && parsedSessions.length > 0
            ? parsedSessions[0]
            : parsedSessions
        );
        if (Array.isArray(parsedSessions)) {
          const validSessions = parsedSessions.filter((session) => {
            const isValid = isChatSession(session);
            if (!isValid) {
              console.warn('[App.tsx Init] Invalid chat session found in localStorage:', session);
            }
            return isValid;
          });
          console.log(
            `[App.tsx Init] Number of valid sessions found: ${validSessions.length} out of ${parsedSessions.length}`
          );
          return validSessions;
        }
        console.warn(
          '[App.tsx Init] Parsed sessions from localStorage was not an array.',
          parsedSessions
        );
      }
    } catch (error) {
      console.error(
        '[App.tsx Init] Error loading or validating chat sessions from localStorage:',
        error
      );
    }
    console.log('[App.tsx Init] No valid chat sessions loaded, returning empty array.');
    return [];
  });
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(() => {
    const savedSessionId = localStorage.getItem(STORAGE_KEYS.CURRENT_CHAT_SESSION);
    if (savedSessionId) {
      return savedSessionId;
    } else {
      return null;
    }
  });
  const currentChatSessionIdRef = useRef(currentChatSessionId);

  useEffect(() => {
    currentChatSessionIdRef.current = currentChatSessionId;
  }, [currentChatSessionId]);

  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>(() => {
    let loadedPrompts: SystemPrompt[] = [];
    try {
      const savedSystemPromptsJson = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPTS);
      if (savedSystemPromptsJson) {
        const parsed = JSON.parse(savedSystemPromptsJson);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (p) =>
              p &&
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              typeof p.content === 'string'
          )
        ) {
          loadedPrompts = parsed as SystemPrompt[];
        }
      }
    } catch (error) {
      console.error('Error loading system prompts from localStorage:', error);
      // If error, loadedPrompts remains empty, defaults will be used by the merging logic below.
    }

    const finalPromptsMap = new Map<string, SystemPrompt>();

    // 1. Add/update all default prompts from DEFAULT_SYSTEM_PROMPTS
    // This ensures all defaults are present and their `isDefault` and `name` are canonical.
    DEFAULT_SYSTEM_PROMPTS.forEach((defaultPrompt) => {
      const loadedVersion = loadedPrompts.find((p) => p.id === defaultPrompt.id);
      if (loadedVersion) {
        // If found in localStorage, use its content but enforce default name and isDefault status
        finalPromptsMap.set(defaultPrompt.id, {
          ...loadedVersion, // Keeps potentially user-modified content for a default
          name: defaultPrompt.name, // Enforce original name
          isDefault: true, // Enforce default status
        });
      } else {
        // If not in localStorage, add the pristine default prompt
        finalPromptsMap.set(defaultPrompt.id, defaultPrompt);
      }
    });

    // 2. Add custom prompts from localStorage (those not identified as defaults by ID)
    loadedPrompts.forEach((loadedPrompt) => {
      if (!DEFAULT_SYSTEM_PROMPTS.some((dp) => dp.id === loadedPrompt.id)) {
        finalPromptsMap.set(loadedPrompt.id, { ...loadedPrompt, isDefault: false });
      }
    });

    const uniquePrompts = Array.from(finalPromptsMap.values());

    return uniquePrompts.length > 0 ? uniquePrompts : DEFAULT_SYSTEM_PROMPTS; // Fallback just in case map is empty
  });
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState<string | null>(() => {
    const savedId = localStorage.getItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
    // Ensure the systemPrompts state (which might have just been initialized from localStorage or defaults) is used for finding
    const availablePrompts = systemPrompts || DEFAULT_SYSTEM_PROMPTS;
    if (savedId && availablePrompts.find((p) => p.id === savedId)) {
      return savedId;
    }
    // Fallback to the first default prompt if selected one isn't valid or available
    const firstDefault = DEFAULT_SYSTEM_PROMPTS.length > 0 ? DEFAULT_SYSTEM_PROMPTS[0].id : null;
    // Or if there are custom prompts but no default, select the first custom one
    return firstDefault || (availablePrompts.length > 0 ? availablePrompts[0].id : null);
  });

  const [isSystemPromptEditorOpen, setIsSystemPromptEditorOpen] = useState(false);

  useEffect(() => {
    try {
      const sm = localStorage.getItem('pastemax-recent-models');
      if (sm) setRecentModels(JSON.parse(sm));
    } catch (e) {
      console.error('Error loading recent models', e);
    }
  }, []);

  const loadAllLlmConfigs = async () => {
    try {
      if (window.llmApi) {
        const configsFromBackend = await window.llmApi.getAllConfigs(); // MODIFIED: Renamed function call
        setAllLlmConfigs(configsFromBackend || {}); // Ensure it defaults to an empty object if null/undefined
        console.log('All LLM configs loaded from backend:', configsFromBackend);
      } else {
        console.warn('window.llmApi not available. Cannot load LLM configs from backend.');
        setAllLlmConfigs({}); // Initialize with an empty object if API is not available
      }
    } catch (error) {
      console.error('Error loading LLM configurations from backend:', error);
      setAllLlmConfigs({}); // Initialize on error
    }
  };

  useEffect(() => {
    loadAllLlmConfigs();
    // ... any other initial loading logic like system prompt, etc.
  }, []);

  // Persist systemPrompts to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPTS, JSON.stringify(systemPrompts));
  }, [systemPrompts]);

  // Persist selectedSystemPromptId to localStorage
  useEffect(() => {
    if (selectedSystemPromptId) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID, selectedSystemPromptId);
    } else {
      // If null, remove it to avoid storing 'null' as a string
      localStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
    }
  }, [selectedSystemPromptId]);

  // Helper to extract provider from model ID (e.g., "mistral/mistral-small-latest" -> "mistral")
  const getProviderFromModelId = (modelId: string): LlmProvider | null => {
    if (!modelId || !modelId.includes('/')) {
      // Attempt to guess if not in the new format - this is a fallback
      // and should ideally be phased out as ChatModelSelector provides full IDs.
      if (modelId.startsWith('gpt-')) return 'openai';
      if (modelId.startsWith('claude-')) return 'anthropic';
      if (modelId.startsWith('gemini-')) return 'gemini';
      if (modelId.startsWith('mistral-') || modelId.startsWith('open-mistral')) return 'mistral';
      if (
        allLlmConfigs?.openrouter?.defaultModel === modelId ||
        (recentModels?.openrouter && recentModels.openrouter.includes(modelId))
      ) {
        return 'openrouter';
      }
      console.warn(
        `Cannot determine provider from modelId: "${modelId}". It should be in 'provider/modelName' format.`
      );
      return null;
    }
    return modelId.split('/')[0] as LlmProvider;
  };

  // Helper to get just the model name (e.g., "mistral/mistral-small-latest" -> "mistral-small-latest")
  const getActualModelName = (modelIdWithProvider: string): string => {
    if (!modelIdWithProvider) return '';
    if (modelIdWithProvider.startsWith('openrouter/')) {
      return modelIdWithProvider.substring('openrouter/'.length);
    }
    // For other providers, assume format "provider/model-name"
    const parts = modelIdWithProvider.split('/');
    if (parts.length > 1) {
      return parts.slice(1).join('/');
    }
    return modelIdWithProvider; // Fallback if no provider prefix is found
  };

  /**
   * Effect hook for loading file list data when dependencies change.
   * Handles debouncing requests and prevents duplicate requests when ignoreSettingsModified is reset.
   * @dependencies selectedFolder, isElectron, isSafeMode, ignoreMode, customIgnores, ignoreSettingsModified, reloadTrigger
   */
  useEffect(() => {
    if (!isElectron || !selectedFolder || isSafeMode) {
      lastSentIgnoreSettingsModifiedRef.current = null; // Reset ref when not processing
      return;
    }

    // Debug log kept intentionally (see Story 4.2) - helps track effect triggers
    // and state changes during development
    console.log(
      `[useEffect triggered] Folder: ${selectedFolder}, ReloadTrigger: ${reloadTrigger}, IgnoreModified: ${ignoreSettingsModified}`
    );

    // Check if this is a refresh vs initial load
    const isRefreshingCurrentFolder =
      reloadTrigger > 0 && selectedFolder === localStorage.getItem(STORAGE_KEYS.SELECTED_FOLDER);

    if (ignoreSettingsModified === false && lastSentIgnoreSettingsModifiedRef.current === true) {
      console.log('[useEffect] Skipping request: run is due to ignoreSettingsModified reset.');
      lastSentIgnoreSettingsModifiedRef.current = false; // Update ref to reflect current state
      return; // Skip the rest of this effect run
    }

    setProcessingStatus({
      status: 'processing',
      message: isRefreshingCurrentFolder ? 'Refreshing file list...' : 'Loading files...',
    });

    const timer = setTimeout(() => {
      console.log('[useEffect] Sending request-file-list with payload:', {
        folderPath: selectedFolder,
        ignoreMode,
        customIgnores,
        ignoreSettingsModified, // Send the current state
      });
      lastSentIgnoreSettingsModifiedRef.current = ignoreSettingsModified;
      window.electron.ipcRenderer.send('request-file-list', {
        folderPath: selectedFolder,
        ignoreMode,
        customIgnores,
        ignoreSettingsModified, // Send the current state
      });
      // Reset ignoreSettingsModified *after* sending the request that uses it.
      if (ignoreSettingsModified) {
        resetIgnoreSettingsModified();
      }
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(timer);
      console.log('[useEffect] Cleanup - canceling pending request-file-list timer');
    };
  }, [
    selectedFolder,
    isElectron,
    isSafeMode,
    ignoreMode,
    customIgnores,
    ignoreSettingsModified,
    reloadTrigger,
    resetIgnoreSettingsModified,
  ]);

  /**
   * Handles folder selection with validation and state management.
   * Prevents redundant processing when the same folder is selected.
   * @param folderPath - The path of the selected folder
   * @dependencies selectedFolder, allFiles, processingStatus
   */
  const handleFolderSelected = useCallback(
    (folderPath: string) => {
      // Validate input
      if (typeof folderPath !== 'string') {
        console.error('Invalid folder path received:', folderPath);
        setProcessingStatus({
          status: 'error',
          message: 'Invalid folder path received',
        });
        return;
      }

      // Skip if same folder is already loaded/loading
      if (
        arePathsEqual(folderPath, selectedFolder) &&
        (allFiles.length > 0 || processingStatus.status === 'processing')
      ) {
        // Skip if same folder is already loaded/loading
        return;
      }

      const normalizedFolderPath = normalizePath(folderPath);
      // Log kept for debugging folder selection
      console.log('Folder selected:', normalizedFolderPath);

      // Update state - main data loading is handled by separate useEffect
      setSelectedFolder(normalizedFolderPath);

      // Clear selections if folder changed
      if (!arePathsEqual(normalizedFolderPath, selectedFolder)) {
        setSelectedFiles([]);
      }

      // Update current workspace's folder path if a workspace is active
      if (currentWorkspaceId) {
        setWorkspaces((prevWorkspaces: Workspace[]) => {
          const updatedWorkspaces = prevWorkspaces.map((workspace: Workspace) =>
            workspace.id === currentWorkspaceId
              ? { ...workspace, folderPath: normalizedFolderPath, lastUsed: Date.now() }
              : workspace
          );
          // Save to localStorage
          localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
          return updatedWorkspaces;
        });
      }
    },
    [selectedFolder, allFiles, processingStatus, currentWorkspaceId]
  );

  // The handleFileListData function is implemented as stableHandleFileListData below
  // with proper dependency tracking

  const handleProcessingStatus = useCallback(
    (status: { status: 'idle' | 'processing' | 'complete' | 'error'; message: string }) => {
      setProcessingStatus(status);
    },
    []
  );

  // Listen for folder selection from main process
  // Removed listenersAddedRef as it's no longer needed with the new IPC listener implementation

  // Memoize handlers with stable dependencies
  const stableHandleFolderSelected = useCallback(
    (folderPath: string) => {
      handleFolderSelected(folderPath);
    },
    [handleFolderSelected]
  );

  const stableHandleFileListData = useCallback(
    (files: FileData[]) => {
      setAllFiles((prevFiles: FileData[]) => {
        if (files.length !== prevFiles.length) {
          console.debug(
            '[handleFileListData] Updating files from',
            prevFiles.length,
            'to',
            files.length
          );
        }
        return files;
      });

      setProcessingStatus({
        status: 'complete',
        message: `Loaded ${files.length} files`,
      });

      setSelectedFiles((prevSelected: string[]) => {
        // If we have previous selections, preserve all existing selections
        if (prevSelected.length > 0) {
          // Only filter out files that no longer exist in the new list
          return prevSelected.filter((selectedPath: string) =>
            files.some((file) => arePathsEqual(file.path, selectedPath))
          );
        }

        // No previous selections - select all eligible files
        return files
          .filter(
            (file: FileData) =>
              !file.isSkipped && !file.excludedByDefault && (includeBinaryPaths || !file.isBinary)
          )
          .map((file: FileData) => file.path);
      });
    },
    [includeBinaryPaths]
  );

  const stableHandleProcessingStatus = useCallback(handleProcessingStatus, [
    handleProcessingStatus,
  ]);

  // Improved IPC listener setup with proper cleanup (now only runs once, uses refs for handlers)
  // --- Types for IPC status ---
  type AppProcessingStatusType = 'idle' | 'processing' | 'complete' | 'error';
  const VALID_APP_STATUSES: AppProcessingStatusType[] = ['idle', 'processing', 'complete', 'error'];
  type IPCFileProcessingStatus = AppProcessingStatusType | 'cancelled' | 'busy';
  type FileProcessingStatusIPCPayload = { status: IPCFileProcessingStatus; message: string };

  // Refs to always point to latest handler logic
  const stableHandleFolderSelectedRef = useRef(stableHandleFolderSelected);
  const stableHandleFileListDataRef = useRef(stableHandleFileListData);
  const stableHandleProcessingStatusRef = useRef(stableHandleProcessingStatus);

  useEffect(() => {
    stableHandleFolderSelectedRef.current = stableHandleFolderSelected;
  }, [stableHandleFolderSelected]);
  useEffect(() => {
    stableHandleFileListDataRef.current = stableHandleFileListData;
  }, [stableHandleFileListData]);
  useEffect(() => {
    stableHandleProcessingStatusRef.current = stableHandleProcessingStatus;
  }, [stableHandleProcessingStatus]);

  useEffect(() => {
    if (!isElectron) return;

    const handleFolderSelectedIPC = (folderPath: string) => {
      console.log('[IPC] Received folder-selected:', folderPath);
      stableHandleFolderSelectedRef.current(folderPath);
    };

    const handleFileListDataIPC = (files: FileData[]) => {
      console.log('[IPC] Received file-list-data:', files.length, 'files');
      stableHandleFileListDataRef.current(files);
    };

    type ProcessingStatusIPCHandler = (payload: FileProcessingStatusIPCPayload) => void;
    const handleProcessingStatusIPC: ProcessingStatusIPCHandler = (payload) => {
      console.log('[IPC] Received file-processing-status:', payload);

      if (VALID_APP_STATUSES.includes(payload.status as AppProcessingStatusType)) {
        stableHandleProcessingStatusRef.current(
          payload as { status: AppProcessingStatusType; message: string }
        );
      } else if (payload.status === 'cancelled') {
        stableHandleProcessingStatusRef.current({
          status: 'idle',
          message: payload.message || 'Operation cancelled',
        });
      } else if (payload.status === 'busy') {
        stableHandleProcessingStatusRef.current({
          status: 'idle',
          message: payload.message || 'System is busy',
        });
      } else {
        console.warn('Received unhandled processing status from IPC:', payload);
        stableHandleProcessingStatusRef.current({
          status: 'error',
          message: 'Unknown status from main process',
        });
      }
    };

    const handleBackendModeUpdateIPC = (newMode: IgnoreMode) => {
      console.info('[App] Backend signaled ignore mode update:', newMode);
    };

    window.electron.ipcRenderer.on('folder-selected', handleFolderSelectedIPC);
    window.electron.ipcRenderer.on('file-list-data', handleFileListDataIPC);
    window.electron.ipcRenderer.on('file-processing-status', handleProcessingStatusIPC);
    window.electron.ipcRenderer.on('ignore-mode-updated', handleBackendModeUpdateIPC);

    return () => {
      window.electron.ipcRenderer.removeListener('folder-selected', handleFolderSelectedIPC);
      window.electron.ipcRenderer.removeListener('file-list-data', handleFileListDataIPC);
      window.electron.ipcRenderer.removeListener(
        'file-processing-status',
        handleProcessingStatusIPC
      );
      window.electron.ipcRenderer.removeListener('ignore-mode-updated', handleBackendModeUpdateIPC);
    };
  }, [isElectron]);

  /* ============================== HANDLERS & UTILITIES (MODIFIED/NEW) ============================== */

  /**
   * Handles closing the ignore patterns viewer and conditionally reloading the app
   * @param changesMade - Whether ignore patterns were modified, requiring a reload
   * @remarks The setTimeout wrapping window.location.reload() allows the UI to update
   * with the "Applying ignore mode..." status message before the reload occurs
   */
  const handleIgnoreViewerClose = useCallback(
    (changesMade?: boolean) => {
      closeIgnoreViewer();
      if (!changesMade) return;

      setProcessingStatus({
        status: 'processing',
        message: 'Applying ignore mode…',
      });

      if (isElectron) {
        console.info('Applying ignore mode:');
        window.electron.ipcRenderer.send('set-ignore-mode', ignoreMode);
        window.electron.ipcRenderer.send('clear-ignore-cache');

        if (changesMade) {
          // Use setTimeout to allow UI to update with "Applying ignore mode..." status before reload
          // Increased timeout to 800ms to ensure UI updates are visible
          setTimeout(() => window.location.reload(), 800);
        }
      }
    },
    [isElectron, closeIgnoreViewer, ignoreMode]
  );

  const cancelDirectoryLoading = useCallback(() => {
    if (isElectron) {
      window.electron.ipcRenderer.send('cancel-directory-loading');
      setProcessingStatus({
        status: 'idle',
        message: 'Directory loading cancelled',
      });
    }
  }, [isElectron]);

  const openFolder = () => {
    if (isElectron) {
      console.log('Opening folder dialog');
      setProcessingStatus({ status: 'idle', message: 'Select a folder...' });
      // Send the last selected folder to the main process for smarter defaultPath logic
      window.electron.ipcRenderer.send('open-folder', {
        lastSelectedFolder: selectedFolder,
      });
    } else {
      console.warn('Folder selection not available in browser');
    }
  };

  // Apply filters and sorting to files
  const applyFiltersAndSort = useCallback(
    (files: FileData[], sort: string, filter: string) => {
      let filtered = files;

      // Apply filter
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        filtered = files.filter(
          (file) =>
            file.name.toLowerCase().includes(lowerFilter) ||
            file.path.toLowerCase().includes(lowerFilter)
        );
      }

      // Apply sort
      const [sortKey, sortDir] = sort.split('-');
      const sorted = [...filtered].sort((a, b) => {
        let comparison = 0;

        if (sortKey === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sortKey === 'tokens') {
          comparison = a.tokenCount - b.tokenCount;
        } else if (sortKey === 'size') {
          comparison = a.size - b.size;
        }

        return sortDir === 'asc' ? comparison : -comparison;
      });

      setDisplayedFiles(sorted);
    },
    [setDisplayedFiles]
  );

  // Apply filters and sort whenever relevant state changes
  useEffect(() => {
    applyFiltersAndSort(allFiles, sortOrder, searchTerm);
  }, [applyFiltersAndSort, allFiles, sortOrder, searchTerm]); // Added all dependencies

  // File event handlers with proper typing
  const handleFileAdded = useCallback((newFile: FileData) => {
    console.log('[IPC] Received file-added:', newFile);
    setAllFiles((prevFiles: FileData[]) => {
      const isDuplicate = prevFiles.some((f) => arePathsEqual(f.path, newFile.path));
      const newAllFiles = isDuplicate ? prevFiles : [...prevFiles, newFile];
      console.log(`[IPC] file-added: Previous count: ${prevFiles.length}, New count: ${newAllFiles.length}, Path: ${newFile.path}`);
      return newAllFiles;
    });
  }, []);

  const handleFileUpdated = useCallback((updatedFile: FileData) => {
    console.log('[IPC] Received file-updated:', updatedFile);
    setAllFiles((prevFiles: FileData[]) => {
      const newAllFiles = prevFiles.map((file) => 
        arePathsEqual(file.path, updatedFile.path) ? updatedFile : file
      );
      console.log(`[IPC] file-updated: Count remains: ${newAllFiles.length}, Updated path: ${updatedFile.path}`);
      return newAllFiles;
    });
  }, []);

  const handleFileRemoved = useCallback(
    (filePathData: { path: string; relativePath: string } | string) => {
      const path = typeof filePathData === 'object' ? filePathData.path : filePathData;
      const normalizedPath = normalizePath(path);
      console.log('[IPC] Received file-removed:', filePathData);
      
      setAllFiles((prevFiles: FileData[]) => {
        const newAllFiles = prevFiles.filter((file) => !arePathsEqual(file.path, normalizedPath));
        console.log(`[IPC] file-removed: Previous count: ${prevFiles.length}, New count: ${newAllFiles.length}, Removed path: ${normalizedPath}`);
        return newAllFiles;
      });
      
      setSelectedFiles((prevSelected: string[]) => {
        const newSelected = prevSelected.filter((p) => !arePathsEqual(p, normalizedPath));
        if (newSelected.length !== prevSelected.length) {
          console.log(`[IPC] file-removed: Also removed from selectedFiles. Path: ${normalizedPath}`);
        }
        return newSelected;
      });
    },
    []
  );

  // Stable IPC listeners
  useEffect(() => {
    if (!isElectron) return;

    const listeners = [
      { event: 'file-added', handler: handleFileAdded },
      { event: 'file-updated', handler: handleFileUpdated },
      { event: 'file-removed', handler: handleFileRemoved },
    ];

    listeners.forEach(({ event, handler }) => window.electron.ipcRenderer.on(event, handler));

    return () => {
      listeners.forEach(({ event, handler }) =>
        window.electron.ipcRenderer.removeListener(event, handler)
      );
    };
  }, [isElectron, handleFileAdded, handleFileUpdated, handleFileRemoved]);

  // Toggle file selection
  const toggleFileSelection = (filePath: string) => {
    // Normalize the incoming file path
    const normalizedPath = normalizePath(filePath);

    const f = allFiles.find((f: FileData) => arePathsEqual(f.path, normalizedPath));
    if (f?.isBinary && !includeBinaryPaths) {
      return;
    }

    setSelectedFiles((prev: string[]) => {
      // Check if the file is already selected using case-sensitive/insensitive comparison as appropriate
      const isSelected = prev.some((path) => arePathsEqual(path, normalizedPath));

      if (isSelected) {
        // Remove the file from selected files
        return prev.filter((path: string) => !arePathsEqual(path, normalizedPath));
      } else {
        // Add the file to selected files
        return [...prev, normalizedPath];
      }
    });
  };

  // Toggle folder selection (select/deselect all files in folder)
  const toggleFolderSelection = (folderPath: string, isSelected: boolean) => {
    // Normalize the folder path for cross-platform compatibility
    const normalizedFolderPath = normalizePath(folderPath);

    // Function to check if a file is in the given folder or its subfolders
    const isFileInFolder = (filePath: string, folderPath: string): boolean => {
      // Ensure paths are normalized with consistent slashes
      let normalizedFilePath = normalizePath(filePath);
      let normalizedFolderPath = normalizePath(folderPath);

      // Add leading slash to absolute paths if missing (common on macOS)
      if (!normalizedFilePath.startsWith('/') && !normalizedFilePath.match(/^[a-z]:/i)) {
        normalizedFilePath = '/' + normalizedFilePath;
      }

      if (!normalizedFolderPath.startsWith('/') && !normalizedFolderPath.match(/^[a-z]:/i)) {
        normalizedFolderPath = '/' + normalizedFolderPath;
      }

      // A file is in the folder if:
      // 1. The paths are equal (exact match)
      // 2. The file path is a subpath of the folder
      const isMatch =
        arePathsEqual(normalizedFilePath, normalizedFolderPath) ||
        isSubPath(normalizedFolderPath, normalizedFilePath);

      if (isMatch) {
        // File is in folder
      }

      return isMatch;
    };

    // Filter all files to get only those in this folder (and subfolders) that are selectable
    const filesInFolder = allFiles.filter((file: FileData) => {
      const inFolder = isFileInFolder(file.path, normalizedFolderPath);
      const selectable =
        !file.isSkipped && !file.excludedByDefault && (includeBinaryPaths || !file.isBinary);
      return selectable && inFolder;
    });

    console.log('Found', filesInFolder.length, 'selectable files in folder');

    // If no selectable files were found, do nothing
    if (filesInFolder.length === 0) {
      console.warn('No selectable files found in folder, nothing to do');
      return;
    }

    // Extract just the paths from the files and normalize them
    const folderFilePaths = filesInFolder.map((file: FileData) => normalizePath(file.path));

    if (isSelected) {
      // Adding files - create a new Set with all existing + new files
      setSelectedFiles((prev: string[]) => {
        const existingSelection = new Set(prev.map(normalizePath));
        folderFilePaths.forEach((pathToAdd: string) => existingSelection.add(pathToAdd));
        const newSelection = Array.from(existingSelection);
        console.log(
          `Added ${folderFilePaths.length} files to selection, total now: ${newSelection.length}`
        );
        return newSelection;
      });
    } else {
      // Removing files - filter out any file that's in our folder
      setSelectedFiles((prev: string[]) => {
        const newSelection = prev.filter(
          (path: string) => !isFileInFolder(path, normalizedFolderPath)
        );
        return newSelection;
      });
    }
  };

  // Handle sort change
  const handleSortChange = (newSort: string) => {
    setSortOrder(newSort);
    // applyFiltersAndSort(allFiles, newSort, searchTerm); // Let the useEffect handle this
    setSortDropdownOpen(false); // Close dropdown after selection
  };

  // Handle search change
  const handleSearchChange = (newSearch: string) => {
    setSearchTerm(newSearch);
    // applyFiltersAndSort(allFiles, sortOrder, newSearch); // Let the useEffect handle this
  };

  // Toggle sort dropdown
  const toggleSortDropdown = () => {
    setSortDropdownOpen(!sortDropdownOpen);
  };

  /**
   * State for storing user instructions
   * This text will be appended at the end of all copied content
   * to provide context or special notes to recipients
   */

  /**
   * Assembles the final content for copying using cached base content
   * @returns {string} The concatenated content ready for copying
   */
  const getSelectedFilesContent = () => {
    return (
      cachedBaseContentString +
      (cachedBaseContentString && userInstructions.trim() ? '\n\n' : '') +
      formatUserInstructionsBlock(userInstructions)
    );
  };

  // Handle select all files
  const selectAllFiles = () => {
    console.time('selectAllFiles');
    try {
      const selectablePaths = displayedFiles
        .filter((file: FileData) => !file.isSkipped && (includeBinaryPaths || !file.isBinary))
        .map((file: FileData) => normalizePath(file.path)); // Normalize paths here

      setSelectedFiles((prev: string[]) => {
        const normalizedPrev = prev.map(normalizePath); // Normalize existing selection
        const newSelection = [...normalizedPrev];
        selectablePaths.forEach((pathToAdd: string) => {
          // Use arePathsEqual for checking existence
          if (!newSelection.some((existingPath) => arePathsEqual(existingPath, pathToAdd))) {
            newSelection.push(pathToAdd);
          }
        });
        return newSelection;
      });
    } finally {
      console.timeEnd('selectAllFiles');
    }
  };

  // Handle deselect all files
  const deselectAllFiles = () => {
    const displayedPathsToDeselect = displayedFiles.map((file: FileData) =>
      normalizePath(file.path)
    ); // Normalize paths to deselect
    setSelectedFiles((prev: string[]) => {
      const normalizedPrev = prev.map(normalizePath); // Normalize existing selection
      // Use arePathsEqual for filtering
      return normalizedPrev.filter(
        (selectedPath: string) =>
          !displayedPathsToDeselect.some(
            (deselectPath: string) => arePathsEqual(selectedPath, deselectPath) // Add type annotation
          )
      );
    });
  };

  // Sort options for the dropdown
  const sortOptions = [
    { value: 'tokens-desc', label: 'Tokens: High to Low' },
    { value: 'tokens-asc', label: 'Tokens: Low to High' },
    { value: 'name-asc', label: 'Name: A to Z' },
    { value: 'name-desc', label: 'Name: Z to A' },
  ];

  // Handle expand/collapse state changes
  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev: Record<string, boolean>) => {
      const newState = {
        ...prev,
        [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId],
      };

      // Save to localStorage
      localStorage.setItem(STORAGE_KEYS.EXPANDED_NODES, JSON.stringify(newState));

      return newState;
    });
  };

  // Helper function to get all directory node IDs from the current file list
  const getAllDirectoryNodeIds = useCallback(() => {
    if (!selectedFolder || !allFiles.length) {
      return [];
    }
    const directoryPaths = new Set<string>();
    allFiles.forEach((file) => {
      let currentPath = dirname(file.path);
      while (
        currentPath &&
        currentPath !== selectedFolder &&
        !arePathsEqual(currentPath, selectedFolder) &&
        currentPath.startsWith(selectedFolder)
      ) {
        directoryPaths.add(normalizePath(currentPath));
        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) break; // Avoid infinite loop for root or malformed paths
        currentPath = parentPath;
      }
      // Add the root selected folder itself if it's not already (e.g. if only files are at root)
      // This is implicitly handled by the Sidebar's root node, but good to be aware
    });
    // Add the selected folder itself as a potential directory node
    directoryPaths.add(normalizePath(selectedFolder));

    return Array.from(directoryPaths).map((dirPath) => `node-${dirPath}`);
  }, [allFiles, selectedFolder]);

  const collapseAllFolders = useCallback(() => {
    const dirNodeIds = getAllDirectoryNodeIds();
    const newExpandedNodes: Record<string, boolean> = {};
    dirNodeIds.forEach((id) => {
      newExpandedNodes[id] = false;
    });
    setExpandedNodes(newExpandedNodes);
    localStorage.setItem(STORAGE_KEYS.EXPANDED_NODES, JSON.stringify(newExpandedNodes));
  }, [getAllDirectoryNodeIds, setExpandedNodes]);

  const expandAllFolders = useCallback(() => {
    // Setting to empty object means all nodes will default to expanded
    // as per the logic in Sidebar.tsx: expandedNodes[node.id] !== undefined ? expandedNodes[node.id] : true;
    const newExpandedNodes = {};
    setExpandedNodes(newExpandedNodes);
    localStorage.setItem(STORAGE_KEYS.EXPANDED_NODES, JSON.stringify(newExpandedNodes));
  }, [setExpandedNodes]);

  // Cache base content when file selections or formatting options change
  useEffect(() => {
    const updateBaseContent = async () => {
      const baseContent = formatBaseFileContent({
        files: allFiles,
        selectedFiles,
        sortOrder,
        includeFileTree,
        includeBinaryPaths,
        selectedFolder,
      });

      setCachedBaseContentString(baseContent);

      if (isElectron && baseContent) {
        try {
          const result = await window.electron.ipcRenderer.invoke('get-token-count', baseContent);
          if (result?.tokenCount !== undefined) {
            setCachedBaseContentTokens(result.tokenCount);
          }
        } catch (error) {
          console.error('Error getting base content token count:', error);
          setCachedBaseContentTokens(0);
        }
      } else {
        setCachedBaseContentTokens(0);
      }
    };

    const debounceTimer = setTimeout(updateBaseContent, 300);
    return () => clearTimeout(debounceTimer);
  }, [
    allFiles,
    selectedFiles,
    sortOrder,
    includeFileTree,
    includeBinaryPaths,
    selectedFolder,
    isElectron,
  ]);

  // Calculate total tokens when user instructions change
  useEffect(() => {
    const calculateAndSetTokenCount = async () => {
      const instructionsBlock = formatUserInstructionsBlock(userInstructions);

      if (isElectron) {
        try {
          let totalTokens = cachedBaseContentTokens;

          // Only calculate instruction tokens if there are instructions
          if (instructionsBlock) {
            const instructionResult = await window.electron.ipcRenderer.invoke(
              'get-token-count',
              instructionsBlock
            );
            totalTokens += instructionResult?.tokenCount || 0;
          }

          setTotalFormattedContentTokens(totalTokens);
        } catch (error) {
          console.error('Error getting token count:', error);
          setTotalFormattedContentTokens(0);
        }
      } else {
        setTotalFormattedContentTokens(0);
      }
    };

    const debounceTimer = setTimeout(calculateAndSetTokenCount, 150);
    return () => clearTimeout(debounceTimer);
  }, [userInstructions, cachedBaseContentTokens, isElectron]);

  // ============================== Update Modal State ==============================
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null as UpdateDisplayState | null);
  const initialUpdateCheckAttemptedRef = useRef(false);

  // Store the result of the initial auto update check from main process
  const [initialAutoUpdateResult, setInitialAutoUpdateResult] = useState(
    null as UpdateDisplayState | null
  );

  // Listen for initial-update-status from main process
  useEffect(() => {
    if (!isElectron) return;
    const handler = (result: any) => {
      setInitialAutoUpdateResult(result as UpdateDisplayState);
    };
    window.electron.ipcRenderer.on('initial-update-status', handler);
    return () => {
      window.electron.ipcRenderer.removeListener('initial-update-status', handler);
    };
  }, [isElectron]);

  // Handler for checking updates
  const handleCheckForUpdates = useCallback(async () => {
    setIsUpdateModalOpen(true);

    // Only fetch if not already checked this session or if updateStatus is null/loading
    if (updateStatus && !updateStatus.isLoading && initialUpdateCheckAttemptedRef.current) {
      console.log('Renderer: Modal opened, update status already exists. Not re-invoking IPC.');
      return;
    }

    setUpdateStatus((prevStatus: UpdateDisplayState | null) => ({
      ...(prevStatus || { currentVersion: '', isUpdateAvailable: false }),
      isLoading: true,
    }));

    try {
      const result = await window.electron.ipcRenderer.invoke('check-for-updates');
      setUpdateStatus({
        ...result,
        isLoading: false,
      });
      initialUpdateCheckAttemptedRef.current = true;
    } catch (error: any) {
      setUpdateStatus({
        isLoading: false,
        isUpdateAvailable: false,
        currentVersion: '',
        error: error?.message || 'Unknown error during IPC invoke',
        // debugLogs removed: not part of UpdateDisplayState
      });
      initialUpdateCheckAttemptedRef.current = true;
    }
  }, [updateStatus]);

  // Handle task type change
  const handleTaskTypeChange = (taskTypeId: string) => {
    setSelectedTaskType(taskTypeId);
  };

  // Workspace functions
  const handleOpenWorkspaceManager = () => {
    // Force reload workspaces from localStorage before opening
    const storedWorkspaces = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
    if (storedWorkspaces) {
      try {
        const parsed = JSON.parse(storedWorkspaces);
        if (Array.isArray(parsed)) {
          // Update state with a fresh copy from localStorage
          setWorkspaces(parsed);
          console.log('Workspaces refreshed from localStorage before opening manager');
        }
      } catch (error) {
        console.error('Failed to parse workspaces from localStorage:', error);
      }
    }

    // Open the workspace manager
    setIsWorkspaceManagerOpen(true);
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    // Find the workspace
    const workspace = workspaces.find((w: Workspace) => w.id === workspaceId);
    if (!workspace) return;

    // Save current workspace id
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE, workspaceId);
    setCurrentWorkspaceId(workspaceId);

    // Update last used timestamp using functional state update
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      const updatedWorkspaces = currentWorkspaces.map((w: Workspace) =>
        w.id === workspaceId ? { ...w, lastUsed: Date.now() } : w
      );

      // Save to localStorage
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));

      return updatedWorkspaces;
    });

    // If the workspace has a folder associated with it
    if (workspace.folderPath) {
      // Only reload if it's different from the current folder
      if (!arePathsEqual(workspace.folderPath, selectedFolder)) {
        console.log(`Switching to workspace folder: ${workspace.folderPath}`);

        // First set the selected folder
        setSelectedFolder(workspace.folderPath);
        localStorage.setItem(STORAGE_KEYS.SELECTED_FOLDER, workspace.folderPath);

        // Request file data from the main process (if in Electron)
        if (isElectron && !isSafeMode) {
          setProcessingStatus({
            status: 'processing',
            message: 'Loading files...',
          });

          // Ensure we're sending the updated folder path to the main process
          window.electron.ipcRenderer.send('request-file-list', {
            folderPath: workspace.folderPath,
            ignoreMode,
            customIgnores,
          });
        }
      }
    } else {
      // Clear current selection if workspace has no folder
      setSelectedFolder(null);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      setSelectedFiles([]);
      setAllFiles([]);
      setProcessingStatus({
        status: 'idle',
        message: '',
      });
    }

    setIsWorkspaceManagerOpen(false);
  };

  const handleCreateWorkspace = (name: string) => {
    console.log('App: Creating new workspace with name:', name);

    // Create a new workspace with a unique id
    const newWorkspace = {
      id: `workspace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      folderPath: null,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    // Add to workspaces list
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      console.log('Updating workspaces state, current count:', currentWorkspaces.length);
      const updatedWorkspaces = [...currentWorkspaces, newWorkspace];
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
      console.log('Saved updated workspaces to localStorage, new count:', updatedWorkspaces.length);
      return updatedWorkspaces;
    });

    // Set as current workspace
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE, newWorkspace.id);
    setCurrentWorkspaceId(newWorkspace.id);
    console.log('Set current workspace ID to:', newWorkspace.id);

    if (selectedFolder) {
      // Show confirmation modal to use current folder
      setConfirmFolderModalDetails({
        workspaceId: newWorkspace.id,
        workspaceName: name,
        folderPath: selectedFolder,
      });
      setIsConfirmUseFolderModalOpen(true);
    } else {
      // No folder selected - proceed with folder selection
      setSelectedFolder(null);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
      setSelectedFiles([]);
      setAllFiles([]);
      setProcessingStatus({
        status: 'idle',
        message: '',
      });
      openFolder();
    }

    // Close the workspace manager
    setIsWorkspaceManagerOpen(false);
    console.log('Workspace creation complete, manager closed');
  };

  const handleConfirmUseCurrentFolder = () => {
    if (!confirmFolderModalDetails.workspaceId) return;

    // Update workspace with current folder path
    handleUpdateWorkspaceFolder(
      confirmFolderModalDetails.workspaceId,
      confirmFolderModalDetails.folderPath
    );
    setIsConfirmUseFolderModalOpen(false);
  };

  const handleDeclineUseCurrentFolder = () => {
    setIsConfirmUseFolderModalOpen(false);
    // Clear state and open folder selector
    setSelectedFolder(null);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
    setSelectedFiles([]);
    setAllFiles([]);
    setProcessingStatus({
      status: 'idle',
      message: '',
    });
    openFolder();
  };

  const handleDeleteWorkspace = (workspaceId: string) => {
    console.log('App: Deleting workspace with ID:', workspaceId);
    // Ensure any open modal is closed first
    setIsConfirmUseFolderModalOpen(false);

    const workspaceBeingDeleted = workspaces.find((w: Workspace) => w.id === workspaceId);
    console.log('Deleting workspace:', workspaceBeingDeleted?.name);

    // Filter out the deleted workspace, using functional update to prevent stale state
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      const filteredWorkspaces = currentWorkspaces.filter((w: Workspace) => w.id !== workspaceId);
      console.log(
        `Filtered workspaces: ${currentWorkspaces.length} -> ${filteredWorkspaces.length}`
      );

      // Save the updated workspaces list to localStorage
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(filteredWorkspaces));
      console.log('Saved filtered workspaces to localStorage');

      // Ensure empty array is properly saved when deleting the last workspace
      if (filteredWorkspaces.length === 0) {
        console.log('No workspaces left, ensuring empty array is saved');
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
      }

      return filteredWorkspaces;
    });

    // (Removed workspaceManagerVersion increment)

    // If deleting current workspace, clear current selection
    if (currentWorkspaceId === workspaceId) {
      console.log('Deleted the current workspace, clearing workspace state');
      localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKSPACE);
      setCurrentWorkspaceId(null);

      // Also clear folder selection when current workspace is deleted
      setSelectedFolder(null);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      setSelectedFiles([]);
      setAllFiles([]);
      setProcessingStatus({
        status: 'idle',
        message: '',
      });
    }

    console.log('Workspace deletion complete');

    // Important: Keep the workspace manager open so user can create a new workspace immediately
    // The visual update with the deleted workspace removed will happen thanks to our useEffect in WorkspaceManager
  };

  // Handler to update a workspace's folder path
  const handleUpdateWorkspaceFolder = (workspaceId: string, folderPath: string | null) => {
    setWorkspaces((prevWorkspaces: Workspace[]) => {
      const updatedWorkspaces = prevWorkspaces.map((workspace: Workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, folderPath, lastUsed: Date.now() }
          : workspace
      );
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
      return updatedWorkspaces;
    });

    // If updating the current workspace, also update the selected folder
    if (currentWorkspaceId === workspaceId) {
      if (folderPath) {
        // Update local storage and request file list
        localStorage.setItem(STORAGE_KEYS.SELECTED_FOLDER, folderPath);
        handleFolderSelected(folderPath);
      } else {
        // Clear folder selection in localStorage and state
        localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
        setSelectedFolder(null);
        setSelectedFiles([]);
        setAllFiles([]);
        setProcessingStatus({
          status: 'idle',
          message: '',
        });
      }
    }
  };

  // Get current workspace name for display
  const currentWorkspaceName = currentWorkspaceId
    ? workspaces.find((w: Workspace) => w.id === currentWorkspaceId)?.name || 'Untitled'
    : null;

  // Handle copying content to clipboard
  const handleCopy = async () => {
    if (selectedFiles.length === 0) return;

    try {
      const content = getSelectedFilesContent();
      await navigator.clipboard.writeText(content);
      setProcessingStatus({ status: 'complete', message: 'Copied to clipboard!' });

      // Add to copy history
      const newHistoryItem: CopyHistoryItem = {
        content,
        timestamp: Date.now(),
        label: `${selectedFiles.length} files`,
      };

      const updatedHistory = [newHistoryItem, ...copyHistory].slice(0, 20); // Keep last 20 items
      setCopyHistory(updatedHistory);
      localStorage.setItem(STORAGE_KEYS.COPY_HISTORY, JSON.stringify(updatedHistory));

      // Reset the status after 2 seconds
      setTimeout(() => {
        setProcessingStatus({ status: 'idle', message: '' });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setProcessingStatus({ status: 'error', message: 'Failed to copy to clipboard' });
    }
  };

  // Handle copy from history
  const handleCopyFromHistory = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setProcessingStatus({ status: 'complete', message: 'Copied to clipboard!' });

      // Reset the status after 2 seconds
      setTimeout(() => {
        setProcessingStatus({ status: 'idle', message: '' });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setProcessingStatus({ status: 'error', message: 'Failed to copy to clipboard' });
    }
  };

  // Clear copy history
  const handleClearCopyHistory = () => {
    setCopyHistory([]);
    localStorage.removeItem(STORAGE_KEYS.COPY_HISTORY);
  };

  const handleManageCustomTaskTypes = () => {
    setIsCustomTaskTypeModalOpen(true);
  };

  const handleCustomTaskTypesUpdated = () => {
    // Force reload task types by triggering a re-render with a temporary state update
    // This creates a state change that will cause the TaskTypeSelector to reload custom types
    const currentTaskType = selectedTaskType;
    // Temporarily set to the first default type and then back to selected
    setSelectedTaskType('none');
    setTimeout(() => {
      setSelectedTaskType(currentTaskType);
    }, 50);
  };

  // Handle model selection
  const handleModelSelect = (newModelId: string) => {
    // Update the globally selected model ID - this is used for NEW chats or as a fallback.
    setSelectedModelId(newModelId);
    localStorage.setItem('pastemax-selected-model', newModelId);

    // If there's a current active chat session, update ITS modelId and providerConfig.
    if (currentChatSessionId) {
      setChatSessions((prevSessions) =>
        prevSessions.map((session) => {
          if (session.id === currentChatSessionId) {
            let updatedProviderConfig = session.providerConfig;
            const provider = getProviderFromModelId(newModelId);
            if (provider && allLlmConfigs && allLlmConfigs[provider]) {
              updatedProviderConfig = allLlmConfigs[provider];
            }
            return {
              ...session,
              modelId: newModelId,
              providerConfig: updatedProviderConfig,
              // Optionally, clear llmError if model change should reset it for the session
              // llmError: null,
            };
          }
          return session;
        })
      );
      // If the active chat's model is changed, clear any global/view-specific LLM error related to the old model.
      if (currentChatSessionIdRef.current === currentChatSessionId) {
        setLlmError(null);
      }
    } else {
      // If no specific chat is active, changing the global model might still warrant clearing a global error.
      setLlmError(null);
    }

    console.log('Model selected (globally and for active session if any):', newModelId);
  };

  // Persist workspaces when they change
  useEffect(() => {
    if (workspaces) {
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(workspaces));

      // Log information for debugging purposes
      console.log(`Workspaces updated: ${workspaces.length} workspaces saved to localStorage`);

      // If we have a current workspace, ensure it still exists in the workspaces array
      if (currentWorkspaceId && !workspaces.some((w: Workspace) => w.id === currentWorkspaceId)) {
        console.log('Current workspace no longer exists, clearing currentWorkspaceId');
        localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKSPACE);
        setCurrentWorkspaceId(null);
      }
    }
  }, [workspaces, currentWorkspaceId]);

  /* ============================== LLM/CHAT HANDLERS (MODIFIED/NEW) ============================== */

  /**
   * Opens the LLM settings modal
   */
  const handleOpenLlmSettings = () => {
    setIsLlmSettingsModalOpen(true);
  };

  const handleSaveAllLlmConfigs = async (configs: AllLlmConfigs) => {
    try {
      if (window.llmApi) {
        const result = await window.llmApi.setAllConfigs(configs); // MODIFIED: Renamed function call
        if (result.success) {
          setAllLlmConfigs(configs); // Update local state on successful save
          console.log('All LLM configurations saved to backend.');
        } else {
          console.error('Failed to save LLM configurations to backend:', result.error);
          // Optionally, set an error state here to inform the user
        }
      } else {
        console.warn('window.llmApi not available. Cannot save LLM configs to backend.');
      }
    } catch (error) {
      console.error('Error saving LLM configurations to backend:', error);
      // Optionally, set an error state here to inform the user
    }
  };

  /**
   * Opens the chat view for a specified target (file, selection, or general)
   */
  const handleOpenChatView = (target?: ChatTarget) => {
    let sessionToOpenId: string | null = null;

    if (target && (target.type === 'file' || target.type === 'selection')) {
      // Try to find an existing session for this specific target
      const existingSession = chatSessions.find(
        (s) =>
          s.targetType === target.type &&
          (s.targetName === target.fileName ||
            (target.filePath && s.targetName === target.filePath)) // Check both name and path for files
      );
      if (existingSession) {
        sessionToOpenId = existingSession.id;
        console.log(`[App.tsx] Found existing targeted session: ${sessionToOpenId}`);
      }
    } else {
      // For general chat or if no specific target, try to use current or create new
      if (currentChatSessionId) {
        const currentGeneralSession = chatSessions.find(
          (s) => s.id === currentChatSessionId && (!s.targetType || s.targetType === 'general')
        );
        if (currentGeneralSession) {
          sessionToOpenId = currentChatSessionId;
          console.log(`[App.tsx] Resuming current general session: ${sessionToOpenId}`);
        }
      }
    }

    if (sessionToOpenId) {
      selectChatSession(sessionToOpenId); // This sets currentChatSessionId, chatMessages, and chatTarget
      // Don't clear error/loading states here - selectChatSession handles setting them from the session
    } else {
      // No existing session found for the target, or no current general session to resume, so create a new one
      const newSessionId = createNewChatSession(target); // This sets currentChatSessionId
      sessionToOpenId = newSessionId;
      console.log(`[App.tsx] Created new session: ${sessionToOpenId}`);
      // Initialize messages for the new session
      if (target) {
        const systemMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'system',
          content: getSystemPromptForTarget(target),
          timestamp: Date.now(),
        };
        setChatMessages([systemMessage]);
        // The updateCurrentSession useEffect will handle saving this to chatSessions
      } else {
        setChatMessages([]); // For a new general chat
      }
      setChatTarget(target); // Set target for the new session

      // Only clear error/loading states for new sessions
      setLlmError(null);
      setIsLlmLoading(false);
    }

    setIsChatViewOpen(true);
  };

  const handleCloseChatView = () => {
    setIsChatViewOpen(false);
    // The view-specific states (chatMessages, llmError, isLlmLoading, chatTarget)
    // will remain as they were. If a session was active, they hold that session's
    // current view state. If no session was active (e.g., after 'New Chat' and then closing),
    // they would be in their cleared state.
  };

  /**
   * Generates an appropriate system prompt based on the chat target
   */
  const getSystemPromptForTarget = (target: ChatTarget): string => {
    let contextInfo = '';
    const currentSelectedPrompt = systemPrompts.find((p) => p.id === selectedSystemPromptId);
    const basePromptContent = currentSelectedPrompt
      ? currentSelectedPrompt.content
      : DEFAULT_SYSTEM_PROMPTS[0].content; // Fallback

    switch (target.type) {
      case 'file':
        // Content will now be in the user message for file-specific queries.
        // System prompt now just sets the general context of discussing a file.
        contextInfo = `\\n\\n## Context\\nYou are discussing the file: ${target.fileName || 'Unnamed file'}. The file content and the specific question will be provided in the user's message.`;
        break;
      case 'selection':
        // For selections, we can keep embedding the content in the system prompt if it's usually smaller
        // or adopt the same strategy as files if preferred for consistency.
        // For now, keeping existing behavior for selection to minimize changes unless specified.
        contextInfo = `\\n\\n## Context\\nYou are discussing the following code/text selection:\\n\\n\`\`\`\\n${target.content}\\n\`\`\``;
        break;
      case 'general':
      default:
        contextInfo = '';
        break;
    }

    return basePromptContent + contextInfo;
  };

  /**
   * Sends a user message to the LLM and processes the response
   */
  const handleSendMessage = async (
    messageContent: string,
    options?: {
      originalQuestion?: string;
      isFullContextSubmission?: boolean;
      explicitSessionId?: string;
    }
  ) => {
    let requestSessionId = options?.explicitSessionId || currentChatSessionIdRef.current;

    // If no session exists (neither explicit nor from ref/state reflecting an existing session),
    // AND this isn't an explicit full context submission (which creates its own session),
    // it means we are sending the first message for a new general chat.
    if (!requestSessionId && !options?.isFullContextSubmission) {
      console.log(
        '[App.tsx] No active/explicit session for a new message. Creating new general session now.'
      );
      // chatTarget might be undefined here if user just typed into a blank chat view.
      // Default to general type if so.
      const newSessionTarget: ChatTarget =
        chatTarget &&
        (chatTarget.type === 'general' ||
          chatTarget.type === 'file' ||
          chatTarget.type === 'selection')
          ? chatTarget
          : { type: 'general', content: '' };

      const newSessionId = createNewChatSession(newSessionTarget);
      // Important: Update currentChatSessionId and its ref immediately so subsequent logic uses it.
      setCurrentChatSessionId(newSessionId);
      currentChatSessionIdRef.current = newSessionId;
      requestSessionId = newSessionId;
    } else if (options?.isFullContextSubmission && !options?.explicitSessionId) {
      // This case should ideally be handled by handleSendInstructionsToAI passing an explicitSessionId.
      // However, as a fallback, if it is a full context submission without an explicit ID,
      // create a session here. This is less ideal because handleSendInstructionsToAI should own this.
      console.warn(
        '[App.tsx] Full context submission without explicitSessionId. Creating session in handleSendMessage as fallback.'
      );
      const newSessionId = createNewChatSession({ type: 'general', content: '' }); // Full context is always general type
      setCurrentChatSessionId(newSessionId);
      currentChatSessionIdRef.current = newSessionId;
      requestSessionId = newSessionId;
    }

    // Safety check to ensure we have a valid session ID before proceeding
    if (!requestSessionId) {
      console.error('[App.tsx] Failed to create or get a valid session ID.');
      setLlmError('Failed to create chat session. Please try again.');
      return;
    }

    console.log(`[App.tsx] handleSendMessage for session: ${requestSessionId}`);
    // console.log('[App.tsx] Current selectedModelId state:', selectedModelId); // Keep for debugging if needed

    // --- Get session-specific or global model/config ---
    const sessionForRequest = chatSessions.find((s) => s.id === requestSessionId);
    const modelIdForRequest = sessionForRequest?.modelId || selectedModelId;
    let providerConfigForRequest = sessionForRequest?.providerConfig; // Keep as let, it might be updated below

    if (!modelIdForRequest) {
      const noModelError = 'No model selected for this session or globally. Please select a model.';
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: noModelError, isLoading: false } : s
        )
      );
      if (currentChatSessionIdRef.current === requestSessionId) {
        setLlmError(noModelError);
        setIsLlmLoading(false);
      }
      return;
    }

    const currentProvider = getProviderFromModelId(modelIdForRequest);
    const actualModelName = getActualModelName(modelIdForRequest);

    if (!currentProvider) {
      const noProviderError = `Could not determine provider for model: "${modelIdForRequest}".`;
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: noProviderError, isLoading: false } : s
        )
      );
      if (currentChatSessionIdRef.current === requestSessionId) {
        setLlmError(noProviderError);
        setIsLlmLoading(false);
      }
      return;
    }

    // If providerConfig was not in session, get it from global configs
    if (!providerConfigForRequest) {
      if (allLlmConfigs && allLlmConfigs[currentProvider]) {
        providerConfigForRequest = allLlmConfigs[currentProvider]; // This is the reassignment
      } else {
        // This case should be rare if a modelId was found, but handle it.
        const noProviderConfigError = `Configuration for provider ${currentProvider} not found.`;
        setChatSessions((prevSessions) =>
          prevSessions.map((s) =>
            s.id === requestSessionId
              ? { ...s, llmError: noProviderConfigError, isLoading: false }
              : s
          )
        );
        if (currentChatSessionIdRef.current === requestSessionId) {
          setLlmError(noProviderConfigError);
          setIsLlmLoading(false);
        }
        return;
      }
    }

    if (!providerConfigForRequest?.apiKey) {
      const apiKeyError = `API key for ${currentProvider} is not configured. Please check LLM Settings.`;
      console.error(
        '[App.tsx] API key missing for provider:',
        currentProvider,
        'Effective Provider Config:',
        providerConfigForRequest
      );
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: apiKeyError, isLoading: false } : s
        )
      );
      if (currentChatSessionIdRef.current === requestSessionId) {
        setLlmError(apiKeyError);
        setIsLlmLoading(false);
      }
      return;
    }
    // --- End Get session-specific or global model/config ---

    let finalMessageContent = messageContent;
    let userFileContext: ChatMessage['fileContext'] | undefined = undefined;
    let finalOriginalUserQuestion = options?.originalQuestion || messageContent;

    // const VERY_LONG_CONTENT_THRESHOLD = 20000; // Characters for fileContext - Unused in this function as userFileContext is always undefined
    // const PREVIEW_LENGTH = 1500; // Characters for fileContext preview - Unused in this function

    // Constants for main message truncation (used if isFullContextSubmission or general long messages)
    // const MAIN_MESSAGE_VERY_LONG_THRESHOLD = 10000; // Used for isFullContextSubmission to decide if its preview is needed - Unused
    // const MAIN_MESSAGE_PREVIEW_LENGTH = 500; // Used for isFullContextSubmission preview snippet - Unused
    const USER_INSTRUCTION_PREVIEW_LENGTH = 150; // Used for isFullContextSubmission user instruction snippet

    const MAIN_MESSAGE_DISPLAY_THRESHOLD = 2000; // General threshold for truncating any long message display
    const GENERIC_PREVIEW_LENGTH = 300; // Preview length for general long messages

    if (
      chatTarget?.type === 'file' &&
      chatTarget.content &&
      chatTarget.fileName &&
      !options?.isFullContextSubmission
    ) {
      const originalContent = chatTarget.content;
      finalMessageContent = `The user is asking about the file named "${chatTarget.fileName}".\n\nFile Content:\n\`\`\`${chatTarget.fileName?.split('.').pop() || 'text'}\n${originalContent}\n\`\`\`\n\nUser's Question:\n${messageContent}`;
      userFileContext = undefined;
      // For 'chat about file', make originalUserQuestion same as finalMessageContent to avoid redundant display
      finalOriginalUserQuestion = finalMessageContent;
    } else {
      userFileContext = undefined;
    }

    let displayPreviewContent: string | undefined = undefined;
    let displayIsContentTruncated: boolean = false;

    if (options?.isFullContextSubmission) {
      displayIsContentTruncated = true;
      const userInstructionSnippet =
        finalOriginalUserQuestion.length > USER_INSTRUCTION_PREVIEW_LENGTH
          ? finalOriginalUserQuestion.substring(0, USER_INSTRUCTION_PREVIEW_LENGTH - 3) + '...'
          : finalOriginalUserQuestion;
      displayPreviewContent = `**User Instructions:**\n${userInstructionSnippet}`;
    } else if (finalMessageContent.length > MAIN_MESSAGE_DISPLAY_THRESHOLD) {
      displayIsContentTruncated = true;
      let snippet = finalMessageContent.substring(0, GENERIC_PREVIEW_LENGTH);

      // Heuristic to avoid creating malformed Markdown for code blocks at truncation point
      const backtickSequences = snippet.split('```');
      if (backtickSequences.length % 2 === 0) {
        // An odd number of ``` means a code block is open
        const contentAfterLastBacktick = backtickSequences[backtickSequences.length - 1];
        if (contentAfterLastBacktick.indexOf('\n') === -1) {
          // If no newline after the last ``` within the snippet, it's likely a broken ```lang or empty block start.
          // Truncate before this last ``` to maintain valid Markdown.
          snippet = snippet.substring(0, snippet.lastIndexOf('```'));
        }
      }
      const ellipsis = finalMessageContent.length > snippet.length ? '...' : '';
      displayPreviewContent = snippet + ellipsis;
    }

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: finalMessageContent,
      timestamp: Date.now(),
      originalUserQuestion: finalOriginalUserQuestion, // Use the potentially adjusted version
      fileContext: userFileContext,
      previewDisplayContent: displayPreviewContent,
      isContentTruncated: displayIsContentTruncated,
    };

    // Update per-session state and global state if the session is active
    setChatSessions((prevSessions) =>
      prevSessions.map((s) =>
        s.id === requestSessionId
          ? {
              ...s,
              messages: [...s.messages, userMessage],
              isLoading: true,
              llmError: null, // Clear previous error for this session
            }
          : s
      )
    );

    if (currentChatSessionIdRef.current === requestSessionId) {
      setChatMessages((prev) => [...prev, userMessage]);
      setIsLlmLoading(true);
      setLlmError(null);
    }

    try {
      // Use the messages from the specific session for the API call
      const updatedSessionForRequest = chatSessions.find((s) => s.id === requestSessionId);

      // Determine the system prompt
      const baseSystemPromptContent = chatTarget
        ? getSystemPromptForTarget(chatTarget)
        : systemPrompts.find((p) => p.id === selectedSystemPromptId)?.content ||
          DEFAULT_SYSTEM_PROMPTS[0].content;

      // Construct messages to be sent to the LLM
      // The history from sessionForRequest.messages should be added *before* the current userMessage
      // And the system prompt should be the very first message.

      const historyMessages = updatedSessionForRequest
        ? updatedSessionForRequest.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant') // Only user and assistant messages for history
            .map((m) => ({ role: m.role, content: m.content }))
        : [];

      // The current user message that's being sent
      const currentUserMessageForLlm = {
        role: 'user' as MessageRole,
        content: finalMessageContent,
      };

      let messagesToSend: { role: MessageRole; content: string }[] = [
        { role: 'system' as MessageRole, content: baseSystemPromptContent },
        ...historyMessages,
        currentUserMessageForLlm,
      ];

      // Ensure we don't send an empty system prompt if baseSystemPromptContent is truly empty
      if (
        !baseSystemPromptContent &&
        messagesToSend.length > 0 &&
        messagesToSend[0].role === 'system' &&
        messagesToSend[0].content === ''
      ) {
        messagesToSend = messagesToSend.slice(1); // Remove empty system message
      }

      if (!window.llmApi) {
        throw new Error('LLM API bridge (window.llmApi) is not available. Check preload script.');
      }

      const paramsForSendPrompt = {
        messages: messagesToSend.slice(-20), // Consider message history length
        provider: currentProvider,
        model: actualModelName,
        apiKey: providerConfigForRequest.apiKey,
        baseUrl: providerConfigForRequest.baseUrl,
        requestId: requestSessionId as string, // Safe assertion after null checks above
      };

      const response = await window.llmApi.sendPrompt(paramsForSendPrompt);

      if (response.error) {
        throw new Error(response.error);
      }

      const assistantMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      };

      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId
            ? {
                ...s,
                messages: [...s.messages, assistantMessage],
                isLoading: false,
                llmError: null,
              }
            : s
        )
      );

      if (currentChatSessionIdRef.current === requestSessionId) {
        setChatMessages((prev) => [...prev, assistantMessage]);
        setIsLlmLoading(false);
        setLlmError(null);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Failed to get response from LLM.';
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: err, isLoading: false } : s
        )
      );
      if (currentChatSessionIdRef.current === requestSessionId) {
        setLlmError(err);
        setIsLlmLoading(false);
      }

      // Request completed with error
    }
  };

  const handleRetrySendMessage = async (messageIdToRetry: string) => {
    let requestSessionId = currentChatSessionId;

    if (!requestSessionId) {
      console.log('[App.tsx] No active session for retry. Creating new session automatically.');
      requestSessionId = createNewChatSession({ type: 'general', content: '' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Safety check
      if (!requestSessionId) {
        console.error('[App.tsx] Failed to create session for retry.');
        setLlmError('Failed to create chat session for retry. Please try again.');
        return;
      }
    }

    console.log(
      `[App.tsx] handleRetrySendMessage for message ${messageIdToRetry} in session: ${requestSessionId}`
    );

    let sessionForRequest = chatSessions.find((s) => s.id === requestSessionId);
    if (!sessionForRequest) {
      // If session not found but we have messages, recreate the session
      if (chatMessages.length > 0) {
        console.log(
          '[App.tsx] Session not found in chatSessions but messages exist. Recreating session.'
        );
        const timestamp = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        const recreatedSession: ChatSession = {
          id: requestSessionId,
          title: `New Chat (${timestamp})`,
          lastUpdated: Date.now(),
          messages: chatMessages,
          targetType: chatTarget?.type,
          targetName: chatTarget?.fileName,
          userPreview: chatMessages.find((m) => m.role === 'user')?.content.substring(0, 40),
          isLoading: false,
          llmError: null,
        };

        setChatSessions((prevSessions) => [recreatedSession, ...prevSessions]);
        sessionForRequest = recreatedSession; // Assign the recreated session
      } else {
        const sessionNotFoundError = 'Internal error: Chat session not found for retry.';
        console.error(`[App.tsx] ${sessionNotFoundError}`);
        setLlmError(sessionNotFoundError);
        setIsLlmLoading(false);
        return;
      }
    }

    const messageToRetryIndex = sessionForRequest.messages.findIndex(
      (msg) => msg.id === messageIdToRetry
    );
    if (
      messageToRetryIndex === -1 ||
      sessionForRequest.messages[messageToRetryIndex].role !== 'user'
    ) {
      const messageNotFoundError = 'Internal error: User message to retry not found or invalid.';
      console.error(`[App.tsx] ${messageNotFoundError}`);
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: messageNotFoundError, isLoading: false } : s
        )
      );
      if (currentChatSessionId === requestSessionId) {
        setLlmError(messageNotFoundError);
        setIsLlmLoading(false);
      }
      return;
    }

    if (!selectedModelId) {
      const noModelError = 'No model selected. Please select a model from the dropdown to retry.';
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: noModelError, isLoading: false } : s
        )
      );
      if (currentChatSessionId === requestSessionId) {
        setLlmError(noModelError);
        setIsLlmLoading(false);
      }
      return;
    }

    const currentProvider = getProviderFromModelId(selectedModelId);
    const actualModelName = getActualModelName(selectedModelId);

    if (!currentProvider) {
      const noProviderError = `Could not determine provider for model: "${selectedModelId}".`;
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: noProviderError, isLoading: false } : s
        )
      );
      if (currentChatSessionId === requestSessionId) {
        setLlmError(noProviderError);
        setIsLlmLoading(false);
      }
      return;
    }

    const providerConfig = allLlmConfigs?.[currentProvider];
    if (!providerConfig?.apiKey) {
      const missingConfigError = `API key for ${currentProvider} is missing. Please configure it in LLM Settings.`;
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: missingConfigError, isLoading: false } : s
        )
      );
      if (currentChatSessionId === requestSessionId) {
        setLlmError(missingConfigError);
        setIsLlmLoading(false);
      }
      return;
    }

    // Set loading state for the session and globally if active
    // Remove any subsequent messages from the point of retry in the session state
    setChatSessions((prevSessions) =>
      prevSessions.map((s) =>
        s.id === requestSessionId
          ? {
              ...s,
              messages: s.messages.slice(0, messageToRetryIndex + 1), // Keep messages up to and including the one retried
              isLoading: true,
              llmError: null,
            }
          : s
      )
    );

    if (currentChatSessionIdRef.current === requestSessionId) {
      setChatMessages((prevMessages) => prevMessages.slice(0, messageToRetryIndex + 1));
      setIsLlmLoading(true);
      setLlmError(null);
    }

    try {
      // Re-fetch sessionForRequest to get the sliced messages for the API call
      const updatedSessionForRequest = chatSessions.find((s) => s.id === requestSessionId);
      if (!updatedSessionForRequest) {
        // Should not happen if previous logic is correct
        throw new Error('Session disappeared during retry preparation.');
      }

      const messagesForLlm = updatedSessionForRequest.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let messagesToSend;

      if (selectedSystemPromptId) {
        // If a system prompt is selected, find it and add to the beginning
        const selectedPrompt = systemPrompts.find((p) => p.id === selectedSystemPromptId);
        if (selectedPrompt) {
          messagesToSend = [
            { role: 'system' as MessageRole, content: selectedPrompt.content },
            ...messagesForLlm.filter((m) => m.role !== 'system'), // Ensure no other system messages sneak in
          ];
        } else {
          console.warn(`[App.tsx] Selected system prompt '${selectedSystemPromptId}' not found`);
          // Fall back to default if not found
          const baseSystemPrompt =
            systemPrompts.find((p) => p.isDefault)?.content || DEFAULT_SYSTEM_PROMPTS[0].content;
          messagesToSend = [
            { role: 'system' as MessageRole, content: baseSystemPrompt },
            ...messagesForLlm.filter((m) => m.role !== 'system'), // Ensure no other system messages sneak in
          ];
        }
      } else {
        // Use default prompt if no specific prompt is selected
        const baseSystemPrompt =
          systemPrompts.find((p) => p.isDefault)?.content || DEFAULT_SYSTEM_PROMPTS[0].content;
        messagesToSend = [
          { role: 'system' as MessageRole, content: baseSystemPrompt },
          ...messagesForLlm.filter((m) => m.role !== 'system'), // Ensure no other system messages sneak in
        ];
      }

      // The user message to be retried is already the last one in messagesToSend due to slicing.

      if (!window.llmApi) {
        throw new Error('LLM API bridge (window.llmApi) is not available.');
      }

      const paramsForSendPrompt = {
        messages: messagesToSend.slice(-20),
        provider: currentProvider,
        model: actualModelName,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        requestId: requestSessionId as string, // Safe assertion after null checks above
      };

      const response = await window.llmApi.sendPrompt(paramsForSendPrompt);

      if (response.error) {
        throw new Error(response.error);
      }

      const assistantMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      };

      // Append only the new assistant message to the (already sliced) session messages
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId
            ? {
                ...s,
                messages: [...s.messages, assistantMessage],
                isLoading: false,
                llmError: null,
              }
            : s
        )
      );

      if (currentChatSessionIdRef.current === requestSessionId) {
        setChatMessages((prev) => [...prev, assistantMessage]);
        setIsLlmLoading(false);
        setLlmError(null);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Failed to get response from LLM on retry.';
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === requestSessionId ? { ...s, llmError: err, isLoading: false } : s
        )
      );
      if (currentChatSessionIdRef.current === requestSessionId) {
        setLlmError(err);
        setIsLlmLoading(false);
      }
    }
  };

  /**
   * Copies a message's content to the clipboard
   */
  const handleCopyResponse = (messageId: string) => {
    const message = chatMessages.find((msg) => msg.id === messageId);
    if (message) {
      navigator.clipboard.writeText(message.content);
      // Optionally add a toast or notification here
    }
  };

  /**
   * Cancels the current LLM request
   */
  const handleCancelLlmRequest = async () => {
    if (!currentChatSessionId) {
      console.warn('[App.tsx] No current chat session to cancel');
      return;
    }

    console.log(`[App.tsx] Cancelling LLM request: ${currentChatSessionId}`);

    try {
      if (window.llmApi?.cancelLlmRequest) {
        const result = await window.llmApi.cancelLlmRequest(currentChatSessionId);
        if (result.success) {
          console.log(`[App.tsx] Successfully cancelled request: ${currentChatSessionId}`);
        } else {
          console.error(`[App.tsx] Failed to cancel request: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('[App.tsx] Error cancelling LLM request:', error);
    }

    // Reset loading state regardless of cancellation success
    setIsLlmLoading(false);

    // Update the current session state
    if (currentChatSessionId) {
      setChatSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === currentChatSessionId ? { ...s, isLoading: false, llmError: null } : s
        )
      );
    }
  };

  /**
   * Opens chat for a selected file
   */
  const handleChatAboutFile = (filePath: string) => {
    // Find the file in allFiles
    const file = allFiles.find((f) => f.path === filePath);
    if (!file) return;

    // Create chat target
    const chatTarget: ChatTarget = {
      type: 'file',
      filePath: file.path,
      fileName: file.name,
      content: file.content || '',
    };

    handleOpenChatView(chatTarget);
  };

  const createNewChatSession = (target?: ChatTarget) => {
    const sessionId = generateId('session_');
    let sessionTitle: string;
    const userPreview: string | undefined = undefined; // Always undefined for a brand new chat
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (target?.type === 'file') {
      sessionTitle = target.fileName
        ? `File: ${target.fileName} (${timestamp})`
        : `File Chat (${timestamp})`;
    } else if (target?.type === 'selection') {
      sessionTitle = `Selection Chat (${timestamp})`;
    } else {
      sessionTitle = `New Chat (${timestamp})`; // Default for general new chats with timestamp
    }

    // Capture current model and config for the new session
    const currentModelIdForSession = selectedModelId;
    let providerConfigForSession: ProviderSpecificConfig | undefined = undefined;
    if (currentModelIdForSession && allLlmConfigs) {
      const provider = getProviderFromModelId(currentModelIdForSession);
      if (provider && allLlmConfigs[provider]) {
        providerConfigForSession = allLlmConfigs[provider];
      }
    }

    const newSession: ChatSession = {
      id: sessionId,
      title: sessionTitle,
      lastUpdated: Date.now(),
      messages: [], // New session starts with no messages
      targetType: target?.type,
      targetName:
        target?.fileName || (target?.type === 'selection' ? 'Selection Snippet' : undefined),
      targetContent: target?.content, // Store the actual content for context persistence
      userPreview: userPreview, // Will be undefined for new chats
      isLoading: false,
      llmError: null,
      modelId: currentModelIdForSession, // Store the model ID
      providerConfig: providerConfigForSession, // Store the provider config
    };

    setChatSessions((prevSessions) => [newSession, ...prevSessions]);
    setCurrentChatSessionId(sessionId);

    return sessionId;
  };

  /**
   * Opens a general chat (not specific to any file)
   */
  const handleOpenGeneralChat = useCallback(() => {
    console.log('[App.tsx] handleOpenGeneralChat called.');

    // If a chat session is already active (currentChatSessionId is set),
    // and its messages are loaded into chatMessages,
    // simply open the view to show the existing context.
    // This handles the case where the user closed the chat view
    // without explicitly starting a new chat or selecting another session.
    if (currentChatSessionId && chatMessages.length > 0) {
      console.log(
        `[App.tsx] Resuming active session ${currentChatSessionId} in general chat view.`
      );
      setIsChatViewOpen(true);
      //isLoading and error state are already part of the session's context (from chatSessions and loaded into view states by selectChatSession or by direct updates)
      return;
    }

    // If no active session, or if the active session somehow has no messages loaded in the view (less likely),
    // or if currentChatSessionId is null (meaning no session was active or was explicitly cleared),
    // then set up for a new general chat.
    console.log(
      '[App.tsx] No active session or active session view state is clear. Setting up for new general chat.'
    );
    setCurrentChatSessionId(null); // Explicitly indicate no specific session, ready for new general if message sent
    setChatMessages([]);
    setChatTarget({ type: 'general', content: '' });
    setLlmError(null);
    setIsLlmLoading(false);

    setIsChatViewOpen(true);
  }, [
    // Dependencies
    currentChatSessionId, // Now depends on currentChatSessionId
    chatMessages, // And chatMessages to check if we can resume
    setCurrentChatSessionId,
    setChatMessages,
    setChatTarget,
    setLlmError,
    setIsLlmLoading,
    setIsChatViewOpen,
  ]);

  const handleSendInstructionsToAI = useCallback(
    async (currentLocalUserInstructions: string) => {
      console.log(
        `[App.tsx] handleSendInstructionsToAI called. User instructions: ${currentLocalUserInstructions.substring(
          0,
          100
        )}...`
      );

      if (!selectedModelId) {
        console.warn('[App.tsx] No model selected. Cannot send instructions to AI.');
        setLlmError('No model selected. Please select a model first.');
        // To show this error, we might need to open the chat view if it's not already open
        // However, the main ChatButton itself is usually disabled if no model is configured at all.
        // For this specific flow, if no model is selected, it's an early exit.
        return;
      }

      // Pre-flight check for the selected model's provider configuration
      const providerForSelectedModel = getProviderFromModelId(selectedModelId);
      if (!providerForSelectedModel || !allLlmConfigs?.[providerForSelectedModel]?.apiKey) {
        const errorMsg = `API key for ${providerForSelectedModel || "the selected model's provider"} is not configured. Please go to LLM Settings to add it.`;
        console.warn(`[App.tsx] Configuration check failed: ${errorMsg}`);
        setLlmError(errorMsg);

        // Open a new, clean chat view to display this configuration error
        const newSessionId = createNewChatSession({ type: 'general', content: '' }); // Create session for context
        setCurrentChatSessionId(newSessionId); // Set it as current
        setChatMessages([]); // Ensure messages are clear
        setChatTarget({ type: 'general', content: '' }); // Set general target
        setIsLlmLoading(false); // Ensure loading is false
        setIsChatViewOpen(true); // Open the chat view to show the error
        return; // Stop further processing
      }

      const fullContentToSend =
        cachedBaseContentString +
        (cachedBaseContentString && currentLocalUserInstructions.trim() ? '\\n\\n' : '') +
        formatUserInstructionsBlock(currentLocalUserInstructions);

      if (!fullContentToSend.trim()) {
        console.warn(
          '[App.tsx] No content to send to AI (base content and instructions are empty).'
        );
        setLlmError('No content to send. Please select files or write instructions.');
        // Similar to above, ensure chat view is open if we want to show this error there.
        // If already in chat view, this error will appear. If not, we might need to open it.
        return;
      }

      // If configuration is present, proceed to set up for sending
      const newSessionIdAfterConfigCheck = createNewChatSession({ type: 'general', content: '' });
      console.log(
        `[App.tsx] Config check passed. Created new session for full context AI send: ${newSessionIdAfterConfigCheck}`
      );

      // Set the new session as active for chat view state updates
      setCurrentChatSessionId(newSessionIdAfterConfigCheck);
      setChatMessages([]);
      setChatTarget({ type: 'general', content: '' });
      setLlmError(null);
      setIsLlmLoading(false);
      setIsChatViewOpen(true);

      // Use a short timeout to ensure state updates for currentChatSessionId propagate
      // before handleSendMessage potentially reads it (though explicitSessionId makes this safer)
      setTimeout(async () => {
        console.log(
          `[App.tsx] Sending full context to new session ${newSessionIdAfterConfigCheck} using model ${selectedModelId}. Content length: ${fullContentToSend.length}`
        );
        // Pass the original short instructions and flag it as a full context submission
        await handleSendMessage(fullContentToSend, {
          originalQuestion: currentLocalUserInstructions,
          isFullContextSubmission: true,
          explicitSessionId: newSessionIdAfterConfigCheck, // Pass the explicitly created session ID
        });
      }, 50);
    },
    [
      selectedModelId,
      cachedBaseContentString,
      createNewChatSession,
      handleSendMessage,
      setIsChatViewOpen,
      setChatMessages,
      setChatTarget,
      setLlmError,
      setIsLlmLoading,
      allLlmConfigs, // Added dependency for the pre-flight configuration check
      setCurrentChatSessionId, // Added: used in the pre-flight error path
      // getProviderFromModelId is a stable utility, formatUserInstructionsBlock too
    ]
  );

  /* ============================== RENDER FUNCTIONS ============================== */

  // Add handler functions
  /**
   * Opens the system prompt editor modal
   */
  const handleOpenSystemPromptEditor = () => {
    setIsSystemPromptEditorOpen(true);
  };

  /**
   * Saves a new system prompt or updates an existing one.
   * Also selects the saved prompt.
   */
  const handleSaveSystemPrompt = (promptToSave: SystemPrompt) => {
    setSystemPrompts((prevPrompts) => {
      const existingIndex = prevPrompts.findIndex((p) => p.id === promptToSave.id);
      if (existingIndex > -1) {
        // Update existing
        const updatedPrompts = [...prevPrompts];
        updatedPrompts[existingIndex] = promptToSave;
        return updatedPrompts;
      } else {
        // Add new
        return [...prevPrompts, promptToSave];
      }
    });
    setSelectedSystemPromptId(promptToSave.id); // Select the newly saved/updated prompt
    // setIsSystemPromptEditorOpen(false); // Close editor after saving - handled by editor itself
  };

  /**
   * Deletes a system prompt if it's not a default one.
   * Selects a fallback prompt if the deleted one was active.
   */
  const handleDeleteSystemPrompt = (promptIdToDelete: string) => {
    const promptToDelete = systemPrompts.find((p) => p.id === promptIdToDelete);
    if (promptToDelete && promptToDelete.isDefault) {
      console.warn('Cannot delete a default system prompt.');
      // Optionally, show a user notification here
      return;
    }

    setSystemPrompts((prevPrompts) => prevPrompts.filter((p) => p.id !== promptIdToDelete));

    if (selectedSystemPromptId === promptIdToDelete) {
      // If the deleted prompt was selected, select the first default, or the first available.
      const firstDefault =
        systemPrompts.find((p) => p.isDefault && p.id !== promptIdToDelete) ||
        DEFAULT_SYSTEM_PROMPTS.find((p) => p.id !== promptIdToDelete);
      const firstAvailable = systemPrompts.find((p) => p.id !== promptIdToDelete);
      setSelectedSystemPromptId(firstDefault?.id || firstAvailable?.id || null);
    }
  };

  /**
   * Creates a new system prompt object, adds it to state, selects it, and prepares for editing.
   */
  const handleAddNewSystemPrompt = () => {
    const newPromptId = generateId('system-prompt_');
    const newPrompt: SystemPrompt = {
      id: newPromptId,
      name: 'New System Prompt',
      content: '', // Start with empty content
      isDefault: false,
    };
    setSystemPrompts((prev) => [...prev, newPrompt]);
    setSelectedSystemPromptId(newPromptId);
    // The SystemPromptEditor will typically open when a new prompt is selected for editing or creation.
    // If it's not already open, this is a good place to open it:
    // setIsSystemPromptEditorOpen(true); // This will be handled by the editor's open logic based on selection
  };

  // Save chat sessions to localStorage when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(chatSessions));
  }, [chatSessions]);

  // Save current chat session ID to localStorage when it changes
  useEffect(() => {
    if (currentChatSessionId) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_CHAT_SESSION, currentChatSessionId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_CHAT_SESSION);
    }
  }, [currentChatSessionId]);

  /**
   * Creates a unique ID for various entities
   */
  const generateId = (prefix = '') => {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  };

  /**
   * Creates a unique ID for chat messages
   */
  const generateMessageId = () => {
    return generateId('msg_');
  };

  /**
   * Updates the current session with the new messages
   */
  const updateCurrentSession = useCallback(
    (messages: ChatMessage[]) => {
      if (!currentChatSessionId) return;

      // Find the first user message to create a preview
      const firstUserMessage = messages.find((msg) => msg.role === 'user');
      let userPreview: string | undefined;
      if (firstUserMessage?.content) {
        userPreview = firstUserMessage.content.substring(0, 40);
        if (firstUserMessage.content.length > 40) {
          userPreview += '...';
        }
      }

      setChatSessions((prevSessions) => {
        let sessionFound = false;
        const updatedSessions = prevSessions.map((session) => {
          if (session.id === currentChatSessionId) {
            sessionFound = true;
            let title = session.title;

            if (session.targetType === 'file') {
              title = session.targetName
                ? `File: ${session.targetName} (${new Date(session.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })})`
                : session.title || 'File Chat';
            } else if (session.targetType === 'selection') {
              title = session.title.startsWith('Selection Chat') ? session.title : 'Selection Chat';
            } else {
              // For general chats, only update title if we have a meaningful user preview
              // and the current title is still the default "New Chat" format
              if (userPreview && session.title.includes('New Chat (')) {
                title = userPreview;
              } else if (session.title.includes('New Chat (') && !userPreview) {
                // Keep the timestamped title if no user preview yet
                title = session.title;
              } else if (userPreview) {
                // If we have user preview and it's not a timestamped title, use the preview
                title = userPreview;
              } else {
                // Fallback to existing title
                title = session.title;
              }
            }

            return {
              ...session,
              messages: messages.map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp,
                originalUserQuestion: msg.originalUserQuestion, // Preserve originalUserQuestion
                fileContext: msg.fileContext ? { ...msg.fileContext } : undefined, // Preserve and deep copy fileContext
                previewDisplayContent: msg.previewDisplayContent, // Preserve previewDisplayContent
                isContentTruncated: msg.isContentTruncated, // Preserve isContentTruncated
              })),
              lastUpdated: Date.now(),
              userPreview: userPreview || session.userPreview, // Preserve existing preview if new one is undefined
              title: title, // Update the title
            } as ChatSession; // Cast the updated active session
          }
          return session as ChatSession; // Cast the non-active session
        });

        // If the currentChatSessionId was not found in prevSessions (e.g., it's a brand new session ID)
        // and we have messages to add, this implies we should add this new session.
        // This case should ideally be handled by createNewChatSession adding it first.
        // For safety, if it wasn't found but we have a current ID, log a warning.
        if (!sessionFound && currentChatSessionId) {
          console.warn(
            `[App.tsx] updateCurrentSession: currentChatSessionId ${currentChatSessionId} not found in prevSessions. This might indicate an issue.`
          );
        }

        return updatedSessions;
      });
    },
    [currentChatSessionId]
  );

  // Update current session with new messages when chatMessages changes
  useEffect(() => {
    if (currentChatSessionId) {
      updateCurrentSession(chatMessages);
    }
  }, [chatMessages, currentChatSessionId, updateCurrentSession]);

  /**
   * Creates a new chat session and sets it as the current session
   */

  /**
   * Selects an existing chat session
   */
  const selectChatSession = (sessionId: string) => {
    console.log(`[App.tsx] selectChatSession called with ID: ${sessionId}`);
    const session = chatSessions.find((s) => s.id === sessionId);

    if (session) {
      setCurrentChatSessionId(session.id);
      setChatMessages(session.messages || []); // Ensure messages is always an array
      setLlmError(session.llmError || null);
      setIsLlmLoading(session.isLoading || false);

      // Reconstruct chatTarget from session information
      if (session.targetType && (session.targetName || session.targetType === 'general')) {
        if (session.targetType === 'file') {
          // Try to find the file in allFiles for its path, but prioritize session.targetContent
          const fileForSession = allFiles.find(
            (f) => f.name === session.targetName || f.path === session.targetName
          );
          setChatTarget({
            type: 'file',
            filePath: fileForSession?.path || session.targetName, // Fallback to targetName if no full path found
            fileName: session.targetName || 'File',
            content: session.targetContent || fileForSession?.content || '', // Prioritize session.targetContent
          });
        } else if (session.targetType === 'selection') {
          setChatTarget({
            type: 'selection',
            content: session.targetContent || '', // Use stored content
            fileName: session.targetName, // Optional: keep fileName if it was stored
          });
        } else if (session.targetType === 'general') {
          setChatTarget({ type: 'general', content: session.targetContent || '' }); // General might also have initial context
        }
      } else {
        // Default to general if no specific target info in session, or if it's an older session type
        setChatTarget({ type: 'general', content: '' });
      }
      setIsChatViewOpen(true); // Open chat view when a session is selected
    } else {
      console.warn(`[App.tsx] Session with ID ${sessionId} not found during selection.`);
      // Optionally, clear current session or handle as error
      // For now, just log and don't change current session if not found
    }
  };

  /**
   * Deletes a chat session
   */
  const deleteChatSession = (sessionId: string) => {
    setChatSessions((prevSessions) => prevSessions.filter((s) => s.id !== sessionId));

    // If deleting the current session, clear current session
    if (currentChatSessionId === sessionId) {
      setCurrentChatSessionId(null);
      setChatMessages([]);
      setChatTarget(undefined);
    }
  };

  /**
   * Handles creating a new chat
   */
  const handleCreateNewChat = () => {
    // Create a new chat session (general type if not specified)
    createNewChatSession();

    // Reset chat state
    setChatMessages([]);
    setChatTarget({ type: 'general', content: '' });
    setLlmError(null);
    setIsLlmLoading(false); // Add this line
  };

  // Make sure the LlmSettingsModal props are updated in the JSX:

  // In the JSX:
  // <LlmSettingsModal
  //   isOpen={isLlmSettingsModalOpen}
  //   onClose={() => setIsLlmSettingsModalOpen(false)}
  //   initialConfigs={allLlmConfigs} // MODIFIED
  //   onSaveAllConfigs={handleSaveAllLlmConfigs} // MODIFIED
  //   onOpenSystemPromptEditor={handleOpenSystemPromptEditor}
  // />

  // Update any UI elements that check for LLM configuration
  const isAnyLlmConfigured = (): boolean => {
    if (!allLlmConfigs) return false;
    return Object.values(allLlmConfigs).some((providerConfig) => !!providerConfig.apiKey);
  };

  // ChatButton in header example:
  // <ChatButton
  //   disabled={!isAnyLlmConfigured()}
  //   title={isAnyLlmConfigured() ? "Open AI Chat" : "Configure LLM Settings to enable Chat"}
  // />

  // FileList isLlmConfigured prop example:
  // <FileList isLlmConfigured={isAnyLlmConfigured()} />

  // ChatView isLlmConfigured prop example:
  // <ChatView isLlmConfigured={isAnyLlmConfigured()} />

  // Placeholder for clearSavedState - Implement or remove button
  const clearSavedState = useCallback(() => {
    console.log('Clearing saved state for current context...');

    const keysToPreserve = [
      STORAGE_KEYS.WORKSPACES,
      STORAGE_KEYS.TASK_TYPE,
      STORAGE_KEYS.IGNORE_MODE,
      STORAGE_KEYS.IGNORE_SETTINGS_MODIFIED,
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.WINDOW_SIZES,

      STORAGE_KEYS.SYSTEM_PROMPTS,
      STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID,
      STORAGE_KEYS.CHAT_HISTORY, // Preserves the list of all chat sessions
      STORAGE_KEYS.RECENT_FOLDERS,
      // 'pastemax-selected-model' is not in STORAGE_KEYS and will be preserved by not touching it.
    ];

    // Clear localStorage keys not in keysToPreserve
    for (const key in STORAGE_KEYS) {
      const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS];
      if (!keysToPreserve.includes(storageKey)) {
        localStorage.removeItem(storageKey);
      }
    }

    // Clear session storage if used
    sessionStorage.removeItem('hasLoadedInitialData');

    // Reset React states
    setSelectedFolder(null);
    setAllFiles([]);
    setSelectedFiles([]); // Clears all selected files
    setDisplayedFiles([]);
    setSearchTerm('');
    setSortOrder('tokens-desc'); // Default sort order
    setExpandedNodes({});
    setIncludeFileTree(false);
    setIncludeBinaryPaths(false); // Default value, as its localStorage key is cleared
    setUserInstructions('');
    setCachedBaseContentString('');
    setCachedBaseContentTokens(0);
    setTotalFormattedContentTokens(0);

    // Reset chat related states for current context
    setChatMessages([]);
    setChatTarget(undefined);
    setLlmError(null);
    setCurrentChatSessionId(null); // current session is cleared, but history preserved.

    // Reset current workspace context
    // localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKSPACE); // Already removed by the loop above
    setCurrentWorkspaceId(null);

    // Restore task type if it was saved (TASK_TYPE key is in keysToPreserve)
    const savedTaskType = localStorage.getItem(STORAGE_KEYS.TASK_TYPE);
    setSelectedTaskType(savedTaskType || '');

    if (isElectron) {
      window.electron.ipcRenderer.send('cancel-directory-loading');
      // Assuming 'clear-main-cache' is a valid IPC message handled by the main process
      window.electron.ipcRenderer.send('clear-main-cache');
    }

    setProcessingStatus({
      status: 'idle',
      message: 'Current folder data and selections cleared.',
    });

    console.log('Finished clearing saved state for current context.');
  }, [
    isElectron,
    setSelectedFolder,
    setAllFiles,
    setSelectedFiles,
    setDisplayedFiles,
    setSearchTerm,
    setSortOrder,
    setExpandedNodes,
    setIncludeFileTree,
    setIncludeBinaryPaths,
    setUserInstructions,
    setCachedBaseContentString,
    setCachedBaseContentTokens,
    setTotalFormattedContentTokens,
    setProcessingStatus,
    setCurrentWorkspaceId,
    setSelectedTaskType,
    setChatMessages,
    setChatTarget,
    setLlmError,
    setCurrentChatSessionId,
    // STORAGE_KEYS is a constant, not needed in deps
  ]);

  return (
    <ThemeProvider>
      <div className="app-container">
        <header className="header">
          <h1>PasteMax</h1>
          <div className="header-actions">
            <ThemeToggle />
            <button
              className="llm-settings-button"
              onClick={handleOpenLlmSettings}
              title="Configure LLM Settings"
            >
              <MessageSquare size={16} />
              <span>LLM Settings</span>
            </button>
            <ChatButton
              onClick={handleOpenGeneralChat}
              className="header-chat-button"
              text="Chat with AI"
              disabled={!isAnyLlmConfigured()}
              title={isAnyLlmConfigured() ? 'Open AI Chat' : 'Configure LLM to enable Chat'}
            />
            <div className="folder-info">
              <div className="selected-folder">
                {selectedFolder ? selectedFolder : 'No Folder Selected'}
              </div>
              <button
                className="select-folder-btn"
                onClick={openFolder}
                disabled={processingStatus.status === 'processing'}
                title="Select a Folder to import"
              >
                <FolderOpen size={16} />
              </button>
              <button
                className="clear-data-btn"
                onClick={clearSavedState}
                title="Clear all Selected Files and Folders"
              >
                <XCircle size={16} />
              </button>
              <button
                className="refresh-list-btn"
                onClick={() => {
                  if (selectedFolder) {
                    setReloadTrigger((prev: number) => prev + 1);
                  }
                }}
                disabled={processingStatus.status === 'processing' || !selectedFolder}
                title="Refresh File List"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={handleViewIgnorePatterns}
                title="View Ignore Filter"
                className="view-ignores-btn"
              >
                <FilterX size={16} />
              </button>
              <button
                className="workspace-button"
                title="Workspace Manager"
                onClick={handleOpenWorkspaceManager}
              >
                <FolderKanban size={16} />
                {currentWorkspaceName ? (
                  <span className="current-workspace-name">{currentWorkspaceName}</span>
                ) : (
                  'Workspaces'
                )}
              </button>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginLeft: 8,
                }}
              >
                <button
                  className={`header-action-btn check-updates-button${initialAutoUpdateResult?.isUpdateAvailable && !isUpdateModalOpen ? ' update-available' : ''}`}
                  title="Check for application updates"
                  onClick={handleCheckForUpdates}
                >
                  <DownloadCloud size={16} />
                </button>
                {/* Show update available indicator if auto check found an update and modal is not open */}
                {initialAutoUpdateResult?.isUpdateAvailable && !isUpdateModalOpen && (
                  <div
                    style={{
                      color: 'var(--color-accent, #2da6fc)',
                      fontWeight: 600,
                      fontSize: 13,
                      marginTop: 4,
                    }}
                    data-testid="update-available-indicator"
                  >
                    Update Available!
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {processingStatus.status === 'processing' && (
          <div className="processing-indicator">
            <div className="spinner"></div>
            <span>{processingStatus.message}</span>
            {processingStatus.message !== 'Applying ignore mode…' && (
              <button className="cancel-btn" onClick={cancelDirectoryLoading}>
                Cancel
              </button>
            )}
          </div>
        )}

        {processingStatus.status === 'error' && (
          <div className="error-message">Error: {processingStatus.message}</div>
        )}

        {/* Main content area - always rendered regardless of whether a folder is selected */}
        <div className="main-content">
          {/* Render Sidebar if folder selected, otherwise show empty sidebar with task type selector */}
          {selectedFolder ? (
            <Sidebar
              selectedFolder={selectedFolder}
              allFiles={allFiles}
              selectedFiles={selectedFiles}
              toggleFileSelection={toggleFileSelection}
              toggleFolderSelection={toggleFolderSelection}
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              selectAllFiles={selectAllFiles}
              deselectAllFiles={deselectAllFiles}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
              includeBinaryPaths={includeBinaryPaths}
              selectedTaskType={selectedTaskType}
              onTaskTypeChange={handleTaskTypeChange}
              onManageCustomTypes={handleManageCustomTaskTypes}
              currentWorkspaceName={currentWorkspaceName}
              collapseAllFolders={collapseAllFolders}
              expandAllFolders={expandAllFolders}
            />
          ) : (
            <div className="sidebar" style={{ width: '300px' }}>
              {/* Task Type Selector - always visible */}
              <TaskTypeSelector
                selectedTaskType={selectedTaskType}
                onTaskTypeChange={handleTaskTypeChange}
                onManageCustomTypes={handleManageCustomTaskTypes}
              />

              <div className="sidebar-header">
                <div className="sidebar-title">Files</div>
              </div>

              <div className="tree-empty">
                No folder selected. Use the{' '}
                <FolderOpen
                  size={16}
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'middle',
                    marginLeft: '2px',
                    marginRight: '2px',
                  }}
                />{' '}
                button to choose a project folder.
              </div>

              <div className="sidebar-resize-handle"></div>
            </div>
          )}

          {/* Content area - always visible with appropriate empty states */}
          <div className="content-area">
            <div className="content-header">
              <div className="content-title">Selected Files</div>
              <div className="content-header-actions-group">
                <div className="stats-info">
                  {selectedFolder
                    ? `${displayedFiles.length} files | ~${totalFormattedContentTokens.toLocaleString()} tokens`
                    : '0 files | ~0 tokens'}
                </div>
                {selectedFolder && (
                  <div className="sort-options">
                    <div className="sort-selector-wrapper">
                      <button
                        type="button"
                        className="sort-selector-button"
                        onClick={toggleSortDropdown}
                        aria-haspopup="listbox"
                        aria-expanded={sortDropdownOpen}
                        aria-label="Change sort order"
                      >
                        <span
                          className="sort-icon"
                          aria-hidden="true"
                          style={{ display: 'flex', alignItems: 'center' }}
                        >
                          <ArrowDownUp size={16} />
                        </span>
                        <span id="current-sort-value" className="current-sort">
                          {sortOptions.find((opt) => opt.value === sortOrder)?.label || sortOrder}
                        </span>
                        <span className="dropdown-arrow" aria-hidden="true">
                          {sortDropdownOpen ? '▲' : '▼'}
                        </span>
                      </button>
                      {sortDropdownOpen && (
                        <ul
                          className="sort-dropdown"
                          role="listbox"
                          aria-label="Sort order options"
                        >
                          {sortOptions.map((option) => (
                            <li
                              key={option.value}
                              role="option"
                              aria-selected={option.value === sortOrder}
                              className={`sort-option-item ${option.value === sortOrder ? 'selected' : ''}`}
                            >
                              <button
                                type="button"
                                className="sort-option-button"
                                onClick={() => handleSortChange(option.value)}
                              >
                                {option.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* File List - show appropriate message when no folder is selected */}
            <div className="file-list-container">
              {selectedFolder ? (
                <FileList
                  files={displayedFiles}
                  selectedFiles={selectedFiles}
                  toggleFileSelection={toggleFileSelection}
                  onChatAbout={handleChatAboutFile}
                  isLlmConfigured={isAnyLlmConfigured()}
                />
              ) : (
                <div className="file-list-empty">
                  No folder selected. Use the{' '}
                  <FolderOpen
                    size={16}
                    style={{
                      display: 'inline-block',
                      verticalAlign: 'middle',
                      marginLeft: '6px',
                      marginRight: '6px',
                    }}
                  />{' '}
                  button to choose a project folder.
                </div>
              )}
            </div>

            {/* User instructions section - always visible */}
            <UserInstructions
              instructions={userInstructions}
              setInstructions={setUserInstructions}
              selectedTaskType={selectedTaskType}
              onSendToAIClicked={handleSendInstructionsToAI} // Ensure this is correctly passed
            />

            {/* Model selection dropdown */}
            <div className="model-selection">
              <ModelDropdown
                externalSelectedModelId={selectedModelId}
                onModelSelect={handleModelSelect}
                currentTokenCount={totalFormattedContentTokens}
              />
            </div>

            {/* Copy bar: options left, buttons right */}
            <div className="copy-settings-container">
              <div className="copy-settings-options">
                <div
                  className="toggle-option-item"
                  title="Include File Tree in the Copyable Content"
                >
                  <ToggleSwitch
                    id="includeFileTree"
                    checked={includeFileTree}
                    onChange={(e) => setIncludeFileTree(e.target.checked)}
                  />
                  <label htmlFor="includeFileTree">Include File Tree</label>
                </div>
                <div
                  className="toggle-option-item"
                  title="Include Binary As Paths in the Copyable Content"
                >
                  <ToggleSwitch
                    id="includeBinaryPaths"
                    checked={includeBinaryPaths}
                    onChange={(e) => setIncludeBinaryPaths(e.target.checked)}
                  />
                  <label htmlFor="includeBinaryPaths">Include Binary As Paths</label>
                </div>
              </div>
              <div className="copy-buttons-group">
                <CopyHistoryButton
                  onClick={() => setIsCopyHistoryModalOpen(true)}
                  className="copy-history-button-position"
                />
                <button
                  className="primary copy-button-main"
                  onClick={handleCopy}
                  disabled={selectedFiles.length === 0}
                >
                  <span className="copy-button-text">
                    COPY ALL SELECTED ({selectedFiles.length} files)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Ignore Patterns Viewer Modal */}
        <IgnoreListModal
          isOpen={isIgnoreViewerOpen}
          onClose={handleIgnoreViewerClose}
          patterns={ignorePatterns ?? undefined}
          error={ignorePatternsError ?? undefined}
          selectedFolder={selectedFolder}
          isElectron={isElectron}
          ignoreSettingsModified={ignoreSettingsModified}
        />
        <UpdateModal
          isOpen={isUpdateModalOpen}
          onClose={() => setIsUpdateModalOpen(false)}
          updateStatus={updateStatus}
        />
        {isCustomTaskTypeModalOpen && (
          <CustomTaskTypeModal
            isOpen={isCustomTaskTypeModalOpen}
            onClose={() => setIsCustomTaskTypeModalOpen(false)}
            onTaskTypesUpdated={handleCustomTaskTypesUpdated}
          />
        )}
        <WorkspaceManager
          isOpen={isWorkspaceManagerOpen}
          onClose={() => setIsWorkspaceManagerOpen(false)}
          workspaces={workspaces}
          currentWorkspace={currentWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onUpdateWorkspaceFolder={handleUpdateWorkspaceFolder}
          selectedFolder={selectedFolder}
        />
        <CopyHistoryModal
          isOpen={isCopyHistoryModalOpen}
          onClose={() => setIsCopyHistoryModalOpen(false)}
          copyHistory={copyHistory}
          onCopyItem={handleCopyFromHistory}
          onClearHistory={handleClearCopyHistory}
        />
        <ConfirmUseFolderModal
          isOpen={isConfirmUseFolderModalOpen}
          onClose={() => setIsConfirmUseFolderModalOpen(false)}
          onConfirm={handleConfirmUseCurrentFolder}
          onDecline={handleDeclineUseCurrentFolder}
          workspaceName={confirmFolderModalDetails.workspaceName}
          folderPath={confirmFolderModalDetails.folderPath}
        />

        {/* LLM Settings Modal */}
        {isLlmSettingsModalOpen && (
          <LlmSettingsModal
            isOpen={isLlmSettingsModalOpen}
            onClose={() => setIsLlmSettingsModalOpen(false)}
            initialConfigs={allLlmConfigs}
            onSaveAllConfigs={handleSaveAllLlmConfigs}
            onOpenSystemPromptEditor={handleOpenSystemPromptEditor}
          />
        )}
        {isChatViewOpen && (
          <ChatView
            key={currentChatSessionId || 'no-session-active'}
            isOpen={isChatViewOpen}
            onClose={handleCloseChatView}
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isLlmLoading}
            error={llmError}
            chatTarget={chatTarget}
            isLlmConfigured={isAnyLlmConfigured()}
            selectedModelId={selectedModelId}
            onModelSelect={handleModelSelect}
            onCopyResponse={handleCopyResponse}
            chatSessions={chatSessions}
            currentSessionId={currentChatSessionId}
            onSelectSession={selectChatSession}
            onDeleteSession={deleteChatSession}
            onCreateNewSession={handleCreateNewChat}
            onRetry={handleRetrySendMessage}
            currentLlmRequestId={currentChatSessionId}
            onCancelLlmRequest={handleCancelLlmRequest}
          />
        )}
        {isSystemPromptEditorOpen && (
          <SystemPromptEditor
            isOpen={isSystemPromptEditorOpen}
            onClose={() => setIsSystemPromptEditorOpen(false)}
            // Pass all system prompts and the selected ID
            systemPrompts={systemPrompts}
            selectedSystemPromptId={selectedSystemPromptId}
            onSaveSystemPrompt={handleSaveSystemPrompt}
            onDeleteSystemPrompt={handleDeleteSystemPrompt}
            onSelectSystemPrompt={setSelectedSystemPromptId} // Allow editor to change selection
            onAddNewSystemPrompt={handleAddNewSystemPrompt} // Allow editor to trigger add new
            // initialPrompt={systemPrompt} // REMOVED - Editor handles current prompt based on ID
            // onSave={handleSaveSystemPrompt} // REMOVED - Replaced by onSaveSystemPrompt
            // onResetToDefault={handleResetSystemPrompt} // REMOVED - Editor handles reset logic internally for its UI
          />
        )}
      </div>
    </ThemeProvider>
  );
};

export default App;

export {}; // Add this line to fix the global scope augmentation error
