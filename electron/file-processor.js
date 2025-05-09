// ======================
//  INITIALIZATION
// ======================

// Imports
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: PQueue } = require('p-queue');

// Electron modules imports
const watcher = require('./watcher.js');
const { binaryExtensions } = require('./excluded-files');
const {
  normalizePath,
  ensureAbsolutePath,
  safeRelativePath,
  safePathJoin,
  isValidPath,
} = require('./utils');

const {
  defaultIgnoreFilter, // Pre-compiled default ignore filter
  shouldIgnorePath, // Utils
  shouldExcludeByDefault, // Utils
  createContextualIgnoreFilter, // Utils
} = require('./ignore-manager');

// Configuration constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file size
const CONCURRENT_DIRS = os.cpus().length * 2; // Increase based on CPU count for better parallelism

// Cache for file metadata
const fileCache = new Map(); // Cache for file metadata keyed by normalized file path
const fileTypeCache = new Map(); // Cache for binary file type detection results

// ======================
// GLOBAL STATE
// ======================
let isLoadingDirectory = false;
let lastStatusUpdateTime = 0; // Throttling for status updates
const STATUS_UPDATE_INTERVAL = 200; // ms

// ======================
// MODULE INITIALIZATION
// ======================
let tiktoken;
try {
  tiktoken = require('tiktoken');
  console.log('Successfully loaded tiktoken module');
} catch (err) {
  console.error('Failed to load tiktoken module:', err);
  tiktoken = null;
}

let encoder;
try {
  if (tiktoken) {
    encoder = tiktoken.get_encoding('o200k_base'); // gpt-4o encoding
    console.log('Tiktoken encoder initialized successfully');
  } else {
    throw new Error('Tiktoken module not available');
  }
} catch (err) {
  console.error('Failed to initialize tiktoken encoder:', err);
  console.log('Using fallback token counter');
  encoder = null;
}

// ======================
// FILE PROCESSING
// ======================

/**
 * The function `countTokens` calculates the number of tokens in a given text, handling special cases
 * and errors.
 * it, and returns the estimated token count based on text length.
 */
function countTokens(text) {
  if (!encoder) {
    return Math.ceil(text.length / 4);
  }

  try {
    const cleanText = text.replace(/<\|endoftext\|>/g, '');
    const tokens = encoder.encode(cleanText);
    return tokens.length;
  } catch (err) {
    console.error('Error counting tokens:', err);
    return Math.ceil(text.length / 4);
  }
}

// To process whether a file is binary or not.
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (fileTypeCache.has(ext)) {
    return fileTypeCache.get(ext);
  }

  const isBinary = binaryExtensions.includes(ext);
  fileTypeCache.set(ext, isBinary);
  return isBinary;
}

/**
 * The function `processSingleFile` processes a single file by checking its validity, size, content,
 * and type, and returns relevant file data or an error message.
 * @param fullPath - The `fullPath` parameter represents the full path of the file that you want to
 * process. It should be a string containing the complete path to the file on the file system.
 * @param rootDir - The `rootDir` parameter in the `processSingleFile` function represents the root
 * directory path from which the `fullPath` parameter is relative to. It is used to calculate the
 * relative path of the file being processed.
 * @param ignoreFilter - The `ignoreFilter` parameter is used to determine if a file should be ignored
 * based on certain criteria. It likely contains a function `ignores()` that checks if a given file
 * path should be ignored according to predefined rules or filters. If the function returns true for a
 * specific file path, that file
 * @param {string} ignoreMode - The current ignore mode ('automatic' or 'global'). This influences checks like `shouldExcludeByDefault`.
 * @returns The `processSingleFile` function returns a Promise that resolves to an object representing
 * data about a single file. The object contains properties such as name, path, relativePath, size,
 * isBinary, isSkipped, content, tokenCount, excludedByDefault, and error (if any). The function
 * handles processing of a file, checking for validity, ignoring based on filter, reading file stats,
 */
async function processSingleFile(fullPath, rootDir, ignoreFilter, ignoreMode) {
  try {
    fullPath = ensureAbsolutePath(fullPath);
    rootDir = ensureAbsolutePath(rootDir);
    const relativePath = safeRelativePath(rootDir, fullPath);

    if (!isValidPath(relativePath) || relativePath.startsWith('..')) {
      return null;
    }

    if (ignoreFilter.ignores(relativePath)) {
      return null;
    }

    const stats = await fs.promises.stat(fullPath);
    const fileData = {
      name: path.basename(fullPath),
      path: normalizePath(fullPath),
      relativePath: relativePath,
      size: stats.size,
      isBinary: false,
      isSkipped: false,
      content: '',
      tokenCount: 0,
      // Determine if the file should be marked as 'excluded by default'.
      // This check is mode-dependent (e.g., GlobalModeExclusion applies only in 'global' mode via shouldExcludeByDefault).
      excludedByDefault: shouldExcludeByDefault(fullPath, rootDir, ignoreMode),
    };

    if (stats.size > MAX_FILE_SIZE) {
      fileData.isSkipped = true;
      fileData.error = 'File too large to process';
      return fileData;
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (binaryExtensions.includes(ext)) {
      fileData.isBinary = true;
      fileData.fileType = ext.toUpperCase();
      return fileData;
    }

    const content = await fs.promises.readFile(fullPath, 'utf8');
    fileData.content = content;
    fileData.tokenCount = countTokens(content);

    return fileData;
  } catch (err) {
    console.error(`Error processing single file ${fullPath}:`, err);
    return {
      name: path.basename(fullPath),
      path: normalizePath(fullPath),
      relativePath: safeRelativePath(rootDir, fullPath),
      size: 0,
      isBinary: false,
      isSkipped: true,
      error: `Error: ${err.message}`,
      content: '',
      tokenCount: 0,
      excludedByDefault: shouldExcludeByDefault(fullPath, rootDir, ignoreMode),
    };
  }
}

/**
 * The function `processDirectory` processes a directory by scanning its contents recursively while
 * applying ignore filters and updating progress.
 * @returns The function `processDirectory` returns an object with two properties: `results` and
 * `progress`. The `results` property contains an array of results, while the `progress` property
 * contains an object with information about the progress of the directory processing.
 */
async function processDirectory({
  dirent,
  dir,
  rootDir,
  ignoreFilter,
  window,
  progress,
  currentDir = dir,
  ignoreMode = 'automatic',
  fileQueue = null,
}) {
  await watcher.shutdownWatcher();
  const fullPath = safePathJoin(dir, dirent.name);
  const relativePath = safeRelativePath(rootDir, fullPath);

  // Early check against default ignore patterns
  if (defaultIgnoreFilter.ignores(relativePath)) {
    console.log('Skipped by default ignore patterns:', relativePath);
    return { results: [], progress };
  }

  if (
    fullPath.includes('.app') ||
    fullPath === app.getAppPath() ||
    !isValidPath(relativePath) ||
    relativePath.startsWith('..')
  ) {
    console.log('Skipping directory:', fullPath);
    return { results: [], progress };
  }

  // Determine the appropriate ignore filter based on the ignoreMode
  let filterToUse;
  if (ignoreMode === 'global') {
    // GLOBAL MODE: Use the pre-configured global ignore filter directly.
    // This filter includes DEFAULT_PATTERNS, GlobalModeExclusion, and custom global ignores,
    // all combined by createGlobalIgnoreFilter in main.js.
    filterToUse = ignoreFilter;
  } else { // 'automatic' mode
    // AUTOMATIC MODE: Create a contextual filter for the current directory.
    // This combines the parent directory's filter (which includes DEFAULT_PATTERNS and any relevant .gitignore from higher up)
    // with .gitignore rules from the currentDir.
    filterToUse = createContextualIgnoreFilter(rootDir, currentDir, ignoreFilter, ignoreMode);
  }

  if (!shouldIgnorePath(fullPath, rootDir, currentDir, filterToUse, ignoreMode)) {
    progress.directories++;
    // Pass ignoreMode to processSingleFile when setting up watcher
    const processSingleFileCallback = (filePathCb, rootDirCb, ignoreFilterCb) =>
      processSingleFile(filePathCb, rootDirCb, ignoreFilterCb, ignoreMode);

    await watcher.initializeWatcher(
      dir,
      window,
      ignoreFilter,
      defaultIgnoreFilter,
      processSingleFileCallback
    );
    window.webContents.send('file-processing-status', {
      status: 'processing',
      message: `Scanning directories (${progress.directories} processed)... (Press ESC to cancel)`,
    });
    return readFilesRecursively(
      fullPath,
      rootDir,
      filterToUse,
      window,
      progress,
      fullPath,
      ignoreMode,
      fileQueue
    );
  }
  return { results: [], progress };
}

/**
 * The function `readFilesRecursively` reads files and directories recursively, processing files with
 * controlled concurrency and handling errors without stopping.
 * @param dir - The `dir` parameter in the `readFilesRecursively` function represents the directory
 * path from which to start reading files recursively.
 * @param rootDir - The `rootDir` parameter in the `readFilesRecursively` function represents the root
 * directory from which the recursive file reading operation starts. It is the top-level directory
 * within which the function will begin reading files and directories recursively.
 * @param ignoreFilter - The `ignoreFilter` parameter in the `readFilesRecursively` function is used to
 * specify a filter function that determines which files or directories to ignore during the recursive
 * file reading process. This filter function helps in excluding specific files or directories based on
 * certain criteria defined by the user. It is a crucial
 * @param window - The `window` parameter in the `readFilesRecursively` function is used to pass a
 * reference to the window object. This can be helpful when you need to communicate with the window,
 * for example, sending status updates or errors to the window during file processing.
 * @param [progress] - The `progress` parameter in the `readFilesRecursively` function is an object
 * that tracks the progress of the file reading operation. It has two properties:
 * @param [currentDir] - The `currentDir` parameter in the `readFilesRecursively` function represents
 * the current directory being processed during the recursive file reading operation. It is used to
 * keep track of the current directory within the recursive function calls. This parameter helps in
 * maintaining the context of the directory structure being traversed and processed
 * @param [ignoreMode=automatic] - The `ignoreMode` parameter in the `readFilesRecursively` function
 * determines how file paths are ignored during the recursive file reading process. It can have two
 * possible values:
 * @param [fileQueue=null] - The `fileQueue` parameter in the `readFilesRecursively` function is used
 * to manage the concurrency of file processing operations. It is an optional parameter that allows you
 * to pass a custom queue for processing files. If a `fileQueue` is not provided, a new queue will be
 * initialized with
 * @returns The function `readFilesRecursively` returns an object with two properties: `results` and
 * `progress`. The `results` property contains an array of file processing results, while the
 * `progress` property contains information about the progress of the file processing operation,
 * including the number of directories and files processed.
 */
async function readFilesRecursively(
  dir,
  rootDir,
  ignoreFilter,
  window,
  progress = { directories: 0, files: 0 },
  currentDir = dir,
  ignoreMode = 'automatic',
  fileQueue = null
) {
  // This function orchestrates recursive directory reading.
  // It receives the 'ignoreMode' and the appropriate 'ignoreFilter'
  // (which is pre-determined by the caller for the initial call, or by a recursive call from processDirectory for sub-directories)
  // and passes them down for consistent ignore rule application.

  await watcher.shutdownWatcher();
  if (!ignoreFilter) {
    throw new Error('readFilesRecursively requires an ignoreFilter parameter');
  }
  if (!isLoadingDirectory) return { results: [], progress };

  dir = ensureAbsolutePath(dir);
  rootDir = ensureAbsolutePath(rootDir || dir);

  // Initialize queue only once at the top level call
  let shouldCleanupQueue = false;
  let queueToUse = fileQueue;
  if (!queueToUse) {
    // Determine concurrency based on CPU cores, with a reasonable minimum and maximum
    const cpuCount = os.cpus().length;
    const fileQueueConcurrency = Math.max(2, Math.min(cpuCount, 8)); // e.g., Use between 2 and 8 concurrent file operations
    queueToUse = new PQueue({ concurrency: fileQueueConcurrency });
    shouldCleanupQueue = true;

    // Only log the initialization message for the root directory to reduce spam
    if (dir === rootDir) {
      console.log(`Initializing file processing queue with concurrency: ${fileQueueConcurrency}`);
    }
  }

  let results = [];
  let fileProcessingErrors = []; // To collect errors without stopping

  try {
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    if (!isLoadingDirectory) return { results: [], progress };

    const directories = dirents.filter((dirent) => dirent.isDirectory());
    const files = dirents.filter((dirent) => dirent.isFile());

    for (let i = 0; i < directories.length; i += CONCURRENT_DIRS) {
      if (!isLoadingDirectory) return { results: [], progress };

      const batch = directories.slice(i, Math.min(i + CONCURRENT_DIRS, directories.length));

      const batchPromises = batch.map((dirent) =>
        processDirectory({
          dirent,
          dir,
          rootDir,
          ignoreFilter,
          window,
          progress,
          currentDir,
          ignoreMode,
          fileQueue,
        })
      );

      const batchResults = await Promise.all(batchPromises);

      const combinedResults = batchResults.reduce(
        (acc, curr) => {
          acc.results = acc.results.concat(curr.results);
          return acc;
        },
        { results: [], progress }
      );

      results = results.concat(combinedResults.results);
      if (!isLoadingDirectory) return { results: [], progress };
    }

    // Process files using the controlled concurrency queue
    for (const dirent of files) {
      if (!isLoadingDirectory) break; // Check cancellation before adding to queue

      queueToUse.add(async () => {
        if (!isLoadingDirectory) return; // Check cancellation again inside the task

        const fullPath = safePathJoin(dir, dirent.name);
        const relativePath = safeRelativePath(rootDir, fullPath);
        const fullPathNormalized = normalizePath(fullPath);

        try {
          // Wrap file processing in try/catch to handle errors within the queue task
          if (!isValidPath(relativePath) || relativePath.startsWith('..')) {
            console.log('Invalid path, skipping:', fullPath);
            return;
          }

          if (fullPath.includes('.app') || fullPath === app.getAppPath()) {
            console.log('System path, skipping:', fullPath);
            return;
          }

          // Early check against default ignore patterns
          if (defaultIgnoreFilter.ignores(relativePath)) {
            console.log('Skipped by default ignore patterns:', relativePath);
            return;
          }

          if (shouldIgnorePath(fullPath, rootDir, currentDir, ignoreFilter, ignoreMode)) {
            // console.log('Ignored by filter, skipping:', relativePath); // Can be noisy
            return;
          }

          if (fileCache.has(fullPathNormalized)) {
            // console.log('Using cached file data for:', fullPathNormalized); // Can be noisy
            results.push(fileCache.get(fullPathNormalized));
            progress.files++;
            return;
          }

          if (isBinaryFile(fullPath)) {
            // console.log('Binary file by extension, skipping content read:', fullPath); // Can be noisy
            const fileData = {
              name: dirent.name,
              path: fullPathNormalized,
              relativePath: relativePath,
              tokenCount: 0,
              size: 0,
              content: '',
              isBinary: true,
              isSkipped: false,
              fileType: path.extname(fullPath).substring(1).toUpperCase(),
            };

            try {
              const stats = await fs.promises.stat(fullPath);
              if (!isLoadingDirectory) return;
              fileData.size = stats.size;
            } catch (statErr) {
              console.log('Could not get size for binary file:', fullPath, statErr.code);
              // Still add the file entry, just with size 0
            }

            fileCache.set(fullPathNormalized, fileData);
            results.push(fileData);
            progress.files++;
            return;
          }

          // Process non-binary files
          const stats = await fs.promises.stat(fullPath);
          if (!isLoadingDirectory) return;

          if (stats.size > MAX_FILE_SIZE) {
            const fileData = {
              name: dirent.name,
              path: fullPathNormalized,
              relativePath: relativePath,
              tokenCount: 0,
              size: stats.size,
              content: '',
              isBinary: false,
              isSkipped: true,
              error: 'File too large to process',
            };
            fileCache.set(fullPathNormalized, fileData);
            results.push(fileData);
            progress.files++;
            return;
          }

          const fileContent = await fs.promises.readFile(fullPath, 'utf8');
          if (!isLoadingDirectory) return;

          const fileData = {
            name: dirent.name,
            path: fullPathNormalized,
            relativePath: relativePath,
            content: fileContent, // Still loading full content for token counting
            tokenCount: countTokens(fileContent),
            size: stats.size,
            isBinary: false,
            isSkipped: false,
          };
          fileCache.set(fullPathNormalized, fileData);
          results.push(fileData);
          progress.files++;
        } catch (err) {
          console.error(`Error processing file ${fullPath}:`, err.code || err.message);
          const errorData = {
            name: dirent.name,
            path: fullPathNormalized,
            relativePath: relativePath,
            tokenCount: 0,
            size: 0, // Attempt to get size if possible, otherwise 0
            isBinary: false,
            isSkipped: true,
            error:
              err.code === 'EPERM'
                ? 'Permission denied'
                : err.code === 'ENOENT'
                  ? 'File not found'
                  : err.code === 'EBUSY'
                    ? 'File busy'
                    : err.code === 'EMFILE'
                      ? 'Too many open files'
                      : 'Could not read file',
          };
          // Try to get stats even if read failed
          try {
            const errorStats = await fs.promises.stat(fullPath);
            errorData.size = errorStats.size;
          } catch (statErr) {
            /* ignore */
          }

          fileCache.set(fullPathNormalized, errorData);
          results.push(errorData); // Add error entry to results
          progress.files++; // Count errors as processed files for progress
          fileProcessingErrors.push({ path: fullPathNormalized, error: err.message });
        }

        // Throttle status updates (moved outside finally)
        const now = Date.now();
        if (now - lastStatusUpdateTime > STATUS_UPDATE_INTERVAL) {
          if (!isLoadingDirectory) return; // Check cancellation before sending IPC
          window.webContents.send('file-processing-status', {
            status: 'processing',
            message: `Processing files (${progress.directories} dirs, ${progress.files} files)... (Press ESC to cancel)`,
          });
          lastStatusUpdateTime = now;
          if (progress.files % 500 === 0) {
            // Log less frequently
            console.log(
              `Progress update - Dirs: ${progress.directories}, Files: ${progress.files}, Queue Size: ${queueToUse.size}, Pending: ${queueToUse.pending}`
            );
          }
        }
      });
    }

    // Wait for all queued file processing tasks to complete
    await queueToUse.onIdle();

    if (fileProcessingErrors.length > 0) {
      console.warn(`Encountered ${fileProcessingErrors.length} errors during file processing.`);
      // Optionally send a summary of errors to the renderer
      // window.webContents.send("file-processing-errors", fileProcessingErrors);
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      console.log(`Skipping inaccessible directory: ${dir}`);
      return { results: [], progress };
    }
  }

  // Cleanup queue if it was initialized in this call
  if (shouldCleanupQueue) {
    await queueToUse.onIdle();
    queueToUse.clear();
  }

  return { results, progress };
}

function clearFileCaches() {
  fileCache.clear();
  fileTypeCache.clear();
  console.log('Cleared all file caches');
}

// ======================
// STATE MANAGEMENT FUNCTIONS
// ======================
function startFileProcessing() {
  isLoadingDirectory = true;
  console.log('[FileProcessor] Started file processing state.');
}

function stopFileProcessing() {
  isLoadingDirectory = false;
  console.log('[FileProcessor] Stopped file processing state.');
}

// Exports for file processing functions
module.exports = {
  processSingleFile,
  processDirectory,
  readFilesRecursively,
  isBinaryFile,
  countTokens,
  clearFileCaches,
  startFileProcessing,
  stopFileProcessing,
};
