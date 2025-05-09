import { useState, useEffect, useCallback } from 'react';
import type { IgnoreMode } from '../types/FileTypes';

interface IgnorePatternsState {
  default: string[];
  excludedFiles: string[];
  gitignore: string[];
}

/**
 * Hook for managing ignore patterns functionality
 * Handles state and operations related to viewing git ignore patterns
 *
 * @param selectedFolder - The currently selected folder path
 * @param isElectron - Whether the app is running in Electron environment
 * @returns {Object} An object containing:
 *   - isIgnoreViewerOpen: Boolean state for viewer visibility
 *   - ignorePatterns: Current ignore patterns state
 *   - ignorePatternsError: Error message if pattern fetch failed
 *   - handleViewIgnorePatterns: Function to fetch patterns
 *   - closeIgnoreViewer: Function to close the viewer
 *   - ignoreMode: Current ignore mode ('automatic' or 'global')
 *     - 'automatic': Combines .gitignore files with default excludes
 *     - 'global': Uses only default excludes and custom ignores
 *   - setIgnoreMode: Function to update ignore mode
 *   - customIgnores: Array of additional ignore patterns
 *     - Only used when ignoreMode is 'global'
 *   - setCustomIgnores: Function to update custom ignores
 *
 * @description The hook automatically includes customIgnores in the IPC call
 * when mode is 'global', but ignores them in 'automatic' mode.
 */
export function useIgnorePatterns(selectedFolder: string | null, isElectron: boolean) {
  const [isIgnoreViewerOpen, setIsIgnoreViewerOpen] = useState(false);
  const [ignorePatterns, setIgnorePatterns] = useState(null as IgnorePatternsState | null);
  const [ignorePatternsError, setIgnorePatternsError] = useState(null as string | null);
  /**
   * Current ignore mode state ('automatic' or 'global')
   * - 'automatic': Scans for .gitignore files and combines with default excludes
   * - 'global': Uses only default excludes and custom ignores
   */
  const [ignoreMode, _setIgnoreMode] = useState(() => {
    const savedMode =
      typeof window !== 'undefined' ? localStorage.getItem('pastemax-ignore-mode') : null;
    return (savedMode === 'global' ? 'global' : 'automatic') as IgnoreMode;
  });

  const [ignoreSettingsModified, _setIgnoreSettingsModified] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pastemax-ignore-settings-modified') === 'true';
  });

  const setIgnoreMode = (mode: IgnoreMode) => {
    if (typeof window !== 'undefined') {
      if (isElectron) {
        window.electron.ipcRenderer.send('clear-ignore-cache');
      }
      localStorage.setItem('pastemax-ignore-mode', mode);
      localStorage.setItem('pastemax-ignore-settings-modified', 'true');
    }
    _setIgnoreMode(mode);
    _setIgnoreSettingsModified(true);
    console.log(`Ignore mode changed to ${mode}`);
  };

  /**
   * Custom ignore patterns that will be included when mode is 'global'
   * These patterns are passed to the IPC handler when fetching ignore patterns
   */
  const [customIgnores, _setCustomIgnores] = useState(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const saved = localStorage.getItem('pastemax-custom-ignores');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Failed to parse custom ignores from localStorage:', error);
      return [];
    }
  });

  // Effect to save customIgnores to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const normalizedIgnores = customIgnores
          .map((pattern: string) => pattern.trim()) // Trim whitespace
          .sort(); // Sort alphabetically
        localStorage.setItem('pastemax-custom-ignores', JSON.stringify(normalizedIgnores));
        if (normalizedIgnores.length > 0) {
          localStorage.setItem('pastemax-ignore-settings-modified', 'true');
          _setIgnoreSettingsModified(true);
        }
      } catch (error) {
        console.error('Failed to save custom ignores to localStorage:', error);
      }
    }
  }, [customIgnores]);

  // Wrapper function to update state and potentially trigger side effects if needed later
  const setCustomIgnores = (newIgnores: string[] | ((prevIgnores: string[]) => string[])) => {
    _setCustomIgnores(newIgnores);
    if (typeof window !== 'undefined' && isElectron) {
      window.electron.ipcRenderer.send('clear-ignore-cache');
    }
    _setIgnoreSettingsModified(true);
  };

  /**
   * Fetches and displays ignore patterns for the selected folder
   * Handles both success and error states
   */
  const handleViewIgnorePatterns = async () => {
    console.time('handleViewIgnorePatterns');

    // Always open the viewer, even if no folder is selected
    setIsIgnoreViewerOpen(true);

    // Only attempt to fetch patterns if both conditions are met
    if (!selectedFolder || !isElectron) {
      console.log('Ignore patterns viewer opened with no folder selected or not in Electron');
      console.timeEnd('handleViewIgnorePatterns');
      return;
    }

    setIgnorePatterns(null);
    setIgnorePatternsError(null);

    console.log(`Fetching ignore patterns for ${selectedFolder} in ${ignoreMode} mode`);
    console.log('Custom ignores:', customIgnores);

    try {
      const result = await window.electron.ipcRenderer.invoke('get-ignore-patterns', {
        folderPath: selectedFolder,
        mode: ignoreMode,
        customIgnores: ignoreMode === 'global' ? customIgnores : [],
      });
      console.log('Received ignore patterns:', result.patterns ? 'success' : 'error', result);
      if (result.error) {
        setIgnorePatternsError(result.error);
      } else {
        console.log('DEBUG: Setting patterns with excludedFiles:', result.patterns?.excludedFiles);
        setIgnorePatterns({
          ...result.patterns,
          excludedFiles: result.patterns?.excludedFiles || [],
        });
      }
    } catch (err) {
      console.error('Error invoking get-ignore-patterns:', err);
      setIgnorePatternsError(
        err instanceof Error ? err.message : 'Failed to fetch ignore patterns.'
      );
    } finally {
      console.timeEnd('handleViewIgnorePatterns');
    }
  };

  const resetIgnoreSettingsModified = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pastemax-ignore-settings-modified', 'false');
    }
    _setIgnoreSettingsModified(false);
  };

  // Close the ignore patterns viewer
  const closeIgnoreViewer = useCallback(() => {
    setIsIgnoreViewerOpen(false);
    // State refresh is handled by backend event listener in App.tsx if mode changed
  }, []);

  return {
    isIgnoreViewerOpen,
    ignorePatterns,
    ignorePatternsError,
    handleViewIgnorePatterns,
    closeIgnoreViewer,
    ignoreMode,
    setIgnoreMode,
    customIgnores,
    setCustomIgnores,
    ignoreSettingsModified,
    resetIgnoreSettingsModified,
  };
}
