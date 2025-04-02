# Changelog

All notable changes to this project will be documented in this file.

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