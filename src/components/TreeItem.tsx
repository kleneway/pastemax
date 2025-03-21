import React, { useRef, useEffect } from "react";
import type { MouseEvent, ChangeEvent } from "react";
import { TreeItemProps, TreeNode } from "../types/FileTypes";
import { ChevronRight, File, Folder } from "lucide-react";
import { arePathsEqual } from "../utils/pathUtils";

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
}: TreeItemProps) => {
  const { id, name, path, type, level, isExpanded, fileData } = node;
  const checkboxRef = useRef(null);

  // Check if this file is in the selected files list
  const isSelected =
    type === "file" &&
    selectedFiles.some((selectedPath) => arePathsEqual(selectedPath, path));

  /**
   * Checks if all selectable files in a directory are selected.
   * A file is considered "selectable" if it's not binary, skipped, or excluded.
   * Empty directories or those with only unselectable files count as "fully selected".
   */
  const areAllFilesInDirectorySelected = (node: TreeNode): boolean => {
    if (node.type === "file") {
      // Unselectable files don't affect the directory's selection state
      if (node.fileData && (node.fileData.isBinary || node.fileData.isSkipped || node.fileData.excludedByDefault)) {
        return true; // Consider these as "selected" for the "all files selected" check
      }
      return selectedFiles.some((selectedPath) =>
        arePathsEqual(selectedPath, node.path)
      );
    }

    if (node.type === "directory" && node.children && node.children.length > 0) {
      // Only consider files that can be selected
      const selectableChildren = node.children.filter(
        child => 
          !(child.type === "file" && 
            child.fileData && 
            (child.fileData.isBinary || child.fileData.isSkipped || child.fileData.excludedByDefault))
      );
      
      // If there are no selectable children, consider it "all selected"
      if (selectableChildren.length === 0) {
        return true;
      }
      
      // Check if all selectable children are selected
      return selectableChildren.every((child) =>
        areAllFilesInDirectorySelected(child)
      );
    }

    return false;
  };

  /**
   * Checks if any selectable file in a directory is selected.
   * Used to determine if a directory is partially selected.
   */
  const isAnyFileInDirectorySelected = (node: TreeNode): boolean => {
    if (node.type === "file") {
      // Skip binary, skipped or excluded files
      if (node.fileData && (node.fileData.isBinary || node.fileData.isSkipped || node.fileData.excludedByDefault)) {
        return false; // These files don't count for the "any files selected" check
      }
      return selectedFiles.some((selectedPath) =>
        arePathsEqual(selectedPath, node.path)
      );
    }

    if (node.type === "directory" && node.children && node.children.length > 0) {
      const selectableChildren = node.children.filter(
        child => 
          !(child.type === "file" && 
            child.fileData && 
            (child.fileData.isBinary || child.fileData.isSkipped || child.fileData.excludedByDefault))
      );
      
      // If there are no selectable children, consider it "none selected"
      if (selectableChildren.length === 0) {
        return false;
      }
      
      // Check if any selectable child is selected
      return selectableChildren.some((child) => 
        isAnyFileInDirectorySelected(child)
      );
    }

    return false;
  };

  // For directories, check if all children are selected
  const isDirectorySelected =
    type === "directory" && node.children && node.children.length > 0
      ? areAllFilesInDirectorySelected(node)
      : false;

  // Check if some but not all files in this directory are selected
  const isDirectoryPartiallySelected =
    type === "directory" && node.children && node.children.length > 0
      ? isAnyFileInDirectorySelected(node) && !isDirectorySelected
      : false;

  // Update the indeterminate state manually whenever it changes
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isDirectoryPartiallySelected;
    }
  }, [isDirectoryPartiallySelected]);

  // Event Handlers
  const handleToggle = (e: any) => {
    e.stopPropagation();
    toggleExpanded(id);
  };

  const handleItemClick = (e: any) => {
    if (type === "directory") {
      toggleExpanded(id);
    } else if (type === "file" && !isDisabled) {
      toggleFileSelection(path);
    }
  };

  const handleCheckboxChange = (e: any) => {
    e.stopPropagation();
    const isChecked = e.target.checked;
    
    console.log('Checkbox clicked:', { 
      type, 
      path, 
      isChecked,
      isDirectory: type === "directory",
      isFile: type === "file"
    });
    
    if (type === "file") {
      toggleFileSelection(path);
    } else if (type === "directory") {
      console.log('Calling toggleFolderSelection with:', path, isChecked);
      toggleFolderSelection(path, isChecked);
    }
  };

  // Check if file is binary, skipped, or excluded by default (unselectable)
  const isDisabled = fileData 
    ? fileData.isBinary || fileData.isSkipped || fileData.excludedByDefault 
    : false;

  return (
    <div
      className={`tree-item ${isSelected ? "selected" : ""} ${
        isDisabled ? "disabled-item" : ""
      }`}
      style={{ marginLeft: `${level * 16}px` }}
      onClick={handleItemClick}
    >
      {/* Expand/collapse arrow for directories */}
      {type === "directory" && (
        <div
          className={`tree-item-toggle ${isExpanded ? "expanded" : ""}`}
          onClick={handleToggle}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
        >
          <ChevronRight size={16} />
        </div>
      )}

      {/* Spacing for files to align with directories */}
      {type === "file" && <div className="tree-item-indent"></div>}

      {/* Selection checkbox */}
      <input
        type="checkbox"
        className="tree-item-checkbox"
        checked={type === "file" ? isSelected : isDirectorySelected}
        ref={checkboxRef}
        onChange={handleCheckboxChange}
        disabled={isDisabled}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Item content (icon, name, and metadata) */}
      <div className="tree-item-content">
        <div className="tree-item-icon">
          {type === "directory" ? <Folder size={16} /> : <File size={16} />}
        </div>

        <div className="tree-item-name">{name}</div>

        {/* Show token count for files that have it */}
        {fileData && fileData.tokenCount > 0 && (
          <span className="tree-item-tokens">
            (~{fileData.tokenCount.toLocaleString()})
          </span>
        )}

        {/* Show badge for unselectable files */}
        {fileData && isDisabled && (
          <span className="tree-item-badge">
            {fileData.isBinary ? "Binary" : 
             fileData.isSkipped ? "Skipped" : 
             "Excluded"}
          </span>
        )}
      </div>
    </div>
  );
};

export default TreeItem; 