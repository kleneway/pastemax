import { FileData } from '../types/FileTypes';
import { getLanguageFromFilename } from './languageUtils';
import { generateAsciiFileTree, normalizePath } from './pathUtils';
import { countTokensCached } from './tokenUtils';
import { DiffHunk, DiffMap, parseUnifiedDiff } from './diffUtils';

interface LineRange {
  start: number;
  end: number;
}

interface CandidateVariant {
  content: string;
  contextLines: number;
}

interface Candidate {
  priority: number;
  variants: CandidateVariant[];
  isEssential: boolean;
}

interface IncludedVariant {
  content: string;
  tokens: number;
}

export interface SmartContextParams {
  files: FileData[];
  selectedFiles: string[];
  sortOrder: string;
  includeFileTree: boolean;
  includeBinaryPaths: boolean;
  selectedFolder: string | null;
  diffText: string;
  diffPaths: string[];
  includeGitDiffs: boolean;
  gitDiff?: string;
  budgetTokens: number;
  contextLines: number;
  joinThreshold: number;
  smallFileTokenThreshold: number;
  tokenCounter?: (text: string) => Promise<number>;
}

export interface SmartContextResult {
  content: string;
  tokenCount: number;
}

const ELLIPSIS_LINE = '…';
const RANGE_PREFIX = (start: number, end: number): string =>
  `[lines ${start}${end !== start ? `-${end}` : ''}]`;

export async function assembleSmartContextContent(
  params: SmartContextParams
): Promise<SmartContextResult> {
  const {
    files,
    selectedFiles,
    sortOrder,
    includeFileTree,
    includeBinaryPaths,
    selectedFolder,
    diffText,
    diffPaths,
    includeGitDiffs,
    gitDiff,
    budgetTokens,
    contextLines,
    joinThreshold,
    smallFileTokenThreshold,
    tokenCounter = countTokensCached,
  } = params;

  const effectiveContext = Math.max(0, contextLines);
  const effectiveJoin = Math.max(0, joinThreshold);
  const diffMap = parseUnifiedDiff(diffText);
  const normalizedSelectedFolder = selectedFolder ? normalizePath(selectedFolder) : null;
  const diffPathSet = new Set<string>();
  diffPaths.forEach((path) => {
    const normalized = normalizePath(path);
    diffPathSet.add(normalized);
    const relative = relativeTo(normalizedSelectedFolder, normalized);
    if (relative) {
      diffPathSet.add(relative);
    }
  });

  const sortedFiles = sortSelectedFiles(files, selectedFiles, sortOrder);

  const binaryEntries: string[] = [];
  const candidates: Candidate[] = [];

  sortedFiles.forEach((file) => {
    const normalizedPath = normalizePath(file.path);
    const relativePath = relativeTo(normalizedSelectedFolder, normalizedPath);

    if (file.isBinary) {
      if (includeBinaryPaths) {
        binaryEntries.push(buildBinaryEntry(file));
      }
      return;
    }

    const language = getLanguageFromFilename(file.name);
    const diffHunks = resolveDiffHunks(diffMap, normalizedPath, normalizedSelectedFolder);
    const isDiffPath =
      diffPathSet.has(normalizedPath) || (relativePath ? diffPathSet.has(relativePath) : false);
    const isInDiff = (diffHunks && diffHunks.length > 0) || isDiffPath;

    if (isInDiff) {
      const variants = buildExcerptVariants({
        file,
        language,
        hunks: diffHunks,
        contextLines: effectiveContext,
        joinThreshold: effectiveJoin,
      });

      // Ensure we have at least one variant – fallback to full file if diff parsing failed
      const safeVariants = variants.length > 0 ? variants : buildFullVariants(file, language);

      candidates.push({
        priority: 0,
        variants: safeVariants,
        isEssential: true,
      });
      return;
    }

    if (file.tokenCount <= smallFileTokenThreshold) {
      candidates.push({
        priority: 1,
        variants: buildFullVariants(file, language),
        isEssential: false,
      });
    } else {
      // Large non-diff file: include as low-priority full content (may be dropped by budget)
      candidates.push({
        priority: 2,
        variants: buildFullVariants(file, language),
        isEssential: false,
      });
    }
  });

  let diffSection = '';
  let diffTokens = 0;
  const trimmedGitDiff = includeGitDiffs && gitDiff ? gitDiff.trim() : '';
  if (trimmedGitDiff) {
    diffSection = `<git_diff>\n\`\`\`diff\n${trimmedGitDiff}\n\`\`\`\n</git_diff>\n`;
    try {
      diffTokens = await tokenCounter(diffSection);
    } catch (error) {
      console.error('Error estimating diff token count:', error);
      diffTokens = 0;
    }
  }

  const enforceBudget = budgetTokens > 0 && Number.isFinite(budgetTokens);
  const availableBudget = enforceBudget ? Math.max(budgetTokens - diffTokens, 0) : budgetTokens;

  const { included } = await selectVariantsWithinBudget({
    candidates,
    budgetTokens: availableBudget,
    enforceBudget,
    tokenCounter,
  });

  let fileContents = '<file_contents>\n';
  included.forEach((variant) => {
    fileContents += variant.content;
  });

  if (includeBinaryPaths && binaryEntries.length > 0) {
    fileContents += '<binary_files>\n';
    binaryEntries.forEach((entry) => {
      fileContents += `${entry}\n`;
    });
    fileContents += '</binary_files>\n\n';
  }

  fileContents += '</file_contents>\n';

  const sections: string[] = [];

  if (includeFileTree && selectedFolder) {
    const asciiTree = generateAsciiFileTree(sortedFiles, selectedFolder);
    const normalizedFolder = normalizePath(selectedFolder);
    sections.push(`<file_map>\n${normalizedFolder}\n${asciiTree}\n</file_map>\n`);
  }

  sections.push(fileContents);

  if (diffSection) {
    sections.push(diffSection);
  }

  const baseContent = sections.join('\n');
  const tokenCount = await tokenCounter(baseContent);

  return {
    content: baseContent,
    tokenCount,
  };
}

function sortSelectedFiles(
  files: FileData[],
  selectedFiles: string[],
  sortOrder: string
): FileData[] {
  const selectedSet = new Set(selectedFiles.map((path) => normalizePath(path)));
  const relevant = files.filter((file) => selectedSet.has(normalizePath(file.path)));

  const [sortKey, sortDir] = sortOrder.split('-');
  const direction = sortDir === 'asc' ? 1 : -1;

  return relevant.sort((a, b) => {
    let comparison = 0;
    if (sortKey === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortKey === 'tokens') {
      comparison = a.tokenCount - b.tokenCount;
    } else if (sortKey === 'size') {
      comparison = a.size - b.size;
    }
    return comparison * direction;
  });
}

function buildBinaryEntry(file: FileData): string {
  const normalizedPath = normalizePath(file.path);
  const fileType = getLanguageFromFilename(file.name);
  return `File: ${normalizedPath}\nThis is a file of the type: ${fileType.charAt(0).toUpperCase()}${fileType.slice(1)}`;
}

function buildFullVariants(file: FileData, language: string): CandidateVariant[] {
  const normalizedPath = normalizePath(file.path);
  const content = ensureTrailingNewline(file.content);
  const block = `File: ${normalizedPath}\n\`\`\`${language}\n${content}\`\`\`\n\n`;
  return [{ content: block, contextLines: Number.POSITIVE_INFINITY }];
}

interface ExcerptBuilderParams {
  file: FileData;
  language: string;
  hunks?: DiffHunk[];
  contextLines: number;
  joinThreshold: number;
}

function buildExcerptVariants(params: ExcerptBuilderParams): CandidateVariant[] {
  const { file, language, hunks, contextLines, joinThreshold } = params;
  const normalizedPath = normalizePath(file.path);
  const lines = file.content.split(/\r?\n/);
  const totalLines = lines.length;

  const contexts = buildContextSequence(contextLines);
  const variants: CandidateVariant[] = [];

  contexts.forEach((context) => {
    const ranges = createRangesForContext({
      hunks,
      contextLines: context,
      joinThreshold,
      totalLines,
    });

    if (!ranges.length) return;

    const snippet = ranges
      .map(({ start, end }) => {
        const segmentLines = lines.slice(start - 1, end);
        const header = RANGE_PREFIX(start, end);
        const body = segmentLines.join('\n');
        return body ? `${header}\n${body}` : header;
      })
      .join(`\n${ELLIPSIS_LINE}\n`);

    const content = `File: ${normalizedPath} (excerpt)\n\`\`\`${language}\n${ensureTrailingNewline(snippet)}\`\`\`\n\n`;
    variants.push({ content, contextLines: context });
  });

  return variants;
}

function buildContextSequence(initialContext: number): number[] {
  const unique = new Set<number>();
  const base = Math.max(0, Math.floor(initialContext));
  unique.add(base);
  if (base > 8) {
    unique.add(Math.max(4, Math.floor(base / 2)));
  } else if (base > 4) {
    unique.add(Math.floor(base / 2));
    unique.add(4);
  } else if (base > 0 && base !== 4) {
    unique.add(Math.max(1, Math.floor(base / 2)));
  }
  unique.add(0);

  return Array.from(unique).sort((a, b) => b - a);
}

interface RangeParams {
  hunks?: DiffHunk[];
  contextLines: number;
  joinThreshold: number;
  totalLines: number;
}

function createRangesForContext(params: RangeParams): LineRange[] {
  const { hunks, contextLines, joinThreshold, totalLines } = params;

  if (!hunks || hunks.length === 0) {
    return [{ start: 1, end: totalLines }];
  }

  const expanded = hunks.map(({ start, end }) => ({
    start: Math.max(1, start - contextLines),
    end: Math.min(totalLines, end + contextLines),
  }));

  expanded.sort((a, b) => a.start - b.start);

  const merged: LineRange[] = [];
  let current = { ...expanded[0] };

  for (let i = 1; i < expanded.length; i += 1) {
    const next = expanded[i];
    if (next.start <= current.end + joinThreshold) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

function relativeTo(basePath: string | null, targetPath: string): string | null {
  if (!basePath) return null;
  const normalizedBase = normalizePath(basePath).replace(/\/+$/, '');
  const normalizedTarget = normalizePath(targetPath);

  if (!normalizedTarget.startsWith(normalizedBase + '/')) {
    return null;
  }

  const relative = normalizedTarget.slice(normalizedBase.length + 1);
  return relative || null;
}

function resolveDiffHunks(
  diffMap: DiffMap,
  filePath: string,
  baseFolder: string | null
): DiffHunk[] | undefined {
  const normalized = normalizePath(filePath);

  const direct = diffMap.get(normalized);
  if (direct) {
    return direct;
  }

  const relative = relativeTo(baseFolder, normalized);
  if (relative) {
    const relativeEntry = diffMap.get(relative);
    if (relativeEntry) {
      return relativeEntry;
    }
  }

  const segments = normalized.split('/');
  if (segments.length > 1) {
    const tailTwo = segments.slice(-2).join('/');
    const tailEntry = diffMap.get(tailTwo);
    if (tailEntry) {
      return tailEntry;
    }
  }

  return diffMap.get(segments[segments.length - 1]);
}

interface SelectionParams {
  candidates: Candidate[];
  budgetTokens: number;
  enforceBudget?: boolean;
  tokenCounter: (text: string) => Promise<number>;
}

async function selectVariantsWithinBudget(params: SelectionParams): Promise<{
  included: IncludedVariant[];
  totalTokens: number;
}> {
  const { candidates, budgetTokens, enforceBudget = false, tokenCounter } = params;
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
  const included: IncludedVariant[] = [];

  const budgetActive = enforceBudget && Number.isFinite(budgetTokens);
  let remainingBudget = Math.max(budgetTokens, 0);

  for (const candidate of sorted) {
    let chosen: IncludedVariant | null = null;

    for (const variant of candidate.variants) {
      const tokens = await tokenCounter(variant.content);
      if (!budgetActive || tokens <= remainingBudget) {
        chosen = { content: variant.content, tokens };
        break;
      }
    }

    if (!chosen && candidate.isEssential) {
      // For essential content (diff excerpts), pick the smallest variant even if it exceeds the remaining budget.
      const lastVariant = candidate.variants[candidate.variants.length - 1];
      const tokens = await tokenCounter(lastVariant.content);
      chosen = { content: lastVariant.content, tokens };
    }

    if (!chosen) {
      continue;
    }

    included.push(chosen);
    if (budgetActive) {
      remainingBudget = Math.max(remainingBudget - chosen.tokens, 0);
    }
  }

  const totalTokens = included.reduce((sum, item) => sum + item.tokens, 0);
  return { included, totalTokens };
}

function ensureTrailingNewline(text: string): string {
  if (!text.endsWith('\n')) {
    return `${text}\n`;
  }
  return text;
}
