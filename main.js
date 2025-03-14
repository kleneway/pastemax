const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Global variables for directory loading control
let isLoadingDirectory = false;
let loadingTimeoutId = null;
const MAX_DIRECTORY_LOAD_TIME = 60000; // 60 seconds timeout

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

/**
 * Normalize file paths to use forward slashes regardless of OS
 * This ensures consistent path formatting between main and renderer processes
 */
function normalizePath(filePath) {
  if (!filePath) return filePath;
  return filePath.replace(/\\/g, '/');
}

/**
 * Get the platform-specific path separator
 */
function getPathSeparator() {
  return os.platform() === 'win32' ? '\\' : '/';
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

// Binary file extensions that should be excluded from token counting
const BINARY_EXTENSIONS = [
  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".ico",
  ".webp",
  ".svg",
  // Audio/Video
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".avi",
  ".mov",
  ".mkv",
  ".flac",
  // Archives
  ".zip",
  ".rar",
  ".tar",
  ".gz",
  ".7z",
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  // Compiled
  ".exe",
  ".dll",
  ".so",
  ".class",
  ".o",
  ".pyc",
  // Database
  ".db",
  ".sqlite",
  ".sqlite3",
  // Others
  ".bin",
  ".dat",
].concat(binaryExtensions || []); // Add any additional binary extensions from excluded-files.js

// Max file size to read (5MB)
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
    const selectedPath = result.filePaths[0];
    try {
      // Ensure we're only sending a string, not an object
      const pathString = String(selectedPath);
      console.log("Sending folder-selected event with path:", pathString);
      event.sender.send("folder-selected", pathString);
    } catch (err) {
      console.error("Error sending folder-selected event:", err);
      // Try a more direct approach as a fallback
      event.sender.send("folder-selected", String(selectedPath));
    }
  }
});

// Function to parse .gitignore file if it exists
function loadGitignore(rootDir) {
  const ig = ignore();
  const gitignorePath = path.join(rootDir, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
    ig.add(gitignoreContent);
  }

  // Add some default ignores that are common
  ig.add([".git", "node_modules", ".DS_Store"]);

  // Add the excludedFiles patterns for gitignore-based exclusion
  ig.add(excludedFiles);

  return ig;
}

// Check if file is binary based on extension
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
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
 * 
 * @param {string} dir - The directory to process
 * @param {string} rootDir - The root directory (used for relative path calculations)
 * @param {object} ignoreFilter - The ignore filter instance for file exclusions
 * @param {BrowserWindow} window - The Electron window instance for sending updates
 * @returns {Promise<Array>} Array of processed file objects
 */
async function readFilesRecursively(dir, rootDir, ignoreFilter, window) {
  if (!isLoadingDirectory) return [];
  
  rootDir = rootDir || dir;
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

      const fullPath = path.join(dir, dirent.name);
      // Ensure path is relative to root and normalized
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');

      // Skip PasteMax app directories
      if (fullPath.includes('.app') || fullPath === app.getAppPath()) {
        console.log('Skipping app directory:', fullPath);
        continue;
      }

      // Only check ignore patterns if the path is inside the root directory
      if (!relativePath.startsWith('..') && !ignoreFilter.ignores(relativePath)) {
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

        const fullPath = path.join(dir, dirent.name);
        // Ensure path is relative to root and normalized
        const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');

        // Skip files in PasteMax app directories
        if (fullPath.includes('.app') || fullPath === app.getAppPath()) {
          console.log('Skipping app file:', fullPath);
          return null;
        }

        // Only check ignore patterns if the path is inside the root directory
        if (relativePath.startsWith('..')) {
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
              path: relativePath,
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
              path: relativePath,
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
            path: relativePath,
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
            path: relativePath,
            tokenCount: 0,
            size: 0,
            isBinary: false,
            isSkipped: true,
            error: "Could not read file"
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
  // Prevent processing if already loading
  if (isLoadingDirectory) {
    console.log("Already processing a directory, cancelling previous operation");
    cancelDirectoryLoading(BrowserWindow.fromWebContents(event.sender));
    // Wait a bit before starting new operation
    await new Promise(resolve => setTimeout(resolve, 100));
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
      path: file.path,
      relativePath: path.relative(folderPath, file.path),
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
    isLoadingDirectory = false;
  
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
  
    event.sender.send("file-processing-status", {
      status: "error",
      message: `Error: ${err.message}`,
    });
  }
});

// Add handler for cancel-directory-loading event
ipcMain.on("cancel-directory-loading", (event) => {
  cancelDirectoryLoading(BrowserWindow.fromWebContents(event.sender));
});

/**
 * Determines if a file should be excluded based on gitignore patterns and default rules.
 * Normalizes paths for consistent cross-platform behavior.
 * 
 * @param {string} filePath - The full path of the file to check
 * @param {string} rootDir - The root directory for relative path calculation
 * @returns {boolean} True if the file should be excluded
 */
function shouldExcludeByDefault(filePath, rootDir) {
  const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
  
  // Don't process paths outside the root directory
  if (relativePath.startsWith('..')) {
    return true;
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
  isLoadingDirectory = false;
  
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }
  
  // Send cancellation message immediately
  window.webContents.send("file-processing-status", {
    status: "cancelled",
    message: "Directory loading cancelled",
  });
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
    cancelDirectoryLoading(window);
  }, MAX_DIRECTORY_LOAD_TIME);
}
