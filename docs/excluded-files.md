# Excluded Files Feature

This application automatically excludes common files by default when loading a folder. This helps keep your workspace clean by focusing only on the most relevant files for your needs.

## How It Works

1. When you open a folder, the application scans all files but automatically excludes certain files from the initial selection.
2. Excluded files are shown with reduced opacity and an "Excluded" badge in the file tree.
3. You can still manually select any excluded file to include it in your workspace if needed.
4. The exclusion rules are stored in a separate file (`excluded-files.js`) for easy customization.

## Customizing Excluded Files

You can modify the list of excluded files by editing the `excluded-files.js` file in the application's root directory. This file contains two main configurations:

1. `excludedFiles`: An array of glob patterns for files that should be excluded by default.
2. `binaryExtensions`: An array of file extensions that should always be treated as binary files.

### Example

```javascript
module.exports = {
  excludedFiles: [
    'package-lock.json',
    '*.min.js',
    'node_modules/**',
    // Add your custom patterns here
  ],
  binaryExtensions: [
    '.svg',
    '.jpg',
    // Add your custom binary extensions here
  ],
};
```

## Default Exclusions

The default configuration includes common files that are typically not needed in code review or analysis:

- Build artifacts and dependencies (`node_modules`, `dist`, `build`, etc.)
- Package lock files (`package-lock.json`, `yarn.lock`, etc.)
- Binary files (images, executables, etc.)
- IDE configuration files (`.vscode`, `.idea`, etc.)
- System files (`.DS_Store`, etc.)
- Generated files (minified JavaScript, source maps, etc.)

## Benefits

- **Cleaner Interface**: Only show files relevant to your code review or analysis
- **Reduced File Count**: Automatically filter out generated files, dependencies, and binaries
- **Faster Loading**: Spend less time selecting files to exclude
- **Fully Customizable**: Easily modify the exclusion list for your specific needs

## Integration with .gitignore

The application also respects patterns in your project's `.gitignore` file, combining those with the default exclusions for a comprehensive filtering system.
