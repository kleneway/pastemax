/**
 * Application entry point that sets up React with strict mode.
 * This ensures better development-time checks and warnings.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/* ============================== BASE STYLES ============================== */
import './styles/index.css';
import './styles/base/Buttons.css';
import './styles/base/Input.css';
import './styles/base/Utilities.css';
import './styles/base/ToggleSwitch.css';

/* ============================== HEADER STYLES ============================ */
import './styles/header/Header.css';
import './styles/header/ThemeToggle.css';

/* ============================== SIDEBAR STYLES =========================== */
import './styles/sidebar/Sidebar.css';
import './styles/sidebar/TreeItem.css';
import './styles/sidebar/Searchbar.css';
import './styles/sidebar/TaskTypeSelector.css';

/* ============================== CONTENT AREA STYLES ====================== */
import './styles/contentarea/ContentArea.css';
import './styles/contentarea/FileList.css';
import './styles/contentarea/FileCard.css';
import './styles/contentarea/UserInstructions.css';
import './styles/contentarea/SortDropDown.css';
import './styles/contentarea/ProcessingIndicator.css';
import './styles/contentarea/ModelDropdown.css';
import './styles/contentarea/CopySettings/CopySettings.css';
import './styles/contentarea/CopySettings/CopyHistoryButton.css';

/* ============================== MODAL STYLES ============================= */
import './styles/modals/IgnoreListModal.css';
import './styles/modals/FilePreviewModal.css';
import './styles/modals/UpdateModal.css';
import './styles/modals/CustomTaskTypeModal.css';
import './styles/modals/WorkspaceManager.css';
import './styles/modals/CopyHistoryModal.css';
import './styles/modals/LlmSettingsModal.css';
import './styles/modals/ChatView.css';

/* ============================== COMPONENT STYLES ========================= */
import './styles/contentarea/ChatButton.css';

/**
 * Add an event listener to ensure state is saved properly before a page refresh.
 * This forces the browser to flush any pending localStorage writes by reading
 * each value, ensuring data persistence across refreshes.
 */
window.addEventListener('beforeunload', () => {
  // App state keys that need to be preserved
  const allStorageKeys = [
    'pastemax-selected-folder',
    'pastemax-selected-files',
    'pastemax-sort-order',
    'pastemax-search-term',
    'pastemax-expanded-nodes',
    'pastemax-workspaces',
    'pastemax-current-workspace',
    'llm-models-cache',
    'llm-models-fetch-time',
  ];

  // Read each key to ensure writes are flushed
  allStorageKeys.forEach((key) => localStorage.getItem(key));
});

/**
 * Initialize the React application in strict mode
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
