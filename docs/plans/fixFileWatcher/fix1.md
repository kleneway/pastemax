# File Watcher Fix Plan

## Issue 1: safeRelativePath Error and Circular Dependencies

### Problem:
- Utility functions (processSingleFile, normalizePath, safeRelativePath, ensureAbsolutePath) are imported from main.js in watcher.js
- This creates circular dependencies and causes the safeRelativePath is not a function error

### Solution:
1. Create new utility file `electron/utils.js` with:
```js
const path = require('path');

function processSingleFile(filePath, basePath, ignoreFilter) {
  // Implementation from main.js
}

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/');
}

function safeRelativePath(basePath, targetPath) {
  // Implementation from main.js
}

function ensureAbsolutePath(filePath, basePath) {
  // Implementation from main.js
}

module.exports = {
  processSingleFile,
  normalizePath,
  safeRelativePath,
  ensureAbsolutePath
};
```

2. Update watcher.js imports:
```js
const {
  processSingleFile,
  normalizePath,
  safeRelativePath,
  ensureAbsolutePath
} = require('./utils');
```

3. Remove these functions from main.js exports

## Issue 2: App Not Updating Automatically

### Problem:
- File change events (add/update/remove) are detected and IPC messages are sent
- App.tsx receives messages but only updates UI when ignore mode changes

### Solution:
1. Modify App.tsx to update state on file changes:
```tsx
// Add these handlers in the main useEffect
useEffect(() => {
  if (!isElectron) return;

  const handleFileAdded = (newFile: FileData) => {
    setAllFiles(prev => [...prev, newFile]);
  };

  const handleFileUpdated = (updatedFile: FileData) => {
    setAllFiles(prev => prev.map(f => 
      f.path === updatedFile.path ? updatedFile : f
    ));
  };

  const handleFileRemoved = (filePath: string) => {
    setAllFiles(prev => prev.filter(f => f.path !== filePath));
  };

  window.electron.ipcRenderer.on('file-added', handleFileAdded);
  window.electron.ipcRenderer.on('file-updated', handleFileUpdated);
  window.electron.ipcRenderer.on('file-removed', handleFileRemoved);

  return () => {
    window.electron.ipcRenderer.removeListener('file-added', handleFileAdded);
    window.electron.ipcRenderer.removeListener('file-updated', handleFileUpdated);
    window.electron.ipcRenderer.removeListener('file-removed', handleFileRemoved);
  };
}, [isElectron]);
```

## Testing Plan

1. Verify safeRelativePath error is resolved:
   - Start app and check terminal for errors
   - Confirm file watching works without errors

2. Test auto-update functionality:
   - Add file to watched folder - should appear immediately
   - Modify file - changes should reflect immediately
   - Remove file - should disappear immediately
   - No manual refresh should be needed

3. Verify circular dependency warnings are gone:
   - Check terminal output during startup
   - No warnings about processSingleFile, normalizePath etc.

## Implementation Order

1. Create electron/utils.js with utility functions
2. Update watcher.js imports
3. Clean up main.js exports
4. Modify App.tsx to handle file changes
5. Test each change incrementally