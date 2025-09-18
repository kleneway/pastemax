/**
 * Utilities for optimizing git diff output to avoid redundant content
 */

interface DiffFile {
  path: string;
  isNew: boolean;
  lineCount?: number;
}

/**
 * Detects new files in a git diff and returns metadata about them
 */
export function detectNewFilesInDiff(diffText: string): Map<string, DiffFile> {
  const newFiles = new Map<string, DiffFile>();
  if (!diffText) return newFiles;

  const lines = diffText.split(/\r?\n/);
  let currentFile: string | null = null;
  let isNewFile = false;
  let lineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect diff header
    if (line.startsWith('diff --git ')) {
      // Save previous file if it was new
      if (currentFile && isNewFile) {
        newFiles.set(currentFile, { path: currentFile, isNew: true, lineCount });
      }

      // Reset for new file
      currentFile = null;
      isNewFile = false;
      lineCount = 0;
      continue;
    }

    // Check for new file indicator
    if (line === 'new file mode 100644' || line.startsWith('new file mode ')) {
      isNewFile = true;
      continue;
    }

    // Parse the +++ line to get the file path
    if (line.startsWith('+++ ')) {
      const pathPart = line.slice(4).trim();
      if (pathPart && pathPart !== '/dev/null') {
        currentFile = pathPart.startsWith('b/') ? pathPart.slice(2) : pathPart;
      }
      continue;
    }

    // Check for --- /dev/null which also indicates a new file
    if (line === '--- /dev/null') {
      isNewFile = true;
      continue;
    }

    // Parse hunk header to get line count for new files
    if (isNewFile && line.startsWith('@@')) {
      const match = line.match(/@@ -\d+,\d+ \+\d+,(\d+) @@/);
      if (match) {
        lineCount = parseInt(match[1], 10);
      }
    }
  }

  // Don't forget the last file
  if (currentFile && isNewFile) {
    newFiles.set(currentFile, { path: currentFile, isNew: true, lineCount });
  }

  return newFiles;
}

/**
 * Optimizes a git diff by replacing new file content with placeholders
 * This prevents duplication when the full file content is already included elsewhere
 */
export function optimizeGitDiff(diffText: string, preserveMetadata = true): string {
  if (!diffText) return diffText;

  const lines = diffText.split(/\r?\n/);
  const result: string[] = [];
  let isNewFile = false;
  let inHunk = false;
  let addedLineCount = 0;
  let currentFilePath = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start of a new diff
    if (line.startsWith('diff --git ')) {
      isNewFile = false;
      inHunk = false;
      currentFilePath = '';
      result.push(line);
      continue;
    }

    // New file indicator
    if (line === 'new file mode 100644' || line.startsWith('new file mode ')) {
      isNewFile = true;
      result.push(line);
      continue;
    }

    // Check for --- /dev/null (new file indicator)
    if (line === '--- /dev/null') {
      isNewFile = true;
      result.push(line);
      continue;
    }

    // Parse file path from +++ line
    if (line.startsWith('+++ ')) {
      const pathPart = line.slice(4).trim();
      if (pathPart && pathPart !== '/dev/null') {
        currentFilePath = pathPart.startsWith('b/') ? pathPart.slice(2) : pathPart;
      }
      result.push(line);
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      inHunk = true;
      result.push(line);

      // For new files, add a placeholder instead of the actual content
      if (isNewFile) {
        const match = line.match(/@@ -0,0 \+1,(\d+) @@/);
        if (match) {
          addedLineCount = parseInt(match[1], 10);
        } else {
          // Try alternate format
          const altMatch = line.match(/@@ -\d+,\d+ \+\d+,(\d+) @@/);
          if (altMatch) {
            addedLineCount = parseInt(altMatch[1], 10);
          }
        }

        // Add placeholder message
        if (preserveMetadata) {
          result.push(`\\ New file: ${currentFilePath || 'unknown'} (${addedLineCount} lines)`);
          result.push('\\ Full content included in <file_contents> section above');
        }

        // Skip the actual diff content for new files
        while (i + 1 < lines.length && !lines[i + 1].startsWith('diff --git ') && !lines[i + 1].startsWith('@@')) {
          i++;
        }
        inHunk = false;
        continue;
      }
      continue;
    }

    // For new files, skip the actual diff lines
    if (isNewFile && inHunk) {
      // Skip lines that are part of the new file content
      continue;
    }

    // Regular diff content for modified files
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Creates a summary entry for a new file in the diff
 */
export function createNewFileSummary(filePath: string, lineCount: number): string {
  return `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lineCount} @@
\\ New file: ${filePath} (${lineCount} lines)
\\ Full content included in <file_contents> section above`;
}

/**
 * Checks if a file status indicates it's a new/untracked file
 */
export function isNewFileStatus(status: string): boolean {
  // Git status codes: ?? = untracked, A = added to index
  return status === '??' || status === 'A' || status.includes('A');
}