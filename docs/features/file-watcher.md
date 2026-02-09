# File Change Watcher

The File Change Watcher feature in PasteMax automatically keeps your file list synchronized with the filesystem, providing real-time updates without manual intervention.

## Overview

When you select a folder in PasteMax, the application not only scans the directory to display all files but also sets up a file system watcher that monitors for changes. This means:

- **Automatic Updates**: The file list updates automatically when changes occur in the selected directory
- **Real-time Sync**: Changes are reflected in the UI within seconds
- **No Manual Refresh Needed**: For most operations, you don't need to use the manual refresh button

## How It Works

### Technology

- Uses the `chokidar` library for cross-platform file system monitoring
- Implements debouncing for file modifications to prevent excessive updates
- Respects the same ignore patterns as the initial directory scan

### Supported Operations

1. **File Addition**

   - New files appear in the sidebar tree automatically
   - Token count is calculated for new text files
   - Files are immediately selectable

2. **File Modification**

   - Token counts update when file content changes
   - File size updates are reflected
   - Changes are debounced (500ms) to handle rapid saves gracefully

3. **File Deletion**

   - Removed files disappear from the UI
   - If a deleted file was selected, it's removed from the selection
   - Total token count updates accordingly

4. **Directory Operations**
   - New directories appear with their contents
   - Deleted directories and all their files are removed
   - Nested file operations are handled correctly

## Ignore Patterns

The file watcher respects the same ignore patterns as the main file scanner:

- In **Automatic Mode**: Follows `.gitignore` rules
- In **Global Mode**: Uses predefined patterns (node_modules, build directories, etc.)
- Binary files are detected but not processed for content

## Manual Refresh

While the file watcher handles most scenarios, the manual refresh button (🔄) is still available for:

- Forcing a complete re-scan of the directory
- Recovering from any potential sync issues
- Refreshing after changing ignore mode settings

## Performance Considerations

- **Debouncing**: Rapid file changes are debounced to prevent UI flickering
- **Efficient Updates**: Only affected files are processed, not the entire directory
- **Resource Usage**: The watcher has minimal CPU and memory overhead

## Limitations

- Very large directories (>10,000 files) may experience slight delays
- Some network file systems may have delayed or missed events
- Symbolic links are followed based on the underlying file system behavior

## Troubleshooting

If auto-updates aren't working as expected:

1. Check the developer console for any error messages
2. Verify the directory is still accessible
3. Try the manual refresh button
4. Ensure the folder hasn't been moved or renamed
5. Restart PasteMax if issues persist

## Technical Details

For developers interested in the implementation:

- Watcher initialization: `electron/watcher.js`
- IPC communication: `file-added`, `file-updated`, `file-removed` events
- Frontend handlers: `handleFileAdded`, `handleFileUpdated`, `handleFileRemoved` in `App.tsx`
- State management: Updates flow through React state to trigger UI re-renders
