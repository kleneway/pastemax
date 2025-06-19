import { useState, useEffect, useCallback } from 'react';
import { Workspace } from '../types/WorkspaceTypes';
import { normalizePath } from '../utils/pathUtils';

// Storage keys - replicating from App.tsx
const STORAGE_KEYS = {
  WORKSPACES: 'pastemax-workspaces',
  CURRENT_WORKSPACE: 'pastemax-current-workspace',
  SELECTED_FOLDER: 'pastemax-selected-folder',
  SELECTED_FILES: 'pastemax-selected-files',
};

interface UseWorkspacesProps {
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;
  setSelectedFiles: (files: string[]) => void;
  setAllFiles: (files: any[]) => void;
  setProcessingStatus: (status: { status: string; message: string }) => void;
  openFolder: () => void;
  handleFolderSelected: (folderPath: string) => void;
  isElectron: boolean;
}

interface UseWorkspacesReturn {
  workspaces: Workspace[];
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: React.Dispatch<React.SetStateAction<string | null>>;
  isWorkspaceManagerOpen: boolean;
  setIsWorkspaceManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isConfirmUseFolderModalOpen: boolean;
  setIsConfirmUseFolderModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  confirmFolderModalDetails: {
    workspaceId: string | null;
    workspaceName: string;
    folderPath: string;
  };
  setConfirmFolderModalDetails: React.Dispatch<React.SetStateAction<{
    workspaceId: string | null;
    workspaceName: string;
    folderPath: string;
  }>>;
  currentWorkspaceName: string | null;
  handleOpenWorkspaceManager: () => void;
  handleSelectWorkspace: (workspaceId: string) => void;
  handleCreateWorkspace: (name: string) => void;
  handleDeleteWorkspace: (workspaceId: string) => void;
  handleUpdateWorkspaceFolder: (workspaceId: string, folderPath: string | null) => void;
  handleConfirmUseCurrentFolder: () => void;
  handleDeclineUseCurrentFolder: () => void;
}

export const useWorkspaces = ({
  selectedFolder,
  setSelectedFolder,
  setSelectedFiles,
  setAllFiles,
  setProcessingStatus,
  openFolder,
  handleFolderSelected,
  isElectron,
}: UseWorkspacesProps): UseWorkspacesReturn => {
  // Initialize workspaces from localStorage
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const savedWorkspaces = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
    if (savedWorkspaces) {
      try {
        const parsed = JSON.parse(savedWorkspaces);
        if (Array.isArray(parsed)) {
          console.log(`Loaded ${parsed.length} workspaces from localStorage`);
          return parsed as Workspace[];
        } else {
          console.warn('Invalid workspaces format in localStorage, resetting to empty array');
          // Reset localStorage to prevent further errors
          localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
          return [] as Workspace[];
        }
      } catch (error) {
        console.error('Error parsing workspaces from localStorage:', error);
        // Reset localStorage to prevent further errors
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
        return [] as Workspace[];
      }
    }
    // Initialize with empty array and ensure localStorage has a valid value
    console.log('No workspaces found in localStorage, initializing with empty array');
    localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
    return [] as Workspace[];
  });

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_WORKSPACE) || null;
  });

  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [isConfirmUseFolderModalOpen, setIsConfirmUseFolderModalOpen] = useState(false);
  const [confirmFolderModalDetails, setConfirmFolderModalDetails] = useState<{
    workspaceId: string | null;
    workspaceName: string;
    folderPath: string;
  }>({
    workspaceId: null,
    workspaceName: '',
    folderPath: '',
  });

  // Sync workspaces to localStorage whenever they change
  useEffect(() => {
    if (workspaces.length > 0) {
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(workspaces));
      console.log(`Workspaces updated: ${workspaces.length} workspaces saved to localStorage`);

      // If we have a current workspace, ensure it still exists in the workspaces array
      if (currentWorkspaceId && !workspaces.some((w: Workspace) => w.id === currentWorkspaceId)) {
        console.log('Current workspace no longer exists, clearing currentWorkspaceId');
        localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKSPACE);
        setCurrentWorkspaceId(null);
      }
    }
  }, [workspaces, currentWorkspaceId]);

  // Update current workspace's folder path when selectedFolder changes
  useEffect(() => {
    if (selectedFolder && currentWorkspaceId) {
      setWorkspaces((prevWorkspaces: Workspace[]) => {
        const updatedWorkspaces = prevWorkspaces.map((workspace: Workspace) =>
          workspace.id === currentWorkspaceId
            ? { ...workspace, folderPath: normalizePath(selectedFolder), lastUsed: Date.now() }
            : workspace
        );
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
        return updatedWorkspaces;
      });
    }
  }, [selectedFolder, currentWorkspaceId]);

  // Get current workspace name for display
  const currentWorkspaceName = currentWorkspaceId
    ? workspaces.find((w: Workspace) => w.id === currentWorkspaceId)?.name || 'Untitled'
    : null;

  // Workspace handler functions
  const handleOpenWorkspaceManager = useCallback(() => {
    setIsWorkspaceManagerOpen(true);
  }, []);

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    console.log('Selecting workspace with ID:', workspaceId);
    const workspace = workspaces.find((w: Workspace) => w.id === workspaceId);
    if (!workspace) {
      console.error('Workspace not found:', workspaceId);
      return;
    }

    // Update timestamps and set as current
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      const updatedWorkspaces = currentWorkspaces.map((w: Workspace) =>
        w.id === workspaceId ? { ...w, lastUsed: Date.now() } : w
      );
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
      return updatedWorkspaces;
    });

    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE, workspaceId);
    setCurrentWorkspaceId(workspaceId);
    console.log('Current workspace ID set to:', workspaceId);

    // Handle folder selection
    if (workspace.folderPath) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_FOLDER, workspace.folderPath);
      handleFolderSelected(workspace.folderPath);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
      setSelectedFolder(null);
      setSelectedFiles([]);
      setAllFiles([]);
      setProcessingStatus({
        status: 'idle',
        message: '',
      });
    }

    setIsWorkspaceManagerOpen(false);
    console.log('Workspace selection complete, manager closed');
  }, [workspaces, handleFolderSelected, setSelectedFolder, setSelectedFiles, setAllFiles, setProcessingStatus]);

  const handleCreateWorkspace = useCallback((name: string) => {
    console.log('Creating workspace with name:', name);
    const newWorkspace: Workspace = {
      id: `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      folderPath: null,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };

    setWorkspaces((currentWorkspaces: Workspace[]) => {
      const updatedWorkspaces = [...currentWorkspaces, newWorkspace];
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
      return updatedWorkspaces;
    });

    // Set as current workspace
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE, newWorkspace.id);
    setCurrentWorkspaceId(newWorkspace.id);
    console.log('Set current workspace ID to:', newWorkspace.id);

    if (selectedFolder) {
      // Show confirmation modal to use current folder
      setConfirmFolderModalDetails({
        workspaceId: newWorkspace.id,
        workspaceName: name,
        folderPath: selectedFolder,
      });
      setIsConfirmUseFolderModalOpen(true);
    } else {
      // No folder selected - proceed with folder selection
      setSelectedFolder(null);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
      setSelectedFiles([]);
      setAllFiles([]);
      setProcessingStatus({
        status: 'idle',
        message: '',
      });
      openFolder();
    }

    // Close the workspace manager
    setIsWorkspaceManagerOpen(false);
    console.log('Workspace creation complete, manager closed');
  }, [selectedFolder, setSelectedFolder, setSelectedFiles, setAllFiles, setProcessingStatus, openFolder]);

  const handleConfirmUseCurrentFolder = useCallback(() => {
    if (!confirmFolderModalDetails.workspaceId) return;

    // Update workspace with current folder path
    handleUpdateWorkspaceFolder(
      confirmFolderModalDetails.workspaceId,
      confirmFolderModalDetails.folderPath
    );
    setIsConfirmUseFolderModalOpen(false);
  }, [confirmFolderModalDetails]);

  const handleDeclineUseCurrentFolder = useCallback(() => {
    setIsConfirmUseFolderModalOpen(false);
    // Clear state and open folder selector
    setSelectedFolder(null);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
    setSelectedFiles([]);
    setAllFiles([]);
    setProcessingStatus({
      status: 'idle',
      message: '',
    });
    openFolder();
  }, [setSelectedFolder, setSelectedFiles, setAllFiles, setProcessingStatus, openFolder]);

  const handleDeleteWorkspace = useCallback((workspaceId: string) => {
    console.log('App: Deleting workspace with ID:', workspaceId);
    // Ensure any open modal is closed first
    setIsConfirmUseFolderModalOpen(false);

    const workspaceBeingDeleted = workspaces.find((w: Workspace) => w.id === workspaceId);
    console.log('Deleting workspace:', workspaceBeingDeleted?.name);

    // Filter out the deleted workspace, using functional update to prevent stale state
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      const filteredWorkspaces = currentWorkspaces.filter((w: Workspace) => w.id !== workspaceId);
      console.log(
        `Filtered workspaces: ${currentWorkspaces.length} -> ${filteredWorkspaces.length}`
      );

      // Save the updated workspaces list to localStorage
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(filteredWorkspaces));
      console.log('Saved filtered workspaces to localStorage');

      return filteredWorkspaces;
    });

    // If deleting current workspace, clear current selection
    if (currentWorkspaceId === workspaceId) {
      console.log('Deleted the current workspace, clearing workspace state');
      localStorage.removeItem(STORAGE_KEYS.CURRENT_WORKSPACE);
      setCurrentWorkspaceId(null);

      // Optionally clear folder selection when deleting current workspace
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_FILES);
      setSelectedFolder(null);
      setSelectedFiles([]);
      setAllFiles([]);
      setProcessingStatus({
        status: 'idle',
        message: '',
      });
    }

    console.log('Workspace deletion complete');
  }, [workspaces, currentWorkspaceId, setSelectedFolder, setSelectedFiles, setAllFiles, setProcessingStatus]);

  const handleUpdateWorkspaceFolder = useCallback((workspaceId: string, folderPath: string | null) => {
    setWorkspaces((prevWorkspaces: Workspace[]) => {
      const updatedWorkspaces = prevWorkspaces.map((workspace: Workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, folderPath, lastUsed: Date.now() }
          : workspace
      );
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updatedWorkspaces));
      return updatedWorkspaces;
    });

    // If updating the current workspace, also update the selected folder
    if (currentWorkspaceId === workspaceId) {
      if (folderPath) {
        // Update local storage and request file list
        localStorage.setItem(STORAGE_KEYS.SELECTED_FOLDER, folderPath);
        handleFolderSelected(folderPath);
      } else {
        // Clear folder selection in localStorage and state
        localStorage.removeItem(STORAGE_KEYS.SELECTED_FOLDER);
        setSelectedFolder(null);
        setSelectedFiles([]);
        setAllFiles([]);
        setProcessingStatus({
          status: 'idle',
          message: '',
        });
      }
    }
  }, [currentWorkspaceId, handleFolderSelected, setSelectedFolder, setSelectedFiles, setAllFiles, setProcessingStatus]);

  return {
    workspaces,
    setWorkspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    isWorkspaceManagerOpen,
    setIsWorkspaceManagerOpen,
    isConfirmUseFolderModalOpen,
    setIsConfirmUseFolderModalOpen,
    confirmFolderModalDetails,
    setConfirmFolderModalDetails,
    currentWorkspaceName,
    handleOpenWorkspaceManager,
    handleSelectWorkspace,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleUpdateWorkspaceFolder,
    handleConfirmUseCurrentFolder,
    handleDeclineUseCurrentFolder,
  };
};