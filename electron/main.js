// ======================
// IMPORTS AND CONSTANTS
// ======================
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const watcher = require('./watcher.js');
const { getUpdateStatus, resetUpdateSessionState } = require('./update-manager');
// GlobalModeExclusion is now in ignore-manager.js

// Configuration constants
const MAX_DIRECTORY_LOAD_TIME = 300000; // 5 minutes timeout for large repositories

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

// ======================
// PATH UTILITIES
// ======================
const { normalizePath, ensureAbsolutePath, safeRelativePath } = require('./utils.js');

// ======================
// IGNORE MANAGEMENT
// ======================
// Import static pattern arrays directly from their source
const { DEFAULT_PATTERNS, GlobalModeExclusion } = require('./excluded-files.js');
// Import ignore logic functions
const {
  loadAutomaticModeIgnoreFilter, // for Automatic Mode
  createGlobalIgnoreFilter, // for Global Mode
  isPathExcludedByDefaults, // Utils
  compiledIgnoreFilterCache, // Cache for ignore filters
  clearIgnoreCaches, // clear ignore caches
} = require('./ignore-manager.js');

// ======================
// FILE PROCESSING
// ======================
const {
  readFilesRecursively,
  clearFileCaches,
  startFileProcessing,
  stopFileProcessing,
  countTokens, // Added countTokens
} = require('./file-processor.js');

// ======================
// DIRECTORY LOADING MANAGEMENT
// ======================
function setupDirectoryLoadingTimeout(window, folderPath) {
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
  }

  loadingTimeoutId = setTimeout(() => {
    console.log(
      `Directory loading timed out after ${MAX_DIRECTORY_LOAD_TIME / 1000} seconds: ${
        folderPath && typeof folderPath === 'object' ? folderPath.folderPath : folderPath
      }`
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

  stopFileProcessing(); // Stop file processor state
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
ipcMain.handle('check-for-updates', async (event) => {
  console.log("Main Process: IPC 'check-for-updates' handler INVOKED.");
  try {
    const updateStatus = await getUpdateStatus();
    console.log('Main Process: getUpdateStatus result:', updateStatus);
    return updateStatus;
  } catch (error) {
    console.error('Main Process: IPC Error in check-for-updates:', error);
    return {
      isUpdateAvailable: false,
      currentVersion: app.getVersion(),
      error: error.message || 'An IPC error occurred while processing the update check.',
      debugLogs: error.stack || null,
    };
  }
});

ipcMain.on('clear-main-cache', () => {
  console.log('Clearing main process caches');
  clearIgnoreCaches();
  clearFileCaches();
  console.log('Main process caches cleared');
});

ipcMain.on('clear-ignore-cache', () => {
  console.log('Clearing ignore cache due to ignore settings change');
  clearIgnoreCaches();
});

// --- WSL-aware folder picker ---
const { exec, execFile } = require('child_process');
const { isWSLPath } = require('./utils.js');
ipcMain.on('open-folder', async (event, arg) => {
  let defaultPath = undefined;
  let lastSelectedFolder = arg && arg.lastSelectedFolder ? arg.lastSelectedFolder : undefined;

  // Only attempt WSL detection on Windows
  if (process.platform === 'win32') {
    try {
      // List WSL distributions
      const wslList = await new Promise((resolve) => {
        exec('wsl.exe --list --quiet', { timeout: 2000 }, (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const distros = stdout
            .split('\n')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
          resolve(distros);
        });
      });

      // Only set defaultPath to \\wsl$\ if last selected folder was a WSL path
      if (
        Array.isArray(wslList) &&
        wslList.length > 0 &&
        lastSelectedFolder &&
        isWSLPath(lastSelectedFolder)
      ) {
        defaultPath = '\\\\wsl$\\';
      }
    } catch (e) {
      // Ignore errors, fallback to default dialog
    }
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
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

// Fetch list of files changed but not yet committed (modified, staged, untracked, renames)
// Returns absolute normalized paths limited to the provided folder
// ======================
// GIT HELPERS
// ======================
const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';
const DEFAULT_GIT_TIMEOUT = 15000;

function execGitCommand(basePath, args, options = {}) {
  const cwd = ensureAbsolutePath(basePath);
  const timeout = options.timeout ?? DEFAULT_GIT_TIMEOUT;

  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout }, (err, stdout = '', stderr = '') => {
      if (err && err.code !== 1) {
        resolve({ error: stderr.trim() || err.message, code: err.code || 1 });
        return;
      }

      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        code: err?.code ?? 0,
      });
    });
  });
}

async function resolveRepoRoot(folderPath) {
  if (!folderPath) {
    return { error: 'No folder selected' };
  }

  const normalizedFolder = ensureAbsolutePath(folderPath);
  const rootRes = await execGitCommand(normalizedFolder, ['rev-parse', '--show-toplevel']);
  if (rootRes.error) {
    return { error: 'Not a git repository or git not available' };
  }

  return { repoRoot: normalizePath(rootRes.stdout.trim()) };
}

function parsePorcelainEntries(rawOutput, repoRoot) {
  const entries = (rawOutput || '').split('\0').filter(Boolean);
  const byPath = new Map();
  const normalizedRepoRoot = normalizePath(repoRoot);

  for (let i = 0; i < entries.length; i++) {
    const record = entries[i];
    if (!record || record.length < 3) continue;

    const xy = record.slice(0, 2);
    const x = xy[0];
    const y = xy[1];
    let relPath = record.slice(3).trim();
    let prevPath;

    // Skip deleted entries entirely as the file no longer exists locally
    if (x === 'D' || y === 'D') continue;

    // Handle renames / copies: the next entry is the target path
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      prevPath = relPath;
      const nextPath = entries[i + 1];
      if (nextPath) {
        relPath = nextPath.trim();
        i += 1;
      }
    }

    // Ensure proper path normalization
    const normalizedRel = normalizePath(relPath);
    const absolutePath = normalizePath(path.join(normalizedRepoRoot, relPath));

    const entry = {
      repoRoot: normalizedRepoRoot,
      absolutePath,
      relativePath: normalizedRel,
      status: xy,
      indexStatus: x === ' ' ? undefined : x,
      worktreeStatus: y === ' ' ? undefined : y,
      isUntracked: xy === '??',
    };

    if (prevPath) {
      entry.oldRelativePath = normalizePath(prevPath);
    }

    byPath.set(normalizedRel, entry);
  }

  return Array.from(byPath.values());
}

function isPathWithin(targetPath, basePath) {
  const normalizedTarget = ensureAbsolutePath(targetPath);
  let normalizedBase = ensureAbsolutePath(basePath);

  if (process.platform === 'win32') {
    if (normalizedBase) normalizedBase = normalizedBase.toLowerCase();
  }

  const targetComparable =
    process.platform === 'win32' ? normalizedTarget.toLowerCase() : normalizedTarget;

  if (!normalizedBase.endsWith('/')) {
    normalizedBase += '/';
  }

  return (
    targetComparable === normalizedBase.slice(0, -1) ||
    targetComparable.startsWith(normalizedBase)
  );
}

async function collectGitStatusEntries(folderPath) {
  const rootResult = await resolveRepoRoot(folderPath);
  if (rootResult.error) return rootResult;

  const { repoRoot } = rootResult;
  const statusRes = await execGitCommand(repoRoot, ['status', '--porcelain=v1', '-z', '-uall']);
  if (statusRes.error) return { error: statusRes.error };

  const entries = parsePorcelainEntries(statusRes.stdout, repoRoot);
  return { repoRoot, entries };
}

ipcMain.handle('get-changed-files', async (_event, { folderPath } = {}) => {
  if (!folderPath) {
    return { error: 'No folder selected' };
  }

  try {
    const statusResult = await collectGitStatusEntries(folderPath);
    if (statusResult.error) return statusResult;

    const { repoRoot, entries } = statusResult;
    const selectedFolderAbs = ensureAbsolutePath(folderPath);

    const withinFolder = entries.filter((entry) =>
      isPathWithin(entry.absolutePath, selectedFolderAbs)
    );

    return { repoRoot, files: withinFolder };
  } catch (e) {
    return { error: e?.message || 'Failed to get changed files' };
  }
});

ipcMain.handle('get-commit-history', async (_event, { folderPath, limit = 20 } = {}) => {
  if (!folderPath) {
    return { error: 'No folder selected' };
  }

  try {
    const rootResult = await resolveRepoRoot(folderPath);
    if (rootResult.error) return rootResult;

    const { repoRoot } = rootResult;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const logRes = await execGitCommand(repoRoot, [
      'log',
      `-n`,
      String(safeLimit),
      '--pretty=format:%H%x09%ct%x09%s',
    ]);

    if (logRes.error) return { error: logRes.error };

    const commits = (logRes.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, timestamp, ...messageParts] = line.split('	');
        const subject = messageParts.join('	').trim();
        const unixSeconds = parseInt(timestamp, 10);
        return {
          hash,
          subject,
          timestamp: unixSeconds,
          isoDate: Number.isFinite(unixSeconds)
            ? new Date(unixSeconds * 1000).toISOString()
            : null,
        };
      });

    return { repoRoot, commits };
  } catch (e) {
    return { error: e?.message || 'Failed to load commit history' };
  }
});

ipcMain.handle(
  'get-files-since-commit',
  async (_event, { folderPath, commit, includeWorkingTree = true } = {}) => {
    if (!folderPath) return { error: 'No folder selected' };
    if (!commit || typeof commit !== 'string') return { error: 'Commit hash is required' };

    // Basic validation for commit hash (accept short hashes)
    const cleanCommit = commit.trim();
    if (!/^[0-9a-fA-F]{4,40}$/.test(cleanCommit)) {
      return { error: 'Invalid commit hash format' };
    }

    try {
      const rootResult = await resolveRepoRoot(folderPath);
      if (rootResult.error) return rootResult;

      const { repoRoot } = rootResult;
      const selectedFolderAbs = ensureAbsolutePath(folderPath);

      // Verify commit exists and get full hash
      const verifyRes = await execGitCommand(repoRoot, ['rev-parse', '--verify', `${cleanCommit}^{commit}`]);
      if (verifyRes.error) return { error: `Commit '${cleanCommit}' not found in this repository` };

      const fullCommitHash = verifyRes.stdout.trim();

      // Step 1: Get all files changed from commit to HEAD
      // Use git log to get all files modified since (and including) the commit
      const filesFromCommitRes = await execGitCommand(repoRoot, [
        'diff',
        '--name-only',
        '--diff-filter=ACMR',
        `${fullCommitHash}^..HEAD`,
      ]);

      let committedFilesList = [];

      if (filesFromCommitRes.error) {
        // Handle initial commit (no parent)
        console.log('Handling initial commit or error, using fallback approach');

        // Get files changed after the commit
        const afterCommitRes = await execGitCommand(repoRoot, [
          'diff',
          '--name-only',
          '--diff-filter=ACMR',
          `${fullCommitHash}..HEAD`,
        ]);

        // Get files changed IN the commit itself
        const inCommitRes = await execGitCommand(repoRoot, [
          'diff-tree',
          '--no-commit-id',
          '--name-only',
          '--diff-filter=ACMR',
          '-r',
          '--root',
          fullCommitHash,
        ]);

        // Combine both lists
        const afterFiles = (afterCommitRes.stdout || '').split('\n').filter(Boolean);
        const inFiles = (inCommitRes.stdout || '').split('\n').filter(Boolean);
        committedFilesList = [...new Set([...afterFiles, ...inFiles])];
      } else {
        committedFilesList = (filesFromCommitRes.stdout || '').split('\n').filter(Boolean);
      }

      console.log(`Files changed since commit ${cleanCommit}: ${committedFilesList.length}`);

      // Step 2: Get all uncommitted changes separately
      let uncommittedFiles = [];
      if (includeWorkingTree) {
        const statusRes = await execGitCommand(repoRoot, ['status', '--porcelain=v1', '-z', '-uall']);

        if (!statusRes.error && statusRes.stdout) {
          // Parse the porcelain output using the existing logic
          const entries = parsePorcelainEntries(statusRes.stdout, repoRoot);
          uncommittedFiles = entries.filter(entry =>
            isPathWithin(entry.absolutePath, selectedFolderAbs)
          );
          console.log(`Uncommitted changes found: ${uncommittedFiles.length}`);
        }
      }

      // Step 3: Combine both lists, with uncommitted taking precedence
      const allFilesMap = new Map();

      // First add committed files
      committedFilesList.forEach(relPath => {
        const normalizedRel = normalizePath(relPath);
        const absPath = normalizePath(path.join(repoRoot, relPath));

        if (isPathWithin(absPath, selectedFolderAbs)) {
          allFilesMap.set(absPath, {
            repoRoot,
            absolutePath: absPath,
            relativePath: normalizedRel,
            status: 'M',  // Default status for committed files
            isUntracked: false,
          });
        }
      });

      // Then add/override with uncommitted changes (these have more detailed status)
      uncommittedFiles.forEach(entry => {
        allFilesMap.set(entry.absolutePath, entry);
      });

      const finalFiles = Array.from(allFilesMap.values());

      console.log(`Total files since commit ${cleanCommit}:`);
      console.log(`  - Committed changes: ${committedFilesList.length} files`);
      console.log(`  - Uncommitted changes: ${uncommittedFiles.length} files`);
      console.log(`  - Combined unique: ${finalFiles.length} files`);

      return { repoRoot, files: finalFiles };
    } catch (e) {
      console.error('Error in get-files-since-commit:', e);
      return { error: e?.message || 'Failed to load files for commit range' };
    }
  }
);

ipcMain.handle(
  'get-selected-files-diff',
  async (
    _event,
    { folderPath, filePaths = [], contextLines = 3 } = {}
  ) => {
    if (!folderPath) return { error: 'No folder selected' };
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { diff: '', changedPaths: [] };
    }

    try {
      console.log(
        `[GitDiff] Request received for ${filePaths.length} file(s) in folder: ${folderPath}`
      );
      const statusResult = await collectGitStatusEntries(folderPath);
      if (statusResult.error) return statusResult;

      const { repoRoot, entries } = statusResult;
      const statusMap = new Map(entries.map((entry) => [entry.relativePath, entry]));

      const normalizedFiles = filePaths
        .map((fp) => ensureAbsolutePath(fp))
        .map((abs) => {
          const normalizedAbs = normalizePath(abs);
          return {
            absolutePath: normalizedAbs,
            relativePath: safeRelativePath(repoRoot, normalizedAbs),
          };
        })
        .filter(({ relativePath }) => relativePath && !relativePath.startsWith('..'));

      const tracked = [];
      const untracked = [];
      const changedPaths = [];

      normalizedFiles.forEach(({ absolutePath, relativePath }) => {
        const entry = statusMap.get(normalizePath(relativePath));
        if (!entry) return;

        changedPaths.push(absolutePath);
        if (entry.isUntracked) {
          untracked.push({ absolutePath, relativePath });
        } else {
          tracked.push({ absolutePath, relativePath });
        }
      });

      console.log(
        `[GitDiff] Normalized ${normalizedFiles.length} file(s) -> ${tracked.length} tracked / ${untracked.length} untracked`
      );

      if (tracked.length === 0 && untracked.length === 0) {
        console.log('[GitDiff] No tracked or untracked entries matched requested files');
        return { diff: '', changedPaths: [] };
      }

      let diffOutput = '';

      if (tracked.length > 0) {
        const trackedArgs = [
          'diff',
          `-U${Math.max(Number(contextLines) || 3, 0)}`,
          'HEAD',
          '--',
          ...tracked.map((item) => item.relativePath),
        ];
        const trackedDiff = await execGitCommand(repoRoot, trackedArgs, { timeout: 20000 });
        if (!trackedDiff.error) {
          diffOutput += trackedDiff.stdout;
        } else {
          console.warn('[GitDiff] tracked diff command returned error:', trackedDiff.error);
        }
      }

      for (const item of untracked) {
        const untrackedDiff = await execGitCommand(repoRoot, [
          'diff',
          `-U${Math.max(Number(contextLines) || 3, 0)}`,
          '--no-index',
          '--',
          NULL_DEVICE,
          item.absolutePath,
        ]);

        if (!untrackedDiff.error) {
          diffOutput += untrackedDiff.stdout;
        } else {
          console.warn('[GitDiff] untracked diff command returned error:', untrackedDiff.error);
        }
      }

      console.log(
        `[GitDiff] Built diff output of ${diffOutput.length} characters for ${changedPaths.length} path(s)`
      );

      return {
        diff: diffOutput.trimEnd(),
        changedPaths,
      };
    } catch (e) {
      return { error: e?.message || 'Failed to build diff for selected files' };
    }
  }
);

if (!ipcMain.eventNames().includes('get-ignore-patterns')) {
  ipcMain.handle(
    'get-ignore-patterns',
    async (event, { folderPath, mode = 'automatic', customIgnores = [] } = {}) => {
      if (!folderPath) {
        console.log('get-ignore-patterns called without folderPath - returning default patterns');
        // Note: defaultIgnoreFilter is an ignore() instance, not an array.
        // For this fallback, we should use DEFAULT_PATTERNS array from ignore-manager,
        // or construct a similar list if that's not directly exported/desired.
        // However, the original code used defaultIgnoreFilter here, which is incorrect for spreading.
        // Assuming the intent was to provide a comprehensive list for a "default global" view.
        // For now, sticking to the structure but using GlobalModeExclusion correctly.
        // A more robust fallback might involve DEFAULT_PATTERNS.
        // For the UI, when no folder is selected, show all patterns that would form a base global ignore set.
        const effectiveGlobalPatternsNoFolder = [
          ...DEFAULT_PATTERNS,
          ...GlobalModeExclusion,
          ...(customIgnores || []),
        ];
        return {
          patterns: {
            global: effectiveGlobalPatternsNoFolder,
          },
        };
      }

      try {
        let patterns;
        const normalizedPath = ensureAbsolutePath(folderPath);

        if (mode === 'global') {
          // For UI display consistency, include DEFAULT_PATTERNS here as well.
          // The actual createGlobalIgnoreFilter used for filtering already includes them.
          const effectiveGlobalPatternsWithFolder = [
            ...DEFAULT_PATTERNS,
            ...GlobalModeExclusion,
            ...(customIgnores || []),
          ];
          patterns = { global: effectiveGlobalPatternsWithFolder };
          const cacheKey = `${normalizedPath}:global:${JSON.stringify(customIgnores?.sort() || [])}`;
          compiledIgnoreFilterCache.set(cacheKey, {
            ig: createGlobalIgnoreFilter(customIgnores),
            patterns,
          });
        } else {
          await loadAutomaticModeIgnoreFilter(normalizedPath);
          const cacheKey = `${normalizedPath}:automatic`;
          patterns = compiledIgnoreFilterCache.get(cacheKey)?.patterns || { gitignoreMap: {} };
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

    clearIgnoreCaches();
    clearFileCaches();

    // Watcher cleanup is now handled by the watcher module itself

    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && win.webContents) {
        win.webContents.send('ignore-mode-updated', mode);
      }
    });
  });
}

// IPC Handler for getting token count
ipcMain.handle('get-token-count', async (event, textToTokenize) => {
  if (typeof textToTokenize !== 'string') {
    console.error('[IPC:get-token-count] Invalid textToTokenize received:', textToTokenize);
    return { error: 'Invalid input: textToTokenize must be a string.' };
  }
  try {
    const tokenCount = countTokens(textToTokenize);
    return { tokenCount };
  } catch (error) {
    console.error('[IPC:get-token-count] Error counting tokens:', error);
    return { error: `Error counting tokens: ${error.message}` };
  }
});

ipcMain.on('request-file-list', async (event, payload) => {
  console.log('Received request-file-list payload:', payload); // Log the entire payload

  // Always clear file caches before scanning
  clearFileCaches();

  if (isLoadingDirectory) {
    console.log('Already processing a directory, ignoring new request for:', payload);
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
    startFileProcessing(); // Start file processor state
    setupDirectoryLoadingTimeout(BrowserWindow.fromWebContents(event.sender), payload.folderPath);

    event.sender.send('file-processing-status', {
      status: 'processing',
      message: 'Scanning directory structure... (Press ESC to cancel)',
    });

    currentProgress = { directories: 0, files: 0 };

    // Clear ignore cache if ignore settings were modified
    if (payload.ignoreSettingsModified) {
      console.log('Clearing ignore cache due to modified ignore settings');
      clearIgnoreCaches();
    }

    console.log(
      `Loading ignore patterns for: ${payload.folderPath} in mode: ${payload.ignoreMode}`
    );
    let ignoreFilter;
    if (payload.ignoreMode === 'global') {
      console.log('Using global ignore filter with custom ignores:', payload.customIgnores);
      ignoreFilter = createGlobalIgnoreFilter(payload.customIgnores);
    } else {
      // Default to automatic
      console.log('Using automatic ignore filter (loading .gitignore)');
      ignoreFilter = await loadAutomaticModeIgnoreFilter(
        payload.folderPath,
        BrowserWindow.fromWebContents(event.sender)
      );
    }
    if (!ignoreFilter) {
      throw new Error('Failed to load ignore patterns');
    }
    console.log('Ignore patterns loaded successfully');

    const { results: files } = await readFilesRecursively(
      payload.folderPath,
      payload.folderPath, // rootDir is the same as the initial dir for top-level call
      ignoreFilter,
      BrowserWindow.fromWebContents(event.sender),
      currentProgress,
      payload.folderPath, // currentDir is also the same for top-level
      payload?.ignoreMode ?? currentIgnoreMode,
      null, // fileQueue
      watcher.shutdownWatcher,
      watcher.initializeWatcher
    );

    if (!isLoadingDirectory) {
      return;
    }

    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
    stopFileProcessing(); // Stop file processor state
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
          excluded: isPathExcludedByDefaults(
            file.path,
            payload.folderPath,
            payload.ignoreMode ?? currentIgnoreMode
          ),
          content: file.content,
          tokenCount: file.tokenCount,
          isBinary: file.isBinary,
          isSkipped: file.isSkipped,
          error: file.error,
        };
      });

    event.sender.send('file-list-data', serializedFiles);

    // After sending file-list-data, start watcher for the root folder
    // Use the same ignoreFilter as used for the scan
    // Pass rootDir as payload.folderPath
    watcher.initializeWatcher(
      payload.folderPath, // rootDir
      BrowserWindow.fromWebContents(event.sender),
      ignoreFilter,
      // For defaultIgnoreFilterInstance, use the system default filter
      require('./ignore-manager.js').systemDefaultFilter,
      // processSingleFileCallback
      (filePath) =>
        require('./file-processor.js').processSingleFile(
          filePath,
          payload.folderPath,
          ignoreFilter,
          payload?.ignoreMode ?? currentIgnoreMode
        )
    );
  } catch (err) {
    console.error('Error processing file list:', err);
    stopFileProcessing(); // Stop file processor state
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
    stopFileProcessing(); // Ensure file processor state is reset
    isLoadingDirectory = false;
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
  }
});

// Handle fetch-models request from renderer
ipcMain.handle('fetch-models', async () => {
  try {
    const fetch = require('node-fetch');
    console.log('Fetching models from OpenRouter API in main process...');
    const response = await fetch('https://openrouter.ai/api/v1/models');

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const apiResponse = await response.json();

    if (apiResponse && Array.isArray(apiResponse.data)) {
      console.log(`Successfully fetched ${apiResponse.data.length} models from main process.`);

      // Map API response to expected ModelInfo structure
      const models = apiResponse.data.map((apiModel) => ({
        id: apiModel.id,
        name: apiModel.name || apiModel.id,
        description: apiModel.description || '',
        context_length: apiModel.context_length || 0,
        pricing: apiModel.pricing || '',
        available: apiModel.available !== false,
      }));

      return models;
    } else {
      console.error(
        "Error fetching models: Invalid response format. Expected object with 'data' array.",
        apiResponse
      );
      return null;
    }
  } catch (error) {
    console.error('Error fetching models in main process:', error);
    return null;
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
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:* ws://localhost:* https://openrouter.ai/*; object-src 'none';",
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

  // Open external links in user's default browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (mainWindow.webContents.getURL() !== url) {
        event.preventDefault();
        shell.openExternal(url);
      }
    }
  });

  // Handle requests to open a new window (e.g., target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Set up window event handlers
  mainWindow.on('closed', async () => {
    await watcher.shutdownWatcher();
    mainWindow = null; // Now allowed since mainWindow is let
  });

  app.on('before-quit', async () => {
    await watcher.shutdownWatcher();
  });

  app.on('will-quit', () => {
    resetUpdateSessionState();
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

  mainWindow.webContents.once('did-finish-load', async () => {
    mainWindow.webContents.send('startup-mode', {
      safeMode: isSafeMode,
    });
    // Automatic update check on app launch (skip in development mode)
    if (process.env.NODE_ENV !== 'development') {
      try {
        const { getUpdateStatus } = require('./update-manager');
        const updateStatus = await getUpdateStatus();
        mainWindow.webContents.send('initial-update-status', updateStatus);
      } catch (err) {
        mainWindow.webContents.send('initial-update-status', {
          isUpdateAvailable: false,
          currentVersion: app.getVersion(),
          error: err?.message || 'Failed to check for updates on launch',
          isLoading: false,
        });
      }
    } else {
      // In development mode, just send a "no update" status immediately
      mainWindow.webContents.send('initial-update-status', {
        isUpdateAvailable: false,
        currentVersion: app.getVersion(),
        isLoading: false,
        error: undefined,
      });
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8765');
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
