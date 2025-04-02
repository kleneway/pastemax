import React, { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import FileList from "./components/FileList";
import CopyButton from "./components/CopyButton";
import { FileData } from "./types/FileTypes";
import { ThemeProvider } from "./context/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";
import UserInstructions from "./components/UserInstructions";

/**
 * Import path utilities for handling file paths across different operating systems.
 * While not all utilities are used directly, they're kept for consistency and future use.
 */
import { generateAsciiFileTree, normalizePath, arePathsEqual, isSubPath, join } from "./utils/pathUtils";

/**
 * Import utility functions for content formatting and language detection.
 * The contentFormatUtils module handles content assembly and applies language detection
 * via the languageUtils module internally.
 */
import { formatContentForCopying } from "./utils/contentFormatUtils";

// Access the electron API from the window object
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, data?: any) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (
          channel: string,
          func: (...args: any[]) => void,
        ) => void;
      };
    };
  }
}

/**
 * Keys used for storing app state in localStorage.
 * Keeping them in one place makes them easier to manage and update.
 */
const STORAGE_KEYS = {
  SELECTED_FOLDER: "pastemax-selected-folder",
  SELECTED_FILES: "pastemax-selected-files",
  SORT_ORDER: "pastemax-sort-order",
  SEARCH_TERM: "pastemax-search-term",
  EXPANDED_NODES: "pastemax-expanded-nodes",
};

/**
 * The main App component that handles:
 * - File selection and management
 * - Folder navigation
 * - File content copying
 * - UI state management
 */
const App = (): JSX.Element => {
  // This useEffect was clearing saved data on every reload
  // It was marked as "temporary, for testing" but was preventing
  // selections from persisting after a page refresh (Ctrl+R)
  /* 
  useEffect(() => {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
    localStorage.removeItem("hasLoadedInitialData");
    sessionStorage.removeItem("hasLoadedInitialData");
  }, []);
  */

  // Load initial state from localStorage if available
  const savedFolder = localStorage.getItem(STORAGE_KEYS.SELECTED_FOLDER);
  const savedFiles = localStorage.getItem(STORAGE_KEYS.SELECTED_FILES);
  const savedSortOrder = localStorage.getItem(STORAGE_KEYS.SORT_ORDER);
  const savedSearchTerm = localStorage.getItem(STORAGE_KEYS.SEARCH_TERM);

  // Normalize selectedFolder when loading from localStorage
  const [selectedFolder, setSelectedFolder] = useState( // Remove type argument
    savedFolder ? normalizePath(savedFolder) : null
  );
  const [allFiles, setAllFiles] = useState([] as FileData[]); // Explicitly type initial value
  // Normalize paths loaded from localStorage
  const [selectedFiles, setSelectedFiles] = useState( // Remove type argument
    (savedFiles ? JSON.parse(savedFiles).map(normalizePath) : []) as string[] // Explicitly type initial value
  );
  const [sortOrder, setSortOrder] = useState( // Remove type argument
    savedSortOrder || "tokens-desc"
  );
  const [searchTerm, setSearchTerm] = useState(savedSearchTerm || ""); // Remove type argument
  const [expandedNodes, setExpandedNodes] = useState(
    {} as Record<string, boolean>
  );
  const [displayedFiles, setDisplayedFiles] = useState([] as FileData[]); // Keep explicit type for initial value
  const [processingStatus, setProcessingStatus] = useState(
    { status: "idle", message: "" } as {
      status: "idle" | "processing" | "complete" | "error";
      message: string;
    }
  );
  const [includeFileTree, setIncludeFileTree] = useState(false);
  


  // State for sort dropdown
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Check if we're running in Electron or browser environment
  const isElectron = window.electron !== undefined;

  const [isSafeMode, setIsSafeMode] = useState(false);

  // Utility function to clear all saved state and reset the app
  const clearSavedState = useCallback(() => {
    // Clear all localStorage items
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Clear any session storage items
    sessionStorage.removeItem("hasLoadedInitialData");
    
    // Reset all state to initial values
    setSelectedFolder(null);
    setAllFiles([]);
    setSelectedFiles([]);
    setDisplayedFiles([]);
    setSearchTerm("");
    setSortOrder("tokens-desc");
    setExpandedNodes({});
    setIncludeFileTree(false);
    setProcessingStatus({ status: "idle", message: "All saved data cleared" });

    // Also cancel any ongoing directory loading
    if (isElectron) {
      window.electron.ipcRenderer.send("cancel-directory-loading");
    }
    
    console.log("All saved state cleared");

    // Reload the application window
    window.location.reload();
  }, [isElectron]); // Added isElectron dependency

  // Load expanded nodes state from localStorage
  useEffect(() => {
    const savedExpandedNodes = localStorage.getItem(
      STORAGE_KEYS.EXPANDED_NODES,
    );
    if (savedExpandedNodes) {
      try {
        setExpandedNodes(JSON.parse(savedExpandedNodes));
      } catch (error) {
        console.error("Error parsing saved expanded nodes:", error);
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
    localStorage.setItem(
      STORAGE_KEYS.SELECTED_FILES,
      JSON.stringify(selectedFiles),
    );
  }, [selectedFiles]);

  // Persist sort order when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SORT_ORDER, sortOrder);
  }, [sortOrder]);

  // Persist search term when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SEARCH_TERM, searchTerm);
  }, [searchTerm]);

  // Add a function to cancel directory loading
  const cancelDirectoryLoading = useCallback(() => {
    if (isElectron) {
      window.electron.ipcRenderer.send("cancel-directory-loading");
      setProcessingStatus({
        status: "idle",
        message: "Directory loading cancelled",
      });
    }
  }, [isElectron]);

  // Add this new useEffect for safe mode detection
  useEffect(() => {
    if (!isElectron) return;
    
    const handleStartupMode = (mode: { safeMode: boolean }) => {
      setIsSafeMode(mode.safeMode);
    
      // If we're in safe mode, don't auto-load the previously selected folder
      if (mode.safeMode) {
        console.log("Starting in safe mode - not loading saved folder");
        localStorage.removeItem("hasLoadedInitialData");
        localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      }
    };
    
    window.electron.ipcRenderer.on("startup-mode", handleStartupMode);
    
    return () => {
      window.electron.ipcRenderer.removeListener("startup-mode", handleStartupMode);
    };
  }, [isElectron]);

  // Modify the existing useEffect for loading initial data
  useEffect(() => {
    // Prevent this hook from running if not in Electron, no folder selected, in safe mode, or already processing
    if (!isElectron || !selectedFolder || isSafeMode || processingStatus.status === 'processing') return;
    
    // Always reload the folder data when the component mounts (after page refresh)
    // We want to ensure the exact same state is restored, including all selected files
    console.log("Loading saved folder on startup:", selectedFolder);
    setProcessingStatus({
      status: "processing",
      message: "Loading files from previously selected folder...",
    });
    
    // Request file list from the main process
    window.electron.ipcRenderer.send("request-file-list", selectedFolder);
    
    // We intentionally don't set any session flags because we want this to run
    // on every refresh to ensure state is fully restored
  }, [isElectron, selectedFolder, isSafeMode]);
  

  // Listen for folder selection from main process
  useEffect(() => {
    if (!isElectron) {
      console.warn("Not running in Electron environment");
      return;
    }

    const handleFolderSelected = (folderPath: string) => {
      // Check if folderPath is valid string
      if (typeof folderPath !== "string") {
        console.error("Invalid folder path received:", folderPath);
        setProcessingStatus({
          status: "error",
          message: "Invalid folder path received",
        });
        return;
      }

      // Prevent redundant processing if the same folder is selected and already loaded/loading
      if (arePathsEqual(folderPath, selectedFolder) && (allFiles.length > 0 || processingStatus.status === 'processing')) {
        console.log("Folder already selected and loaded/loading, skipping request:", folderPath);
        return;
      }
      
      const normalizedFolderPath = normalizePath(folderPath); // Normalize before setting
      console.log("Folder selected:", normalizedFolderPath);
      setSelectedFolder(normalizedFolderPath); // Set normalized path
      // Reset selections when a *new* folder is selected
      if (!arePathsEqual(normalizedFolderPath, selectedFolder)) { // Compare normalized path
        setSelectedFiles([]); 
      }
      setProcessingStatus({
        status: "processing",
        message: "Requesting file list...",
      });
      window.electron.ipcRenderer.send("request-file-list", folderPath);
    };

    const handleFileListData = (files: FileData[]) => {
      console.log("Received file list data:", files.length, "files");
      // Set the files, but let the separate useEffect handle filtering/sorting
      setAllFiles(files); 
      setProcessingStatus({
        status: "complete",
        message: `Loaded ${files.length} files`,
      });

      // Preserve selected files after reload
      if (selectedFiles.length > 0) {
        console.log("Preserving", selectedFiles.length, "file selections from before reload");
        
        // Validate that selected files still exist in the newly loaded files
        // and remove any that don't (they might have been deleted)
        const validSelectedFiles = selectedFiles.filter((selectedPath: string) => 
          files.some(file => arePathsEqual(file.path, selectedPath))
        );
        
        if (validSelectedFiles.length !== selectedFiles.length) {
          console.log("Removed", selectedFiles.length - validSelectedFiles.length, "invalid selections");
          setSelectedFiles(validSelectedFiles);
        }
      } else {
        // If no files were selected, auto-select non-binary files
        console.log("No existing selections, selecting all eligible files");
        const selectablePaths = files
          .filter(
            (file: FileData) =>
              !file.isBinary && !file.isSkipped && !file.excludedByDefault,
          )
          .map((file: FileData) => file.path);
  
        setSelectedFiles(selectablePaths);
      }
    };

    const handleProcessingStatus = (status: {
      status: "idle" | "processing" | "complete" | "error";
      message: string;
    }) => {
      console.log("Processing status:", status);
      setProcessingStatus(status);
    };

    window.electron.ipcRenderer.on("folder-selected", handleFolderSelected);
    window.electron.ipcRenderer.on("file-list-data", handleFileListData);
    window.electron.ipcRenderer.on(
      "file-processing-status",
      handleProcessingStatus,
    );

    return () => {
      window.electron.ipcRenderer.removeListener(
        "folder-selected",
        handleFolderSelected,
      );
      window.electron.ipcRenderer.removeListener(
        "file-list-data",
        handleFileListData,
      );
      window.electron.ipcRenderer.removeListener(
        "file-processing-status",
        handleProcessingStatus,
      );
    };
  }, [isElectron]); // Removed sortOrder and searchTerm dependencies

  // Apply filters and sort whenever relevant state changes
  useEffect(() => {
    applyFiltersAndSort(allFiles, sortOrder, searchTerm);
  }, [allFiles, sortOrder, searchTerm]); // Added allFiles dependency

  const openFolder = () => {
    if (isElectron) {
      console.log("Opening folder dialog");
      setProcessingStatus({ status: "idle", message: "Select a folder..." });
      window.electron.ipcRenderer.send("open-folder");
    } else {
      console.warn("Folder selection not available in browser");
    }
  };

  // Apply filters and sorting to files
  const applyFiltersAndSort = (
    files: FileData[],
    sort: string,
    filter: string,
  ) => {
    let filtered = files;

    // Apply filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      filtered = files.filter(
        (file) =>
          file.name.toLowerCase().includes(lowerFilter) ||
          file.path.toLowerCase().includes(lowerFilter),
      );
    }

    // Apply sort
    const [sortKey, sortDir] = sort.split("-");
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      if (sortKey === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortKey === "tokens") {
        comparison = a.tokenCount - b.tokenCount;
      } else if (sortKey === "size") {
        comparison = a.size - b.size;
      }

      return sortDir === "asc" ? comparison : -comparison;
    });

    setDisplayedFiles(sorted);
  };

  // Toggle file selection
  const toggleFileSelection = (filePath: string) => {
    // Normalize the incoming file path
    const normalizedPath = normalizePath(filePath);
    
    setSelectedFiles((prev: string[]) => {
      // Check if the file is already selected using case-sensitive/insensitive comparison as appropriate
      const isSelected = prev.some(path => arePathsEqual(path, normalizedPath));
      
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
    console.log('toggleFolderSelection called with:', { folderPath, isSelected });
    
    // Normalize the folder path for cross-platform compatibility
    const normalizedFolderPath = normalizePath(folderPath);
    console.log('Normalized folder path:', normalizedFolderPath);
    
    // Function to check if a file is in the given folder or its subfolders
    const isFileInFolder = (filePath: string, folderPath: string): boolean => {
      // Ensure paths are normalized with consistent slashes
      let normalizedFilePath = normalizePath(filePath);
      let normalizedFolderPath = normalizePath(folderPath);

      // Add leading slash to absolute paths if missing (common on macOS)
      if (
        !normalizedFilePath.startsWith("/") &&
        !normalizedFilePath.match(/^[a-z]:/i)
      ) {
        normalizedFilePath = "/" + normalizedFilePath;
      }

      if (
        !normalizedFolderPath.startsWith("/") &&
        !normalizedFolderPath.match(/^[a-z]:/i)
      ) {
        normalizedFolderPath = "/" + normalizedFolderPath;
      }

      // A file is in the folder if:
      // 1. The paths are equal (exact match)
      // 2. The file path is a subpath of the folder
      const isMatch =
        arePathsEqual(normalizedFilePath, normalizedFolderPath) ||
        isSubPath(normalizedFolderPath, normalizedFilePath);

      if (isMatch) {
        console.log(
          `File ${normalizedFilePath} is in folder ${normalizedFolderPath}`,
        );
      }

      return isMatch;
    };
    
    // Filter all files to get only those in this folder (and subfolders) that are selectable
    const filesInFolder = allFiles.filter((file: FileData) => {
      const inFolder = isFileInFolder(file.path, normalizedFolderPath);
      const selectable = !file.isBinary && !file.isSkipped && !file.excludedByDefault;
      return selectable && inFolder;
    });
    
    console.log('Found', filesInFolder.length, 'selectable files in folder');
    
    // If no selectable files were found, do nothing
    if (filesInFolder.length === 0) {
      console.log('No selectable files found in folder, nothing to do');
      return;
    }
    
    // Extract just the paths from the files and normalize them
    const folderFilePaths = filesInFolder.map((file: FileData) => normalizePath(file.path));
    console.log('File paths in folder:', folderFilePaths);
    
    if (isSelected) {
      // Adding files - create a new Set with all existing + new files
      setSelectedFiles((prev: string[]) => {
        const existingSelection = new Set(prev.map(normalizePath));
        folderFilePaths.forEach((path: string) => existingSelection.add(path));
        const newSelection = Array.from(existingSelection);
        console.log(`Added ${folderFilePaths.length} files to selection, total now: ${newSelection.length}`);
        return newSelection;
      });
    } else {
      // Removing files - filter out any file that's in our folder
      setSelectedFiles((prev: string[]) => {
        const newSelection = prev.filter((path: string) => !isFileInFolder(path, normalizedFolderPath));
        console.log(`Removed ${prev.length - newSelection.length} files from selection, total now: ${newSelection.length}`);
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
  const [userInstructions, setUserInstructions] = useState("");

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
      userInstructions
    });
  };

  // Handle select all files
  const selectAllFiles = () => {
    const selectablePaths = displayedFiles
      .filter((file: FileData) => !file.isBinary && !file.isSkipped)
      .map((file: FileData) => normalizePath(file.path)); // Normalize paths here

    setSelectedFiles((prev: string[]) => {
      const normalizedPrev = prev.map(normalizePath); // Normalize existing selection
      const newSelection = [...normalizedPrev];
      selectablePaths.forEach((pathToAdd: string) => {
        // Use arePathsEqual for checking existence
        if (!newSelection.some(existingPath => arePathsEqual(existingPath, pathToAdd))) {
          newSelection.push(pathToAdd);
        }
      });
      return newSelection;
    });
  };

  // Handle deselect all files
  const deselectAllFiles = () => {
    const displayedPathsToDeselect = displayedFiles.map((file: FileData) => normalizePath(file.path)); // Normalize paths to deselect
    setSelectedFiles((prev: string[]) => {
      const normalizedPrev = prev.map(normalizePath); // Normalize existing selection
      // Use arePathsEqual for filtering
      return normalizedPrev.filter(
        (selectedPath: string) => !displayedPathsToDeselect.some(
          (deselectPath: string) => arePathsEqual(selectedPath, deselectPath) // Add type annotation
        )
      );
    });
  };

  // Sort options for the dropdown
  const sortOptions = [
    { value: "tokens-desc", label: "Tokens: High to Low" },
    { value: "tokens-asc", label: "Tokens: Low to High" },
    { value: "name-asc", label: "Name: A to Z" },
    { value: "name-desc", label: "Name: Z to A" },
  ];

  // Handle expand/collapse state changes
  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev: Record<string, boolean>) => {
      const newState = {
        ...prev,
        [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId],
      };

      // Save to localStorage
      localStorage.setItem(
        STORAGE_KEYS.EXPANDED_NODES,
        JSON.stringify(newState),
      );

      return newState;
    });
  };

  return (
    <ThemeProvider children={
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
                disabled={processingStatus.status === "processing"}
              >
                Select Folder
              </button>
              <button
                className="clear-data-btn"
                onClick={clearSavedState}
                title="Clear all saved data and start fresh"
              >
                Clear Data
              </button>
            </div>
          </div>
        </header>

        {processingStatus.status === "processing" && (
          <div className="processing-indicator">
            <div className="spinner"></div>
            <span>{processingStatus.message}</span>
            <button
              className="cancel-btn"
              onClick={cancelDirectoryLoading}
            >
              Cancel
            </button>
          </div>
        )}

        {processingStatus.status === "error" && (
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
            />
            <div className="content-area">
              <div className="content-header">
                <div className="content-title">Selected Files</div>
                <div className="content-actions">
                  <div className="sort-dropdown">
                    <button
                      className="sort-dropdown-button"
                      onClick={toggleSortDropdown}
                    >
                      Sort:{" "}
                      {sortOptions.find((opt) => opt.value === sortOrder)
                        ?.label || sortOrder}
                    </button>
                    {sortDropdownOpen && (
                      <div className="sort-options">
                        {sortOptions.map((option) => (
                          <div
                            key={option.value}
                            className={`sort-option ${
                              sortOrder === option.value ? "active" : ""
                            }`}
                            onClick={() => handleSortChange(option.value)}
                          >
                            {option.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="file-stats">
                    {selectedFiles.length} files | ~
                    {calculateTotalTokens().toLocaleString()} tokens
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
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%", maxWidth: "400px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={includeFileTree}
                      onChange={() => setIncludeFileTree(!includeFileTree)}
                    />
                    <span>Include File Tree</span>
                  </label>
                  {/* 
                   * Copy Button
                   * When clicked, this will copy all selected files along with:
                   * - File tree (if enabled via the checkbox)
                   * - User instructions (if any were entered)
                   */}
                  <CopyButton
                    text={getSelectedFilesContent()}
                    className="primary full-width"
                  >
                    <span>COPY ALL SELECTED ({selectedFiles.length} files)</span>
                  </CopyButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    } />
  );
};

export default App;
