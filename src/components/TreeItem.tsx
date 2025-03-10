import React, {
  useRef,
  useEffect,
} from "react";
import { TreeItemProps, TreeNode } from "../types/FileTypes";
import { ChevronRight, File, Folder } from "lucide-react";
import { arePathsEqual } from "../utils/pathUtils";

const TreeItem = ({
  node,
  selectedFiles,
  toggleFileSelection,
  toggleFolderSelection,
  toggleExpanded,
}: TreeItemProps) => {
  const { id, name, path, type, level, isExpanded, fileData } = node;
  const checkboxRef = useRef<HTMLInputElement>(null);

  const isSelected = type === "file" && selectedFiles.some(selectedPath => 
    arePathsEqual(selectedPath, path)
  );

  // For directories, check if all children are selected
  const isDirectorySelected =
    type === "directory" && node.children
      ? node.children.every((child: TreeNode) => {
          if (child.type === "file") {
            return selectedFiles.some(selectedPath => 
              arePathsEqual(selectedPath, child.path)
            );
          } else if (child.type === "directory" && child.children) {
            // Check recursively if this directory's children are all selected
            return child.children.every((grandchild: TreeNode) => {
              return (
                grandchild.type === "file" &&
                selectedFiles.some(selectedPath => 
                  arePathsEqual(selectedPath, grandchild.path)
                )
              );
            });
          }
          return false;
        })
      : false;

  // Check if some but not all files in this directory are selected
  const isDirectoryPartiallySelected =
    type === "directory" && node.children
      ? node.children.some((child: TreeNode) => {
          if (child.type === "file") {
            return selectedFiles.some(selectedPath => 
              arePathsEqual(selectedPath, child.path)
            );
          } else if (child.type === "directory" && child.children) {
            return child.children.some((grandchild: TreeNode) => {
              return (
                grandchild.type === "file" &&
                selectedFiles.some(selectedPath => 
                  arePathsEqual(selectedPath, grandchild.path)
                )
              );
            });
          }
          return false;
        }) && !isDirectorySelected
      : false;

  // Update the indeterminate state manually whenever it changes
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isDirectoryPartiallySelected;
    }
  }, [isDirectoryPartiallySelected]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(id);
  };

  const handleItemClick = (e: React.MouseEvent) => {
    if (type === "directory") {
      toggleExpanded(id);
    } else if (type === "file" && !isDisabled) {
      toggleFileSelection(path);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (type === "file") {
      toggleFileSelection(path);
    } else if (type === "directory") {
      toggleFolderSelection(path, e.target.checked);
    }
  };

  // Check if file is binary or otherwise unselectable
  const isDisabled = fileData ? fileData.isBinary || fileData.isSkipped : false;

  // Check if the file is excluded by default (but still selectable)
  const isExcludedByDefault = fileData?.excludedByDefault || false;

  return (
    <div
      className={`tree-item ${isSelected ? "selected" : ""} ${
        isExcludedByDefault ? "excluded-by-default" : ""
      }`}
      style={{ marginLeft: `${level * 16}px` }}
      onClick={handleItemClick}
    >
      {type === "directory" && (
        <div
          className={`tree-item-toggle ${isExpanded ? "expanded" : ""}`}
          onClick={handleToggle}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
        >
          <ChevronRight size={16} />
        </div>
      )}

      {type === "file" && <div className="tree-item-indent"></div>}

      <input
        type="checkbox"
        className="tree-item-checkbox"
        checked={type === "file" ? isSelected : isDirectorySelected}
        ref={checkboxRef}
        onChange={handleCheckboxChange}
        disabled={isDisabled}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="tree-item-content">
        <div className="tree-item-icon">
          {type === "directory" ? <Folder size={16} /> : <File size={16} />}
        </div>

        <div className="tree-item-name">{name}</div>

        {fileData && fileData.tokenCount > 0 && (
          <span className="tree-item-tokens">
            (~{fileData.tokenCount.toLocaleString()})
          </span>
        )}

        {isDisabled && fileData && (
          <span className="tree-item-badge">
            {fileData.isBinary ? "Binary" : "Skipped"}
          </span>
        )}

        {!isDisabled && isExcludedByDefault && (
          <span className="tree-item-badge excluded">Excluded</span>
        )}
      </div>
    </div>
  );
};

export default TreeItem;
