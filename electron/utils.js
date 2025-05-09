const path = require('path');
const fs = require('fs').promises;
const { excludedFiles, binaryExtensions } = require('./excluded-files');

// ======================
// PATH UTILITIES
// ======================

function normalizePath(filePath) {
  if (!filePath) return filePath;

  if (process.platform === 'win32' && filePath.startsWith('\\\\')) {
    return '\\\\' + filePath.slice(2).replace(/\\/g, '/');
  }

  return filePath.replace(/\\/g, '/');
}

function ensureAbsolutePath(inputPath) {
  if (!path.isAbsolute(inputPath)) {
    inputPath = path.resolve(inputPath);
  }
  return normalizePath(inputPath);
}

function safeRelativePath(from, to) {
  from = normalizePath(from);
  to = normalizePath(to);

  if (process.platform === 'win32') {
    from = from.toLowerCase();
    to = to.toLowerCase();
  }

  let relativePath = path.relative(from, to);
  return normalizePath(relativePath);
}

function safePathJoin(...paths) {
  const joined = path.join(...paths);
  return normalizePath(joined);
}

function isValidPath(pathToCheck) {
  try {
    path.parse(pathToCheck);
    return true;
  } catch (err) {
    return false;
  }
}

// ==========================
// FILE PROCESSING UTILITIES
// ==========================

// async function processSingleFile(fullPath, rootDir, ignoreFilter) {
//   fullPath = ensureAbsolutePath(fullPath);
//   rootDir = ensureAbsolutePath(rootDir);

//   const relativePath = safeRelativePath(rootDir, fullPath);
//   const stats = await fs.stat(fullPath);
//   const isBinary = isBinaryFile(fullPath);
//   const shouldIgnore = ignoreFilter.ignores(relativePath);

//   if (shouldIgnore) {
//     return null;
//   }

//   let content = '';
//   let tokenCount = 0;
//   let error = null;

//   try {
//     if (!isBinary) {
//       content = await fs.readFile(fullPath, 'utf8');
//       tokenCount = countTokens(content);
//     }
//   } catch (err) {
//     error = err.message;
//   }

//   return {
//     path: fullPath,
//     relativePath,
//     name: path.basename(fullPath),
//     size: stats.size,
//     modified: stats.mtime.getTime(),
//     isBinary,
//     content,
//     tokenCount,
//     error
//   };
// }

// function isBinaryFile(filePath) {
//   const ext = path.extname(filePath).toLowerCase();
//   return binaryExtensions.includes(ext);
// }

// function countTokens(text) {
//   if (!text) return 0;
//   return Math.ceil(text.length / 4); // Simple fallback
// }

module.exports = {
  normalizePath,
  ensureAbsolutePath,
  safeRelativePath,
  // processSingleFile,
  safePathJoin,
  isValidPath
};