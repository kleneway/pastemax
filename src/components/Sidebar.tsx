import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SidebarProps, TreeNode, FileData } from '../types/FileTypes';
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
}: Omit<SidebarProps, 'openFolder'>) => {
  // State for managing the file tree and UI
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [isTreeBuildingComplete, setIsTreeBuildingComplete] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);

  // Sidebar width constraints for a good UX
  const MIN_SIDEBAR_WIDTH = 200;
  const MAX_SIDEBAR_WIDTH = 500;

  // Constants for better maintainability
  const TREE_BUILD_DELAY = 0; // ms delay for tree building

  // Refs for optimization
  const treeBuildTimeoutRef = useRef<NodeJS.Timeout>();
  const animationFrameRef = useRef<number>();
  const prevFilesRef = useRef<FileData[]>([]);
  const prevExpandedNodesRef = useRef<Record<string, boolean>>({});

  // Handle mouse down for resizing - memoize the handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle resize effect - optimized with requestAnimationFrame and passive listeners
  useEffect(() => {
    if (!isResizing) return;

    const handleResize = (e: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const newWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(e.clientX, MAX_SIDEBAR_WIDTH)
        );
        setSidebarWidth(newWidth);
      });
    };

    const handleResizeEnd = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleResize, { passive: true });
    document.addEventListener('mouseup', handleResizeEnd, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isResizing]);

  // Build file tree structure from flat list of files
  const buildTree = useCallback(() => {
    if (allFiles.length === 0) {
      setFileTree([]);
      setIsTreeBuildingComplete(true);
      return;
    }

    // Skip rebuild if files and expanded nodes haven't changed
    if (
      allFiles === prevFilesRef.current &&
      expandedNodes === prevExpandedNodesRef.current
    ) {
      return;
    }

    console.log('Building file tree from', allFiles.length, 'files');
    setIsTreeBuildingComplete(false);

    try {
      const normalizedSelectedFolder = selectedFolder ? normalizePath(selectedFolder) : '';
      const treeMap = new Map<string, TreeNode>();

      // First pass: create all nodes
      allFiles.forEach((file) => {
        if (!file.path) return;

        const normalizedFilePath = normalizePath(file.path);
        const relativePath = normalizedSelectedFolder && isSubPath(normalizedSelectedFolder, normalizedFilePath)
          ? normalizedFilePath.substring(normalizedSelectedFolder.length + 1)
          : normalizedFilePath;

        const parts = relativePath.split('/');
        let currentPath = '';

        // Build path segments and create nodes
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (!part) continue;

          currentPath = currentPath ? join(currentPath, part) : part;
          const fullPath = normalizedSelectedFolder ? join(normalizedSelectedFolder, currentPath) : currentPath;
          const nodeId = `node-${fullPath}`;

          if (!treeMap.has(nodeId)) {
            if (i === parts.length - 1) {
              treeMap.set(nodeId, createTreeNode(part, file.path, 'file', i, file));
            } else {
              treeMap.set(nodeId, createTreeNode(part, fullPath, 'directory', i));
            }
          }
        }
      });

      // Second pass: build parent-child relationships
      const rootNodes: TreeNode[] = [];
      treeMap.forEach((node, nodeId) => {
        if (node.type === 'directory') {
          const parentPath = node.path.split('/').slice(0, -1).join('/');
          const parentId = `node-${parentPath}`;
          const parent = treeMap.get(parentId);

          if (parent && parent.type === 'directory' && parent.children) {
            parent.children.push(node);
          } else if (node.level === 0) {
            rootNodes.push(node);
          }
        } else if (node.level === 0) {
          rootNodes.push(node);
        }
      });

      // Sort nodes and apply expanded state
      const sortedTree = rootNodes.sort(sortTreeNodes).map(node => ({
        ...node,
        isExpanded: expandedNodes[node.id] ?? true,
        children: node.children?.sort(sortTreeNodes)
      }));

      setFileTree(sortedTree);
      prevFilesRef.current = allFiles;
      prevExpandedNodesRef.current = expandedNodes;
      setIsTreeBuildingComplete(true);
    } catch (err) {
      console.error('Error building file tree:', err);
      setFileTree([]);
      setIsTreeBuildingComplete(true);
    }
  }, [allFiles, selectedFolder, expandedNodes]);

  // Optimized tree building effect
  useEffect(() => {
    if (treeBuildTimeoutRef.current) {
      clearTimeout(treeBuildTimeoutRef.current);
    }

    treeBuildTimeoutRef.current = setTimeout(buildTree, TREE_BUILD_DELAY);

    return () => {
      if (treeBuildTimeoutRef.current) {
        clearTimeout(treeBuildTimeoutRef.current);
      }
    };
  }, [buildTree]);

  // Memoize the filterTree function to avoid unnecessary recalculations
  const filterTree = useCallback((nodes: TreeNode[], term: string): TreeNode[] => {
    if (!term) return nodes;

    const lowerTerm = term.toLowerCase();
    const searchTerms = new Set(lowerTerm.split(/\s+/).filter(Boolean));
    const termLength = Math.min(...Array.from(searchTerms).map(t => t.length));

    const nodeMatches = (node: TreeNode): boolean => {
      const nodeName = node.name.toLowerCase();
      if (nodeName.length < termLength) return false;
      return Array.from(searchTerms).every(term => nodeName.includes(term));
    };

    return nodes.filter(nodeMatches).map(node => {
      if (node.type === 'directory' && node.children) {
        return {
          ...node,
          children: filterTree(node.children, term),
          isExpanded: true
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

  // Utility functions moved outside component to prevent recreation
  const createTreeNode = (
    name: string,
    path: string,
    type: 'file' | 'directory',
    level: number,
    fileData?: FileData
  ): TreeNode => ({
    id: `node-${path}`,
    name,
    path,
    type,
    level,
    children: type === 'directory' ? [] : undefined,
    fileData,
    isExpanded: true
  });

  const sortTreeNodes = (a: TreeNode, b: TreeNode): number => {
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    if (a.type === 'file' && b.type === 'file') {
      const aTokens = a.fileData?.tokenCount || 0;
      const bTokens = b.fileData?.tokenCount || 0;
      return bTokens - aTokens;
    }
    return a.name.localeCompare(b.name);
  };

  // Recursive flatten function
  const flattenTreeRecursive = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.reduce<TreeNode[]>((acc, node) => {
      acc.push(node);
      if (node.type === 'directory' && node.isExpanded && node.children) {
        acc.push(...flattenTreeRecursive(node.children));
      }
      return acc;
    }, []);
  };

  // Memoize the flattened tree to avoid unnecessary recalculations
  const visibleTree = useMemo(
    () => flattenTreeRecursive(filteredTree),
    [filteredTree]
  );

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
      />
    ));
  }, [visibleTree, selectedFiles, toggleFileSelection, toggleFolderSelection, toggleExpanded, includeBinaryPaths]);

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
