export interface GitChangedFile {
  absolutePath: string;
  relativePath: string;
  status: string;
  indexStatus?: string;
  worktreeStatus?: string;
  isUntracked: boolean;
  oldRelativePath?: string;
}

export interface GitCommitSummary {
  hash: string;
  subject: string;
  timestamp: number;
  isoDate: string | null;
}

export interface GitDiffResult {
  diff: string;
  changedPaths: string[];
}
