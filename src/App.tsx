import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import FileList from "./components/FileList";
import CopyButton from "./components/CopyButton";
import { FileData, FileTreeMode } from "./types/FileTypes";
import { ThemeProvider } from "./context/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";
import FileTreeToggle from "./components/FileTreeToggle";
import { generateAsciiFileTree, getTopLevelDirectories, getAllDirectories } from "./utils/pathUtils";

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

// Keys for localStorage
const STORAGE_KEYS = {
  SELECTED_FOLDER: "pastemax-selected-folder",
  SELECTED_FILES: "pastemax-selected-files",
  SORT_ORDER: "pastemax-sort-order",
  SEARCH_TERM: "pastemax-search-term",
  EXPANDED_NODES: "pastemax-expanded-nodes",
  FILE_TREE_MODE: "pastemax-file-tree-mode",
};

const App = () => {
  // Load initial state from localStorage if available
  const savedFolder = localStorage.getItem(STORAGE_KEYS.SELECTED_FOLDER);
  const savedFiles = localStorage.getItem(STORAGE_KEYS.SELECTED_FILES);
  const savedSortOrder = localStorage.getItem(STORAGE_KEYS.SORT_ORDER);
  const savedSearchTerm = localStorage.getItem(STORAGE_KEYS.SEARCH_TERM);

  const [selectedFolder, setSelectedFolder] = useState(
    savedFolder as string | null
  );
  const [allFiles, setAllFiles] = useState([] as FileData[]);
  const [selectedFiles, setSelectedFiles] = useState(
    savedFiles ? JSON.parse(savedFiles) : [] as string[]
  );
  const [sortOrder, setSortOrder] = useState(
    savedSortOrder || "tokens-desc"
  );
  const [searchTerm, setSearchTerm] = useState(savedSearchTerm || "");
  const [expandedNodes, setExpandedNodes] = useState(
    {} as Record<string, boolean>
  );
  const [displayedFiles, setDisplayedFiles] = useState([] as FileData[]);
  const [processingStatus, setProcessingStatus] = useState(
    { status: "idle", message: "" } as {
      status: "idle" | "processing" | "complete" | "error";
      message: string;
    }
  );
  // Load saved file tree mode from localStorage
  const savedFileTreeMode = localStorage.getItem(STORAGE_KEYS.FILE_TREE_MODE);
  const validModes: FileTreeMode[] = ["none", "selected", "selected-with-roots", "complete"];
  const initialMode: FileTreeMode = validModes.includes(savedFileTreeMode as FileTreeMode) 
    ? (savedFileTreeMode as FileTreeMode) 
    : "none";
  const [fileTreeMode, setFileTreeMode] = useState(initialMode);
  


  // State for sort dropdown
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Check if we're running in Electron or browser environment
  const isElectron = window.electron !== undefined;

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

  // Persist file tree mode when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILE_TREE_MODE, fileTreeMode);
  }, [fileTreeMode]);

  // Load initial data from saved folder
  useEffect(() => {
    if (!isElectron || !selectedFolder) return;
  
    // Use a flag in sessionStorage to ensure we only load data once per session
    const hasLoadedInitialData = sessionStorage.getItem("hasLoadedInitialData");
    if (hasLoadedInitialData === "true") return;
  
    console.log("Loading saved folder on startup:", selectedFolder);
    setProcessingStatus({
      status: "processing",
      message: "Loading files from previously selected folder...",
    });
    window.electron.ipcRenderer.send("request-file-list", selectedFolder);
  
    // Mark that we've loaded the initial data
    sessionStorage.setItem("hasLoadedInitialData", "true");
  }, [isElectron, selectedFolder]);
  


  // Listen for folder selection from main process
  useEffect(() => {
    if (!isElectron) {
      console.warn("Not running in Electron environment");
      return;
    }

    const handleFolderSelected = (folderPath: string) => {
      // Check if folderPath is valid string
      if (typeof folderPath === "string") {
        console.log("Folder selected:", folderPath);
        setSelectedFolder(folderPath);
        // We'll select all files after they're loaded
        setSelectedFiles([]);
        setProcessingStatus({
          status: "processing",
          message: "Requesting file list...",
        });
        window.electron.ipcRenderer.send("request-file-list", folderPath);
      } else {
        console.error("Invalid folder path received:", folderPath);
        setProcessingStatus({
          status: "error",
          message: "Invalid folder path received",
        });
      }
    };

    const handleFileListData = (files: FileData[]) => {
      console.log("Received file list data:", files.length, "files");
      setAllFiles(files);
      setProcessingStatus({
        status: "complete",
        message: `Loaded ${files.length} files`,
      });

      // Apply filters and sort to the new files
      applyFiltersAndSort(files, sortOrder, searchTerm);

      // Select only files that are not binary, not skipped, and not excluded by default
      const selectablePaths = files
        .filter(
          (file: FileData) =>
            !file.isBinary && !file.isSkipped && !file.excludedByDefault, // Respect the excludedByDefault flag
        )
        .map((file: FileData) => file.path);

      setSelectedFiles(selectablePaths);
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
  }, [isElectron, sortOrder, searchTerm]);

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
    setSelectedFiles((prev: string[]) => {
      if (prev.includes(filePath)) {
        return prev.filter((path: string) => path !== filePath);
      } else {
        return [...prev, filePath];
      }
    });
  };

  // Toggle folder selection (select/deselect all files in folder)
  const toggleFolderSelection = (folderPath: string, isSelected: boolean) => {
    const filesInFolder = allFiles.filter(
      (file: FileData) =>
        file.path.startsWith(folderPath) && !file.isBinary && !file.isSkipped,
    );

    if (isSelected) {
      // Add all files from this folder that aren't already selected
      const filePaths = filesInFolder.map((file: FileData) => file.path);
      setSelectedFiles((prev: string[]) => {
        const newSelection = [...prev];
        filePaths.forEach((path: string) => {
          if (!newSelection.includes(path)) {
            newSelection.push(path);
          }
        });
        return newSelection;
      });
    } else {
      // Remove all files from this folder
      setSelectedFiles((prev: string[]) =>
        prev.filter(
          (path: string) =>
            !filesInFolder.some((file: FileData) => file.path === path),
        ),
      );
    }
  };

  // Handle sort change
  const handleSortChange = (newSort: string) => {
    setSortOrder(newSort);
    applyFiltersAndSort(allFiles, newSort, searchTerm);
    setSortDropdownOpen(false); // Close dropdown after selection
  };

  // Handle search change
  const handleSearchChange = (newSearch: string) => {
    setSearchTerm(newSearch);
    applyFiltersAndSort(allFiles, sortOrder, newSearch);
  };

  // Toggle sort dropdown
  const toggleSortDropdown = () => {
    setSortDropdownOpen(!sortDropdownOpen);
  };

  // Calculate total tokens from selected files
  const calculateTotalTokens = () => {
    return selectedFiles.reduce((total: number, path: string) => {
      const file = allFiles.find((f: FileData) => f.path === path);
      return total + (file ? file.tokenCount : 0);
    }, 0);
  };

  // Concatenate selected files content for copying
  const getSelectedFilesContent = () => {
    // Sort selected files according to current sort order
    const [sortKey, sortDir] = sortOrder.split("-");
    const sortedSelected = allFiles
      .filter((file: FileData) => selectedFiles.includes(file.path))
      .sort((a: FileData, b: FileData) => {
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

    if (sortedSelected.length === 0) {
      return "No files selected.";
    }

    // Start with opening file_contents tag
    let concatenatedString = "<codebase>\n";
    
    // Add ASCII file tree if enabled
    if (fileTreeMode !== "none" && selectedFolder) {
      let fileTreeItems: { path: string; isFile?: boolean }[] = [];

      if (fileTreeMode === "selected") {
        // Only include selected files
        fileTreeItems = sortedSelected.map((file: FileData) => ({ path: file.path, isFile: true }));
      } else if (fileTreeMode === "selected-with-roots") {
        // Include all directories and selected files to show the complete folder structure
        const allDirs = getAllDirectories(allFiles, selectedFolder);
        fileTreeItems = [
          ...allDirs.map(dir => ({ path: dir, isFile: false })),
          ...sortedSelected.map((file: FileData) => ({ path: file.path, isFile: true }))
        ];
      } else if (fileTreeMode === "complete") {
        // Include all files
        fileTreeItems = allFiles.map((file: FileData) => ({ path: file.path, isFile: true }));
      }

      const asciiTree = generateAsciiFileTree(fileTreeItems, selectedFolder);
      concatenatedString += `<file_map>\n${selectedFolder}\n${asciiTree}\n</file_map>\n\n`;
    }
    
    sortedSelected.forEach((file: FileData) => {
      // Calculate the relative path from the selected folder
      const normalizedFilePath = file.path.replace(/\\/g, "/");
      const normalizedRootPath = selectedFolder ? selectedFolder.replace(/\\/g, "/").replace(/\/$/, "") : "";
      
      // Get the path relative to the project root
      let relativePath = file.path;
      if (normalizedRootPath && normalizedFilePath.startsWith(normalizedRootPath + "/")) {
        relativePath = normalizedFilePath.substring(normalizedRootPath.length + 1);
      }
      
      // Determine the file extension for the code block language
      const extension = file.path.split('.').pop() || '';
      
      // Map file extensions to appropriate language identifiers for code blocks
      let languageIdentifier = extension;
      // Web development languages
      if (extension === 'js') languageIdentifier = 'javascript';
      else if (extension === 'ts') languageIdentifier = 'typescript';
      else if (extension === 'tsx') languageIdentifier = 'tsx';
      else if (extension === 'jsx') languageIdentifier = 'jsx';
      else if (extension === 'css') languageIdentifier = 'css';
      else if (extension === 'scss' || extension === 'sass') languageIdentifier = 'scss';
      else if (extension === 'less') languageIdentifier = 'less';
      else if (extension === 'html') languageIdentifier = 'html';
      else if (extension === 'json') languageIdentifier = 'json';
      else if (extension === 'md') languageIdentifier = 'markdown';
      else if (extension === 'xml') languageIdentifier = 'xml';
      else if (extension === 'svg') languageIdentifier = 'svg';
      
      // Backend languages
      else if (extension === 'py') languageIdentifier = 'python';
      else if (extension === 'rb') languageIdentifier = 'ruby';
      else if (extension === 'php') languageIdentifier = 'php';
      else if (extension === 'java') languageIdentifier = 'java';
      else if (extension === 'cs') languageIdentifier = 'csharp';
      else if (extension === 'go') languageIdentifier = 'go';
      else if (extension === 'rs') languageIdentifier = 'rust';
      else if (extension === 'swift') languageIdentifier = 'swift';
      else if (extension === 'kt' || extension === 'kts') languageIdentifier = 'kotlin';
      else if (extension === 'c' || extension === 'h') languageIdentifier = 'c';
      else if (extension === 'cpp' || extension === 'cc' || extension === 'cxx' || extension === 'hpp') languageIdentifier = 'cpp';
      
      // Shell and configuration
      else if (extension === 'sh' || extension === 'bash') languageIdentifier = 'bash';
      else if (extension === 'ps1') languageIdentifier = 'powershell';
      else if (extension === 'bat' || extension === 'cmd') languageIdentifier = 'batch';
      else if (extension === 'yaml' || extension === 'yml') languageIdentifier = 'yaml';
      else if (extension === 'toml') languageIdentifier = 'toml';
      else if (extension === 'ini') languageIdentifier = 'ini';
      else if (extension === 'dockerfile' || file.path.toLowerCase().endsWith('dockerfile')) languageIdentifier = 'dockerfile';
      
      // Database
      else if (extension === 'sql') languageIdentifier = 'sql';
      
      // Fallback to plaintext if no matching language is found
      else if (!languageIdentifier) languageIdentifier = 'plaintext';
      
      // Add file content with file header and code block
      concatenatedString += `\nFile: ${relativePath}\n\`\`\`${languageIdentifier}\n${file.content}\n\`\`\`\n`;
    });
    
    // Close file_contents tag
    concatenatedString += "</codebase>";

    return concatenatedString;
  };

  // Handle select all files
  const selectAllFiles = () => {
    const selectablePaths = displayedFiles
      .filter((file: FileData) => !file.isBinary && !file.isSkipped)
      .map((file: FileData) => file.path);

    setSelectedFiles((prev: string[]) => {
      const newSelection = [...prev];
      selectablePaths.forEach((path: string) => {
        if (!newSelection.includes(path)) {
          newSelection.push(path);
        }
      });
      return newSelection;
    });
  };

  // Handle deselect all files
  const deselectAllFiles = () => {
    const displayedPaths = displayedFiles.map((file: FileData) => file.path);
    setSelectedFiles((prev: string[]) =>
      prev.filter((path: string) => !displayedPaths.includes(path)),
    );
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
                disabled={processingStatus.status === "processing"}
              >
                Select Folder
              </button>
            </div>
          </div>
        </header>

        {processingStatus.status === "processing" && (
          <div className="processing-indicator">
            <div className="spinner"></div>
            <span>{processingStatus.message}</span>
          </div>
        )}

        {processingStatus.status === "error" && (
          <div className="error-message">Error: {processingStatus.message}</div>
        )}

        {selectedFolder && (
          <div className="main-content">
            <Sidebar
              selectedFolder={selectedFolder}
              openFolder={openFolder}
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

              <div className="copy-button-container">
                <div className="file-tree-options-container">
                  <div className="file-tree-format-container">
                    <FileTreeToggle currentMode={fileTreeMode} onChange={setFileTreeMode} />
                  </div>
                  <CopyButton
                    text={getSelectedFilesContent()}
                    className="primary"
                  >
                    <span>COPY ALL SELECTED ({selectedFiles.length} files)</span>
                  </CopyButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
};

export default App;