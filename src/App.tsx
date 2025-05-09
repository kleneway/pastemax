/* ============================== IMPORTS ============================== */
import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import CopyButton from './components/CopyButton';
import { FileData, IgnoreMode } from './types/FileTypes';
import { ThemeProvider } from './context/ThemeContext';
import IgnorePatternsViewer from './components/IgnorePatternsViewer';
import ThemeToggle from './components/ThemeToggle';
import ViewIgnoresButton from './components/ViewIgnoresButton';
import { useIgnorePatterns } from './hooks/useIgnorePatterns';
import UserInstructions from './components/UserInstructions';

/**
 * Import path utilities for handling file paths across different operating systems.
 * While not all utilities are used directly, they're kept for consistency and future use.
 */
import {
  normalizePath,
  arePathsEqual,
  isSubPath,
} from './utils/pathUtils';

/**
 * Import utility functions for content formatting and language detection.
 * The contentFormatUtils module handles content assembly and applies language detection
 * via the languageUtils module internally.
 */
import { formatContentForCopying } from './utils/contentFormatUtils';

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
  // const savedIgnoreMode = localStorage.getItem(STORAGE_KEYS.IGNORE_MODE); no longer needed

  /* ============================== STATE: Core App State ============================== */
  const [selectedFolder, setSelectedFolder] = useState(
    savedFolder ? normalizePath(savedFolder) : null
  );
  const isElectron = window.electron !== undefined;
  const [allFiles, setAllFiles] = useState([] as FileData[]);

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

  /* ============================== STATE: User Instructions ============================== */
  const [userInstructions, setUserInstructions] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0); // For triggering data re-fetch
  const lastSentIgnoreSettingsModifiedRef = useRef(null as boolean | null);

  // Utility function to clear all saved state and reset the app
  const clearSavedState = useCallback(() => {
    console.time('clearSavedState');
    // Clear all localStorage items except ignore mode, custom ignores, and ignore settings modified flag
    Object.values(STORAGE_KEYS).forEach((key) => {
      if (key !== STORAGE_KEYS.IGNORE_MODE && key !== STORAGE_KEYS.IGNORE_SETTINGS_MODIFIED) {
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

    // Reload the application window
    console.timeEnd('clearSavedState');
    window.location.reload();
  }, [isElectron]); // Added isElectron dependency

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

    // Set status to processing *before* the timeout to give immediate feedback
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
        ignoreSettingsModified,
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
      window.electron.ipcRenderer.send('open-folder');
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

  // Calculate total tokens from selected files
  const calculateTotalTokens = () => {
    // Ensure paths are normalized before summing tokens
    const normalizedSelectedPaths = selectedFiles.map(normalizePath);
    return normalizedSelectedPaths.reduce((total: number, selectedPath: string) => {
      // Use arePathsEqual for comparison
      const file = allFiles.find((f: FileData) => arePathsEqual(f.path, selectedPath));
      return total + (file ? file.tokenCount : 0);
    }, 0);
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
                className="refresh-list-btn" // Add a new class for styling
                onClick={() => {
                  if (selectedFolder) {
                    // Only refresh if a folder is selected
                    console.log('[Refresh Button] Clicked, selectedFolder:', selectedFolder);
                    // DO NOT setProcessingStatus here. Let the useEffect handle it.
                    setReloadTrigger((prev: number) => prev + 1);
                  } else {
                    console.log('[Refresh Button] Clicked, but no folder selected.');
                  }
                }}
                disabled={processingStatus.status === 'processing' || !selectedFolder}
                title="Refresh the current file list"
              >
                Refresh
              </button>
              <ViewIgnoresButton onClick={handleViewIgnorePatterns} />
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

        {selectedFolder && (
          <div className="main-content">
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
            />
            <div className="content-area">
              <div className="content-header">
                <div className="content-title">Selected Files</div>
                <div className="content-actions">
                  <div className="file-stats">
                    {selectedFiles.length} files | ~{calculateTotalTokens().toLocaleString()} tokens
                  </div>
                  <div className="sort-dropdown">
                    <button className="sort-dropdown-button" onClick={toggleSortDropdown}>
                      Sort: {sortOptions.find((opt) => opt.value === sortOrder)?.label || sortOrder}
                    </button>
                    {sortDropdownOpen && (
                      <div className="sort-options">
                        {sortOptions.map((option) => (
                          <div
                            key={option.value}
                            className={`sort-option ${sortOrder === option.value ? 'active' : ''}`}
                            onClick={() => handleSortChange(option.value)}
                          >
                            {option.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <FileList
                files={displayedFiles}
                selectedFiles={selectedFiles}
                toggleFileSelection={toggleFileSelection}
              />

              {/*
               * User Instructions Component
               * Positioned after the file list and before the copy button
               * Allows users to enter supplementary text that will be
               * included at the end of the copied content
               */}
              <UserInstructions
                instructions={userInstructions}
                setInstructions={setUserInstructions}
              />

              <div className="copy-button-container">
                <div className="copy-button-wrapper">
                  <div
                    className="toggle-options-container"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <label
                      className="file-tree-option"
                      style={{ marginRight: '20px' }}
                      title="Include file tree in copied content"
                    >
                      <input
                        type="checkbox"
                        checked={includeFileTree}
                        onChange={() => setIncludeFileTree(!includeFileTree)}
                      />
                      <span>Include File Tree</span>
                    </label>
                    <label
                      className="file-tree-option"
                      title="Include binary files as paths in copied content"
                    >
                      <input
                        type="checkbox"
                        checked={includeBinaryPaths}
                        onChange={() => setIncludeBinaryPaths(!includeBinaryPaths)}
                      />
                      <span>Include Binary As Paths</span>
                    </label>
                  </div>
                  {/*
                   * Copy Button
                   * When clicked, this will copy all selected files along with:
                   * - File tree (if enabled via the checkbox)
                   * - User instructions (if any were entered)
                   */}
                  <CopyButton
                    text={getSelectedFilesContent()}
                    className="primary full-width copy-button-main"
                  >
                    <span className="copy-button-text">
                      COPY ALL SELECTED ({selectedFiles.length} files)
                    </span>
                  </CopyButton>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ignore Patterns Viewer Modal */}
        <IgnorePatternsViewer
          isOpen={isIgnoreViewerOpen}
          onClose={handleIgnoreViewerClose}
          patterns={ignorePatterns}
          error={ignorePatternsError}
          selectedFolder={selectedFolder}
          isElectron={isElectron}
          ignoreSettingsModified={ignoreSettingsModified}
        />
      </div>
    </ThemeProvider>
  );
};

export default App;
