import { useState, useEffect, useCallback, useMemo } from 'react';
import { SidebarProps, TreeNode } from '../types/FileTypes';
import SearchBar from './SearchBar';
import TreeItem from './TreeItem';
import TaskTypeSelector from './TaskTypeSelector';
import { ListChecks, ListX, FolderMinus, FolderPlus } from 'lucide-react';

/**
 * Import path utilities for handling file paths across different operating systems.
 * While not all utilities are used directly, they're kept for consistency and future use.
 */
import { normalizePath, join, isSubPath } from '../utils/pathUtils';

/**
 * The Sidebar component displays a tree view of files and folders, allowing users to:
 * - Navigate through the file structure
 * - Select/deselect files and folders
 * - Search for specific files
 * - Resize the sidebar width
 */
const Sidebar = ({
  selectedFolder,
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
  includeBinaryPaths,
  selectedTaskType,
  onTaskTypeChange,
  onManageCustomTypes,
  collapseAllFolders,
  expandAllFolders,
  processingFiles,
}: Omit<SidebarProps, 'openFolder'>) => {
  // State for managing the file tree and UI
  const [fileTree, setFileTree] = useState(() => [] as TreeNode[]);
  const [isTreeBuildingComplete, setIsTreeBuildingComplete] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // Sidebar width constraints for a good UX
  const MIN_SIDEBAR_WIDTH = 200;
  const MAX_SIDEBAR_WIDTH = 500;

  // Handle mouse down for resizing - memoize the handler
  const handleResizeStart = useCallback((e: any) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle resize effect - optimized with requestAnimationFrame and passive listeners
  useEffect(() => {
    let animationFrameId: number;

    const handleResize = (e: MouseEvent) => {
      if (!isResizing) return;

      // Use requestAnimationFrame for smoother updates
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(e.clientX, MAX_SIDEBAR_WIDTH));
        setSidebarWidth(newWidth);
      });
    };

    const handleResizeEnd = () => {
      cancelAnimationFrame(animationFrameId);
      setIsResizing(false);
    };

    // Use passive event listeners for better performance
    document.addEventListener('mousemove', handleResize, { passive: true });
    document.addEventListener('mouseup', handleResizeEnd, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
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
      console.log('Building file tree from', allFiles.length, 'files');
      setIsTreeBuildingComplete(false);

      try {
        // Create a structured representation using nested objects first
        const fileMap: Record<string, any> = {};

        // First pass: create directories and files
        allFiles.forEach((file) => {
          if (!file.path) return;

          // Normalize both the selectedFolder and file.path
          const normalizedSelectedFolder = selectedFolder ? normalizePath(selectedFolder) : '';
          const normalizedFilePath = normalizePath(file.path);

          // Get the relative path by removing the selectedFolder prefix if it exists
          const relativePath =
            normalizedSelectedFolder && isSubPath(normalizedSelectedFolder, normalizedFilePath)
              ? normalizedFilePath.substring(normalizedSelectedFolder.length + 1) // +1 for the trailing slash
              : normalizedFilePath;

          const parts = relativePath.split('/');
          let currentPath = '';
          let current = fileMap;

          // Build the path in the tree
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            // Build the current path segment
            currentPath = currentPath ? join(currentPath, part) : part;

            // For directory paths, prepend selectedFolder only for the full path
            const fullPath = normalizedSelectedFolder
              ? join(normalizedSelectedFolder, currentPath)
              : currentPath;

            if (i === parts.length - 1) {
              // This is a file
              current[part] = {
                id: `node-${file.path}`,
                name: part,
                path: file.path, // Keep the original file path
                type: 'file',
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
                  type: 'directory',
                  level: i,
                  children: {},
                };
              }
              // Safety check - ensure children exists
              if (!current[part].children) {
                current[part].children = {};
              }
              current = current[part].children;
            }
          }
        });

        // Function to check if a directory contains binary files
        const hasBinaryFiles = (files: TreeNode[]): boolean => {
          return files.some((node) => {
            if (node.type === 'file') {
              return node.fileData?.isBinary || false;
            }
            return node.children ? hasBinaryFiles(node.children) : false;
          });
        };

        // Convert nested object structure to TreeNode array format
        const convertToTreeNodes = (node: Record<string, any>, level = 0): TreeNode[] => {
          return Object.keys(node).map((key) => {
            const item = node[key];
            if (item.type === 'file') {
              return item as TreeNode;
            } else {
              const children = convertToTreeNodes(item.children, level + 1);
              const isExpanded = !!expandedNodes[item.id];

              // Check if this directory contains any binary files
              const hasBinaries = hasBinaryFiles(children);

              return {
                ...item,
                children: children.sort((a, b) => {
                  if (a.type === 'directory' && b.type === 'file') return -1;
                  if (a.type === 'file' && b.type === 'directory') return 1;
                  if (a.type === 'file' && b.type === 'file') {
                    const aTokens = a.fileData?.tokenCount || 0;
                    const bTokens = b.fileData?.tokenCount || 0;
                    return bTokens - aTokens;
                  }
                  return a.name.localeCompare(b.name);
                }),
                isExpanded,
                hasBinaries,
              };
            }
          });
        };

        // Convert to proper tree structure and sort the top level
        const treeRoots = convertToTreeNodes(fileMap);
        const sortedTree = treeRoots.sort((a, b) => {
          if (a.type === 'directory' && b.type === 'file') return -1;
          if (a.type === 'file' && b.type === 'directory') return 1;

          // Sort files by token count (largest first)
          if (a.type === 'file' && b.type === 'file') {
            const aTokens = a.fileData?.tokenCount || 0;
            const bTokens = b.fileData?.tokenCount || 0;
            return bTokens - aTokens;
          }

          return a.name.localeCompare(b.name);
        });

        setFileTree(sortedTree);
        setIsTreeBuildingComplete(true);
      } catch (err) {
        console.error('Error building file tree:', err);
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
        if (node.type === 'directory') {
          const isExpanded = !!expandedNodes[node.id];

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
  }, [expandedNodes, fileTree.length]);

  // Memoize the flattenTree function to avoid unnecessary recalculations
  const flattenTree = useCallback((nodes: TreeNode[]): TreeNode[] => {
    let result: TreeNode[] = [];

    nodes.forEach((node) => {
      // Add the current node
      result.push(node);

      // If it's a directory and it's expanded, add its children
      if (node.type === 'directory' && node.isExpanded && node.children) {
        result = [...result, ...flattenTree(node.children)];
      }
    });

    return result;
  }, []);

  // Memoize the filterTree function to avoid unnecessary recalculations
  const filterTree = useCallback((nodes: TreeNode[], term: string): TreeNode[] => {
    if (!term) return nodes;

    const lowerTerm = term.toLowerCase();

    // Function to check if a node or any of its children match the search
    const nodeMatches = (node: TreeNode): boolean => {
      // Check if the node name matches
      if (node.name.toLowerCase().includes(lowerTerm)) return true;

      // If it's a file, we're done
      if (node.type === 'file') return false;

      // For directories, check if any children match
      if (node.children) {
        return node.children.some(nodeMatches);
      }

      return false;
    };

    // Filter the nodes
    return nodes.filter(nodeMatches).map((node) => {
      // If it's a directory, also filter its children
      if (node.type === 'directory' && node.children) {
        return {
          ...node,
          children: filterTree(node.children, term),
          isExpanded: true, // Auto-expand directories when searching
        };
      }
      return node;
    });
  }, []);

  // Memoize the filtered tree to avoid unnecessary recalculations
  const filteredTree = useMemo(
    () => filterTree(fileTree, searchTerm),
    [fileTree, searchTerm, filterTree]
  );

  // Memoize the flattened tree to avoid unnecessary recalculations
  const visibleTree = useMemo(() => flattenTree(filteredTree), [filteredTree, flattenTree]);

  // Memoize the rendered tree items to avoid unnecessary re-renders
  const renderedTreeItems = useMemo(() => {
    if (visibleTree.length === 0) {
      return <div className="tree-empty">No files match your search.</div>;
    }

    return visibleTree.map((node: TreeNode) => (
      <TreeItem
        key={node.id}
        node={node}
        selectedFiles={selectedFiles}
        toggleFileSelection={toggleFileSelection}
        toggleFolderSelection={toggleFolderSelection}
        toggleExpanded={toggleExpanded}
        includeBinaryPaths={includeBinaryPaths}
        processingFiles={processingFiles}
      />
    ));
  }, [visibleTree, selectedFiles, toggleFileSelection, toggleFolderSelection, toggleExpanded, processingFiles]);

  return (
    <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
      {/* Task Type Selector */}
      {onTaskTypeChange && (
        <TaskTypeSelector
          selectedTaskType={selectedTaskType || ''}
          onTaskTypeChange={onTaskTypeChange}
          onManageCustomTypes={onManageCustomTypes}
        />
      )}

      <div className="sidebar-header">
        <div className="sidebar-title">Files</div>
      </div>

      <div className="sidebar-search">
        <SearchBar
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          placeholder="Search files..."
        />
      </div>

      <div className="sidebar-actions">
        <button
          className="sidebar-action-btn"
          title="Select all files and folders"
          onClick={selectAllFiles}
          aria-label="Select all files and folders"
          type="button"
        >
          <ListChecks size={18} />
        </button>
        <button
          className="sidebar-action-btn"
          title="Deselect all files and folders"
          onClick={deselectAllFiles}
          aria-label="Deselect all files and folders"
          type="button"
        >
          <ListX size={18} />
        </button>
        <button
          className="sidebar-action-btn"
          title="Collapse all folders"
          onClick={collapseAllFolders}
          aria-label="Collapse all folders"
          type="button"
        >
          <FolderMinus size={18} />
        </button>
        <button
          className="sidebar-action-btn"
          title="Expand all folders"
          onClick={expandAllFolders}
          aria-label="Expand all folders"
          type="button"
        >
          <FolderPlus size={18} />
        </button>
      </div>

      {allFiles.length > 0 ? (
        isTreeBuildingComplete ? (
          <div className="file-tree">{renderedTreeItems}</div>
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
