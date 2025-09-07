/* ============================== IMPORTS ============================== */
import { useState, useEffect, useCallback, useRef } from 'react';
import ConfirmUseFolderModal from './components/ConfirmUseFolderModal';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import { FileData, IgnoreMode } from './types/FileTypes';
import { ThemeProvider } from './context/ThemeContext';
import IgnoreListModal from './components/IgnoreListModal';
import ThemeToggle from './components/ThemeToggle';
import UpdateModal from './components/UpdateModal';
import { useIgnorePatterns } from './hooks/useIgnorePatterns';
import { useWorkspaces } from './hooks/useWorkspaces';
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
import LargeFolderModal from './components/LargeFolderModal';
import LargeSubfolderModal from './components/LargeSubfolderModal';
import ProcessingOverlay from './components/ProcessingOverlay';

/**
 * Import path utilities for handling file paths across different operating systems.
 * While not all utilities are used directly, they're kept for consistency and future use.
 */
import { normalizePath, arePathsEqual, isSubPath, join, dirname } from './utils/pathUtils';

/**
 * Import utility functions for content formatting and language detection.
 * The contentFormatUtils module handles content assembly and applies language detection
 * via the languageUtils module internally.
 */
import { formatBaseFileContent, formatUserInstructionsBlock } from './utils/contentFormatUtils';
import type { UpdateDisplayState } from './types/UpdateTypes';

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
  TASK_TYPE: STORAGE_KEY_TASK_TYPE,
  WORKSPACES: 'pastemax-workspaces',
  CURRENT_WORKSPACE: 'pastemax-current-workspace',
  COPY_HISTORY: 'pastemax-copy-history',
};

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
  // Workspace management is now handled by the useWorkspaces hook

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

  // Debug logging for selectedFiles changes
  useEffect(() => {
    console.log(`[DEBUG] selectedFiles changed: ${selectedFiles.length} files selected`);
    if (selectedFiles.length > 0 && selectedFiles.length < 10) {
      console.log(`[DEBUG] Selected files:`, selectedFiles);
    } else if (selectedFiles.length >= 10) {
      console.log(`[DEBUG] Too many files to log individually (${selectedFiles.length})`);
    }
  }, [selectedFiles]);

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
  const [processingFiles, setProcessingFiles] = useState(new Set<string>());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isFolderProcessing, setIsFolderProcessing] = useState(false);
  const [processingFolderName, setProcessingFolderName] = useState('');

  /* ============================== STATE: UI Controls ============================== */
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState('');
  const [isCustomTaskTypeModalOpen, setIsCustomTaskTypeModalOpen] = useState(false);

  /* ============================== STATE: User Instructions ============================== */
  const [userInstructions, setUserInstructions] = useState('');
  const [totalFormattedContentTokens, setTotalFormattedContentTokens] = useState(0);
  const [cachedBaseContentString, setCachedBaseContentString] = useState('');
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

  /* ============================== STATE: Large Folder Modal ============================== */
  const [isLargeFolderModalOpen, setIsLargeFolderModalOpen] = useState(false);
  const [largeFolderDetails, setLargeFolderDetails] = useState({ totalTokens: 0, folderPath: '' });
  
  /* ============================== STATE: Large Subfolder Modal ============================== */
  const [isLargeSubfolderModalOpen, setIsLargeSubfolderModalOpen] = useState(false);
  const [largeSubfolderDetails, setLargeSubfolderDetails] = useState({ totalTokens: 0, folderPath: '', hasEstimates: false });
  const [pendingFolderSelection, setPendingFolderSelection] = useState<{ folderPath: string; isSelected: boolean } | null>(null);

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
        // Reset expanded nodes to only show the root folder expanded
        const newExpandedState = { [`node-${normalizedFolderPath}`]: true };
        setExpandedNodes(newExpandedState);
        localStorage.setItem(STORAGE_KEYS.EXPANDED_NODES, JSON.stringify(newExpandedState));
      }

      // Workspace update is handled by the useWorkspaces hook
    },
    [selectedFolder, allFiles, processingStatus]
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
    (payload: { files: FileData[], selectAll: boolean }) => {
      const { files, selectAll } = payload;
      
      console.log(`[handleFileListData] Called with ${files.length} files, selectAll: ${selectAll}`);
      
      // Debug: Check token counts in loaded files
      const filesWithTokens = files.filter(f => f.tokenCount > 0);
      console.log(`[TOKEN DEBUG] Loaded ${filesWithTokens.length} files with tokens out of ${files.length}`);
      if (filesWithTokens.length > 0) {
        console.log(`[TOKEN DEBUG] Sample files:`, filesWithTokens.slice(0, 3).map(f => ({
          name: f.name,
          tokens: f.tokenCount,
          isEstimate: f.isTokenEstimate
        })));
      }
      
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

      // Force clear selections if selectAll is false - do this immediately and separately
      if (!selectAll) {
        console.log('[handleFileListData] selectAll is false, FORCE clearing all selections');
        setSelectedFiles([]);
        return; // Exit early to prevent any other selection logic
      }

      setSelectedFiles((prevSelected: string[]) => {        
        // If we have previous selections, preserve all existing selections that still exist
        if (prevSelected.length > 0) {
          // Only filter out files that no longer exist in the new list
          const preservedSelections = prevSelected.filter((selectedPath: string) =>
            files.some((file) => arePathsEqual(file.path, selectedPath))
          );
          console.log(`[handleFileListData] Preserving ${preservedSelections.length} existing selections`);
          return preservedSelections;
        }

        // No previous selections - select all eligible files if selectAll is true
        console.log(`[handleFileListData] selectAll is true, auto-selecting eligible files`);
        const eligibleFiles = files
          .filter(
            (file: FileData) =>
              !file.isSkipped && !file.excludedByDefault && (includeBinaryPaths || !file.isBinary)
          )
          .map((file: FileData) => file.path);
        console.log(`[handleFileListData] Auto-selecting ${eligibleFiles.length} files`);
        return eligibleFiles;
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

    const handleFileListDataIPC = (payload: FileData[] | { files: FileData[], selectAll: boolean }) => {
      // Handle both old and new payload formats
      if (Array.isArray(payload)) {
        // Old format - backward compatibility
        console.log('[IPC] Received file-list-data (legacy format):', payload.length, 'files');
        stableHandleFileListDataRef.current({ files: payload, selectAll: true });
      } else {
        // New format
        console.log('[IPC] Received file-list-data:', payload.files.length, 'files, selectAll:', payload.selectAll);
        stableHandleFileListDataRef.current(payload);
      }
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

  // Listen for large folder warning from main process
  useEffect(() => {
    if (!isElectron) return;
    const handleLargeFolderWarning = (details: { totalTokens: number; folderPath: string }) => {
      console.log(`[APP] Received large-folder-warning:`, details);
      setLargeFolderDetails(details);
      setIsLargeFolderModalOpen(true);
      setProcessingStatus({ status: 'idle', message: '' }); // Stop the "loading" indicator
      console.log(`[APP] Modal should now be open: isLargeFolderModalOpen set to true`);
    };
    window.electron.ipcRenderer.on('large-folder-warning', handleLargeFolderWarning);
    return () => {
      window.electron.ipcRenderer.removeListener('large-folder-warning', handleLargeFolderWarning);
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

  // Initialize workspace management hook
  const {
    workspaces,
    setWorkspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    isWorkspaceManagerOpen,
    setIsWorkspaceManagerOpen,
    isConfirmUseFolderModalOpen,
    setIsConfirmUseFolderModalOpen,
    confirmFolderModalDetails,
    setConfirmFolderModalDetails,
    currentWorkspaceName,
    handleOpenWorkspaceManager,
    handleSelectWorkspace,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleUpdateWorkspaceFolder,
    handleConfirmUseCurrentFolder,
    handleDeclineUseCurrentFolder,
  } = useWorkspaces({
    selectedFolder,
    setSelectedFolder,
    setSelectedFiles,
    setAllFiles,
    setProcessingStatus,
    openFolder,
    handleFolderSelected,
    isElectron,
  });

  // Large folder modal handlers
  const handleProceedWithLargeFolder = () => {
    window.electron.ipcRenderer.send('proceed-with-large-folder', largeFolderDetails.folderPath);
    setIsLargeFolderModalOpen(false);
    setProcessingStatus({ status: 'processing', message: 'Loading large folder...' });
  };

  const handleLoadLargeFolderDeselected = () => {
    window.electron.ipcRenderer.send('load-large-folder-deselected', largeFolderDetails.folderPath);
    setIsLargeFolderModalOpen(false);
    setProcessingStatus({ status: 'processing', message: 'Loading folder with files deselected...' });
  };

  const handleCancelLargeFolder = () => {
    window.electron.ipcRenderer.send('cancel-large-folder-load');
    clearSavedState();
    setIsLargeFolderModalOpen(false);
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

  // Process files for real tokenization when selected
  const processFileForRealTokens = async (filePath: string) => {
    if (!isElectron) return;
    
    // Add file to processing set
    setProcessingFiles(prev => new Set([...prev, filePath]));
    
    try {
      console.log(`[APP] Processing file for real tokens: ${filePath}`);
      const result = await window.electron.ipcRenderer.invoke('process-selected-files', [filePath]);
      
      if (result.success && result.processedFiles.length > 0) {
        const processedFile = result.processedFiles[0];
        
        // Update the file in allFiles with real token data
        setAllFiles((prevFiles: FileData[]) => 
          prevFiles.map((file: FileData) => {
            if (arePathsEqual(file.path, filePath)) {
              console.log(`[TOKEN UPDATE] Updating ${file.name}: ${file.tokenCount} -> ${processedFile.tokenCount}`);
              return { 
                ...file, 
                content: processedFile.content,
                tokenCount: processedFile.tokenCount,
                isTokenEstimate: false,
                isBinary: processedFile.isBinary,
                error: processedFile.error
              };
            }
            return file;
          })
        );
        
        console.log(`[APP] Updated file ${filePath} with real tokens: ${processedFile.tokenCount}`);
      }
    } catch (error) {
      console.error(`[APP] Error processing file ${filePath}:`, error);
    } finally {
      // Remove file from processing set
      setProcessingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  // Toggle file selection
  const toggleFileSelection = async (filePath: string) => {
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
        const newSelection = [...prev, normalizedPath];
        
        // If this file has estimated tokens, process it for real tokenization
        if (f && f.isTokenEstimate && !f.isDirectory) {
          console.log(`[toggleFileSelection] File ${normalizedPath} has estimated tokens, processing for real tokens`);
          processFileForRealTokens(normalizedPath);
        } else if (f) {
          console.log(`[toggleFileSelection] File ${normalizedPath} - isTokenEstimate: ${f.isTokenEstimate}, isDirectory: ${f.isDirectory}`);
        }
        
        return newSelection;
      }
    });
  };

  // Calculate folder tokens and detect if they're estimated
  const calculateFolderTokensWithEstimateInfo = (folderPath: string): { totalTokens: number; hasEstimates: boolean } => {
    const normalizedFolderPath = normalizePath(folderPath);
    let totalTokens = 0;
    let hasEstimates = false;

    // Function to check if a file is in the given folder or its subfolders
    const isFileInFolder = (filePath: string, folderPath: string): boolean => {
      let normalizedFilePath = normalizePath(filePath);
      let normalizedFolderPath = normalizePath(folderPath);

      // Add leading slash to absolute paths if missing (common on macOS)
      if (!normalizedFilePath.startsWith('/') && !normalizedFilePath.match(/^[a-z]:/i)) {
        normalizedFilePath = '/' + normalizedFilePath;
      }

      if (!normalizedFolderPath.startsWith('/') && !normalizedFolderPath.match(/^[a-z]:/i)) {
        normalizedFolderPath = '/' + normalizedFolderPath;
      }

      return arePathsEqual(normalizedFilePath, normalizedFolderPath) || isSubPath(normalizedFolderPath, normalizedFilePath);
    };

    // Find all files in this folder
    const filesInFolder = allFiles.filter((file: FileData) => {
      const inFolder = isFileInFolder(file.path, normalizedFolderPath);
      const selectable = !file.isSkipped && !file.excludedByDefault && (includeBinaryPaths || !file.isBinary);
      return selectable && inFolder && !file.isDirectory;
    });

    // Calculate total tokens and check for estimates
    filesInFolder.forEach((file: FileData) => {
      if (file.tokenCount > 0) {
        totalTokens += file.tokenCount;
        if (file.isTokenEstimate) {
          hasEstimates = true;
        }
      }
    });

    return { totalTokens, hasEstimates };
  };

  // Toggle folder selection (select/deselect all files in folder)
  const toggleFolderSelection = (folderPath: string, isSelected: boolean) => {
    // Normalize the folder path for cross-platform compatibility
    const normalizedFolderPath = normalizePath(folderPath);

    // Check for large folder selection (500k+ tokens) before proceeding
    if (isSelected) {
      const { totalTokens, hasEstimates } = calculateFolderTokensWithEstimateInfo(normalizedFolderPath);
      const TOKEN_THRESHOLD = 500000; // 500k tokens
      
      if (totalTokens >= TOKEN_THRESHOLD) {
        console.log(`[toggleFolderSelection] Large folder detected: ${totalTokens.toLocaleString()} tokens (estimated: ${hasEstimates})`);
        
        // Store the pending selection and show modal
        setPendingFolderSelection({ folderPath: normalizedFolderPath, isSelected });
        setLargeSubfolderDetails({ 
          totalTokens, 
          folderPath: normalizedFolderPath, 
          hasEstimates 
        });
        setIsLargeSubfolderModalOpen(true);
        return; // Don't proceed with selection until user confirms
      }
    }

    // For non-large folders, proceed with normal selection
    performFolderSelection(normalizedFolderPath, isSelected);
  };

  // Perform the actual folder selection (extracted from toggleFolderSelection)
  const performFolderSelection = async (folderPath: string, isSelected: boolean) => {
    const normalizedFolderPath = normalizePath(folderPath);
    const folderName = normalizedFolderPath.split(/[/\\]/).pop() || normalizedFolderPath;

    // Function to check if a file is in the given folder or its subfolders (same as in toggleFolderSelection)
    const isFileInFolder = (filePath: string, folderPath: string): boolean => {
      let normalizedFilePath = normalizePath(filePath);
      let normalizedFolderPath = normalizePath(folderPath);

      if (!normalizedFilePath.startsWith('/') && !normalizedFilePath.match(/^[a-z]:/i)) {
        normalizedFilePath = '/' + normalizedFilePath;
      }

      if (!normalizedFolderPath.startsWith('/') && !normalizedFolderPath.match(/^[a-z]:/i)) {
        normalizedFolderPath = '/' + normalizedFolderPath;
      }

      return arePathsEqual(normalizedFilePath, normalizedFolderPath) || isSubPath(normalizedFolderPath, normalizedFilePath);
    };

    // Filter all files to get only those in this folder (and subfolders) that are selectable
    const filesInFolder = allFiles.filter((file: FileData) => {
      const inFolder = isFileInFolder(file.path, normalizedFolderPath);
      const selectable = !file.isSkipped && !file.excludedByDefault && (includeBinaryPaths || !file.isBinary);
      return selectable && inFolder;
    });

    console.log('Found', filesInFolder.length, 'selectable files in folder');

    if (filesInFolder.length === 0) {
      console.warn('No selectable files found in folder, nothing to do');
      return;
    }

    const folderFilePaths = filesInFolder.map((file: FileData) => normalizePath(file.path));

    if (isSelected) {
      // Check if significant processing is needed (threshold: 25+ files with estimates OR 100+ total files)
      const filesToProcess = filesInFolder.filter((file: FileData) => 
        file.isTokenEstimate && !file.isDirectory
      );
      
      const needsSignificantProcessing = filesToProcess.length >= 25 || filesInFolder.length >= 100;
      
      if (needsSignificantProcessing) {
        // Show processing overlay before starting
        setIsFolderProcessing(true);
        setProcessingFolderName(folderName);
        console.log(`[performFolderSelection] Starting processing for folder "${folderName}" with ${filesToProcess.length} files to process`);
        
        try {
          // Process files in a single batch call if needed
          if (filesToProcess.length > 0) {
            console.log(`[performFolderSelection] Starting batch processing of ${filesToProcess.length} files`);
            const filePaths = filesToProcess.map(file => file.path);
            const result = await window.electron.ipcRenderer.invoke('process-selected-files', filePaths);
            
            if (result.success && result.processedFiles.length > 0) {
              // Update all processed files in state
              setAllFiles((prevFiles: FileData[]) => 
                prevFiles.map((file: FileData) => {
                  const processedFile = result.processedFiles.find((pf: FileData) => 
                    arePathsEqual(pf.path, file.path)
                  );
                  
                  if (processedFile) {
                    console.log(`[performFolderSelection] Updated ${file.name}: ${file.tokenCount} -> ${processedFile.tokenCount}`);
                    return { 
                      ...file, 
                      content: processedFile.content,
                      tokenCount: processedFile.tokenCount,
                      isTokenEstimate: false,
                      isBinary: processedFile.isBinary,
                      error: processedFile.error
                    };
                  }
                  return file;
                })
              );
            }
            console.log(`[performFolderSelection] Completed batch processing of ${filesToProcess.length} files`);
          }
          
          // Only update selection after processing completes
          setSelectedFiles((prev: string[]) => {
            const existingSelection = new Set(prev.map(normalizePath));
            folderFilePaths.forEach((pathToAdd: string) => existingSelection.add(pathToAdd));
            const newSelection = Array.from(existingSelection);
            console.log(`Added ${folderFilePaths.length} files to selection, total now: ${newSelection.length}`);
            return newSelection;
          });
          
        } catch (error) {
          console.error(`[performFolderSelection] Error processing folder "${folderName}":`, error);
        } finally {
          setIsFolderProcessing(false);
          setProcessingFolderName('');
        }
      } else {
        // For small folders, proceed with immediate selection as before
        setSelectedFiles((prev: string[]) => {
          const existingSelection = new Set(prev.map(normalizePath));
          folderFilePaths.forEach((pathToAdd: string) => existingSelection.add(pathToAdd));
          const newSelection = Array.from(existingSelection);
          console.log(`Added ${folderFilePaths.length} files to selection, total now: ${newSelection.length}`);
          return newSelection;
        });
        
        // Process any remaining files in background
        if (filesToProcess.length > 0) {
          setIsBatchProcessing(true);
          Promise.all(
            filesToProcess.map((file: FileData) => processFileForRealTokens(file.path))
          ).finally(() => {
            setIsBatchProcessing(false);
          });
        }
      }
    } else {
      // For deselection, proceed immediately
      setSelectedFiles((prev: string[]) => {
        const newSelection = prev.filter((path: string) => !isFileInFolder(path, normalizedFolderPath));
        return newSelection;
      });
    }
  };

  // Handle large subfolder modal responses
  const handleLargeSubfolderConfirm = () => {
    if (pendingFolderSelection) {
      performFolderSelection(pendingFolderSelection.folderPath, pendingFolderSelection.isSelected);
      setPendingFolderSelection(null);
    }
    setIsLargeSubfolderModalOpen(false);
  };

  const handleLargeSubfolderCancel = () => {
    setPendingFolderSelection(null);
    setIsLargeSubfolderModalOpen(false);
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

  // Refresh only the currently selected files without reloading the entire folder
  const refreshSelectedFiles = async () => {
    if (!isElectron || selectedFiles.length === 0) {
      console.log('[refreshSelectedFiles] No files selected or not in Electron environment');
      return;
    }

    console.log(`[refreshSelectedFiles] Refreshing ${selectedFiles.length} selected files`);
    setIsBatchProcessing(true);
    
    try {
      // Process all selected files that need updating
      const filesToRefresh = selectedFiles.filter(filePath => {
        const file = allFiles.find(f => arePathsEqual(f.path, filePath));
        return file && !file.isDirectory;
      });
      
      if (filesToRefresh.length > 0) {
        console.log(`[refreshSelectedFiles] Processing ${filesToRefresh.length} files`);
        await Promise.all(
          filesToRefresh.map(filePath => processFileForRealTokens(filePath))
        );
        console.log(`[refreshSelectedFiles] Completed refreshing ${filesToRefresh.length} files`);
      }
    } catch (error) {
      console.error('[refreshSelectedFiles] Error refreshing files:', error);
    } finally {
      setIsBatchProcessing(false);
    }
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
      
      // Process files with estimated tokens immediately for instant copy
      const filesToProcess = displayedFiles.filter((file: FileData) => 
        !file.isSkipped && 
        (includeBinaryPaths || !file.isBinary) &&
        file.isTokenEstimate && 
        !file.isDirectory
      );
      
      if (filesToProcess.length > 0) {
        setIsBatchProcessing(true);
        console.log(`[selectAllFiles] Processing ${filesToProcess.length} files immediately for instant copy`);
        
        // Process all files and wait for completion
        Promise.all(
          filesToProcess.map((file: FileData) => processFileForRealTokens(file.path))
        ).finally(() => {
          setIsBatchProcessing(false);
        });
      }
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
        [nodeId]: prev[nodeId] === undefined ? true : !prev[nodeId],
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

      // Calculate tokens by summing individual file tokens instead of tokenizing concatenated content
      // This works correctly with lazy loading where some files may not have content loaded yet
      const normalizedSelectedPaths = new Set(selectedFiles.map(path => normalizePath(path)));
      const selectedFileData = allFiles.filter(file => 
        normalizedSelectedPaths.has(normalizePath(file.path)) && !file.isBinary
      );
      
      const baseContentTokens = selectedFileData.reduce((total, file) => {
        const tokens = file.tokenCount || 0;
        console.log(`[TOKEN DEBUG] File: ${file.name}, tokens: ${tokens}, isEstimate: ${file.isTokenEstimate}`);
        return total + tokens;
      }, 0);
      
      console.log(`[TOKEN DEBUG] Selected ${selectedFileData.length} files, total tokens: ${baseContentTokens}`);
      
      // Add estimated tokens for file tree if enabled
      let fileTreeTokens = 0;
      if (includeFileTree && baseContent.includes('<file_map>')) {
        // Estimate tokens for file tree (approximately 1 token per 4 characters)
        const fileMapMatch = baseContent.match(/<file_map>([\s\S]*?)<\/file_map>/);
        if (fileMapMatch) {
          fileTreeTokens = Math.ceil(fileMapMatch[1].length / 4);
        }
      }
      
      setCachedBaseContentTokens(baseContentTokens + fileTreeTokens);
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

  // Workspace functions are now handled by the useWorkspaces hook


  // Handle copying content to clipboard
  const handleCopy = async () => {
    if (selectedFiles.length === 0) return;

    try {
      // Files should already be processed when selected, so copy should be instant
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
                  if (selectedFiles.length > 0) {
                    refreshSelectedFiles();
                  } else if (selectedFolder) {
                    setReloadTrigger((prev: number) => prev + 1);
                  }
                }}
                disabled={processingStatus.status === 'processing' || isBatchProcessing || !selectedFolder}
                title={selectedFiles.length > 0 ? "Refresh Selected Files" : "Refresh File List"}
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
              processingFiles={processingFiles}
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
                    ? `${selectedFiles.length} files | ~${totalFormattedContentTokens.toLocaleString()} tokens`
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
                  files={allFiles}
                  selectedFiles={selectedFiles}
                  toggleFileSelection={toggleFileSelection}
                  sortOrder={sortOrder}
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
        <LargeFolderModal
          isOpen={isLargeFolderModalOpen}
          onClose={() => setIsLargeFolderModalOpen(false)}
          details={largeFolderDetails}
          onProceed={handleProceedWithLargeFolder}
          onLoadDeselected={handleLoadLargeFolderDeselected}
          onCancel={handleCancelLargeFolder}
        />
        <LargeSubfolderModal
          isOpen={isLargeSubfolderModalOpen}
          onClose={handleLargeSubfolderCancel}
          onConfirm={handleLargeSubfolderConfirm}
          details={largeSubfolderDetails}
        />
        {/* ProcessingOverlay for folder and batch file processing */}
        <ProcessingOverlay 
          isVisible={isFolderProcessing || isBatchProcessing}
          title={isFolderProcessing ? "Processing Folder" : "Processing Files"}
          message={isFolderProcessing 
            ? `Calculating tokens for "${processingFolderName}" folder...`
            : "Calculating precise tokens for copying..."
          }
        />
      </div>
    </ThemeProvider>
  );
};

export default App;
