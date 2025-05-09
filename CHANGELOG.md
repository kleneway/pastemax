# Changelog

All notable changes to this project will be documented in this file.

## 1.2.3

### Added

- Dual-mode ignore pattern system:

  - Global ignore mode: Static, user-customizable ignore patterns
    - Faster processing with predefined ignore rules
    - User interface for adding custom global ignore patterns
    - Perfect for standard project structures with predictable file types
  - Automatic mode: Dynamic .gitignore discovery and application
    - Intelligent scanning of repository structure for .gitignore files
    - Hierarchical application of ignore rules respecting .gitignore scope
    - Optimized for monorepos and complex nested repository structures
    - Maintains context-aware rule application with parent/child relationships

- View Applied Ignore Patterns feature:

  - Added modal interface to view all active ignore patterns
  - Organized patterns by source (default, excluded-files.js, .gitignore)
  - Live search functionality for quick pattern finding
  - Smart pattern categorization with pattern counts
  - Section-based filtering with empty state handling
  - Auto-focus search with UX improvements
  - Theme-aware styling with improved readability

- Enhanced large repository handling:

  - Extended directory loading timeout to 5 minutes for very large repositories
  - Added detailed progress tracking for directories and files processed
  - Improved logging and status messages with processing statistics
  - Fixed race condition in .gitignore handling:
    - Better handling of deep repositories with multiple .gitignore files
    - Ensured all .gitignore patterns are loaded before file filtering begins
    - Better support for complex repository structures with nested git repositories
  - Implemented parallel folder loading for significantly faster processing
  - Added graceful crash recovery for extremely large repositories
  - Intelligent memory management to prevent out-of-memory errors

- Enhanced cache clearing functionality:

  - Added main process cache clearing to "Clear Data" operation
  - Complete clearing of ignoreCache and fileCache in main process
  - Synchronized clearing of renderer and main process caches
  - Improved state reset during cache clearing operations

- Implemented intelligent caching system:

  - New file metadata cache for faster reprocessing
  - Unified .gitignore pattern cache with deep repository support
  - Session-persistent caching for improved performance
  - Advanced memoization for tree operations with intelligent invalidation
  - Optimized tree traversal with cached intermediate results

- Enhanced file processing architecture:

  - Smart validation checks before file I/O
  - Early binary file detection without content reads
  - Efficient path validation system
  - Asynchronous worker-based file processing for improved responsiveness

- Enhanced binary file handling:

  - Added binary flag propagation through directory structure
  - New visual indicators for folders containing binary files
  - Improved badge system with theme-aware styling
  - Clear distinction between binary files and folders containing binaries

- Improved file tree UI:
  - Added styled badges for binary files and containing folders
  - Enhanced badge visibility with distinct styling for light/dark themes
  - Added italicized indicators for folders with binary content
  - Virtualized tree rendering for exceptional performance with large repositories
  - Progressive loading indicators for better perceived performance

### Improved

- View Applied Ignore Patterns UI Improvements:

  - Added sorting for better pattern organization
  - Enhanced section styling with clear visual hierarchy
  - Added hover effects for pattern lists
  - Improved modal layout and spacing
  - Added search input with theme-consistent styling
  - Fixed search state management for better UX
  - Toggle between Global and Automatic ignore modes

- Optimized large repository handling:
  - Reordered file processing checks for better performance
  - Reduced unnecessary file I/O operations
  - Improved handling of deep directory structures
  - Parallel directory scanning with configurable concurrency
  - Adaptive threading based on system capabilities
  - Cancelable operations with clean resource cleanup
- Enhanced directory tree metadata:
  - Added `hasBinaries` flag to track binary file presence
  - Optimized binary state propagation through directory structure
  - Improved UI feedback for binary content location
  - Efficient tree node memoization with selective invalidation
- Better theme compatibility:
  - Added semi-transparent backgrounds for binary indicators
  - Enhanced contrast for badge text in both themes
  - Consistent styling across light and dark modes

## v1.2.1 (2024-06-19)

### Added

- Added "Clean" npm script with rimraf for cross-platform build directory cleanup
- Added "Clear Data" button to explicitly reset application state
- Added enhanced state management during page reload
- Added UserInstructions component to allow custom notes in copied output
- Added improved copyable format with better syntax highlighting
- Added sophisticated language detection system for copied content:
  - Language-specific code blocks with backticks (```language) for LLM compatibility
  - Automatic detection of over 200 file types and extensions
  - Proper mapping of less common extensions to standard language identifiers
  - Consistent language tagging for optimal syntax highlighting in LLM contexts
- Added modern scrollbar styling with theme consistency:
  - Customized scrollbar appearance for both light and dark modes
  - Thin scrollbars for content areas with better UI integration
  - Cross-browser compatibility with Firefox and WebKit support

### Fixed

- Fixed file path normalization in copied content to ensure cross-platform compatibility
- Fixed state preservation issue when refreshing the application
- Fixed selected files not being properly maintained after reload
- Fixed inconsistent path separators in file maps and content output
- Fixed language detection for many uncommon file types

### Improved

- Improved path handling in contentFormatUtils.ts with explicit normalization
- Enhanced localStorage synchronization before page reload
- Optimized file selection preservation logic
- Improved session state handling with more comprehensive reset functionality
- Modularized utilities in the utils directory:
  - Separated language detection into dedicated languageUtils.ts module
  - Improved content formatting with consistent path normalization
  - Better separation of concerns between path, language, and content utilities
- Enhanced cross-platform compatibility with normalized paths in copied content
- Enhanced content format for improved LLM compatibility:
  - Better structured output with clear section tags
  - Normalized file paths for cross-platform compatibility
  - Sophisticated language-aware code fencing
  - Standardized language identifiers for consistent highlighting
- Enhanced UI with modern scrollbars that match application theme:
  - Light mode: subtle gray scrollbars with hover effects
  - Dark mode: darker scrollbars that blend with the interface
  - Improved visual consistency across scrollable containers

## v1.2.0

### Added

- Added enhanced logging for file selection and deselection actions.
- Expanded the ignore list to include additional binary file types.

### Fixed

- Fixed app reloading issue caused by testing configuration being merged into main.
- Fixed issue where Windows paths were duplicated, making folders unrecognizable.

### Improved

- Improved folder selection to automatically select/deselect all files within the folder.
- Optimized repository and project loading for better performance.
- Improved path normalization for better cross-platform compatibility.

## 2024-03-21

### Added

- Enhanced cross-platform path handling system
  - New utility functions for consistent path operations:
    - `normalizePath()`: Ensures consistent path separators across platforms
    - `ensureAbsolutePath()`: Guarantees absolute path resolution
    - `safePathJoin()`: Platform-safe path joining
    - `safeRelativePath()`: Safe relative path calculation
    - `isValidPath()`: Path string validation
  - Special handling for Windows UNC paths and network shares
  - Case-insensitive path handling for Windows systems
  - Improved .gitignore pattern normalization
  - Platform-specific file system restrictions handling

### Fixed

- "Path Should Be a Relative String" error in file processing
  - Now properly handles path conversions between absolute and relative formats
  - Maintains both full path and relative path properties for each file
  - Correctly processes ignore patterns across different platforms
- Directory containment checks in folder selection
  - Improved path comparison logic for nested directories
  - Fixed issues with path separators in directory tree traversal
- File selection state preservation across platform differences
  - Consistent path normalization in selection tracking
  - Fixed path comparison issues in tree view

### Improved

- Cross-platform compatibility
  - Added support for Windows network paths (UNC)
  - Better handling of Windows drive letter case-sensitivity
  - Improved symlink and file permission handling for Unix/Mac
  - Enhanced path separator normalization
  - Added platform-specific file ignores:
    - Windows: Thumbs.db, desktop.ini, system files (CON, PRN, etc.)
    - macOS: .DS_Store, .Spotlight, .Trashes, .fseventsd
    - Linux: /proc, /sys, /dev directories
    - Common: .git, node_modules, IDE folders
- File system access
  - Better error handling for inaccessible files and directories
  - Improved permission handling across different OS security models
  - More informative error messages for file system issues

### Security

- Added validation for file paths to prevent directory traversal
- Improved handling of inaccessible directories and files
- Better error handling for file system operations
- Platform-specific security checks:
  - Windows: System file and directory restrictions
  - Unix/Linux: Permission and ownership validation
  - macOS: System integrity protection awareness

### Performance

- Optimized path normalization operations
  - Reduced redundant path conversions
  - Improved caching of normalized paths
- Improved memory usage in path handling
  - Better string manipulation for path operations
  - Reduced duplicate path storage
- Better handling of large directory structures
  - Optimized directory traversal
  - Improved file filtering performance
- Enhanced error recovery and graceful degradation

## 2024-03-01

### Added

- Initial release
- Basic file system operations
- File selection and copying
- Directory tree view
- Search and sort functionality
