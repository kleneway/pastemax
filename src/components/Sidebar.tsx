import React, { useState, useEffect } from "react";
import { SidebarProps, TreeNode } from "../types/FileTypes";
import SearchBar from "./SearchBar";
import TreeItem from "./TreeItem";

const Sidebar = ({
  selectedFolder,
  openFolder,
  allFiles,
  selectedFiles,
  toggleFileSelection,
  toggleFolderSelection,
  searchTerm,
  onSearchChange,
  selectAllFiles,
  deselectAllFiles,
  expandedNodes,
  toggleExpanded,
}: SidebarProps) => {
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [isTreeBuildingComplete, setIsTreeBuildingComplete] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // Min and max width constraints
  const MIN_SIDEBAR_WIDTH = 200;
  const MAX_SIDEBAR_WIDTH = 500;

  // Handle mouse down for resizing
  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Handle resize effect
  useEffect(() => {
    const handleResize = (e: globalThis.MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(newWidth);
        }
      }
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", handleResizeEnd);

    return () => {
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing]);

  // Build file tree structure from flat list of files
  useEffect(() => {
    if (allFiles.length === 0) {
      setFileTree([]);
      setIsTreeBuildingComplete(false);
      return;
    }

    const buildTree = () => {
      console.log("Building file tree from", allFiles.length, "files");
      setIsTreeBuildingComplete(false);

      try {
        // Create a structured representation using nested objects first
        const fileMap: Record<string, any> = {};

        // First pass: create directories and files
        allFiles.forEach((file) => {
          if (!file.path) return;

          const relativePath =
            selectedFolder && file.path.startsWith(selectedFolder)
              ? file.path
                  .substring(selectedFolder.length)
                  .replace(/^\/|^\\/, "")
              : file.path;

          const parts = relativePath.split(/[/\\]/);
          let currentPath = "";
          let current = fileMap;

          // Build the path in the tree
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            // Use the original file.path for files to avoid path duplication
            const fullPath = i === parts.length - 1 
              ? file.path // For files, use the original path
              : (selectedFolder 
                  ? `${selectedFolder}/${currentPath}` 
                  : currentPath); // For directories

            if (i === parts.length - 1) {
              // This is a file
              current[part] = {
                id: `node-${fullPath}`,
                name: part,
                path: file.path, // Use the original file path
                type: "file",
                level: i,
                fileData: file,
              };
            } else {
              // This is a directory
              if (!current[part]) {
                current[part] = {
                  id: `node-${fullPath}`,
                  name: part,
                  path: fullPath,
                  type: "directory",
                  level: i,
                  children: {},
                };
              }
              current = current[part].children;
            }
          }
        });

        // Convert the nested object structure to the TreeNode array format
        const convertToTreeNodes = (
          node: Record<string, any>,
          level = 0,
        ): TreeNode[] => {
          return Object.keys(node).map((key) => {
            const item = node[key];

            if (item.type === "file") {
              return item as TreeNode;
            } else {
              const children = convertToTreeNodes(item.children, level + 1);
              const isExpanded =
                expandedNodes[item.id] !== undefined
                  ? expandedNodes[item.id]
                  : true; // Default to expanded if not in state

              return {
                ...item,
                children: children.sort((a, b) => {
                  // Sort directories first
                  if (a.type === "directory" && b.type === "file") return -1;
                  if (a.type === "file" && b.type === "directory") return 1;

                  // Sort files by token count (largest first)
                  if (a.type === "file" && b.type === "file") {
                    const aTokens = a.fileData?.tokenCount || 0;
                    const bTokens = b.fileData?.tokenCount || 0;
                    return bTokens - aTokens;
                  }

                  // Default to alphabetical
                  return a.name.localeCompare(b.name);
                }),
                isExpanded,
              };
            }
          });
        };

        // Convert to proper tree structure
        const treeRoots = convertToTreeNodes(fileMap);

        // Sort the top level (directories first, then by name)
        const sortedTree = treeRoots.sort((a, b) => {
          if (a.type === "directory" && b.type === "file") return -1;
          if (a.type === "file" && b.type === "directory") return 1;

          // Sort files by token count (largest first)
          if (a.type === "file" && b.type === "file") {
            const aTokens = a.fileData?.tokenCount || 0;
            const bTokens = b.fileData?.tokenCount || 0;
            return bTokens - aTokens;
          }

          return a.name.localeCompare(b.name);
        });

        setFileTree(sortedTree);
        setIsTreeBuildingComplete(true);
      } catch (err) {
        console.error("Error building file tree:", err);
        setFileTree([]);
        setIsTreeBuildingComplete(true);
      }
    };

    // Use a timeout to not block UI
    const buildTreeTimeoutId = setTimeout(buildTree, 0);
    return () => clearTimeout(buildTreeTimeoutId);
  }, [allFiles, selectedFolder, expandedNodes]);

  // Apply expanded state as a separate operation when expandedNodes change
  useEffect(() => {
    if (fileTree.length === 0) return;

    // Function to apply expanded state to nodes
    const applyExpandedState = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((node: TreeNode): TreeNode => {
        if (node.type === "directory") {
          const isExpanded =
            expandedNodes[node.id] !== undefined
              ? expandedNodes[node.id]
              : true; // Default to expanded if not in state

          return {
            ...node,
            isExpanded,
            children: node.children ? applyExpandedState(node.children) : [],
          };
        }
        return node;
      });
    };

    setFileTree((prevTree: TreeNode[]) => applyExpandedState(prevTree));
  }, [expandedNodes]);

  // Flatten the tree for rendering with proper indentation
  const flattenTree = (nodes: TreeNode[]): TreeNode[] => {
    let result: TreeNode[] = [];

    nodes.forEach((node) => {
      // Add the current node
      result.push(node);

      // If it's a directory and it's expanded, add its children
      if (node.type === "directory" && node.isExpanded && node.children) {
        result = [...result, ...flattenTree(node.children)];
      }
    });

    return result;
  };

  // Filter the tree based on search term
  const filterTree = (nodes: TreeNode[], term: string): TreeNode[] => {
    if (!term) return nodes;

    const lowerTerm = term.toLowerCase();

    // Function to check if a node or any of its children match the search
    const nodeMatches = (node: TreeNode): boolean => {
      // Check if the node name matches
      if (node.name.toLowerCase().includes(lowerTerm)) return true;

      // If it's a file, we're done
      if (node.type === "file") return false;

      // For directories, check if any children match
      if (node.children) {
        return node.children.some(nodeMatches);
      }

      return false;
    };

    // Filter the nodes
    return nodes.filter(nodeMatches).map((node) => {
      // If it's a directory, also filter its children
      if (node.type === "directory" && node.children) {
        return {
          ...node,
          children: filterTree(node.children, term),
          isExpanded: true, // Auto-expand directories when searching
        };
      }
      return node;
    });
  };

  // The final tree to render, filtered and flattened
  const visibleTree = flattenTree(filterTree(fileTree, searchTerm));

  return (
    <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
      <div className="sidebar-header">
        <div className="sidebar-title">Files</div>
        <div className="sidebar-folder-path">{selectedFolder}</div>
      </div>

      <div className="sidebar-search">
        <SearchBar
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          placeholder="Search files..."
        />
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-action-btn" onClick={selectAllFiles}>
          Select All
        </button>
        <button className="sidebar-action-btn" onClick={deselectAllFiles}>
          Deselect All
        </button>
      </div>

      {allFiles.length > 0 ? (
        isTreeBuildingComplete ? (
          <div className="file-tree">
            {visibleTree.length > 0 ? (
              visibleTree.map((node) => (
                <TreeItem
                  key={node.id}
                  node={node}
                  selectedFiles={selectedFiles}
                  toggleFileSelection={toggleFileSelection}
                  toggleFolderSelection={toggleFolderSelection}
                  toggleExpanded={toggleExpanded}
                />
              ))
            ) : (
              <div className="tree-empty">No files match your search.</div>
            )}
          </div>
        ) : (
          <div className="tree-loading">
            <div className="spinner"></div>
            <span>Building file tree...</span>
          </div>
        )
      ) : (
        <div className="tree-empty">No files found in this folder.</div>
      )}

      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
        title="Drag to resize sidebar"
      ></div>
    </div>
  );
};

export default Sidebar;
