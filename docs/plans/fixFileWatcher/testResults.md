# Errors in terminal log:
```
[WatcherModule] Error in ignored function: TypeError: safeRelativePath is not a function
    at ignored (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\electron\watcher.js:45:30)
    at matchPatterns (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\anymatch\index.js:62:18)  
    at FSWatcher._userIgnored (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\anymatch\index.js:96:14)
    at FSWatcher._isIgnored (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\chokidar\index.js:779:15)
    at NodeFsHandler._addToNodeFs (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\chokidar\lib\nodefs-handler.js:589:16)
    at E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\chokidar\index.js:451:47
    at Array.map (<anonymous>)
    at FSWatcher.add (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\chokidar\index.js:450:13) 
    at Object.watch (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\node_modules\chokidar\index.js:969:11)  
    at Object.initializeWatcher (E:\CODING\Projects\CODE\PasteMax\PasteMax-Priv\electron\watcher.js:80:31) 
```
```
--- createWindow() ENTERED ---
(node:24272) Warning: Accessing non-existent property 'processSingleFile' of module exports inside circular dependency
(Use `electron --trace-warnings ...` to show where the warning was created)
(node:24272) Warning: Accessing non-existent property 'normalizePath' of module exports inside circular dependency
(node:24272) Warning: Accessing non-existent property 'safeRelativePath' of module exports inside circular dependency
(node:24272) Warning: Accessing non-existent property 'ensureAbsolutePath' of module exports inside circular dependency
```

## Test Cases Runned

### Test Case 1:
- [x] Test Case 1: Remove file from watched folder then reloads the app
- [x] Result: File is successfully removed after reloading the app.

Note: The file is removed from the watched folder only when user manually reloads the app with Ctrl + R. No automatic reload is triggered.

### Test Case 2:
- [x] Test Case 2: Add file to watched folder then reloads the app
- [x] Result: File is successfully added after reloading the app.

Note: The file is added to the watched folder only when user manually reloads the app with Ctrl + R. No automatic reload is triggered.

### Test Case 3:
- [x] Test Case 3: Update a content of a file in watched folder then reloads the app.
- [x] Result: File does not update automatically after reloading the app. Checked through the previewer modal `FilePrevieweModal.tsx` and the content is not updated.

Note:
- For some reason the file then properly updates if user change ignore patterns in the settings. This is not expected behavior and should be fixed.
- As the file should be updated automatically, when user reloads the app.
- Another thing as expected the update to file content is not reflected in the app until a manual refresh is performed. This needs to be addressed to ensure seamless user experience.

## Recurrent Issues:
- Not automatically reloading the app after a change in the watched folder.
- Always requiring a manual refresh to see the changes in the app.
- For file content updates / file updates, the app does not reflect the changes until user changes an ignore mode.
- The app should automatically trigger auto reload on any of these changes file-remove, file-add, file-update.
- The issue with the ignored function `safeRelativePath` needs to be investigated as it may relate to the circular dependency warnings.