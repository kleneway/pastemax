/**
 * Application entry point that sets up React with strict mode.
 * This ensures better development-time checks and warnings.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/header/Header.css';
import './styles/header/ThemeToggle.css';
import './styles/sidebar/Sidebar.css';
import './styles/sidebar/TreeItem.css';
import './styles/sidebar/Searchbar.css';
import './styles/sidebar/TaskTypeSelector.css';
import './styles/contentarea/ContentArea.css';
import './styles/contentarea/FileList.css';
import './styles/contentarea/FileCard.css';
import './styles/contentarea/UserInstructions.css';
import './styles/contentarea/CopyButton.css';
import './styles/contentarea/SortDropDown.css';
import './styles/contentarea/ProcessingIndicator.css';
import './styles/contentarea/CopyHistoryButton.css';
import './styles/modals/IgnoreListModal.css';
import './styles/modals/FilePreviewModal.css';
import './styles/modals/UpdateModal.css';
import './styles/modals/CustomTaskTypeModal.css';
import './styles/modals/WorkspaceManager.css';
import './styles/modals/CopyHistoryModal.css';
import './styles/base/Buttons.css';
import './styles/base/Input.css';
import './styles/base/Utilities.css';

// Add an event listener to ensure state is saved properly before a page refresh
window.addEventListener('beforeunload', () => {
  // Get all app state from localStorage to ensure it's fully synced before reload
  // This forces the browser to flush any pending localStorage writes
  const allStorageKeys = [
    'pastemax-selected-folder',
    'pastemax-selected-files',
    'pastemax-sort-order',
    'pastemax-search-term',
    'pastemax-expanded-nodes',
    'pastemax-workspaces',
    'pastemax-current-workspace',
  ];

  // Read each key to ensure writes are flushed
  allStorageKeys.forEach((key) => localStorage.getItem(key));
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
