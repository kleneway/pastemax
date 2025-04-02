/**
 * Application entry point that sets up React with strict mode.
 * This ensures better development-time checks and warnings.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// Add an event listener to ensure state is saved properly before a page refresh
window.addEventListener('beforeunload', () => {
  // Get all app state from localStorage to ensure it's fully synced before reload
  // This forces the browser to flush any pending localStorage writes
  const allStorageKeys = [
    "pastemax-selected-folder",
    "pastemax-selected-files",
    "pastemax-sort-order",
    "pastemax-search-term",
    "pastemax-expanded-nodes"
  ];
  
  // Read each key to ensure writes are flushed
  allStorageKeys.forEach(key => localStorage.getItem(key));
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
