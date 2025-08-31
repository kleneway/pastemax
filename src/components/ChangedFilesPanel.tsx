import { useEffect, useMemo, useState, useCallback } from 'react';
import { FileData } from '../types/FileTypes';
import { arePathsEqual, normalizePath } from '../utils/pathUtils';
import { RefreshCw, Plus } from 'lucide-react';

type ChangedFilesPanelProps = {
  selectedFolder: string | null;
  allFiles: FileData[];
  selectedFiles: string[];
  includeBinaryPaths: boolean;
  onAddAll: () => void;
  onAddSingle: (filePath: string) => void;
};

/**
 * Displays a list of Git-changed files within the selected folder and
 * allows quickly adding all or individual files to the selection.
 */
const ChangedFilesPanel = ({
  selectedFolder,
  allFiles,
  selectedFiles,
  includeBinaryPaths,
  onAddAll,
  onAddSingle,
}: ChangedFilesPanelProps) => {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changedAbsPaths, setChangedAbsPaths] = useState<string[]>([]);

  const eligibleMap = useMemo(() => {
    // Map changed abs paths to file info + eligibility under current filters
    return changedAbsPaths.map((absPath) => {
      const match = allFiles.find((f) => arePathsEqual(f.path, absPath));
      const eligible = !!(
        match &&
        !match.isSkipped &&
        !match.excludedByDefault &&
        (includeBinaryPaths || !match.isBinary)
      );
      const alreadySelected = selectedFiles.some((p) => arePathsEqual(p, absPath));
      return { absPath, file: match, eligible, alreadySelected };
    });
  }, [changedAbsPaths, allFiles, includeBinaryPaths, selectedFiles]);

  const relativeDisplay = useCallback(
    (absPath: string) => {
      if (!selectedFolder) return absPath;
      const a = normalizePath(absPath);
      const root = normalizePath(selectedFolder);
      return a.startsWith(root + '/') ? a.substring(root.length + 1) : a;
    },
    [selectedFolder]
  );

  const fetchChanges = useCallback(async () => {
    if (!selectedFolder || !isElectron) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await (window as any).electron.ipcRenderer.invoke('get-changed-files', {
        folderPath: selectedFolder,
      });
      if (!result || result.error) {
        setError(result?.error || 'Failed to get changed files');
        setChangedAbsPaths([]);
      } else {
        const files = Array.isArray(result.files) ? result.files : [];
        setChangedAbsPaths(files.map(normalizePath));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to get changed files');
      setChangedAbsPaths([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFolder, isElectron]);

  useEffect(() => {
    // Fetch whenever folder changes
    setChangedAbsPaths([]);
    if (selectedFolder && isElectron) fetchChanges();
  }, [selectedFolder, isElectron, fetchChanges]);

  const changedCount = changedAbsPaths.length;

  if (!selectedFolder) return null;

  return (
    <div className="changes-panel">
      <div className="changes-header">
        <div className="changes-title">Changes {changedCount > 0 ? `(${changedCount})` : ''}</div>
        <div className="changes-actions">
          <button
            className="text-button"
            onClick={fetchChanges}
            title="Refresh changed files"
            disabled={!isElectron || isLoading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className="primary"
            onClick={onAddAll}
            title="Add all changed files to selection"
            disabled={!isElectron || isLoading || changedCount === 0}
          >
            Add All
          </button>
        </div>
      </div>
      <div className="changes-list">
        {isLoading && <div className="changes-empty">Loading changed files…</div>}
        {!isLoading && error && <div className="changes-error">{error}</div>}
        {!isLoading && !error && changedCount === 0 && (
          <div className="changes-empty">No uncommitted changes in this folder.</div>
        )}

        {!isLoading && !error && changedCount > 0 && (
          <ul>
            {eligibleMap.map(({ absPath, eligible, alreadySelected }) => (
              <li key={absPath} className="change-item">
                <span className="change-path">{relativeDisplay(absPath)}</span>
                <span className="change-actions">
                  {alreadySelected ? (
                    <span className="change-added">Added</span>
                  ) : eligible ? (
                    <button
                      className="text-button"
                      title="Add this file"
                      onClick={() => onAddSingle(absPath)}
                    >
                      <Plus size={14} /> Add
                    </button>
                  ) : (
                    <span className="change-disabled" title="Excluded by filters">Excluded</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChangedFilesPanel;

