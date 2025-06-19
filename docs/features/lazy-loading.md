# Lazy Loading Architecture

## Overview

PasteMax uses a lazy loading architecture to efficiently handle large repositories. Instead of reading and tokenizing all files upfront (which can take minutes for large codebases), the app performs a lightweight initial scan that only gathers file metadata and estimates token counts. Actual file content and accurate token counts are loaded on-demand when files are selected.

## How It Works

### 1. Initial Folder Load - Lightweight Scan

When a folder is selected:
- The app performs a fast metadata-only scan using `scanDirectoryLightweight()`
- For each file, it collects:
  - File path and name
  - File size from `fs.stat()`
  - Estimated token count based on file extension and size
- Files are marked with `isTokenEstimate: true` flag
- File content is left empty (`content: ''`)

### 2. Token Estimation Algorithm

The `estimateTokens()` function in `electron/main.js` estimates tokens without reading files:

- **Binary files** (images, videos, executables): 0 tokens
- **Code files** (.js, .py, .ts, etc.): ~3 characters per token
- **Text files** (.md, .txt, .json, etc.): ~4 characters per token
- **Unknown files**: Default to ~4 characters per token

This provides reasonably accurate estimates for the file tree display.

### 3. Visual Indicators

Files with estimated tokens are displayed with visual cues:
- Token count prefixed with `~` (e.g., "~1,234 tokens")
- Small "est" badge next to the count
- Loading spinner when processing begins

### 4. On-Demand Processing

When a file is selected:
1. The UI immediately adds it to the selection
2. If `isTokenEstimate === true`, it triggers `processFileForRealTokens()`
3. A loading spinner appears next to the file
4. The backend reads the file content and calculates actual tokens
5. The file data is updated with real values and `isTokenEstimate: false`
6. The spinner disappears and real token count is shown

### 5. Performance Benefits

- **Initial load time**: Reduced from minutes to seconds for large repos
- **Memory usage**: Minimal until files are actually needed
- **UI responsiveness**: No freezing during folder selection
- **Scalability**: Can handle repositories with 10,000+ files

## Implementation Details

### Frontend Components

- **App.tsx**: Manages `processingFiles` state and triggers on-demand processing
- **TreeItem.tsx**: Shows loading spinners and estimate badges
- **FileCard.tsx**: Displays estimate badges for selected files

### Backend Services

- **main.js**: 
  - `scanDirectoryLightweight()`: Performs metadata-only scanning
  - `estimateTokens()`: Calculates token estimates
  - `process-selected-files` IPC handler: Processes files on-demand
  
- **file-processor.js**: 
  - `processSingleFile()`: Reads and tokenizes individual files

### IPC Communication

```typescript
// Frontend requests processing
await window.electron.ipcRenderer.invoke('process-selected-files', [filePath]);

// Backend response
{
  success: true,
  processedFiles: [{
    path: string,
    content: string,
    tokenCount: number,
    isTokenEstimate: false,
    // ... other metadata
  }]
}
```

## Configuration

Currently, lazy loading is always enabled. Future versions may add:
- Threshold settings for automatic vs on-demand processing
- Batch processing options
- Preloading for commonly selected files

## Known Limitations

1. **Estimates may be inaccurate** for files with unusual formatting
2. **Binary detection** is extension-based until file is processed
3. **Large files** still take time to process when selected

## Future Improvements

- Background pre-processing of likely selections
- Smart caching of processed files between sessions
- Progressive loading for very large files
- Parallel processing of multiple selections