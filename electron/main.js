// ======================
// IMPORTS AND CONSTANTS
// ======================
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: PQueue } = require('p-queue'); // Added for controlled concurrency
const watcher = require('./watcher.js'); // New watcher module
const { excludedFiles, binaryExtensions } = require('./excluded-files'); // Import the excluded files list

// Configuration constants
const MAX_DIRECTORY_LOAD_TIME = 300000; // 5 minutes timeout for large repositories
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file size
const CONCURRENT_DIRS = os.cpus().length * 2; // Increase based on CPU count for better parallelism
// const CHUNK_SIZE = 30; // Number of files to process in one chunk (no longer used, might bring back)

// Default ignore patterns that should always be applied
const DEFAULT_PATTERNS = [
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'bin',
  'Debug',
  'Release',
  'x64',
  'x86',
  '.output',
  '*.min.js',
  '*.min.css',
  '*.bundle.js',
  '*.compiled.*',
  '*.generated.*',
  '.cache',
  '.parcel-cache',
  '.webpack',
  '.turbo',
  '.idea',
  '.vscode',
  '.vs',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.asar',
  'release-builds',
];

// ======================
// GLOBAL STATE
// ======================
/** runtime ignore-mode */
/** @type {'automatic' | 'global'} */
let currentIgnoreMode = 'automatic';
let isLoadingDirectory = false;
let loadingTimeoutId = null;

/**
 * @typedef {Object} DirectoryLoadingProgress
 * @property {number} directories - Number of directories processed
 * @property {number} files - Number of files processed
 */
let currentProgress = { directories: 0, files: 0 };

// Throttling for status updates
let lastStatusUpdateTime = 0;
const STATUS_UPDATE_INTERVAL = 200; // ms

// Global caches
const ignoreCache = new Map(); // Cache for ignore filters keyed by normalized root directory
const fileCache = new Map(); // Cache for file metadata keyed by normalized file path
const fileTypeCache = new Map(); // Cache for binary file type detection results
const gitIgnoreFound = new Map(); // Cache for already found/processed gitignore files
let defaultExcludeFilter = null; // Cache for default exclude ignore filter

// ======================
// PATH UTILITIES
// ======================
const {
  normalizePath,
  ensureAbsolutePath,
  safePathJoin,
  safeRelativePath,
  isValidPath
} = require('./utils.js');

// ======================
// MODULE INITIALIZATION
// ======================
let ignore;
try {
  ignore = require('ignore');
  console.log('Successfully loaded ignore module');
} catch (err) {
  console.error('Failed to load ignore module:', err);
  // Simple fallback implementation
  ignore = {
    createFilter: () => (path) => !excludedFiles.includes(path),
  };
  console.log('Using fallback for ignore module');
}

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

function shouldExcludeByDefault(filePath, rootDir) {
  filePath = ensureAbsolutePath(filePath);
  rootDir = ensureAbsolutePath(rootDir);

  const relativePath = safeRelativePath(rootDir, filePath);

  if (!isValidPath(relativePath) || relativePath.startsWith('..')) {
    return true;
  }

  if (process.platform === 'win32') {
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(path.basename(filePath))) {
      console.log(`Excluding reserved Windows name: ${path.basename(filePath)}`);
      return true;
    }

    if (
      filePath.toLowerCase().includes('\\windows\\') ||
      filePath.toLowerCase().includes('\\system32\\')
    ) {
      console.log(`Excluding system path: ${filePath}`);
      return true;
    }
  }

  if (process.platform === 'darwin') {
    if (
      filePath.includes('/.Spotlight-') ||
      filePath.includes('/.Trashes') ||
      filePath.includes('/.fseventsd')
    ) {
      console.log(`Excluding macOS system path: ${filePath}`);
      return true;
    }
  }

  if (process.platform === 'linux') {
    if (
      filePath.startsWith('/proc/') ||
      filePath.startsWith('/sys/') ||
      filePath.startsWith('/dev/')
    ) {
      console.log(`Excluding Linux system path: ${filePath}`);
      return true;
    }
  }

  // Create the filter only once and reuse it
  if (!defaultExcludeFilter) {
    defaultExcludeFilter = ignore().add(excludedFiles);
    console.log(`[Default Exclude] Initialized filter with ${excludedFiles.length} excluded files`);
  }

  const isExcluded = defaultExcludeFilter.ignores(relativePath);

  // Only log exclusions periodically to reduce spam
  if (isExcluded && Math.random() < 0.05) {
    // Log ~5% of exclusions as samples
    console.log(`[Default Exclude] Excluded file: ${relativePath}`);
  }

  return isExcluded;
}

// ======================
// IGNORE CACHE LOGIC
// ======================
async function collectGitignoreMapRecursive(startDir, rootDir, currentMap = new Map()) {
  const normalizedStartDir = normalizePath(startDir);
  const normalizedRootDir = normalizePath(rootDir);

  try {
    await fs.promises.access(normalizedStartDir, fs.constants.R_OK);
  } catch (err) {
    console.warn(`Cannot access directory: ${normalizedStartDir}`, err);
    return currentMap;
  }

  // Read .gitignore in current directory
  const gitignorePath = safePathJoin(normalizedStartDir, '.gitignore');
  try {
    const content = await fs.promises.readFile(gitignorePath, 'utf8');
    const patterns = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    if (patterns.length > 0) {
      const relativeDirPath = safeRelativePath(normalizedRootDir, normalizedStartDir) || '.';
      currentMap.set(relativeDirPath, patterns);
      console.log(`Found .gitignore in ${relativeDirPath} with ${patterns.length} patterns`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error reading ${gitignorePath}:`, err);
    }
  }

  // Recursively scan subdirectories in parallel
  try {
    const dirents = await fs.promises.readdir(normalizedStartDir, { withFileTypes: true });
    const subdirs = dirents.filter((dirent) => dirent.isDirectory());

    // Process subdirectories in parallel
    await Promise.all(
      subdirs.map(async (dirent) => {
        const subDir = safePathJoin(normalizedStartDir, dirent.name);
        await collectGitignoreMapRecursive(subDir, normalizedRootDir, currentMap);
      })
    );
  } catch (err) {
    console.error(`Error reading directory ${normalizedStartDir} for recursion:`, err);
  }

  return currentMap;
}

// Pre-compiled default ignore filter for early checks
const defaultIgnoreFilter = ignore().add(DEFAULT_PATTERNS);

function shouldIgnorePath(filePath, rootDir, currentDir, ignoreFilter, ignoreMode = 'automatic') {
  // Validate paths to prevent empty path errors
  if (!filePath || filePath.trim() === '') {
    console.warn('Ignoring empty path in shouldIgnorePath');
    return true; // Treat empty paths as "should ignore"
  }

  const relativeToRoot = safeRelativePath(rootDir, filePath);
  const relativeToCurrent = safeRelativePath(currentDir, filePath);

  // Validate that the relative paths are not empty
  if (!relativeToRoot || relativeToRoot.trim() === '') {
    console.warn(`Skipping empty relativeToRoot path for: ${filePath}`);
    return true;
  }

  // First check against default patterns (fast path)
  if (defaultIgnoreFilter.ignores(relativeToRoot)) {
    console.log('Skipped by default ignore patterns:', relativeToRoot);
    return true;
  }

  // Then check against root-relative patterns (global/default)
  if (ignoreFilter.ignores(relativeToRoot)) {
    return true;
  }

  // In global mode, we don't need contextual checks
  if (ignoreMode === 'global') {
    return false;
  }

  // Then check against current directory context (automatic mode only)
  const currentIgnoreFilter = createContextualIgnoreFilter(rootDir, currentDir, ignoreFilter);

  // Ensure relativeToCurrent is not empty before calling ignores
  if (!relativeToCurrent || relativeToCurrent.trim() === '') {
    console.warn(`Skipping empty relativeToCurrent path for: ${filePath}`);
    return false; // Don't ignore if we can't determine the relative path
  }

  return currentIgnoreFilter.ignores(relativeToCurrent);
}

function createGlobalIgnoreFilter(customIgnores = []) {
  const normalizedCustomIgnores = (customIgnores || []).map((p) => p.trim()).sort();
  const ig = ignore();
  const globalPatterns = [...DEFAULT_PATTERNS, ...excludedFiles, ...normalizedCustomIgnores].map(
    (pattern) => normalizePath(pattern)
  );
  ig.add(globalPatterns);
  console.log(
    `[Global Mode] Added ${DEFAULT_PATTERNS.length} default patterns, ${excludedFiles.length} excluded files, and ${normalizedCustomIgnores.length} custom ignores`
  );

  console.log(
    `[Global Mode] Added ${globalPatterns.length} global patterns (${excludedFiles.length} excluded + ${normalizedCustomIgnores.length} custom)`
  );
  console.log(`[Global Mode] Custom ignores added:`, normalizedCustomIgnores);

  return ig;
}

function createContextualIgnoreFilter(
  rootDir,
  currentDir,
  parentIgnoreFilter,
  ignoreMode = 'automatic'
) {
  const ig = ignore();

  // 1. Add all patterns from parent filter (global/default patterns)
  if (parentIgnoreFilter && parentIgnoreFilter.rules) {
    const parentRules = parentIgnoreFilter.rules;
    // Extract pattern strings from parent rules
    const parentPatterns = Object.values(parentRules).map((rule) => rule.pattern);
    // Filter out any undefined/empty patterns
    const validPatterns = parentPatterns.filter((p) => p && typeof p === 'string');
    ig.add(validPatterns);
  }

  // 2. Only add patterns from .gitignore if in automatic mode
  if (ignoreMode === 'automatic') {
    const gitignorePath = safePathJoin(currentDir, '.gitignore');

    // Create a cache key for this .gitignore file
    const cacheKey = normalizePath(gitignorePath);

    let patterns = [];
    let needToProcessFile = true;

    // Check if we've already processed this .gitignore file
    if (gitIgnoreFound.has(cacheKey)) {
      patterns = gitIgnoreFound.get(cacheKey);
      needToProcessFile = false;
    }

    if (needToProcessFile) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        patterns = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));

        // Cache the patterns for future use
        if (patterns.length > 0) {
          gitIgnoreFound.set(cacheKey, patterns);

          // Get a more concise path for display
          const relativePath = safeRelativePath(rootDir, currentDir);
          console.log(
            `[Contextual Filter] Added ${patterns.length} patterns from ${relativePath === '.' ? 'root' : relativePath} .gitignore`
          );
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Error reading ${gitignorePath}:`, err);
        }
      }
    }

    if (patterns.length > 0) {
      // Adjust patterns to be relative to current directory
      const adjustedPatterns = patterns.map((pattern) => {
        if (pattern.startsWith('/')) {
          return pattern.substring(1); // Make root-relative
        }
        if (!pattern.includes('**')) {
          // Make relative to current directory
          const relPath = safeRelativePath(rootDir, currentDir);
          return safePathJoin(relPath, pattern);
        }
        return pattern;
      });

      ig.add(adjustedPatterns);
    }
  }

  return ig;
}

async function loadGitignore(rootDir, window) {
  rootDir = ensureAbsolutePath(rootDir);
  const cacheKey = `${rootDir}:automatic`;

  if (ignoreCache.has(cacheKey)) {
    console.log(`Using cached ignore filter for automatic mode in:`, rootDir);
    const cached = ignoreCache.get(cacheKey);
    console.log('Cache entry details:', {
      patternCount: Object.keys(cached.patterns.gitignoreMap || {}).length,
    });
    return cached.ig;
  }
  console.log(`Cache miss for key: ${cacheKey}`);

  const ig = ignore();

  try {
    // Combine default patterns with excludedFiles
    const defaultPatterns = [...DEFAULT_PATTERNS, ...excludedFiles];

    ig.add(defaultPatterns);
    console.log(
      `[Automatic Mode] Added ${DEFAULT_PATTERNS.length} default patterns and ${excludedFiles.length} excluded files`
    );

    const gitignoreMap = await collectGitignoreMapRecursive(rootDir, rootDir);
    let totalGitignorePatterns = 0;

    // Store raw patterns with their origin directory
    const patternOrigins = new Map();
    for (const [relativeDirPath, patterns] of gitignoreMap) {
      patternOrigins.set(relativeDirPath, patterns);

      // Add patterns to root filter (for backward compatibility)
      const patternsToAdd = patterns.map((pattern) => {
        if (!pattern.startsWith('/') && !pattern.includes('**')) {
          const joinedPath = normalizePath(
            path.join(relativeDirPath === '.' ? '' : relativeDirPath, pattern)
          );
          return joinedPath.replace(/^\.\//, '');
        } else if (pattern.startsWith('/')) {
          return pattern.substring(1);
        }
        return pattern;
      });

      if (patternsToAdd.length > 0) {
        ig.add(patternsToAdd);
        totalGitignorePatterns += patternsToAdd.length;
        console.log(
          `[Automatic Mode] Added ${patternsToAdd.length} repository patterns from ${relativeDirPath}/.gitignore`
        );
      }
    }

    if (totalGitignorePatterns > 0) {
      console.log(
        `[Automatic Mode] Added ${totalGitignorePatterns} repository-specific patterns (combined with ${defaultPatterns.length} default patterns) for:`,
        rootDir
      );
    }

    ignoreCache.set(cacheKey, {
      ig,
      patterns: {
        gitignoreMap: Object.fromEntries(gitignoreMap),
        patternOrigins: Object.fromEntries(patternOrigins),
      },
    });


    return ig;
  } catch (err) {
    console.error(`Error in loadGitignore for ${rootDir}:`, err);
    return ig;
  }
}

// ======================
// FILE PROCESSING
// ======================
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (fileTypeCache.has(ext)) {
    return fileTypeCache.get(ext);
  }

  const isBinary = binaryExtensions.includes(ext);
  fileTypeCache.set(ext, isBinary);
  return isBinary;
}

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

// Process a single file for the file watcher
async function processSingleFile(fullPath, rootDir, ignoreFilter) {
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
      excludedByDefault: shouldExcludeByDefault(fullPath, rootDir),
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
      excludedByDefault: shouldExcludeByDefault(fullPath, rootDir),
    };
  }
}

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

  // In global mode, use the passed ignoreFilter directly
  const filterToUse =
    ignoreMode === 'global'
      ? ignoreFilter
      : createContextualIgnoreFilter(rootDir, currentDir, ignoreFilter, ignoreMode);

  if (!shouldIgnorePath(fullPath, rootDir, currentDir, filterToUse, ignoreMode)) {
    progress.directories++;
    await watcher.initializeWatcher(dir, window, ignoreFilter, defaultIgnoreFilter);
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

// ======================
// DIRECTORY LOADING MANAGEMENT
// ======================
function setupDirectoryLoadingTimeout(window, folderPath) {
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
  }

  loadingTimeoutId = setTimeout(() => {
    console.log(
      `Directory loading timed out after ${MAX_DIRECTORY_LOAD_TIME / 1000} seconds: ${folderPath}`
    );
    console.log(
      `Stats at timeout: Processed ${currentProgress.directories} directories and ${currentProgress.files} files`
    );
    cancelDirectoryLoading(window, 'timeout');
  }, MAX_DIRECTORY_LOAD_TIME);

  currentProgress = { directories: 0, files: 0 };
}

async function cancelDirectoryLoading(window, reason = 'user') {
  await watcher.shutdownWatcher();
  if (!isLoadingDirectory) return;

  console.log(`Cancelling directory loading process (Reason: ${reason})`);
  console.log(
    `Stats at cancellation: Processed ${currentProgress.directories} directories and ${currentProgress.files} files`
  );

  isLoadingDirectory = false;

  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }

  currentProgress = { directories: 0, files: 0 };

  if (window && window.webContents && !window.webContents.isDestroyed()) {
    const message =
      reason === 'timeout'
        ? 'Directory loading timed out after 5 minutes. Try clearing data and retrying.'
        : 'Directory loading cancelled';

    window.webContents.send('file-processing-status', {
      status: 'cancelled',
      message: message,
    });
  } else {
    console.log('Window not available to send cancellation status.');
  }
}

// ======================
// IPC HANDLERS
// ======================
ipcMain.on('clear-main-cache', () => {
  console.log('Clearing main process caches');
  ignoreCache.clear();
  fileCache.clear();
  fileTypeCache.clear();
  console.log('Main process caches cleared (including ignoreCache)');
});

ipcMain.on('clear-ignore-cache', () => {
  console.log('Clearing ignore cache due to ignore settings change');
  ignoreCache.clear();
  console.log('Ignore cache cleared');
});

ipcMain.on('open-folder', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    const rawPath = result.filePaths[0];
    const normalizedPath = normalizePath(rawPath);
    try {
      console.log('Sending folder-selected event with normalized path:', normalizedPath);
      event.sender.send('folder-selected', normalizedPath);
    } catch (err) {
      console.error('Error sending folder-selected event:', err);
      event.sender.send('folder-selected', normalizedPath);
    }
  }
});

if (!ipcMain.eventNames().includes('get-ignore-patterns')) {
  ipcMain.handle(
    'get-ignore-patterns',
    async (event, { folderPath, mode = 'automatic', customIgnores = [] } = {}) => {
      if (!folderPath) {
        console.log('get-ignore-patterns called without folderPath - returning default patterns');
        return {
          patterns: {
            global: [...DEFAULT_PATTERNS, ...excludedFiles, ...(customIgnores || [])],
          },
        };
      }

      try {
        let patterns;
        const normalizedPath = ensureAbsolutePath(folderPath);

        if (mode === 'global') {
          patterns = { global: [...excludedFiles, ...(customIgnores || [])] };
          const cacheKey = `${normalizedPath}:global:${JSON.stringify(customIgnores?.sort() || [])}`;
          ignoreCache.set(cacheKey, {
            ig: createGlobalIgnoreFilter(customIgnores),
            patterns,
          });
        } else {
          await loadGitignore(normalizedPath);
          const cacheKey = `${normalizedPath}:automatic`;
          patterns = ignoreCache.get(cacheKey)?.patterns || { gitignoreMap: {} };
        }

        return { patterns };
      } catch (err) {
        console.error(`Error getting ignore patterns for ${folderPath}:`, err);
        return { error: err.message };
      }
    }
  );
}

ipcMain.on('cancel-directory-loading', (event) => {
  cancelDirectoryLoading(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.on('debug-file-selection', (event, data) => {
  console.log('DEBUG - File Selection:', data);
});

if (!ipcMain.eventNames().includes('set-ignore-mode')) {
  /**
   * Handles ignore mode changes. Validates the mode, clears caches,
   * resets the watcher, and notifies renderer windows of the change.
   * @param {string} mode - The new ignore mode ('automatic' or 'global')
   */
  ipcMain.on('set-ignore-mode', async (_event, mode) => {
    if (mode !== 'automatic' && mode !== 'global') {
      console.warn(`[IgnoreMode] Received invalid mode: ${mode}`);
      return;
    }

    currentIgnoreMode = mode;
    console.log(`[IgnoreMode] switched -> ${mode}`);
    console.log('[IgnoreMode] DEBUG - Current mode set to:', currentIgnoreMode);

    ignoreCache.clear();
    fileCache.clear();
    fileTypeCache.clear();

    // Watcher cleanup is now handled by the watcher module itself

    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && win.webContents) {
        win.webContents.send('ignore-mode-updated', mode);
      }
    });
  });
}

ipcMain.on('request-file-list', async (event, folderPath) => {
  console.log('Received request-file-list payload:', folderPath); // Log the entire payload

  if (isLoadingDirectory) {
    console.log('Already processing a directory, ignoring new request for:', folderPath);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && window.webContents && !window.webContents.isDestroyed()) {
      window.webContents.send('file-processing-status', {
        status: 'busy',
        message: 'Already processing another directory. Please wait.',
      });
    }
    return;
  }

  try {
    isLoadingDirectory = true;
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), folderPath);

    event.sender.send('file-processing-status', {
      status: 'processing',
      message: 'Scanning directory structure... (Press ESC to cancel)',
    });

    currentProgress = { directories: 0, files: 0 };

    // Clear ignore cache if ignore settings were modified
    if (folderPath.ignoreSettingsModified) {
      console.log('Clearing ignore cache due to modified ignore settings');
      ignoreCache.clear();
    }

    console.log(
      `Loading ignore patterns for: ${folderPath.folderPath} in mode: ${folderPath.ignoreMode}`
    );
    let ignoreFilter;
    if (folderPath.ignoreMode === 'global') {
      console.log('Using global ignore filter with custom ignores:', folderPath.customIgnores);
      ignoreFilter = createGlobalIgnoreFilter(folderPath.customIgnores);
    } else {
      // Default to automatic
      console.log('Using automatic ignore filter (loading .gitignore)');
      ignoreFilter = await loadGitignore(
        folderPath.folderPath,
        BrowserWindow.fromWebContents(event.sender)
      );
    }
    if (!ignoreFilter) {
      throw new Error('Failed to load ignore patterns');
    }
    console.log('Ignore patterns loaded successfully');

    const { results: files } = await readFilesRecursively(
      folderPath.folderPath,
      folderPath.folderPath,
      ignoreFilter,
      BrowserWindow.fromWebContents(event.sender),
      currentProgress,
      folderPath.folderPath,
      folderPath?.ignoreMode ?? currentIgnoreMode
    );

    if (!isLoadingDirectory) {
      return;
    }

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
    isLoadingDirectory = false;

    event.sender.send('file-processing-status', {
      status: 'complete',
      message: `Found ${files.length} files`,
    });

    const serializedFiles = files
      .filter((file) => {
        if (typeof file?.path !== 'string') {
          console.warn('Invalid file object in files array:', file);
          return false;
        }
        return true;
      })
      .map((file) => {
        return {
          path: file.path,
          relativePath: file.relativePath,
          name: file.name,
          size: file.size,
          isDirectory: file.isDirectory,
          extension: path.extname(file.name).toLowerCase(),
          excluded: shouldExcludeByDefault(file.path, folderPath.folderPath),
          content: file.content,
          tokenCount: file.tokenCount,
          isBinary: file.isBinary,
          isSkipped: file.isSkipped,
          error: file.error,
        };
      });

    event.sender.send('file-list-data', serializedFiles);
  } catch (err) {
    console.error('Error processing file list:', err);
    isLoadingDirectory = false;

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }

    event.sender.send('file-processing-status', {
      status: 'error',
      message: `Error: ${err.message}`,
    });
  } finally {
    isLoadingDirectory = false;
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
  }
});

// ======================
// ELECTRON WINDOW SETUP
// ======================
console.log('--- createWindow() ENTERED ---');
let mainWindow;
function createWindow() {
  const isSafeMode = process.argv.includes('--safe-mode');

  // Set CSP header for all environments
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none';",
        ],
      },
    });
  });
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: {
        isDevToolsExtension: false,
        htmlFullscreen: false,
      },
      // Always enable security
      // Disable manually for testing
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Set up window event handlers
  mainWindow.on('closed', async () => {
    await watcher.shutdownWatcher();
    mainWindow = null; // Now allowed since mainWindow is let
  });

  app.on('before-quit', async (event) => {
    await watcher.shutdownWatcher();
  });

  app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
      await watcher.shutdownWatcher();
      app.quit();
    }
  });

  // handle Escape locally (only when focused), not globally
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // only intercept Esc when our window is focused and a load is in progress
    if (input.key === 'Escape' && isLoadingDirectory) {
      cancelDirectoryLoading(mainWindow);
      event.preventDefault(); // stop further in-app handling
    }
  });

  // Only verify file existence in production mode
  if (process.env.NODE_ENV !== 'development') {
    // Verify file exists before loading
    const prodPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Production path:', prodPath);
    try {
      fs.accessSync(prodPath, fs.constants.R_OK);
      console.log('File exists and is readable');
    } catch (err) {
      console.error('File access error:', err);
    }
  }

  // Clean up watcher when window is closed
  mainWindow.on('closed', () => {
    // Watcher cleanup is now handled by the watcher module itself
  });

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('startup-mode', {
      safeMode: isSafeMode,
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const prodPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
      : path.join(__dirname, 'dist', 'index.html');

    console.log('--- PRODUCTION LOAD ---');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('app.isPackaged:', app.isPackaged);
    console.log('__dirname:', __dirname);
    console.log('Resources Path:', process.resourcesPath);
    console.log('Attempting to load file:', prodPath);
    console.log('File exists:', fs.existsSync(prodPath));

    mainWindow
      .loadFile(prodPath)
      .then(() => {
        console.log('Successfully loaded index.html');
        mainWindow.webContents.on('did-finish-load', () => {
          console.log('Finished loading all page resources');
        });
      })
      .catch((err) => {
        console.error('Failed to load index.html:', err);
        // Fallback to showing error page
        mainWindow.loadURL(
          `data:text/html,<h1>Loading Error</h1><p>${encodeURIComponent(err.message)}</p>`
        );
      });
  }
}

// ======================
// APP LIFECYCLE
// ======================
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
