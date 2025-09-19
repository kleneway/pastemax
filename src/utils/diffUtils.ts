import { normalizePath } from './pathUtils';

export interface DiffHunk {
  /** 1-based start line of the hunk in the new file */
  start: number;
  /** inclusive end line of the hunk in the new file */
  end: number;
}

export type DiffMap = Map<string, DiffHunk[]>;

const HUNK_REGEX = /@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

/**
 * Parses a unified diff into a map of file path -> hunks (line ranges in the new file).
 * Only tracks additions/changes that exist in the working tree. Deleted files are ignored.
 */
export function parseUnifiedDiff(diffText: string): DiffMap {
  const diffMap: DiffMap = new Map();
  if (!diffText) return diffMap;

  const lines = diffText.split(/\r?\n/);

  let currentFile: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      currentFile = null; // reset until we see +++ marker
      continue;
    }

    if (line.startsWith('+++ ')) {
      const filePath = parseFilePathFromMarker(line);
      currentFile = filePath;
      if (currentFile && !diffMap.has(currentFile)) {
        diffMap.set(currentFile, []);
      }
      continue;
    }

    if (!currentFile) {
      continue;
    }

    const match = line.match(HUNK_REGEX);
    if (!match) {
      continue;
    }

    const newStart = parseInt(match[3] ?? '0', 10);
    const newLength = parseInt(match[4] ?? '1', 10);

    if (newLength === 0) {
      // Pure deletion – no new content to surface.
      continue;
    }

    // Check if this is an optimized new file placeholder
    // Look ahead to see if the next line is our optimization marker
    if (i + 1 < lines.length && lines[i + 1].startsWith('\\ New file:')) {
      // For optimized new files, we still want to track them as changed
      // so they get included in smart context, but we use the full file content
      // from the file itself, not from the diff
      const start = newStart;
      const end = newStart + Math.max(newLength - 1, 0);
      const hunks = diffMap.get(currentFile);
      if (hunks) {
        hunks.push({ start, end });
      }
      // Skip the optimization marker lines
      while (i + 1 < lines.length && lines[i + 1].startsWith('\\')) {
        i++;
      }
      continue;
    }

    const start = newStart;
    const end = newStart + Math.max(newLength - 1, 0);

    const hunks = diffMap.get(currentFile);
    if (!hunks) continue;

    hunks.push({ start, end });
  }

  // Merge overlapping ranges for each file
  for (const [file, hunks] of diffMap.entries()) {
    if (hunks.length === 0) continue;
    hunks.sort((a, b) => a.start - b.start);

    const merged: DiffHunk[] = [];
    let current = { ...hunks[0] };

    for (let idx = 1; idx < hunks.length; idx += 1) {
      const next = hunks[idx];
      if (next.start <= current.end + 1) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    diffMap.set(file, merged);
  }

  return diffMap;
}

function parseFilePathFromMarker(markerLine: string): string | null {
  // Examples: "+++ b/src/App.tsx" or "+++ /dev/null"
  const pathPart = markerLine.slice(4).trim();
  if (!pathPart || pathPart === '/dev/null') {
    return null;
  }

  const normalized = normalizePath(stripDiffPrefix(pathPart));
  return normalized || null;
}

function stripDiffPrefix(path: string): string {
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

export function isPathInDiff(diffMap: DiffMap, filePath: string): boolean {
  if (!filePath) return false;
  const normalized = normalizePath(filePath);
  return diffMap.has(normalized);
}
