/* ============================== IMPORTS ============================== */
import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import { FileData, IgnoreMode } from './types/FileTypes';
import { ThemeProvider } from './context/ThemeContext';
import IgnoreListModal from './components/IgnoreListModal';
import ThemeToggle from './components/ThemeToggle';
import UpdateModal from './components/UpdateModal';
import { useIgnorePatterns } from './hooks/useIgnorePatterns';
import UserInstructions from './components/UserInstructions';
import { STORAGE_KEY_TASK_TYPE } from './types/TaskTypes';
import { DownloadCloud, ArrowDownUp, FolderKanban } from 'lucide-react';
import CustomTaskTypeModal from './components/CustomTaskTypeModal';
import TaskTypeSelector from './components/TaskTypeSelector';
import WorkspaceManager from './components/WorkspaceManager';
import { Workspace } from './types/WorkspaceTypes';
import CopyHistoryModal, { CopyHistoryItem } from './components/CopyHistoryModal';
import CopyHistoryButton from './components/CopyHistoryButton';

/**
 * Import path utilities for handling file paths across different operating systems.
 * While not all utilities are used directly, they're kept for consistency and future use.
 */
import { normalizePath, arePathsEqual, isSubPath } from './utils/pathUtils';

/**
 * Import utility functions for content formatting and language detection.
 * The contentFormatUtils module handles content assembly and applies language detection
 * via the languageUtils module internally.
 */
import { formatContentForCopying } from './utils/contentFormatUtils';
import type { UpdateDisplayState } from './types/UpdateTypes';

/* ============================== GLOBAL DECLARATIONS ============================== */
// Access the electron API from the window object
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, data?: any) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (channel: string, func: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}

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
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_WORKSPACE) || null;
  });
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

  /* ============================== STATE: UI Controls ============================== */
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState('');
  const [isCustomTaskTypeModalOpen, setIsCustomTaskTypeModalOpen] = useState(false);

  /* ============================== STATE: User Instructions ============================== */
  const [userInstructions, setUserInstructions] = useState('');
  const [totalFormattedContentTokens, setTotalFormattedContentTokens] = useState(0); // New state for accurate token count
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

  // Utility function to clear all saved state and reset the app
  const clearSavedState = useCallback(() => {
    console.time('clearSavedState');
    // Clear only folder-related localStorage items, preserving workspaces and other settings
    const keysToPreserve = [
      STORAGE_KEYS.IGNORE_MODE,
      STORAGE_KEYS.IGNORE_SETTINGS_MODIFIED,
      STORAGE_KEYS.WORKSPACES,
      STORAGE_KEYS.CURRENT_WORKSPACE,
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

    // Reset only folder-related state, keep workspaces intact
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

  // Improved IPC listener setup with proper cleanup
  useEffect(() => {
    if (!isElectron) return;

    const handleFolderSelected = (folderPath: string) => {
      console.log('[IPC] Received folder-selected:', folderPath);
      stableHandleFolderSelected(folderPath);
    };

    const handleFileListData = (files: FileData[]) => {
      console.log('[IPC] Received file-list-data:', files.length, 'files');
      stableHandleFileListData(files);
    };

    const handleProcessingStatus = (status: { status: string; message: string }) => {
      console.log('[IPC] Received file-processing-status:', status);
      stableHandleProcessingStatus(status);
    };

    const handleBackendModeUpdate = (newMode: IgnoreMode) => {
      console.info('[App] Backend signaled ignore mode update:', newMode);
    };

    // Set up IPC listeners for electron communication
    window.electron.ipcRenderer.on('folder-selected', handleFolderSelected);
    window.electron.ipcRenderer.on('file-list-data', handleFileListData);
    window.electron.ipcRenderer.on('file-processing-status', handleProcessingStatus);
    window.electron.ipcRenderer.on('ignore-mode-updated', handleBackendModeUpdate);

    return () => {
      // Clean up IPC listeners when component unmounts
      window.electron.ipcRenderer.removeListener('folder-selected', handleFolderSelected);
      window.electron.ipcRenderer.removeListener('file-list-data', handleFileListData);
      window.electron.ipcRenderer.removeListener('file-processing-status', handleProcessingStatus);
      window.electron.ipcRenderer.removeListener('ignore-mode-updated', handleBackendModeUpdate);
    };
  }, [isElectron]); // Leave as is

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
    console.log('<<< IPC Event Received: file-added >>> Data:', JSON.stringify(newFile));
    setAllFiles((prevFiles: FileData[]) =>
      prevFiles.some((f) => arePathsEqual(f.path, newFile.path))
        ? prevFiles
        : [...prevFiles, newFile]
    );
  }, []);

  const handleFileUpdated = useCallback((updatedFile: FileData) => {
    console.log('<<< IPC Event Received: file-updated >>> Data:', JSON.stringify(updatedFile));
    setAllFiles((prevFiles: FileData[]) =>
      prevFiles.map((file) => (arePathsEqual(file.path, updatedFile.path) ? updatedFile : file))
    );
  }, []);

  const handleFileRemoved = useCallback(
    (filePathData: { path: string; relativePath: string } | string) => {
      const path = typeof filePathData === 'object' ? filePathData.path : filePathData;
      const normalizedPath = normalizePath(path);
      setAllFiles((prevFiles: FileData[]) =>
        prevFiles.filter((file) => !arePathsEqual(file.path, normalizedPath))
      );
      setSelectedFiles((prevSelected: string[]) =>
        prevSelected.filter((p) => !arePathsEqual(p, normalizedPath))
      );
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
   * Assembles the final content for copying by using the utility function
   * @returns {string} The concatenated content ready for copying
   */
  const getSelectedFilesContent = () => {
    return formatContentForCopying({
      files: allFiles,
      selectedFiles,
      sortOrder,
      includeFileTree,
      selectedFolder,
      userInstructions,
      includeBinaryPaths,
    });
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

  // useEffect for calculating token count of the fully formatted content
  useEffect(() => {
    const calculateAndSetTokenCount = async () => {
      const contentToTokenize = getSelectedFilesContent();
      if (contentToTokenize && isElectron) {
        try {
          // Invoke IPC to get token count from the main process
          const result = (await window.electron.ipcRenderer.invoke(
            'get-token-count',
            contentToTokenize
          )) as any;
          if (result && result.tokenCount !== undefined) {
            setTotalFormattedContentTokens(result.tokenCount);
          } else if (result && result.error) {
            console.error('Error from get-token-count IPC:', result.error);
            setTotalFormattedContentTokens(0); // Fallback or error state
          } else {
            console.error('Unexpected response from get-token-count IPC:', result);
            setTotalFormattedContentTokens(0); // Fallback
          }
        } catch (error) {
          console.error('Failed to invoke get-token-count:', error);
          setTotalFormattedContentTokens(0); // Fallback on IPC error
        }
      } else {
        // If not in Electron or no content, set tokens to 0
        setTotalFormattedContentTokens(0);
      }
    };

    // Debounce the calculation
    const debounceTimeout = setTimeout(() => {
      calculateAndSetTokenCount();
    }, 150); // Debounce to avoid rapid recalculations

    return () => clearTimeout(debounceTimeout);
  }, [
    allFiles,
    selectedFiles,
    sortOrder,
    includeFileTree,
    selectedFolder,
    userInstructions,
    includeBinaryPaths,
    isElectron, // isElectron is now a necessary dependency
  ]);

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
        debugLogs: error?.stack || (typeof error === 'string' ? error : 'IPC invoke failed'),
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
      folderPath: null, // Explicitly set to null to start with blank layout
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    // Add to workspaces list - use functional update to ensure we're working with latest state
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      console.log('Updating workspaces state, current count:', currentWorkspaces.length);
      const updatedWorkspaces = [...currentWorkspaces, newWorkspace];

      // Save to localStorage
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
      console.log('Saved updated workspaces to localStorage, new count:', updatedWorkspaces.length);

      return updatedWorkspaces;
    });

    // Set as current workspace
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE, newWorkspace.id);
    setCurrentWorkspaceId(newWorkspace.id);
    console.log('Set current workspace ID to:', newWorkspace.id);

    // Clear selected folder to start with blank layout
    setSelectedFolder(null);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
    setSelectedFiles([]);
    setAllFiles([]);
    setProcessingStatus({
      status: 'idle',
      message: '',
    });

    // Close the workspace manager
    setIsWorkspaceManagerOpen(false);

    // Log final state
    console.log('Workspace creation complete, manager closed');
  };

  const handleDeleteWorkspace = (workspaceId: string) => {
    console.log('App: Deleting workspace with ID:', workspaceId);

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
              {selectedFolder ? (
                <div className="selected-folder">{selectedFolder}</div>
              ) : (
                <span>No folder selected</span>
              )}
              <button
                className="select-folder-btn"
                onClick={openFolder}
                disabled={processingStatus.status === 'processing'}
                title="Select a Folder to import"
              >
                Select Folder
              </button>
              <button
                className="clear-data-btn"
                onClick={clearSavedState}
                title="Clear all saved data and start fresh"
              >
                Clear All
              </button>
              <button
                className="refresh-list-btn"
                onClick={() => {
                  if (selectedFolder) {
                    setReloadTrigger((prev: number) => prev + 1);
                  }
                }}
                disabled={processingStatus.status === 'processing' || !selectedFolder}
                title="Refresh the current file list"
              >
                Refresh
              </button>
              <button
                onClick={handleViewIgnorePatterns}
                title="View Applied Ignore Rules"
                className="view-ignores-btn"
              >
                Ignore Filters
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
                No folder selected. Use the "Select Folder" button to choose a project folder.
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
                />
              ) : (
                <div className="file-list-empty">
                  No folder selected. Use the "Select Folder" button to choose a project folder.
                </div>
              )}
            </div>

            {/* User instructions section - always visible */}
            <UserInstructions
              instructions={userInstructions}
              setInstructions={setUserInstructions}
              selectedTaskType={selectedTaskType}
            />

            {/* Options for content format - always visible */}
            <div className="copy-options">
              <div className="option">
                <input
                  type="checkbox"
                  id="includeFileTree"
                  checked={includeFileTree}
                  onChange={(e) => setIncludeFileTree(e.target.checked)}
                />
                <label htmlFor="includeFileTree">Include File Tree</label>
              </div>

              <div className="option">
                <input
                  type="checkbox"
                  id="includeBinaryPaths"
                  checked={includeBinaryPaths}
                  onChange={(e) => setIncludeBinaryPaths(e.target.checked)}
                />
                <label htmlFor="includeBinaryPaths">Include Binary As Paths</label>
              </div>
            </div>

            {/* Copy button - always visible but disabled when no files selected */}
            <div className="copy-button-container">
              <button
                className="primary copy-button-main"
                onClick={handleCopy}
                disabled={selectedFiles.length === 0}
              >
                <span className="copy-button-text">
                  COPY ALL SELECTED ({selectedFiles.length} files)
                </span>
              </button>
              <CopyHistoryButton
                onClick={() => setIsCopyHistoryModalOpen(true)}
                className="copy-history-button-position"
              />
            </div>
          </div>
        </div>

        {/* Ignore Patterns Viewer Modal */}
        <IgnoreListModal
          isOpen={isIgnoreViewerOpen}
          onClose={handleIgnoreViewerClose}
          patterns={ignorePatterns}
          error={ignorePatternsError}
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
      </div>
    </ThemeProvider>
  );
};

export default App;
