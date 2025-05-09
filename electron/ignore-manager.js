// ======================
//  INITIALIZATION
// ======================

// Imports
const { excludedFiles } = require('./excluded-files');
const { normalizePath, ensureAbsolutePath, safeRelativePath, isValidPath, safePathJoin } = require('./utils');

// Constants
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

// Global caches
const ignoreCache = new Map(); // Cache for ignore filters keyed by normalized root directory
const gitIgnoreFound = new Map(); // Cache for already found/processed gitignore files
let defaultExcludeFilter = null // Cache for default exclude ignore filter

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
// Pre-compiled default ignore filter for early checks
const defaultIgnoreFilter = ignore().add(DEFAULT_PATTERNS);

/**
 * The function `shouldExcludeByDefault` determines whether a file should be excluded based on various
 * conditions including platform-specific paths and a default exclusion filter.
 * @param filePath - The `filePath` parameter represents the path of the file that is being checked for
 * exclusion. It is used to determine if the file should be excluded based on certain criteria.
 * @param rootDir - The `rootDir` parameter in the `shouldExcludeByDefault` function represents the
 * root directory of the project or file system that is being analyzed. It is used to determine the
 * relative path of the file being checked for exclusion.
 * @returns The function `shouldExcludeByDefault` returns a boolean value. It returns `true` if the
 * file should be excluded based on various conditions such as being a reserved Windows name, system
 * path on Windows, macOS, or Linux, or if it matches the default exclusion filter. If none of these
 * conditions are met, it returns `false`.
 */
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

/**
 * The function `shouldIgnorePath` determines whether a file path should be ignored based on specified
 * ignore filters and modes.
 * @param filePath - The `filePath` parameter represents the path of the file that you want to check
 * for whether it should be ignored or not based on the ignore rules provided.
 * @param rootDir - The `rootDir` parameter in the `shouldIgnorePath` function represents the root
 * directory of the project or file system. It is used to calculate the relative path of the `filePath`
 * with respect to the root directory. This relative path is then checked against ignore filters to
 * determine if the file should
 * @param currentDir - The `currentDir` parameter in the `shouldIgnorePath` function represents the
 * current directory path from which the `filePath` is being checked for ignoring. It is used to
 * calculate the relative path of the `filePath` with respect to the current directory. This relative
 * path is then used to determine if
 * @param ignoreFilter - The `ignoreFilter` parameter is a filter object that contains patterns to
 * determine whether a file path should be ignored or not. It is used to check if a given file path
 * matches any of the ignore patterns specified in the filter. The function `shouldIgnorePath` uses
 * this filter to decide whether a
 * @param [ignoreMode=automatic] - The `ignoreMode` parameter in the `shouldIgnorePath` function
 * determines the mode in which the path should be ignored. It has three possible values:
 * @returns The function `shouldIgnorePath` returns a boolean value indicating whether the given file
 * path should be ignored based on the ignore filters and mode specified. If the file path is empty or
 * if the relative paths are empty, the function will return `true` to indicate that the path should be
 * ignored. Otherwise, it will check against default ignore patterns, root-relative patterns, and
 * current directory context (in automatic
 */
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

// ======================
// IGNORE CACHE LOGIC
// ======================

/**
 * Clears all ignore-related caches
 */
function clearIgnoreCaches() {
  ignoreCache.clear();
  gitIgnoreFound.clear();
  console.log('Cleared all ignore caches');
}

/**
 * The function `collectGitignoreMapRecursive` recursively scans directories to collect and map
 * `.gitignore` patterns.
 * @param startDir - The `startDir` parameter in the `collectGitignoreMapRecursive` function represents
 * the directory from which the function will start collecting `.gitignore` files and their patterns
 * recursively. It is the initial directory where the function will begin its search for `.gitignore`
 * files and process subdirectories.
 * @param rootDir - The `rootDir` parameter in the `collectGitignoreMapRecursive` function represents
 * the root directory from which the recursive search for `.gitignore` files starts. It is used to
 * calculate the relative paths of the directories where `.gitignore` files are found in relation to
 * the root directory.
 * @param [currentMap] - The `currentMap` parameter in the `collectGitignoreMapRecursive` function is a
 * Map object that stores the mapping of directory paths to arrays of gitignore patterns. Each key in
 * the map represents a directory path relative to the root directory, and the corresponding value is
 * an array of gitignore patterns
 * @returns The function `collectGitignoreMapRecursive` returns a `Map` object containing the directory
 * paths and corresponding patterns found in the `.gitignore` files within the specified directory and
 * its subdirectories.
 */
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

/**
 * The function `createGlobalIgnoreFilter` creates a 'Global' ignore filter by combining default
 * patterns, excluded files, and custom ignores.
 * @param [customIgnores] - The `customIgnores` parameter is an array that contains custom file
 * patterns to be ignored. These patterns are normalized by trimming any extra whitespace and sorting
 * them alphabetically before being added to the global ignore filter. The function then combines these
 * custom ignores with default patterns and excluded files to create a
 * @returns The function `createGlobalIgnoreFilter` is returning an instance of the `ignore` class with
 * global patterns added based on default patterns, excluded files, and custom ignores provided as
 * input.
 */
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

/**
 * The function `createContextualIgnoreFilter` generates an 'Automatic' filter based on parent filter rules
 * and patterns from a `.gitignore` file in automatic mode.
 * @param rootDir - The `rootDir` parameter represents the root directory of the project where the
 * ignore filter is being created. This is the base directory from which paths will be resolved.
 * @param currentDir - `currentDir` is the current directory path where the
 * `createContextualIgnoreFilter` function is being called.
 * @param parentIgnoreFilter - The `parentIgnoreFilter` parameter is used to provide a filter object
 * containing rules to ignore specific patterns. These patterns are typically inherited from a
 * higher-level directory or a global configuration. The function extracts the valid patterns from the
 * parent filter and adds them to the ignore filter being created.
 * @param [ignoreMode=automatic] - The `ignoreMode` parameter in the `createContextualIgnoreFilter`
 * function determines how the ignore patterns are applied.
 * @returns The function `createContextualIgnoreFilter` returns an instance of the `ignore` class with
 * patterns added based on the provided parameters and conditions.
 */
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

/**
 * The function `loadGitignore` asynchronously loads and combines default and repository-specific
 * patterns for ignoring files in a specified directory for 'Automatic Mode'.
 * @param rootDir - The `rootDir` parameter in the `loadGitignore` function represents the root
 * directory path where the Gitignore file and other files to be ignored are located. It is the
 * starting point for collecting Gitignore patterns and setting up the ignore filter.
 * @param window - The `window` parameter in the `loadGitignore` function is not used within the
 * function itself. It seems to be a leftover parameter that is not being utilized in the code snippet
 * provided. If you don't need it for any specific purpose, you can safely remove it from the function
 * signature to
 * @returns The function `loadGitignore` returns the `ig` object, which is an instance of the `ignore`
 * class.
 */
async function loadGitignore(rootDir) {
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

// Exports
module.exports = {
  defaultIgnoreFilter, // Pre-compiled default ignore filter
  loadGitignore, // for Automatic Mode
  createGlobalIgnoreFilter, // for Global Mode
  createContextualIgnoreFilter, // utils
  shouldIgnorePath, // Utils
  shouldExcludeByDefault, // Utils
  ignoreCache, // Cache for ignore filters
  clearIgnoreCaches, // clear ignore caches
};