const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Load ignore module with fallback
let ignore;
try {
  ignore = require("ignore");
  console.log("Successfully loaded ignore module");
} catch (err) {
  console.error("Failed to load ignore module:", err);
  ignore = {
    createFilter: () => (filePath) => !excludedFiles.includes(filePath),
  };
  console.log("Using fallback for ignore module");
}

function normalizePath(filePath) {
  if (!filePath) return filePath;
  return filePath.replace(/\\/g, "/");
}

function getPathSeparator() {
  return os.platform() === "win32" ? "\\" : "/";
}

let tiktoken;
try {
  tiktoken = require("tiktoken");
  console.log("Successfully loaded tiktoken module");
} catch (err) {
  console.error("Failed to load tiktoken module:", err);
  tiktoken = null;
}

const { excludedFiles, binaryExtensions } = require("./excluded-files");

let encoder;
try {
  if (tiktoken) {
    encoder = tiktoken.get_encoding("o200k_base");
    console.log("Tiktoken encoder initialized successfully");
  } else {
    throw new Error("Tiktoken module not available");
  }
} catch (err) {
  console.error("Failed to initialize tiktoken encoder:", err);
  console.log("Using fallback token counter");
  encoder = null;
}

const BINARY_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".ico",
  ".webp",
  ".svg",
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".avi",
  ".mov",
  ".mkv",
  ".flac",
  ".zip",
  ".rar",
  ".tar",
  ".gz",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".exe",
  ".dll",
  ".so",
  ".class",
  ".o",
  ".pyc",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".bin",
  ".dat",
].concat(binaryExtensions || []);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const isDev =
    process.env.NODE_ENV === "development" || process.env.ELECTRON_START_URL;
  if (isDev) {
    const startUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";
    console.log(`Loading from dev server: ${startUrl}`);

    setTimeout(() => {
      mainWindow.webContents.session.clearCache().then(() => {
        mainWindow.loadURL(startUrl);
        mainWindow.webContents.openDevTools({ mode: "detach" });
      });
    }, 1000);
  } else {
    // Use __dirname for production; ensure the 'dist' folder is packaged with your app.
    const indexPath = path.join(__dirname, "dist", "index.html");
    console.log(`Loading from built files at: ${indexPath}`);
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error("Error loading production build:", err);
    });
  }

  mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `Failed to load: ${validatedURL} - ${errorDescription} (${errorCode})`
      );

      if (isDev) {
        const retryUrl =
          process.env.ELECTRON_START_URL || "http://localhost:3000";
        console.log(`Retrying dev server: ${retryUrl}`);
        await mainWindow.webContents.session.clearCache();
        setTimeout(() => mainWindow.loadURL(retryUrl), 1000);
      } else {
        const indexPath = path.join(__dirname, "dist", "index.html");
        console.log(`Retrying production build: ${indexPath}`);
        await mainWindow.webContents.session.clearCache();
        mainWindow.loadFile(indexPath);
      }
    }
  );
}

module.exports = { createWindow };

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
    // Very rough estimate: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  try {
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (err) {
    console.error("Error counting tokens:", err);
    // Fallback to character-based estimation on error
    return Math.ceil(text.length / 4);
  }
}

// Function to recursively read files from a directory
function readFilesRecursively(dir, rootDir, ignoreFilter) {
  rootDir = rootDir || dir;
  ignoreFilter = ignoreFilter || loadGitignore(rootDir);

  let results = [];

  try {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });

    // Process directories first, then files
    const directories = [];
    const files = [];

    dirents.forEach((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      const relativePath = path.relative(rootDir, fullPath);

      // Skip if the path is ignored
      if (ignoreFilter.ignores(relativePath)) {
        return;
      }

      if (dirent.isDirectory()) {
        directories.push(dirent);
      } else if (dirent.isFile()) {
        files.push(dirent);
      }
    });

    // Process directories first
    directories.forEach((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      // Recursively read subdirectory
      results = results.concat(
        readFilesRecursively(fullPath, rootDir, ignoreFilter)
      );
    });

    // Then process files
    files.forEach((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      try {
        // Get file stats for size
        const stats = fs.statSync(fullPath);
        const fileSize = stats.size;

        // Skip files that are too large
        if (fileSize > MAX_FILE_SIZE) {
          results.push({
            name: dirent.name,
            path: fullPath,
            tokenCount: 0,
            size: fileSize,
            content: "",
            isBinary: false,
            isSkipped: true,
            error: "File too large to process",
          });
          return;
        }

        // Check if the file is binary
        const isBinary = isBinaryFile(fullPath);

        if (isBinary) {
          // Skip token counting for binary files
          results.push({
            name: dirent.name,
            path: fullPath,
            tokenCount: 0,
            size: fileSize,
            content: "",
            isBinary: true,
            isSkipped: false,
            fileType: path.extname(fullPath).substring(1).toUpperCase(),
          });
        } else {
          // Read file content
          const fileContent = fs.readFileSync(fullPath, "utf8");

          // Calculate token count
          const tokenCount = countTokens(fileContent);

          // Add file info with content and token count
          results.push({
            name: dirent.name,
            path: fullPath,
            content: fileContent,
            tokenCount: tokenCount,
            size: fileSize,
            isBinary: false,
            isSkipped: false,
          });
        }
      } catch (err) {
        console.error(`Error reading file ${fullPath}:`, err);
        results.push({
          name: dirent.name,
          path: fullPath,
          tokenCount: 0,
          size: 0,
          isBinary: false,
          isSkipped: true,
          error: "Could not read file",
        });
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }

  return results;
}

// Handle file list request
ipcMain.on("request-file-list", (event, folderPath) => {
  try {
    console.log("Processing file list for folder:", folderPath);
    console.log("OS platform:", os.platform());
    console.log("Path separator:", getPathSeparator());

    // Send initial progress update
    event.sender.send("file-processing-status", {
      status: "processing",
      message: "Scanning directory structure...",
    });

    // Process files in chunks to avoid blocking the UI
    const processFiles = () => {
      const files = readFilesRecursively(folderPath, folderPath);
      console.log(`Found ${files.length} files in ${folderPath}`);

      // Update with processing complete status
      event.sender.send("file-processing-status", {
        status: "complete",
        message: `Found ${files.length} files`,
      });

      // Process the files to ensure they're serializable
      const serializableFiles = files.map((file) => {
        // Normalize the path to use forward slashes consistently
        const normalizedPath = normalizePath(file.path);

        // Create a clean file object
        return {
          name: file.name ? String(file.name) : "",
          path: normalizedPath, // Use normalized path
          tokenCount: typeof file.tokenCount === "number" ? file.tokenCount : 0,
          size: typeof file.size === "number" ? file.size : 0,
          content: file.isBinary
            ? ""
            : typeof file.content === "string"
            ? file.content
            : "",
          isBinary: Boolean(file.isBinary),
          isSkipped: Boolean(file.isSkipped),
          error: file.error ? String(file.error) : null,
          fileType: file.fileType ? String(file.fileType) : null,
          excludedByDefault: shouldExcludeByDefault(
            normalizedPath,
            normalizePath(folderPath)
          ), // Also normalize here
        };
      });

      try {
        console.log(`Sending ${serializableFiles.length} files to renderer`);
        // Log a sample of paths to check normalization
        if (serializableFiles.length > 0) {
          console.log("Sample file paths (first 3):");
          serializableFiles.slice(0, 3).forEach((file) => {
            console.log(`- ${file.path}`);
          });
        }

        event.sender.send("file-list-data", serializableFiles);
      } catch (sendErr) {
        console.error("Error sending file data:", sendErr);

        // If sending fails, try again with minimal data
        const minimalFiles = serializableFiles.map((file) => ({
          name: file.name,
          path: file.path,
          tokenCount: file.tokenCount,
          size: file.size,
          isBinary: file.isBinary,
          isSkipped: file.isSkipped,
          excludedByDefault: file.excludedByDefault,
        }));

        event.sender.send("file-list-data", minimalFiles);
      }
    };

    // Use setTimeout to allow UI to update before processing starts
    setTimeout(processFiles, 100);
  } catch (err) {
    console.error("Error processing file list:", err);
    event.sender.send("file-processing-status", {
      status: "error",
      message: `Error: ${err.message}`,
    });
  }
});

// Check if a file should be excluded by default, using glob matching
function shouldExcludeByDefault(filePath, rootDir) {
  const relativePath = path.relative(rootDir, filePath);
  const relativePathNormalized = relativePath.replace(/\\/g, "/"); // Normalize for consistent pattern matching

  // Use the ignore package to do glob pattern matching
  const ig = ignore().add(excludedFiles);
  return ig.ignores(relativePathNormalized);
}

// Add a debug handler for file selection
ipcMain.on("debug-file-selection", (event, data) => {
  console.log("DEBUG - File Selection:", data);
});
