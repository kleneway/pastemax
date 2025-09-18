import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { GitChangedFile, GitCommitSummary } from '../types/GitTypes';
import { arePathsEqual, normalizePath } from '../utils/pathUtils';
import { RefreshCw, Plus, History, GitCommit as GitCommitIcon } from 'lucide-react';

interface ChangedFilesPanelProps {
  selectedFolder: string | null;
  changedFiles: GitChangedFile[];
  selectedFiles: string[];
  selectedDiffPaths: string[];
  gitChangesLoading: boolean;
  gitChangesError: string | null;
  onRefreshChanges: () => Promise<unknown> | void;
  onAddAll: () => void;
  onAddSingle: (filePath: string) => void;
  onAddSinceCommit: (commitHash: string) => void;
  gitCommitHistory: GitCommitSummary[];
  loadCommitHistory: (limit?: number) => Promise<unknown> | void;
  isCommitHistoryLoading: boolean;
  commitHistoryError: string | null;
}

const formatCommitLabel = (commit: GitCommitSummary) => {
  const shortHash = commit.hash.substring(0, 7);
  const date = commit.isoDate ? new Date(commit.isoDate) : commit.timestamp ? new Date(commit.timestamp * 1000) : null;
  const formattedDate = date ? `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}` : 'Unknown';
  const subject = commit.subject || '(no message)';
  const truncatedSubject = subject.length > 40 ? subject.substring(0, 37) + '...' : subject;
  return `${shortHash} • ${formattedDate} • ${truncatedSubject}`;
};

const ChangedFilesPanel = ({
  selectedFolder,
  changedFiles,
  selectedFiles,
  selectedDiffPaths,
  gitChangesLoading,
  gitChangesError,
  onRefreshChanges,
  onAddAll,
  onAddSingle,
  onAddSinceCommit,
  gitCommitHistory,
  loadCommitHistory,
  isCommitHistoryLoading,
  commitHistoryError,
}: ChangedFilesPanelProps) => {
  const [selectedCommit, setSelectedCommit] = useState('');
  const [filesForCommit, setFilesForCommit] = useState<GitChangedFile[]>([]);
  const [isLoadingCommitFiles, setIsLoadingCommitFiles] = useState(false);
  const lastFolderRef = useRef<string | null>(null);

  const normalizedFolder = selectedFolder ? normalizePath(selectedFolder) : null;

  const ensureInitialData = useCallback(() => {
    if (!normalizedFolder) return;
    if (lastFolderRef.current !== normalizedFolder) {
      lastFolderRef.current = normalizedFolder;
      onRefreshChanges?.();
      loadCommitHistory?.();
      setSelectedCommit('');
    }
  }, [normalizedFolder, onRefreshChanges, loadCommitHistory]);

  useEffect(() => {
    ensureInitialData();
  }, [ensureInitialData]);

  useEffect(() => {
    if (!selectedCommit) return;
    const stillExists = gitCommitHistory.some((commit) => commit.hash === selectedCommit);
    if (!stillExists) {
      setSelectedCommit('');
    }
  }, [gitCommitHistory, selectedCommit]);

  // Remove auto-select logic completely - always let user choose
  // This prevents confusion when commit history loads

  // Load files when commit is selected
  useEffect(() => {
    if (!selectedCommit || !normalizedFolder) {
      setFilesForCommit([]);
      return;
    }

    const loadFilesForCommit = async () => {
      setIsLoadingCommitFiles(true);
      try {
        if (!(window as any).electron?.ipcRenderer) {
          console.error('Electron IPC not available');
          setFilesForCommit([]);
          return;
        }

        const result = await (window as any).electron.ipcRenderer.invoke('get-files-since-commit', {
          folderPath: normalizedFolder,
          commit: selectedCommit,
          includeWorkingTree: true,  // Include uncommitted changes
        });

        console.log('Files for commit result:', result);

        if (result?.error) {
          console.error('Error loading files for commit:', result.error);
          setFilesForCommit([]);
          return;
        }

        if (result?.files && Array.isArray(result.files)) {
          const formattedFiles = result.files
            .filter((file: any) => file != null)
            .map((file: any) => {
              // Handle both string paths and object formats
              const isString = typeof file === 'string';
              const absolutePath = isString
                ? file
                : (file.absolutePath || file.path || '');
              const relativePath = isString
                ? file
                : (file.relativePath || file.path || '');

              // Skip invalid entries
              if (!absolutePath) return null;

              return {
                absolutePath,
                relativePath: relativePath || absolutePath,
                status: file.status || 'M',
                indexStatus: file.indexStatus,
                worktreeStatus: file.worktreeStatus,
                isUntracked: file.isUntracked || false,
              };
            })
            .filter((file: any) => file !== null);

          console.log('Formatted files:', formattedFiles);
          setFilesForCommit(formattedFiles);
        } else {
          console.log('No files in result:', result);
          setFilesForCommit([]);
        }
      } catch (error) {
        console.error('Error loading files for commit:', error);
        setFilesForCommit([]);
      } finally {
        setIsLoadingCommitFiles(false);
      }
    };

    loadFilesForCommit();
  }, [selectedCommit, normalizedFolder]);

  const relativeDisplay = useCallback(
    (absPath: string) => {
      if (!normalizedFolder) return absPath;
      const normalizedPath = normalizePath(absPath);
      return normalizedPath.startsWith(normalizedFolder + '/')
        ? normalizedPath.substring(normalizedFolder.length + 1)
        : normalizedPath;
    },
    [normalizedFolder]
  );

  const selectedDiffSet = useMemo(() => {
    return new Set(selectedDiffPaths.map((p) => normalizePath(p)));
  }, [selectedDiffPaths]);

  const displayEntries = useMemo(() => {
    // Use commit-specific files if a commit is selected, otherwise use current changed files
    const filesToDisplay = selectedCommit && !isLoadingCommitFiles ? filesForCommit : changedFiles;

    // If we're loading commit files, return empty to avoid showing stale data
    if (selectedCommit && isLoadingCommitFiles) {
      return [];
    }

    return filesToDisplay
      .filter((file) => file && file.absolutePath) // Filter out invalid entries
      .map((file) => {
        const absPath = normalizePath(file.absolutePath);
        const alreadySelected = selectedFiles.some((path) => arePathsEqual(path, absPath));
        const hasDiff = selectedDiffSet.has(absPath);

        // Compute status - prefer explicit status, then combine index and worktree
        let computedStatus = file.status;
        if (!computedStatus && (file.indexStatus || file.worktreeStatus)) {
          computedStatus = `${file.indexStatus || ' '}${file.worktreeStatus || ' '}`;
        }
        if (!computedStatus && file.isUntracked) {
          computedStatus = '??';
        }
        if (!computedStatus) {
          computedStatus = '--';
        }

        return {
          absPath,
          relativePath: file.relativePath || relativeDisplay(absPath),
          status: computedStatus,
          isUntracked: file.isUntracked || false,
          alreadySelected,
          hasDiff,
        };
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [changedFiles, filesForCommit, selectedCommit, selectedFiles, relativeDisplay, selectedDiffSet, isLoadingCommitFiles]);

  const changedCount = displayEntries.length;

  if (!selectedFolder) return null;

  const handleAddSinceCommit = () => {
    if (!selectedCommit) {
      console.warn('No commit selected for add since operation');
      return;
    }
    if (isLoadingCommitFiles) {
      console.warn('Still loading files for commit');
      return;
    }
    onAddSinceCommit(selectedCommit);
  };

  const handleRefreshCommits = () => {
    loadCommitHistory?.();
  };

  // Add all currently displayed files (either commit files or uncommitted changes)
  const handleAddAllDisplayed = () => {
    if (selectedCommit) {
      // When a commit is selected, add all files since that commit
      onAddSinceCommit(selectedCommit);
    } else {
      // When no commit selected, add all uncommitted changes
      onAddAll();
    }
  };

  return (
    <div className="changes-panel">
      <div className="changes-header">
        <div className="changes-title">
          {selectedCommit ? `All changes since commit (${changedCount})` : `Uncommitted changes (${changedCount})`}
        </div>
        <div className="changes-actions">
          <button
            className="text-button"
            onClick={() => onRefreshChanges?.()}
            title="Refresh changed files"
            disabled={gitChangesLoading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className="primary"
            onClick={handleAddAllDisplayed}
            title={selectedCommit ? "Add all files since selected commit" : "Add all uncommitted changes to selection"}
            disabled={gitChangesLoading || isLoadingCommitFiles || changedCount === 0}
          >
            Add All
          </button>
        </div>
      </div>
      <div className="changes-list">
        {(gitChangesLoading || isLoadingCommitFiles) && (
          <div className="changes-empty">
            {isLoadingCommitFiles ? 'Loading all changes since commit…' : 'Loading changed files…'}
          </div>
        )}
        {!gitChangesLoading && !isLoadingCommitFiles && gitChangesError && (
          <div className="changes-error">{gitChangesError}</div>
        )}
        {!gitChangesLoading && !isLoadingCommitFiles && !gitChangesError && changedCount === 0 && (
          <div className="changes-empty">
            {selectedCommit ? 'No files changed since selected commit.' : 'No uncommitted changes in this folder.'}
          </div>
        )}

        {!gitChangesLoading && !isLoadingCommitFiles && !gitChangesError && changedCount > 0 && (
          <ul>
            {displayEntries.map(({ absPath, relativePath, status, isUntracked, alreadySelected, hasDiff }) => (
              <li key={absPath} className="change-item">
                <div className="change-meta">
                  <span className={`change-status-badge ${isUntracked ? 'untracked' : ''}`}>
                    {status || (isUntracked ? '??' : '--')}
                  </span>
                  <span className="change-path">{relativePath}</span>
                  {hasDiff && <span className="change-badge">Diff</span>}
                </div>
                <span className="change-actions">
                  {alreadySelected ? (
                    <span className="change-added">Added</span>
                  ) : (
                    <button
                      className="text-button"
                      title="Add this file"
                      onClick={() => onAddSingle(absPath)}
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="changes-commit-controls">
        <div className="changes-commit-header">
          <span className="changes-commit-title">
            <GitCommitIcon size={14} /> Commit Range
          </span>
          <button
            className="text-button"
            onClick={handleRefreshCommits}
            title="Refresh commit list"
            disabled={isCommitHistoryLoading}
          >
            <History size={14} /> Refresh
          </button>
        </div>
        {isCommitHistoryLoading && <div className="changes-empty">Loading commit history…</div>}
        {!isCommitHistoryLoading && commitHistoryError && (
          <div className="changes-error">{commitHistoryError}</div>
        )}
        <div className="commit-selector">
          <select
            value={selectedCommit}
            onChange={(event) => setSelectedCommit(event.target.value)}
            disabled={gitCommitHistory.length === 0}
          >
            <option value="">Select a commit…</option>
            {gitCommitHistory.map((commit) => (
              <option key={commit.hash} value={commit.hash}>
                {formatCommitLabel(commit)}
              </option>
            ))}
          </select>
          <button
            className="primary"
            onClick={handleAddSinceCommit}
            disabled={!selectedCommit}
            title="Add files changed in the selected commit and everything after it"
          >
            Add Since
          </button>
        </div>
        <div className="commit-hint">Adds all files changed since the selected commit (including uncommitted changes).</div>
      </div>
    </div>
  );
};

export default ChangedFilesPanel;
