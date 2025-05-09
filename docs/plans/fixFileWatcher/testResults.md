# Errors in terminal log:
```
(node:8100) Warning: Accessing non-existent property 'processSingleFile' of module exports inside circular dependency
```
```
[WatcherModule] Watcher started successfully for folder: E:/CODING/Projects/CODE/mechvibesTest/src/audio/mxbrown-travel
[WatcherModule] Attempting to stop existing watcher...
[WatcherModule] Existing watcher stopped successfully.
Skipped by default ignore patterns: src/audio/turquoise/release
[WatcherModule] Attempting to start watcher for folder: E:/CODING/Projects/CODE/mechvibesTest/src/audio/turquoise
[WatcherModule] Could not get relative path for: E:/CODING/Projects/CODE/mechvibesTest/src/audio/turquoise  
[WatcherModule] Watcher started successfully for folder: E:/CODING/Projects/CODE/mechvibesTest/src/audio/turquoise
[WatcherModule] Attempting to stop existing watcher...
[WatcherModule] Existing watcher stopped successfully.
[WatcherModule] Attempting to start watcher for folder: E:/CODING/Projects/CODE/mechvibesTest/src/libs/electron-log
[WatcherModule] Could not get relative path for: E:/CODING/Projects/CODE/mechvibesTest/src/libs/electron-log
[WatcherModule] Watcher started successfully for folder: E:/CODING/Projects/CODE/mechvibesTest/src/libs/electron-log
[WatcherModule] Attempting to stop existing watcher...
[WatcherModule] Existing watcher stopped successfully.
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
- [x] Result: File does not update automatically after reloading the app. Checked the file contents through the previewer modal `FilePrevieweModal.tsx` and the content is not updated.

Note:
- For some reason the file then properly updates if user change ignore patterns in the settings from `ignorePatternsViewer` `ToggleSwitch`. This is not expected behavior and should be fixed.
- As the file should be updated automatically, when user reloads the app.
- Another thing as expected the update to file content is not reflected in the app until a manual refresh is performed. This needs to be addressed to ensure seamless user experience.

## Recurrent Issues:
- Not automatically reloading the app after a change in the watched folder.
- Always requiring a manual refresh to see the changes in the app.
- For file content updates / file updates, the app does not reflect the changes until user changes an ignore mode.
- The app should automatically trigger auto reload on any of these changes file-remove, file-add, file-update.
- The issue with the ignored function `safeRelativePath` needs to be investigated as it may relate to the circular dependency warnings.