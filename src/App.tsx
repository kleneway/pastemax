/* ============================== IMPORTS ============================== */
import { useState, useEffect, useCallback, useRef } from 'react';
import ConfirmUseFolderModal from './components/ConfirmUseFolderModal';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import { FileData, IgnoreMode } from './types/FileTypes';
import type { GitChangedFile, GitCommitSummary } from './types/GitTypes';
import { ThemeProvider } from './context/ThemeContext';
import IgnoreListModal from './components/IgnoreListModal';
import ThemeToggle from './components/ThemeToggle';
import UpdateModal from './components/UpdateModal';
import { useIgnorePatterns } from './hooks/useIgnorePatterns';
import UserInstructions from './components/UserInstructions';
import { STORAGE_KEY_TASK_TYPE } from './types/TaskTypes';
import {
  DownloadCloud,
  ArrowDownUp,
  FolderKanban,
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
import SavedPromptsDropdown from './components/SavedPromptsDropdown';

/**
 * Import path utilities for handling file paths across different operating systems.
 * While not all utilities are used directly, they're kept for consistency and future use.
 */
import { normalizePath, arePathsEqual, isSubPath, dirname } from './utils/pathUtils';

/**
 * Import utility functions for content formatting and language detection.
 * The contentFormatUtils module handles content assembly and applies language detection
 * via the languageUtils module internally.
 */
import { formatBaseFileContent, formatUserInstructionsBlock } from './utils/contentFormatUtils';
import { assembleSmartContextContent } from './utils/smartContextUtils';
import { countTokensCached } from './utils/tokenUtils';
import { optimizeGitDiff } from './utils/diffOptimizationUtils';
import type { UpdateDisplayState } from './types/UpdateTypes';
import type { ModelInfo } from './types/ModelTypes';

/* ============================== GLOBAL DECLARATIONS ============================== */

/* ============================== CONSTANTS ============================== */
/**
 * Keys used for storing app state in localStorage.
 * Keeping them in one place makes them easier to manage and update.
 */
const STORAGE_KEYS = {
  SELECTED_FOLDER: 'pastemax-selected-folder',
  SELECTED_FILES: 'pastemax-selected-files',
  SORT_ORDER: 'pastemax-sort-order',
  SEARCH_TERM: 'pastemax-search-term',
  EXPANDED_NODES: 'pastemax-expanded-nodes',
  IGNORE_MODE: 'pastemax-ignore-mode',
  IGNORE_SETTINGS_MODIFIED: 'pastemax-ignore-settings-modified',
  INCLUDE_BINARY_PATHS: 'pastemax-include-binary-paths',
  INCLUDE_GIT_DIFFS: 'pastemax-include-git-diffs',
  TASK_TYPE: STORAGE_KEY_TASK_TYPE,
  WORKSPACES: 'pastemax-workspaces',
  CURRENT_WORKSPACE: 'pastemax-current-workspace',
  COPY_HISTORY: 'pastemax-copy-history',
  SMART_CONTEXT_ENABLED: 'pastemax-smart-context-enabled',
  SMART_CONTEXT_BUDGET_TOKENS: 'pastemax-smart-context-budget-tokens',
};

const SMART_CONTEXT_JOIN_THRESHOLD = 10;
const SMART_CONTEXT_SMALL_FILE_TOKENS = 800;
const LEGACY_SMART_CONTEXT_BUDGET_PERCENT_KEY = 'pastemax-smart-context-budget-percent';
const SMART_CONTEXT_DEFAULT_CONTEXT_LINES = 12;

/* ============================== MAIN APP COMPONENT ============================== */
/**
 * The main App component that handles:
 * - File selection and management
 * - Folder navigation
 * - File content copying
 * - UI state management
 */

const App = (): JSX.Element => {
  /* ============================== STATE: Load initial state from localStorage ============================== */
  const savedFolder = localStorage.getItem(STORAGE_KEYS.SELECTED_FOLDER);
  const savedFiles = localStorage.getItem(STORAGE_KEYS.SELECTED_FILES);
  const savedSortOrder = localStorage.getItem(STORAGE_KEYS.SORT_ORDER);
  const savedSearchTerm = localStorage.getItem(STORAGE_KEYS.SEARCH_TERM);
  // const savedTaskType = localStorage.getItem(STORAGE_KEYS.TASK_TYPE); // Removed this line
  // const savedIgnoreMode = localStorage.getItem(STORAGE_KEYS.IGNORE_MODE); no longer needed

  /* ============================== STATE: Core App State ============================== */
  const [selectedFolder, setSelectedFolder] = useState(
    savedFolder ? normalizePath(savedFolder) : null
  );
  const isElectron = window.electron !== undefined;
  const [allFiles, setAllFiles] = useState([] as FileData[]);

  /* ============================== STATE: Workspace Management ============================== */
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_WORKSPACE) || null;
  });
  // State for confirm folder modal
  const [isConfirmUseFolderModalOpen, setIsConfirmUseFolderModalOpen] = useState(false);
  const [confirmFolderModalDetails, setConfirmFolderModalDetails] = useState<{
    workspaceId: string | null;
    workspaceName: string;
    folderPath: string;
  }>({ workspaceId: null, workspaceName: '', folderPath: '' });

  const [workspaces, setWorkspaces] = useState(() => {
    const savedWorkspaces = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
    if (savedWorkspaces) {
      try {
        const parsed = JSON.parse(savedWorkspaces);
        if (Array.isArray(parsed)) {
          console.log(`Initialized workspaces state with ${parsed.length} workspaces`);
          return parsed as Workspace[];
        } else {
          console.warn(
            'Invalid workspaces data in localStorage (not an array), resetting to empty array'
          );
          localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
          return [] as Workspace[];
        }
      } catch (error) {
        console.error('Failed to parse workspaces from localStorage during initialization:', error);
        // Reset localStorage to prevent further errors
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
        return [] as Workspace[];
      }
    }
    // Initialize with empty array and ensure localStorage has a valid value
    console.log('No workspaces found in localStorage, initializing with empty array');
    localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
    return [] as Workspace[];
  });

  /* ============================== STATE: Ignore Patterns ============================== */
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

  /* ============================== STATE: File Selection and Sorting ============================== */
  const [selectedFiles, setSelectedFiles] = useState(
    (savedFiles ? JSON.parse(savedFiles).map(normalizePath) : []) as string[]
  );
  const [sortOrder, setSortOrder] = useState(savedSortOrder || 'tokens-desc');
  const [searchTerm, setSearchTerm] = useState(savedSearchTerm || '');
  const [expandedNodes, setExpandedNodes] = useState({} as Record<string, boolean>);
  const [displayedFiles, setDisplayedFiles] = useState([] as FileData[]);
  const [processingStatus, setProcessingStatus] = useState({ status: 'idle', message: '' } as {
    status: 'idle' | 'processing' | 'complete' | 'error';
    message: string;
  });
  const [includeFileTree, setIncludeFileTree] = useState(false);
  const [includeBinaryPaths, setIncludeBinaryPaths] = useState(
    localStorage.getItem(STORAGE_KEYS.INCLUDE_BINARY_PATHS) === 'true'
  );
  const [includeGitDiffs, setIncludeGitDiffs] = useState(
    localStorage.getItem(STORAGE_KEYS.INCLUDE_GIT_DIFFS) === 'true'
  );
  const [smartContextEnabled, setSmartContextEnabled] = useState(
    localStorage.getItem(STORAGE_KEYS.SMART_CONTEXT_ENABLED) === 'true'
  );
  const [smartContextBudgetTokens, setSmartContextBudgetTokens] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEYS.SMART_CONTEXT_BUDGET_TOKENS));
    if (Number.isFinite(stored) && stored > 0) {
      return Math.floor(stored);
    }
    const legacyPercent = Number(localStorage.getItem(LEGACY_SMART_CONTEXT_BUDGET_PERCENT_KEY));
    if (Number.isFinite(legacyPercent) && legacyPercent > 0) {
      // Approximate legacy percent with default 70% of a 32k window
      const fallback = Math.round((legacyPercent / 100) * 32000);
      return Math.max(fallback, 4000);
    }
    return 20000;
  });
  const [selectedModelContextLength, setSelectedModelContextLength] = useState<number | null>(null);

  /* ============================== STATE: Git Integration ============================== */
  const [gitChangedFiles, setGitChangedFiles] = useState<Record<string, GitChangedFile>>({});
  const [isGitChangesLoading, setIsGitChangesLoading] = useState(false);
  const [gitChangesError, setGitChangesError] = useState<string | null>(null);
  const [gitCommitHistory, setGitCommitHistory] = useState<GitCommitSummary[]>([]);
  const [isCommitHistoryLoading, setIsCommitHistoryLoading] = useState(false);
  const [commitHistoryError, setCommitHistoryError] = useState<string | null>(null);
  const [selectedFilesDiff, setSelectedFilesDiff] = useState('');
  const [selectedDiffPaths, setSelectedDiffPaths] = useState<string[]>([]);

  /* ============================== STATE: UI Controls ============================== */
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState('');
  const [isCustomTaskTypeModalOpen, setIsCustomTaskTypeModalOpen] = useState(false);

  /* ============================== STATE: User Instructions ============================== */
  const [userInstructions, setUserInstructions] = useState('');
  const [totalFormattedContentTokens, setTotalFormattedContentTokens] = useState(0);
  const [cachedBaseContentTokens, setCachedBaseContentTokens] = useState(0);
  /**
   * State variable used to trigger data re-fetching when its value changes.
   * The `reloadTrigger` is incremented whenever a refresh of the file list or
   * other related data is required. Components or hooks that depend on this
   * state can listen for changes and re-execute their logic accordingly.
   */
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const lastSentIgnoreSettingsModifiedRef = useRef(null as boolean | null);

  /* ============================== STATE: Copy History ============================== */
  const [copyHistory, setCopyHistory] = useState(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEYS.COPY_HISTORY);
    if (savedHistory) {
      try {
        return JSON.parse(savedHistory) as CopyHistoryItem[];
      } catch {
        return [] as CopyHistoryItem[];
      }
    }
    return [] as CopyHistoryItem[];
  });
  const [isCopyHistoryModalOpen, setIsCopyHistoryModalOpen] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState(() => {
    const savedModelId = localStorage.getItem('pastemax-selected-model');
    return savedModelId || '';
  });

  // Utility function to clear all saved state and reset the app
  const clearSavedState = useCallback(() => {
    console.time('clearSavedState');
    // Clear only folder-related localStorage items, preserving workspaces and other settings
    const keysToPreserve = [
      STORAGE_KEYS.IGNORE_MODE,
      STORAGE_KEYS.IGNORE_SETTINGS_MODIFIED,
      STORAGE_KEYS.WORKSPACES,
      STORAGE_KEYS.TASK_TYPE,
    ];

    Object.values(STORAGE_KEYS).forEach((key) => {
      if (!keysToPreserve.includes(key)) {
        localStorage.removeItem(key);
      }
    });

    // Clear any session storage items
    sessionStorage.removeItem('hasLoadedInitialData');

    // Reset all state to initial values
    setSelectedFolder(null);
    setAllFiles([]);
    setSelectedFiles([]);
    setDisplayedFiles([]);
    setSearchTerm('');
    setSortOrder('tokens-desc');
    setExpandedNodes({});
    setIncludeFileTree(false);
    setIncludeGitDiffs(false);
    setProcessingStatus({ status: 'idle', message: 'All saved data cleared' });

    // Also cancel any ongoing directory loading and clear main process caches
    if (isElectron) {
      window.electron.ipcRenderer.send('cancel-directory-loading');
      window.electron.ipcRenderer.send('clear-main-cache');
    }

    // Clear current workspace but keep workspaces list intact
    localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKSPACE);
    setCurrentWorkspaceId(null);
    console.timeEnd('clearSavedState');

    // Keep the task type
    const savedTaskType = localStorage.getItem(STORAGE_KEYS.TASK_TYPE);

    // Reload the page to refresh UI, but without affecting workspaces data
    setProcessingStatus({
      status: 'complete',
      message: 'Selected folder cleared',
    });

    // Avoid full page reload to preserve workspace data
    setSelectedFolder(null);
    setAllFiles([]);
    setSelectedFiles([]);
    setDisplayedFiles([]);

    // Restore task type if it was saved
    if (savedTaskType) {
      setSelectedTaskType(savedTaskType);
    }
  }, [
    isElectron,
    setSelectedFolder,
    setAllFiles,
    setSelectedFiles,
    setDisplayedFiles,
    setSelectedTaskType,
    setProcessingStatus,
  ]); // Updated dependencies

  /* ============================== EFFECTS ============================== */

  // Load expanded nodes state from localStorage
  useEffect(() => {
    const savedExpandedNodes = localStorage.getItem(STORAGE_KEYS.EXPANDED_NODES);
    if (savedExpandedNodes) {
      try {
        setExpandedNodes(JSON.parse(savedExpandedNodes));
      } catch (error) {
        // Keep error logging for troubleshooting
        console.error('Error parsing saved expanded nodes:', error);
      }
    }
  }, []);

  // Persist selected folder when it changes
  useEffect(() => {
    if (selectedFolder) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_FOLDER, selectedFolder);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
    }
  }, [selectedFolder]);

  useEffect(() => {
    setGitChangedFiles({});
    setGitChangesError(null);
    setGitCommitHistory([]);
    setIsGitChangesLoading(false);
    setIsCommitHistoryLoading(false);
    setCommitHistoryError(null);
    setSelectedFilesDiff('');
    setSelectedDiffPaths([]);
  }, [selectedFolder]);

  // Persist selected files when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_FILES, JSON.stringify(selectedFiles));
  }, [selectedFiles]);

  // Persist sort order when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SORT_ORDER, sortOrder);
  }, [sortOrder]);

  // Persist search term when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SEARCH_TERM, searchTerm);
  }, [searchTerm]);

  // Persist ignore mode when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.IGNORE_MODE, ignoreMode);
  }, [ignoreMode]);

  // Persist includeBinaryPaths when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INCLUDE_BINARY_PATHS, String(includeBinaryPaths));
  }, [includeBinaryPaths]);

  // Persist includeGitDiffs when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INCLUDE_GIT_DIFFS, String(includeGitDiffs));
  }, [includeGitDiffs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SMART_CONTEXT_ENABLED, String(smartContextEnabled));
  }, [smartContextEnabled]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.SMART_CONTEXT_BUDGET_TOKENS,
      String(smartContextBudgetTokens)
    );
    localStorage.removeItem(LEGACY_SMART_CONTEXT_BUDGET_PERCENT_KEY);
  }, [smartContextBudgetTokens]);

  useEffect(() => {
    if (
      selectedModelContextLength &&
      selectedModelContextLength > 0 &&
      smartContextBudgetTokens > selectedModelContextLength
    ) {
      setSmartContextBudgetTokens(selectedModelContextLength);
    }
  }, [selectedModelContextLength, smartContextBudgetTokens]);

  // Persist task type when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TASK_TYPE, selectedTaskType);
  }, [selectedTaskType]);

  // Effect to handle binary file selection when includeBinaryPaths changes
  useEffect(() => {
    if (!allFiles.length) return;

    setSelectedFiles((prevSelectedFiles: string[]) => {
      // Preserve all existing selections
      const newSelectedFiles = [...prevSelectedFiles];

      // Process binary files based on includeBinaryPaths
      allFiles.forEach((file: FileData) => {
        const normalizedPath = normalizePath(file.path);
        if (file.isBinary) {
          const isSelected = newSelectedFiles.some((p) => arePathsEqual(p, normalizedPath));

          if (includeBinaryPaths && !isSelected) {
            // Add binary file if not already selected
            newSelectedFiles.push(normalizedPath);
          } else if (!includeBinaryPaths && isSelected) {
            // Remove binary file if selected
            const index = newSelectedFiles.findIndex((p) => arePathsEqual(p, normalizedPath));
            if (index !== -1) {
              newSelectedFiles.splice(index, 1);
            }
          }
        }
      });

      return newSelectedFiles;
    });
  }, [includeBinaryPaths, allFiles]);

  // Add this new useEffect for safe mode detection
  useEffect(() => {
    if (!isElectron) return;

    const handleStartupMode = (mode: { safeMode: boolean }) => {
      setIsSafeMode(mode.safeMode);

      // If we're in safe mode, don't auto-load the previously selected folder
      if (mode.safeMode) {
        localStorage.removeItem('hasLoadedInitialData');
        localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      }
    };

    window.electron.ipcRenderer.on('startup-mode', handleStartupMode);

    return () => {
      window.electron.ipcRenderer.removeListener('startup-mode', handleStartupMode);
    };
  }, [isElectron]);

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

  /* ============================== HANDLERS & UTILITIES ============================== */

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
      console.log(
        `[IPC] file-added: Previous count: ${prevFiles.length}, New count: ${newAllFiles.length}, Path: ${newFile.path}`
      );
      return newAllFiles;
    });
  }, []);

  const handleFileUpdated = useCallback((updatedFile: FileData) => {
    console.log('[IPC] Received file-updated:', updatedFile);
    setAllFiles((prevFiles: FileData[]) => {
      const newAllFiles = prevFiles.map((file) =>
        arePathsEqual(file.path, updatedFile.path) ? updatedFile : file
      );
      console.log(
        `[IPC] file-updated: Count remains: ${newAllFiles.length}, Updated path: ${updatedFile.path}`
      );
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
        console.log(
          `[IPC] file-removed: Previous count: ${prevFiles.length}, New count: ${newAllFiles.length}, Removed path: ${normalizedPath}`
        );
        return newAllFiles;
      });

      setSelectedFiles((prevSelected: string[]) => {
        const newSelected = prevSelected.filter((p) => !arePathsEqual(p, normalizedPath));
        if (newSelected.length !== prevSelected.length) {
          console.log(
            `[IPC] file-removed: Also removed from selectedFiles. Path: ${normalizedPath}`
          );
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

  const refreshBaseContent = useCallback(async () => {
    if (!selectedFiles.length) {
      setCachedBaseContentTokens(0);
      return { content: '', tokenCount: 0 };
    }

    if (smartContextEnabled) {
      const requestedBudget = Math.max(0, Math.floor(smartContextBudgetTokens));
      const computedBudget =
        selectedModelContextLength && selectedModelContextLength > 0 && requestedBudget > 0
          ? Math.min(requestedBudget, selectedModelContextLength)
          : requestedBudget;

      try {
        // Optimize the diff to avoid duplicating new file content
        const optimizedDiff = selectedFilesDiff ? optimizeGitDiff(selectedFilesDiff) : '';

        const result = await assembleSmartContextContent({
          files: allFiles,
          selectedFiles,
          sortOrder,
          includeFileTree,
          includeBinaryPaths,
          selectedFolder,
          diffText: optimizedDiff,
          diffPaths: selectedDiffPaths,
          includeGitDiffs,
          gitDiff: includeGitDiffs ? optimizedDiff : undefined,
          budgetTokens: computedBudget,
          contextLines: SMART_CONTEXT_DEFAULT_CONTEXT_LINES,
          joinThreshold: SMART_CONTEXT_JOIN_THRESHOLD,
          smallFileTokenThreshold: SMART_CONTEXT_SMALL_FILE_TOKENS,
        });
        setCachedBaseContentTokens(result.tokenCount);
        return result;
      } catch (error) {
        console.error('Error assembling smart context content:', error);
        setCachedBaseContentTokens(0);
        return { content: '', tokenCount: 0 };
      }
    }

    // Optimize the diff to avoid duplicating new file content
    const optimizedDiff =
      includeGitDiffs && selectedFilesDiff ? optimizeGitDiff(selectedFilesDiff) : undefined;

    const baseContent = formatBaseFileContent({
      files: allFiles,
      selectedFiles,
      sortOrder,
      includeFileTree,
      includeBinaryPaths,
      selectedFolder,
      gitDiff: optimizedDiff,
    });

    if (isElectron && baseContent) {
      try {
        const result = await window.electron.ipcRenderer.invoke('get-token-count', baseContent);
        const tokenCount = typeof result?.tokenCount === 'number' ? result.tokenCount : 0;
        setCachedBaseContentTokens(tokenCount);
        return { content: baseContent, tokenCount };
      } catch (error) {
        console.error('Error getting base content token count:', error);
        setCachedBaseContentTokens(0);
        return { content: baseContent, tokenCount: 0 };
      }
    }

    setCachedBaseContentTokens(0);
    return { content: baseContent, tokenCount: 0 };
  }, [
    allFiles,
    includeBinaryPaths,
    includeFileTree,
    includeGitDiffs,
    isElectron,
    selectedDiffPaths,
    selectedFiles,
    selectedFilesDiff,
    selectedFolder,
    selectedModelContextLength,
    smartContextBudgetTokens,
    smartContextEnabled,
    sortOrder,
  ]);

  /**
   * Assembles the final content for copying using cached base content
   * @returns {string} The concatenated content ready for copying
   */
  const getSelectedFilesContent = useCallback(async (): Promise<string> => {
    const { content: baseContent } = await refreshBaseContent();
    const instructionsBlock = formatUserInstructionsBlock(userInstructions);

    if (!instructionsBlock) {
      return baseContent;
    }

    return baseContent + (baseContent && instructionsBlock ? '\n\n' : '') + instructionsBlock;
  }, [refreshBaseContent, userInstructions]);

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
    const debounceTimer = setTimeout(() => {
      refreshBaseContent();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [refreshBaseContent]);

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

  const refreshGitChangedFiles = useCallback(async () => {
    if (!selectedFolder || !isElectron) {
      setGitChangedFiles({});
      return [] as GitChangedFile[];
    }

    setIsGitChangesLoading(true);
    setGitChangesError(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('get-changed-files', {
        folderPath: selectedFolder,
      });

      if (!result || result.error) {
        const errorMessage = result?.error || 'Failed to get changed files';
        setGitChangesError(errorMessage);
        setGitChangedFiles({});
        return [] as GitChangedFile[];
      }

      const incoming: GitChangedFile[] = Array.isArray(result.files)
        ? result.files
            .map((file: any) => {
              if (!file) return null;
              const absolutePath = normalizePath(
                file.absolutePath || file.absPath || file.path || file
              );
              if (!absolutePath) return null;

              const status = typeof file.status === 'string' ? file.status : '';
              const indexStatus =
                typeof file.indexStatus === 'string'
                  ? file.indexStatus
                  : status.length > 0
                    ? status[0]
                    : '';
              const worktreeStatus =
                typeof file.worktreeStatus === 'string'
                  ? file.worktreeStatus
                  : status.length > 1
                    ? status[1]
                    : '';

              return {
                absolutePath,
                relativePath: normalizePath(file.relativePath || file.repoRelativePath || ''),
                status,
                indexStatus,
                worktreeStatus,
                isUntracked: Boolean(file.isUntracked || status === '??'),
                oldRelativePath: file.oldRelativePath
                  ? normalizePath(file.oldRelativePath)
                  : undefined,
              } as GitChangedFile;
            })
            .filter(Boolean)
        : [];

      const map = incoming.reduce(
        (acc, file) => {
          acc[file.absolutePath] = file;
          return acc;
        },
        {} as Record<string, GitChangedFile>
      );

      setGitChangedFiles(map);
      return incoming;
    } catch (error: any) {
      console.error('Failed to refresh git changed files', error);
      setGitChangedFiles({});
      setGitChangesError(error?.message || 'Failed to get changed files');
      return [] as GitChangedFile[];
    } finally {
      setIsGitChangesLoading(false);
    }
  }, [selectedFolder, isElectron]);

  const loadCommitHistory = useCallback(
    async (limit = 20) => {
      if (!selectedFolder || !isElectron) {
        setGitCommitHistory([]);
        setCommitHistoryError(null);
        return [] as GitCommitSummary[];
      }

      setIsCommitHistoryLoading(true);
      setCommitHistoryError(null);

      try {
        const result = await window.electron.ipcRenderer.invoke('get-commit-history', {
          folderPath: selectedFolder,
          limit,
        });

        if (!result || result.error) {
          const message = result?.error || 'Failed to load commit history';
          setCommitHistoryError(message);
          setGitCommitHistory([]);
          return [] as GitCommitSummary[];
        }

        const commits: GitCommitSummary[] = Array.isArray(result.commits)
          ? result.commits
              .map((commit: any) => ({
                hash: commit?.hash || '',
                subject: commit?.subject || '',
                timestamp: Number(commit?.timestamp) || 0,
                isoDate: commit?.isoDate || null,
              }))
              .filter((commit: GitCommitSummary) => Boolean(commit.hash))
          : [];

        setGitCommitHistory(commits);
        return commits;
      } catch (error: any) {
        console.error('Failed to load commit history', error);
        setGitCommitHistory([]);
        setCommitHistoryError(error?.message || 'Failed to load commit history');
        return [] as GitCommitSummary[];
      } finally {
        setIsCommitHistoryLoading(false);
      }
    },
    [selectedFolder, isElectron]
  );

  // Handle copying content to clipboard
  const handleCopy = async () => {
    if (selectedFiles.length === 0) return;

    try {
      const content = await getSelectedFilesContent();
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

  // Add all Git-changed files (modified, staged, untracked) within the selected folder to selection
  const selectChangedFiles = async () => {
    if (!selectedFolder) return;

    if (!isElectron) {
      setProcessingStatus({ status: 'error', message: 'Git integration requires Electron app' });
      return;
    }

    try {
      setProcessingStatus({ status: 'processing', message: 'Finding changed files…' });
      const changedEntries = await refreshGitChangedFiles();
      if (!changedEntries || changedEntries.length === 0) {
        setProcessingStatus({ status: 'complete', message: 'No uncommitted changes found' });
        return;
      }

      const changedSet = new Set(
        changedEntries.map((entry) => normalizePath(entry.absolutePath)).filter(Boolean)
      );

      const eligible = allFiles
        .filter((f: FileData) => changedSet.has(normalizePath(f.path)))
        .filter(
          (f: FileData) =>
            !f.isSkipped && !f.excludedByDefault && (includeBinaryPaths || !f.isBinary)
        )
        .map((f: FileData) => normalizePath(f.path));

      if (eligible.length === 0) {
        setProcessingStatus({ status: 'complete', message: 'No changed files matched filters' });
        return;
      }

      setSelectedFiles((prev: string[]) => {
        const set = new Set(prev.map(normalizePath));
        eligible.forEach((p) => set.add(p));
        return Array.from(set);
      });

      setProcessingStatus({
        status: 'complete',
        message: `Added ${eligible.length} changed file${eligible.length === 1 ? '' : 's'}`,
      });
    } catch (err) {
      console.error('Error selecting changed files', err);
      setProcessingStatus({ status: 'error', message: 'Error selecting changed files' });
    }
  };

  useEffect(() => {
    if (!isElectron || !selectedFolder || selectedFiles.length === 0) {
      setSelectedFilesDiff('');
      setSelectedDiffPaths([]);
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const loadDiff = async () => {
      try {
        const diffPayload = {
          folderPath: selectedFolder,
          filePaths: selectedFiles,
        };

        const invokeGetSelectedDiff = window.electron.getSelectedFilesDiff
          ? window.electron.getSelectedFilesDiff(diffPayload)
          : window.electron.ipcRenderer.invoke('get-selected-files-diff', diffPayload);

        const result = await invokeGetSelectedDiff;

        if (cancelled) return;

        if (!result || result.error) {
          if (result?.error) {
            console.warn('get-selected-files-diff error:', result.error);
          }
          setSelectedFilesDiff('');
          setSelectedDiffPaths([]);
          return;
        }

        const diffText = typeof result.diff === 'string' ? result.diff : '';
        const changed = Array.isArray(result.changedPaths)
          ? result.changedPaths.map((p: string) => normalizePath(p))
          : [];

        console.debug(
          `[GitDiff] Renderer received diff length ${diffText.length} for ${changed.length} path(s)`
        );

        setSelectedFilesDiff(diffText);
        setSelectedDiffPaths(changed);
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to compute git diff for selection', error);
          setSelectedFilesDiff('');
          setSelectedDiffPaths([]);
        }
      }
    };

    // Add debouncing to avoid excessive IPC calls
    timeoutId = setTimeout(loadDiff, 500);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isElectron, selectedFolder, selectedFiles]);

  const handleAddFilesSinceCommit = async (commitHash: string) => {
    if (!selectedFolder) return;

    if (!isElectron) {
      setProcessingStatus({ status: 'error', message: 'Git integration requires Electron app' });
      return;
    }

    if (!commitHash) {
      setProcessingStatus({ status: 'error', message: 'Commit hash is required' });
      return;
    }

    try {
      setProcessingStatus({ status: 'processing', message: 'Selecting files since commit…' });
      const result = await window.electron.ipcRenderer.invoke('get-files-since-commit', {
        folderPath: selectedFolder,
        commit: commitHash,
      });

      if (!result || result.error) {
        setProcessingStatus({
          status: 'error',
          message: result?.error || 'Failed to load files for commit range',
        });
        return;
      }

      const absolutePaths = (Array.isArray(result.files) ? result.files : [])
        .map((entry: any) => {
          if (!entry) return null;
          if (typeof entry === 'string') return normalizePath(entry);
          if (typeof entry.absolutePath === 'string') return normalizePath(entry.absolutePath);
          if (typeof entry.absPath === 'string') return normalizePath(entry.absPath);
          if (typeof entry.path === 'string') return normalizePath(entry.path);
          return null;
        })
        .filter(Boolean) as string[];

      if (absolutePaths.length === 0) {
        setProcessingStatus({
          status: 'complete',
          message: 'No files found for selected commit range',
        });
        return;
      }

      const pathSet = new Set(absolutePaths.map((p) => normalizePath(p)));

      const eligible = allFiles
        .filter((f: FileData) => pathSet.has(normalizePath(f.path)))
        .filter(
          (f: FileData) =>
            !f.isSkipped && !f.excludedByDefault && (includeBinaryPaths || !f.isBinary)
        )
        .map((f: FileData) => normalizePath(f.path));

      if (eligible.length === 0) {
        setProcessingStatus({
          status: 'complete',
          message: 'No matching files passed current filters',
        });
        return;
      }

      setSelectedFiles((prev: string[]) => {
        const set = new Set(prev.map(normalizePath));
        eligible.forEach((p) => set.add(p));
        return Array.from(set);
      });

      setProcessingStatus({
        status: 'complete',
        message: `Added ${eligible.length} file${eligible.length === 1 ? '' : 's'} since commit`,
      });
    } catch (error) {
      console.error('Failed to select files since commit', error);
      setProcessingStatus({
        status: 'error',
        message: 'Error selecting files from commit range',
      });
    }
  };

  // Insert a saved prompt into the user instructions
  const handleInsertSavedPrompt = (promptText: string) => {
    setUserInstructions((prev) => {
      const trimmedPrev = (prev || '').trim();
      // Place saved prompt at the top, followed by any existing notes
      return trimmedPrev ? `${promptText}\n\n${trimmedPrev}` : promptText;
    });
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

  const handleSuggestBudgetFromSelection = useCallback(async () => {
    if (!selectedFiles.length) {
      setSmartContextBudgetTokens(0);
      return;
    }

    const baseTokens = selectedFiles.reduce((sum, path) => {
      const normalized = normalizePath(path);
      const file = allFiles.find((f) => arePathsEqual(f.path, normalized));
      return sum + (file?.tokenCount ?? 0);
    }, 0);

    let diffTokens = 0;
    if (includeGitDiffs && selectedFilesDiff.trim()) {
      try {
        diffTokens = await countTokensCached(selectedFilesDiff.trim());
      } catch (error) {
        console.error('Error estimating diff token count:', error);
      }
    }

    const total = baseTokens + diffTokens;
    const clamped =
      selectedModelContextLength && selectedModelContextLength > 0 && total > 0
        ? Math.min(total, selectedModelContextLength)
        : total;

    setSmartContextBudgetTokens(Math.max(0, Math.floor(clamped)));
  }, [allFiles, includeGitDiffs, selectedFiles, selectedFilesDiff, selectedModelContextLength]);

  const handleApplySmartContextSettings = useCallback(() => {
    void refreshBaseContent();
  }, [refreshBaseContent]);

  const handleModelContextChange = useCallback((model: ModelInfo | null) => {
    setSelectedModelContextLength(model?.context_length ?? null);
  }, []);

  // Handle model selection
  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem('pastemax-selected-model', modelId);
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

  /* ===================================================================== */
  /* ============================== RENDER =============================== */
  /* ===================================================================== */
  // Main JSX rendering

  return (
    <ThemeProvider>
      <div className="app-container">
        <header className="header">
          <h1>PasteMax</h1>
          <div className="header-actions">
            <ThemeToggle />
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
              <SavedPromptsDropdown onInsert={handleInsertSavedPrompt} />
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
              selectChangedFiles={selectChangedFiles}
              gitChangedFiles={Object.values(gitChangedFiles)}
              gitChangesLoading={isGitChangesLoading}
              gitChangesError={gitChangesError}
              onRefreshGitChanges={refreshGitChangedFiles}
              onAddChangedFilesSinceCommit={handleAddFilesSinceCommit}
              gitCommitHistory={gitCommitHistory}
              loadCommitHistory={loadCommitHistory}
              isCommitHistoryLoading={isCommitHistoryLoading}
              commitHistoryError={commitHistoryError}
              selectedDiffPaths={selectedDiffPaths}
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
                  {selectedFolder ? (
                    <>
                      <span>
                        {selectedFiles.length} / {displayedFiles.length} selected
                      </span>
                      <span className="stats-separator">•</span>
                      <span>~{totalFormattedContentTokens.toLocaleString()} tokens</span>
                    </>
                  ) : (
                    '0 files | ~0 tokens'
                  )}
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
            />

            {/* Model selection dropdown */}
            <div className="model-selection">
              <ModelDropdown
                externalSelectedModelId={selectedModelId}
                onModelSelect={handleModelSelect}
                currentTokenCount={totalFormattedContentTokens}
                onModelContextChange={handleModelContextChange}
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
                <div
                  className="toggle-option-item"
                  title="Include Git Diffs in the Copyable Content"
                >
                  <ToggleSwitch
                    id="includeGitDiffs"
                    checked={includeGitDiffs}
                    onChange={(e) => setIncludeGitDiffs(e.target.checked)}
                  />
                  <label htmlFor="includeGitDiffs">Include Git Diffs</label>
                </div>
                <div
                  className="toggle-option-item"
                  title="Use smart context to keep excerpts within a token budget"
                >
                  <ToggleSwitch
                    id="smartContextEnabled"
                    checked={smartContextEnabled}
                    onChange={(e) => setSmartContextEnabled(e.target.checked)}
                  />
                  <label htmlFor="smartContextEnabled">Smart Context</label>
                </div>
                {smartContextEnabled && (
                  <>
                    <div
                      className="toggle-option-item toggle-option-block"
                      title="Token budget used when assembling smart context excerpts"
                    >
                      <label htmlFor="smartContextBudgetTokens">Context Budget (tokens)</label>
                      <div className="toggle-option-actions">
                        <input
                          id="smartContextBudgetTokens"
                          type="number"
                          min={0}
                          step={500}
                          value={smartContextBudgetTokens}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isNaN(next)) return;
                            setSmartContextBudgetTokens(Math.max(0, Math.floor(next)));
                          }}
                        />
                        <button
                          type="button"
                          className="refresh-button"
                          onClick={() => {
                            void handleSuggestBudgetFromSelection();
                          }}
                        >
                          Use Selection
                        </button>
                        <button
                          type="button"
                          className="refresh-button"
                          onClick={handleApplySmartContextSettings}
                        >
                          Apply
                        </button>
                      </div>
                      <small className="toggle-option-help">
                        Total tokens for excerpts and diff.
                      </small>
                    </div>
                  </>
                )}
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
      </div>
    </ThemeProvider>
  );
};

export default App;
