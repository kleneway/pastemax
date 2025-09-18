import type { GitChangedFile, GitCommitSummary } from './GitTypes';

export type IgnoreMode = 'automatic' | 'global';
// Hot reload occurs when mode changes.

export interface FileData {
  name: string;
  path: string;
  content: string;
  tokenCount: number;
  size: number;
  isBinary: boolean;
  isSkipped: boolean;
  relativePath?: string;
  error?: string;
  fileType?: string;
  excludedByDefault?: boolean;
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  isExpanded?: boolean;
  level: number;
  fileData?: FileData;
  hasBinaries?: boolean;
}

export interface SidebarProps {
  selectedFolder: string | null;
  openFolder: () => void;
  allFiles: FileData[];
  selectedFiles: string[];
  toggleFileSelection: (filePath: string) => void;
  toggleFolderSelection: (folderPath: string, isSelected: boolean) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;
  selectChangedFiles: () => void;
  gitChangedFiles: GitChangedFile[];
  gitChangesLoading: boolean;
  gitChangesError: string | null;
  onRefreshGitChanges: () => Promise<unknown> | void;
  onAddChangedFilesSinceCommit: (commitHash: string) => void;
  gitCommitHistory: GitCommitSummary[];
  loadCommitHistory: (limit?: number) => Promise<unknown> | void;
  isCommitHistoryLoading: boolean;
  commitHistoryError: string | null;
  selectedDiffPaths: string[];
  expandedNodes: Record<string, boolean>;
  toggleExpanded: (nodeId: string) => void;
  includeBinaryPaths: boolean;
  selectedTaskType?: string;
  onTaskTypeChange?: (taskType: string) => void;
  onManageCustomTypes?: () => void;
  currentWorkspaceName?: string | null;
  collapseAllFolders: () => void;
  expandAllFolders: () => void;
}

export interface FileListProps {
  files: FileData[];
  selectedFiles: string[];
  toggleFileSelection: (filePath: string) => void;
}

export interface FileCardProps {
  file: FileData;
  isSelected: boolean;
  toggleSelection: (filePath: string) => void;
}

export interface TreeItemProps {
  node: TreeNode;
  selectedFiles: string[];
  toggleFileSelection: (filePath: string) => void;
  toggleFolderSelection: (folderPath: string, isSelected: boolean) => void;
  toggleExpanded: (nodeId: string) => void;
  includeBinaryPaths: boolean;
}

export interface SortOption {
  value: string;
  label: string;
}

export interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export interface CopyButtonProps {
  text: string;
  className?: string;
  children?: JSX.Element | string;
}
