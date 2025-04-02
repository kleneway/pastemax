const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Global variables for directory loading control
let isLoadingDirectory = false;
let loadingTimeoutId = null;
const MAX_DIRECTORY_LOAD_TIME = 60000; // 60 seconds timeout

/**
 * Enhanced path handling functions for cross-platform compatibility
 */

/**
 * Normalize file paths to use forward slashes regardless of OS
 * This ensures consistent path formatting between main and renderer processes
 * Also handles UNC paths on Windows
 */
function normalizePath(filePath) {
  if (!filePath) return filePath;

  // Handle Windows UNC paths
  if (process.platform === 'win32' && filePath.startsWith('\\\\')) {
    // Preserve the UNC path format but normalize separators
    return '\\\\' + filePath.slice(2).replace(/\\/g, '/');
  }

  return filePath.replace(/\\/g, '/');
}

/**
 * Get the platform-specific path separator
 */
function getPathSeparator() {
  return path.sep;
}

/**
 * Ensures a path is absolute and normalized for the current platform
 * @param {string} inputPath - The path to normalize
 * @returns {string} - Normalized absolute path
 */
function ensureAbsolutePath(inputPath) {
  if (!path.isAbsolute(inputPath)) {
    inputPath = path.resolve(inputPath);
  }
  return normalizePath(inputPath);
}

/**
 * Safely joins paths across different platforms
 * @param {...string} paths - Path segments to join
 * @returns {string} - Normalized joined path
 */
function safePathJoin(...paths) {
  const joined = path.join(...paths);
  return normalizePath(joined);
}

/**
 * Safely calculates relative path between two paths
 * Handles different OS path formats and edge cases
 * @param {string} from - Base path
 * @param {string} to - Target path
 * @returns {string} - Normalized relative path
 */
function safeRelativePath(from, to) {
  // Normalize both paths to use the same separator format
  from = normalizePath(from);
  to = normalizePath(to);
  
  // Handle Windows drive letter case-insensitivity
  if (process.platform === 'win32') {
    from = from.toLowerCase();
    to = to.toLowerCase();
  }
  
  let relativePath = path.relative(from, to);
  return normalizePath(relativePath);
}

/**
 * Checks if a path is a valid path for the current OS
 * @param {string} pathToCheck - Path to validate
 * @returns {boolean} - True if path is valid
 */
function isValidPath(pathToCheck) {
  try {
    path.parse(pathToCheck);
    return true;
  } catch (err) {
    return false;
  }
}

// Add handling for the 'ignore' module
let ignore;
try {
  ignore = require("ignore");
  console.log("Successfully loaded ignore module");
} catch (err) {
  console.error("Failed to load ignore module:", err);
  // Simple fallback implementation for when the ignore module fails to load
  ignore = {
    // Simple implementation that just matches exact paths
    createFilter: () => {
      return (path) => !excludedFiles.includes(path);
    },
  };
  console.log("Using fallback for ignore module");
}

// Initialize tokenizer with better error handling
let tiktoken;
try {
  tiktoken = require("tiktoken");
  console.log("Successfully loaded tiktoken module");
} catch (err) {
  console.error("Failed to load tiktoken module:", err);
  tiktoken = null;
}

// Import the excluded files list
const { excludedFiles, binaryExtensions } = require("./excluded-files");

// Initialize the encoder once at startup with better error handling
let encoder;
try {
  if (tiktoken) {
    encoder = tiktoken.get_encoding("o200k_base"); // gpt-4o encoding
    console.log("Tiktoken encoder initialized successfully");
  } else {
    throw new Error("Tiktoken module not available");
  }
} catch (err) {
  console.error("Failed to initialize tiktoken encoder:", err);
  // Fallback to a simpler method if tiktoken fails
  console.log("Using fallback token counter");
  encoder = null;
}

// Max file size to read (5MB) - BINARY_EXTENSIONS constant removed
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function createWindow() {
  // Check if we're starting in safe mode (Shift key pressed)
  const isSafeMode = process.argv.includes('--safe-mode');
  
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      devTools: {
        isDevToolsExtension: false,
        htmlFullscreen: false,
      },
    },
  });

  // Pass the safe mode flag to the renderer
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('startup-mode', { 
      safeMode: isSafeMode 
    });
  });

  // Register the escape key to cancel directory loading
  globalShortcut.register('Escape', () => {
    if (isLoadingDirectory) {
      cancelDirectoryLoading(mainWindow);
    }
  });

  // Clean up shortcuts when window is closed
  mainWindow.on('closed', () => {
    globalShortcut.unregisterAll();
  });

  // Load the index.html file
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle folder selection
ipcMain.on("open-folder", async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    const rawPath = result.filePaths[0]; // Get the raw path
    const normalizedPath = normalizePath(rawPath); // Normalize it immediately
    try {
      // Ensure we're only sending a string, not an object
      // Use the normalized path for logging and sending
      console.log("Sending folder-selected event with normalized path:", normalizedPath);
      event.sender.send("folder-selected", normalizedPath);
    } catch (err) {
      console.error("Error sending folder-selected event:", err);
      // Try a more direct approach as a fallback, still using normalized path
      event.sender.send("folder-selected", normalizedPath);
    }
  }
});

/**
 * Parse .gitignore file if it exists and create an ignore filter
 * Handles path normalization for cross-platform compatibility
 * 
 * @param {string} rootDir - The root directory containing .gitignore
 * @returns {object} - Configured ignore filter
 */
function loadGitignore(rootDir) {
  const ig = ignore();
  
  // Ensure root directory path is absolute and normalized
  rootDir = ensureAbsolutePath(rootDir);
  const gitignorePath = safePathJoin(rootDir, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
      // Split content into lines and normalize path separators
      const normalizedPatterns = gitignoreContent
        .split(/\r?\n/)
        .map(pattern => pattern.trim())
        .filter(pattern => pattern && !pattern.startsWith('#'))
        .map(pattern => normalizePath(pattern));

      ig.add(normalizedPatterns);
    } catch (err) {
      console.error("Error reading .gitignore:", err);
    }
  }

  // Add some default ignores that are common
  ig.add([
    ".git",
    "node_modules",
    ".DS_Store",
    // Add Windows-specific files to ignore
    "Thumbs.db",
    "desktop.ini",
    // Add common IDE files
    ".idea",
    ".vscode",
    // Add common build directories
    "dist",
    "build",
    "out"
  ]);

  // Normalize and add the excludedFiles patterns
  const normalizedExcludedFiles = excludedFiles.map(pattern => normalizePath(pattern));
  ig.add(normalizedExcludedFiles);

  return ig;
}

// Check if file is binary based on extension
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // Use imported binaryExtensions directly
  return binaryExtensions.includes(ext);
}

// Count tokens using tiktoken with o200k_base encoding
function countTokens(text) {
  // Simple fallback implementation if encoder fails
  if (!encoder) {
    return Math.ceil(text.length / 4);
  }

  try {
    // Remove any special tokens that might cause issues
    const cleanText = text.replace(/<\|endoftext\|>/g, '');
    const tokens = encoder.encode(cleanText);
    return tokens.length;
  } catch (err) {
    console.error("Error counting tokens:", err);
    // Fallback to character-based estimation on error
    return Math.ceil(text.length / 4);
  }
}

/**
 * Recursively reads files from a directory with chunked processing and cancellation support.
 * Implements several performance and safety features:
 * - Processes files in small chunks to maintain UI responsiveness
 * - Supports immediate cancellation at any point
 * - Handles binary files and large files appropriately
 * - Respects .gitignore and custom exclusion patterns
 * - Provides progress updates to the UI
 * - Handles cross-platform path issues including UNC paths
 * 
 * @param {string} dir - The directory to process
 * @param {string} rootDir - The root directory (used for relative path calculations)
 * @param {object} ignoreFilter - The ignore filter instance for file exclusions
 * @param {BrowserWindow} window - The Electron window instance for sending updates
 * @returns {Promise<Array>} Array of processed file objects
 */
async function readFilesRecursively(dir, rootDir, ignoreFilter, window) {
  if (!isLoadingDirectory) return [];
  
  // Ensure absolute and normalized paths
  dir = ensureAbsolutePath(dir);
  rootDir = ensureAbsolutePath(rootDir || dir);
  ignoreFilter = ignoreFilter || loadGitignore(rootDir);

  let results = [];
  let processedFiles = 0;
  const CHUNK_SIZE = 20;

  try {
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    if (!isLoadingDirectory) return results;

    const directories = dirents.filter(dirent => dirent.isDirectory());
    const files = dirents.filter(dirent => dirent.isFile());

    // Process directories first
    for (const dirent of directories) {
      if (!isLoadingDirectory) return results;

      const fullPath = safePathJoin(dir, dirent.name);
      // Calculate relative path safely
      const relativePath = safeRelativePath(rootDir, fullPath);

      // Skip PasteMax app directories and invalid paths
      if (fullPath.includes('.app') || fullPath === app.getAppPath() || 
          !isValidPath(relativePath) || relativePath.startsWith('..')) {
        console.log('Skipping directory:', fullPath);
        continue;
      }

      // Only process if not ignored
      if (!ignoreFilter.ignores(relativePath)) {
        const subResults = await readFilesRecursively(fullPath, rootDir, ignoreFilter, window);
        if (!isLoadingDirectory) return results;
        results = results.concat(subResults);
      }

      window.webContents.send("file-processing-status", {
        status: "processing",
        message: `Scanning directories... (Press ESC to cancel)`,
      });
    }

    // Process files in chunks
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      if (!isLoadingDirectory) return results;

      const chunk = files.slice(i, i + CHUNK_SIZE);
      
      const chunkPromises = chunk.map(async (dirent) => {
        if (!isLoadingDirectory) return null;

        const fullPath = safePathJoin(dir, dirent.name);
        // Calculate relative path safely
        const relativePath = safeRelativePath(rootDir, fullPath);

        // Skip PasteMax app files and invalid paths
        if (fullPath.includes('.app') || fullPath === app.getAppPath() || 
            !isValidPath(relativePath) || relativePath.startsWith('..')) {
          console.log('Skipping file:', fullPath);
          return null;
        }

        if (ignoreFilter.ignores(relativePath)) {
          return null;
        }

        try {
          const stats = await fs.promises.stat(fullPath);
          if (!isLoadingDirectory) return null;
          
          if (stats.size > MAX_FILE_SIZE) {
            return {
              name: dirent.name,
              path: normalizePath(fullPath),
              relativePath: relativePath,
              tokenCount: 0,
              size: stats.size,
              content: "",
              isBinary: false,
              isSkipped: true,
              error: "File too large to process"
            };
          }

          if (isBinaryFile(fullPath)) {
            return {
              name: dirent.name,
              path: normalizePath(fullPath),
              relativePath: relativePath,
              tokenCount: 0,
              size: stats.size,
              content: "",
              isBinary: true,
              isSkipped: false,
              fileType: path.extname(fullPath).substring(1).toUpperCase()
            };
          }

          const fileContent = await fs.promises.readFile(fullPath, "utf8");
          if (!isLoadingDirectory) return null;
          
          return {
            name: dirent.name,
            path: normalizePath(fullPath),
            relativePath: relativePath,
            content: fileContent,
            tokenCount: countTokens(fileContent),
            size: stats.size,
            isBinary: false,
            isSkipped: false
          };
        } catch (err) {
          console.error(`Error reading file ${fullPath}:`, err);
          return {
            name: dirent.name,
            path: normalizePath(fullPath),
            relativePath: relativePath,
            tokenCount: 0,
            size: 0,
            isBinary: false,
            isSkipped: true,
            error: err.code === 'EPERM' ? "Permission denied" : 
                   err.code === 'ENOENT' ? "File not found" : 
                   "Could not read file"
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      if (!isLoadingDirectory) return results;
      
      results = results.concat(chunkResults.filter(result => result !== null));
      processedFiles += chunk.length;
      
      window.webContents.send("file-processing-status", {
        status: "processing",
        message: `Processing files... ${processedFiles}/${files.length} (Press ESC to cancel)`,
      });
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      console.log(`Skipping inaccessible directory: ${dir}`);
      return results;
    }
  }

  return results;
}

// Modify the request-file-list handler to use async/await
ipcMain.on("request-file-list", async (event, folderPath) => {
  // Prevent processing if already loading - Simply return if busy
  if (isLoadingDirectory) {
    console.log("Already processing a directory, ignoring new request for:", folderPath);
    // Optionally send a status update to the renderer
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window.webContents && !window.webContents.isDestroyed()) {
      window.webContents.send("file-processing-status", {
        status: "busy",
        message: "Already processing another directory. Please wait.",
      });
    }
    return; // Exit the handler
  }

  try {
    // Set the loading flag first to prevent race conditions
    isLoadingDirectory = true;

    // Set up the timeout for directory loading
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), folderPath);

    // Send initial progress update
    event.sender.send("file-processing-status", {
      status: "processing",
      message: "Scanning directory structure... (Press ESC to cancel)",
    });

    // Process files with async/await
    const files = await readFilesRecursively(folderPath, folderPath, null, BrowserWindow.fromWebContents(event.sender));
    
    // If loading was cancelled, return early
    if (!isLoadingDirectory) {
      return;
    }

    // Clear the timeout and loading flag
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
    isLoadingDirectory = false;

    // Update with processing complete status
    event.sender.send("file-processing-status", {
      status: "complete",
      message: `Found ${files.length} files`,
    });

    // Process the files to ensure they're serializable
    const serializedFiles = files.map(file => ({
      path: file.path, // Keep the full path
      relativePath: file.relativePath, // Use the relative path for display
      name: file.name,
      size: file.size,
      isDirectory: file.isDirectory,
      extension: path.extname(file.name).toLowerCase(),
      excluded: shouldExcludeByDefault(file.path, folderPath),
      content: file.content,
      tokenCount: file.tokenCount,
      isBinary: file.isBinary,
      isSkipped: file.isSkipped,
      error: file.error,
    }));

    event.sender.send("file-list-data", serializedFiles);
  } catch (err) {
    console.error("Error processing file list:", err);
    isLoadingDirectory = false; // Reset flag on error

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }

    event.sender.send("file-processing-status", {
      status: "error",
      message: `Error: ${err.message}`,
    });
  } finally {
    // Ensure the flag is always reset, even on error or cancellation
    isLoadingDirectory = false;
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
  }
});

// Add handler for cancel-directory-loading event
ipcMain.on("cancel-directory-loading", (event) => {
  cancelDirectoryLoading(BrowserWindow.fromWebContents(event.sender));
});

/**
 * Determines if a file should be excluded based on gitignore patterns and default rules.
 * Handles cross-platform path issues including UNC paths and network shares.
 * 
 * @param {string} filePath - The full path of the file to check
 * @param {string} rootDir - The root directory for relative path calculation
 * @returns {boolean} True if the file should be excluded
 */
function shouldExcludeByDefault(filePath, rootDir) {
  // Ensure paths are absolute and normalized
  filePath = ensureAbsolutePath(filePath);
  rootDir = ensureAbsolutePath(rootDir);
  
  // Calculate relative path safely
  const relativePath = safeRelativePath(rootDir, filePath);
  
  // Don't process paths outside the root directory or invalid paths
  if (!isValidPath(relativePath) || relativePath.startsWith('..')) {
    return true;
  }

  // Handle Windows-specific paths
  if (process.platform === 'win32') {
    // Skip system files and folders
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(path.basename(filePath))) {
      return true;
    }
    
    // Skip Windows system directories
    if (filePath.toLowerCase().includes('\\windows\\') || 
        filePath.toLowerCase().includes('\\system32\\')) {
      return true;
    }
  }

  // Handle macOS-specific paths
  if (process.platform === 'darwin') {
    // Skip macOS system files
    if (filePath.includes('/.Spotlight-') || 
        filePath.includes('/.Trashes') || 
        filePath.includes('/.fseventsd')) {
      return true;
    }
  }

  // Handle Linux-specific paths
  if (process.platform === 'linux') {
    // Skip Linux system directories
    if (filePath.startsWith('/proc/') || 
        filePath.startsWith('/sys/') || 
        filePath.startsWith('/dev/')) {
      return true;
    }
  }

  const ig = ignore().add(excludedFiles);
  return ig.ignores(relativePath);
}

// Add a debug handler for file selection
ipcMain.on("debug-file-selection", (event, data) => {
  console.log("DEBUG - File Selection:", data);
});

/**
 * Handles the cancellation of directory loading operations.
 * Ensures clean cancellation by:
 * - Clearing all timeouts
 * - Resetting loading flags
 * - Notifying the UI immediately
 * 
 * @param {BrowserWindow} window - The Electron window instance to send updates to
 */
function cancelDirectoryLoading(window) {
  if (!isLoadingDirectory) return;

  console.log("Cancelling directory loading process immediately");
  // Ensure flag is reset here as well
  isLoadingDirectory = false;

  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }

  // Send cancellation message immediately
  // Add checks for window validity
  if (window && window.webContents && !window.webContents.isDestroyed()) {
    window.webContents.send("file-processing-status", {
      status: "cancelled",
      message: "Directory loading cancelled",
    });
  } else {
    console.log("Window not available to send cancellation status.");
  }
}

/**
 * Sets up a safety timeout for directory loading operations.
 * Prevents infinite loading by automatically cancelling after MAX_DIRECTORY_LOAD_TIME.
 * 
 * @param {BrowserWindow} window - The Electron window instance
 * @param {string} folderPath - The path being processed (for logging)
 */
function setupDirectoryLoadingTimeout(window, folderPath) {
  // Clear any existing timeout
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
  }
  
  // Set a new timeout
  loadingTimeoutId = setTimeout(() => {
    console.log(`Directory loading timed out after ${MAX_DIRECTORY_LOAD_TIME / 1000} seconds: ${folderPath}`);
    // Call cancelDirectoryLoading which now resets the flag
    cancelDirectoryLoading(window);
  }, MAX_DIRECTORY_LOAD_TIME);
}
