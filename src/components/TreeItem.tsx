import { useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { TreeItemProps, TreeNode, FileData } from '../types/FileTypes';
import { ChevronRight, File, Folder, Loader } from 'lucide-react';
import { arePathsEqual } from '../utils/pathUtils';

/**
 * Helper function to determine if a file should be excluded from selection
 * based on its properties and the includeBinaryPaths setting
 */
const isFileExcluded = (fileData: any, includeBinaryPaths: boolean): boolean => {
  if (!fileData) return false;

  return (
    fileData.isSkipped || fileData.excludedByDefault || (fileData.isBinary && !includeBinaryPaths)
  );
};

/**
 * TreeItem represents a single item (file or folder) in the file tree.
 * It handles:
 * - File/folder selection with checkboxes
 * - Folder expansion/collapse
 * - Visual indicators for selection state
 * - Special cases for binary/skipped/excluded files
 */
const TreeItem = ({
  node,
  selectedFiles,
  toggleFileSelection,
  toggleFolderSelection,
  toggleExpanded,
  includeBinaryPaths,
  processingFiles,
}: TreeItemProps) => {
  const { id, name, path, type, level, isExpanded, fileData } = node;
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  // Calculate total tokens for a folder by summing all child files
  const calculateFolderTokens = useCallback((folderNode: TreeNode): number => {
    if (!folderNode.children) return 0;
    
    let totalTokens = 0;
    
    const traverseChildren = (children: TreeNode[]) => {
      children.forEach(child => {
        if (child.type === 'file' && child.fileData && child.fileData.tokenCount > 0) {
          totalTokens += child.fileData.tokenCount;
        } else if (child.type === 'directory' && child.children) {
          traverseChildren(child.children);
        }
      });
    };
    
    traverseChildren(folderNode.children);
    return totalTokens;
  }, []);

  // Calculate folder tokens with estimate information
  const calculateFolderTokensWithEstimates = useCallback((folderNode: TreeNode): { totalTokens: number; hasEstimates: boolean } => {
    if (!folderNode.children) return { totalTokens: 0, hasEstimates: false };
    
    let totalTokens = 0;
    let hasEstimates = false;
    
    const traverseChildren = (children: TreeNode[]) => {
      children.forEach(child => {
        if (child.type === 'file' && child.fileData && child.fileData.tokenCount > 0) {
          totalTokens += child.fileData.tokenCount;
          if (child.fileData.isTokenEstimate) {
            hasEstimates = true;
          }
        } else if (child.type === 'directory' && child.children) {
          traverseChildren(child.children);
        }
      });
    };
    
    traverseChildren(folderNode.children);
    return { totalTokens, hasEstimates };
  }, []);

  // Check if this file is in the selected files list - memoize this calculation
  const isSelected = useMemo(
    () =>
      type === 'file' && selectedFiles.some((selectedPath) => arePathsEqual(selectedPath, path)),
    [type, selectedFiles, path]
  );

  /**
   * Checks if all selectable files in a directory are selected.
   * A file is considered "selectable" if it's not skipped, or excluded.
   * Empty directories or those with only unselectable files count as "fully selected".
   */
  const areAllFilesInDirectorySelected = useCallback(
    (node: TreeNode): boolean => {
      if (node.type === 'file') {
        // Unselectable files don't affect the directory's selection state
        if (node.fileData && isFileExcluded(node.fileData, includeBinaryPaths)) {
          return true; // Consider these as "selected" for the "all files selected" check
        }
        return selectedFiles.some((selectedPath) => arePathsEqual(selectedPath, node.path));
      }

      if (node.type === 'directory' && node.children && node.children.length > 0) {
        // Only consider files that can be selected
        const selectableChildren = node.children.filter(
          (child) =>
            !(
              child.type === 'file' &&
              child.fileData &&
              isFileExcluded(child.fileData, includeBinaryPaths)
            )
        );

        // If there are no selectable children, consider it "all selected"
        if (selectableChildren.length === 0) {
          return true;
        }

        // Check if all selectable children are selected
        return selectableChildren.every((child) => areAllFilesInDirectorySelected(child));
      }

      return false;
    },
    [selectedFiles, includeBinaryPaths]
  );

  /**
   * Checks if any selectable file in a directory is selected.
   * Used to determine if a directory is partially selected.
   */
  const isAnyFileInDirectorySelected = useCallback(
    (node: TreeNode): boolean => {
      if (node.type === 'file') {
        // Skip skipped or excluded files
        if (node.fileData && isFileExcluded(node.fileData, includeBinaryPaths)) {
          return false; // These files don't count for the "any files selected" check
        }
        return selectedFiles.some((selectedPath) => arePathsEqual(selectedPath, node.path));
      }

      if (node.type === 'directory' && node.children && node.children.length > 0) {
        const selectableChildren = node.children.filter(
          (child) =>
            !(
              child.type === 'file' &&
              child.fileData &&
              isFileExcluded(child.fileData, includeBinaryPaths)
            )
        );

        // If there are no selectable children, consider it "none selected"
        if (selectableChildren.length === 0) {
          return false;
        }

        // Check if any selectable child is selected
        return selectableChildren.some((child) => isAnyFileInDirectorySelected(child));
      }

      return false;
    },
    [selectedFiles, includeBinaryPaths]
  );

  // For directories, check if all children are selected - memoize these calculations
  const isDirectorySelected = useMemo(
    () =>
      type === 'directory' && node.children && node.children.length > 0
        ? (function () {
            // Check if folder is disabled due to containing only unselectable files and includeBinaryPaths is OFF
            const isFolderDisabledDueToUnselectableFiles =
              node.type === 'directory' &&
              node.children &&
              node.children.length > 0 &&
              node.children.every((child) => {
                if (
                  child.type === 'file' &&
                  child.fileData &&
                  isFileExcluded(child.fileData, includeBinaryPaths)
                ) {
                  return true;
                }
                return false;
              }) &&
              !includeBinaryPaths; // ensure includeBinaryPaths is OFF
            // If folder is disabled due to unselectable files, force checked to false
            if (isFolderDisabledDueToUnselectableFiles) {
              return false;
            }
            // Otherwise, proceed with existing logic
            return areAllFilesInDirectorySelected(node);
          })()
        : false,
    [type, node, areAllFilesInDirectorySelected, includeBinaryPaths]
  );

  // Check if some but not all files in this directory are selected - memoize this calculation
  const isDirectoryPartiallySelected = useMemo(
    () =>
      type === 'directory' && node.children && node.children.length > 0
        ? isAnyFileInDirectorySelected(node) && !isDirectorySelected
        : false,
    [type, node, isAnyFileInDirectorySelected, isDirectorySelected]
  );

  // Update the indeterminate state manually whenever it changes
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isDirectoryPartiallySelected;
    }
  }, [isDirectoryPartiallySelected]);

  // Check if checkbox should be disabled (file is skipped or excluded by default) - memoize this
  const isCheckboxDisabled = useMemo(() => {
    return fileData ? isFileExcluded(fileData, includeBinaryPaths) : false;
  }, [fileData, includeBinaryPaths]);

  // Check if this file is currently being processed for tokens
  const isProcessing = useMemo(() => {
    return processingFiles ? processingFiles.has(path) : false;
  }, [processingFiles, path]);

  // Event Handlers - memoize them to prevent recreating on each render
  const handleToggle = useCallback(
    (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      toggleExpanded(id);
    },
    [toggleExpanded, id]
  );

  const handleItemClick = useCallback(() => {
    // Only handle file clicks, directories should only be expanded via the arrow
    if (type === 'file' && !isCheckboxDisabled) {
      toggleFileSelection(path);
    }
  }, [type, path, toggleFileSelection, isCheckboxDisabled]);

  const handleCheckboxChange = useCallback(
    (e: any) => {
      e.stopPropagation();

      if (isCheckboxDisabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const isChecked = e.target.checked;

      if (type === 'file') {
        toggleFileSelection(path);
      } else if (type === 'directory') {
        toggleFolderSelection(path, isChecked);
      }
    },
    [type, path, toggleFileSelection, toggleFolderSelection, isCheckboxDisabled]
  );

  return (
    <div
      className={`tree-item ${isSelected ? 'selected' : ''} ${isCheckboxDisabled ? 'disabled-item' : ''}`}
      style={{ marginLeft: `${level * 16}px` }}
      onClick={handleItemClick}
    >
      {/* Expand/collapse arrow for directories */}
      {type === 'directory' && (
        <div
          className={`tree-item-toggle ${isExpanded ? 'expanded' : ''}`}
          onClick={handleToggle}
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        >
          <ChevronRight size={16} />
        </div>
      )}

      {/* Spacing for files to align with directories */}
      {type === 'file' && <div className="tree-item-indent"></div>}

      {/* Selection checkbox */}
      <input
        type="checkbox"
        className="tree-item-checkbox"
        checked={type === 'file' ? isSelected : isDirectorySelected}
        ref={checkboxRef}
        onChange={handleCheckboxChange}
        disabled={isCheckboxDisabled}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Item content (icon, name, and metadata) */}
      <div className="tree-item-content">
        <div className="tree-item-icon">
          {type === 'directory' ? <Folder size={16} /> : <File size={16} />}
        </div>

        <div className="tree-item-name">{name}</div>

        {/* Show loading indicator for files being processed */}
        {isProcessing && type === 'file' && (
          <span className="tree-item-processing" title="Processing tokens...">
            <Loader size={14} className="tree-item-spinner" />
          </span>
        )}

        {/* Show token count for files that have it */}
        {!isProcessing && fileData && fileData.tokenCount > 0 && (
          <span className="tree-item-tokens">
            ({fileData.isTokenEstimate ? '~' : ''}{fileData.tokenCount.toLocaleString()}
            {fileData.isTokenEstimate && <span className="estimate-badge-small" title="Estimated tokens">est</span>})
          </span>
        )}
        
        {/* Show folder token totals */}
        {type === 'directory' && node.children && (() => {
          const { totalTokens, hasEstimates } = calculateFolderTokensWithEstimates(node);
          if (totalTokens > 0) {
            return (
              <span className="tree-item-tokens">
                ({hasEstimates ? '~' : ''}{totalTokens.toLocaleString()}
                {hasEstimates && <span className="estimate-badge-small" title="Estimated tokens">est</span>} tokens)
              </span>
            );
          }
          return null;
        })()}

        {/* Show badges for files and folders */}
        {type === 'file' && fileData && (
          <span
            className={`tree-item-badge ${
              fileData.isBinary && !isCheckboxDisabled ? 'tree-item-badge-binary-file' : ''
            }`}
          >
            {fileData.isBinary && !isCheckboxDisabled
              ? 'Binary'
              : isCheckboxDisabled
                ? fileData.isSkipped
                  ? 'Skipped'
                  : 'Excluded'
                : ''}
          </span>
        )}
        {type === 'directory' && node.hasBinaries && (
          <span className="tree-item-badge tree-item-badge-folder">Has Binary Files</span>
        )}
      </div>
    </div>
  );
};

// Wrap the component with React.memo to prevent unnecessary re-renders
export default memo(TreeItem);