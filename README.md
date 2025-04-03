# PasteMax

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/kleneway/pastemax)](https://github.com/kleneway/pastemax/issues)

A modern file viewer application for developers to easily navigate, search, and copy code from repositories. Ideal for pasting into ChatGPT or your LLM of choice. Built with Electron, React, and TypeScript.

![PasteMax Screenshot](https://github.com/user-attachments/assets/4115ad31-9c93-4cf8-bd65-4bb5379e0eba)

## Video
[YouTube Link](https://youtu.be/YV-pZSDNnPo)

## Features

- **File Tree Navigation**: Browse directories and files with an expandable tree view
- **Token Counting**: View the approximate token count for each file (useful for LLM context limits)
- **Search Capabilities**: Quickly find files by name or content
- **Selection Management**: Select multiple files and copy their contents together
- **Sorting Options**: Sort files by name, size, or token count
- **Dark Mode**: Toggle between light and dark themes for comfortable viewing in any environment
- **Binary File Detection**: Automatic detection and exclusion of binary files
- **Smart File Exclusion**: Automatically excludes common files like package-lock.json, binary files, and more by default
- **File Change Watcher**: Automatically updates the files whenever changes are detected

## Installation

### Download Binary

Download the latest version from the [releases page](https://github.com/kleneway/pastemax/releases).

### Or Build from Source

1. Clone the repository:

```
git clone https://github.com/kleneway/pastemax.git
cd pastemax
```

2. Install dependencies:

```
npm install
```

3. Build the app:

```
npm run build-electron
npm run package
```

**Note for Windows users**: If you encounter issues with `npm run package`, you can try the platform-specific command:

```
npm run package:win
```

After successful build, you'll find the executable files in the `release-builds` directory:
- `PasteMax Setup 1.0.0.exe` - Installer version
- `PasteMax 1.0.0.exe` - Portable version

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies:

```
npm install
```

### Running in Development Mode

To run the application in development mode:

```
# Start the Vite dev server
npm run dev

# In a separate terminal, start Electron
npm run dev:electron
```

### Building for Production

To build the application for production:

```
# Build the React app with Vite and update paths for Electron
npm run build-electron

# Create platform-specific distributables
npm run package
```

Platform-specific build commands:
- Windows: `npm run package:win`
- macOS: `npm run package:mac`
- Linux: `npm run package:linux`

## Project Structure

- `src/` - React application source code
  - `components/` - React components
  - `types/` - TypeScript type definitions
  - `styles/` - CSS styles
- `main.js` - Electron main process
- `build.js` - Build script for production
- `excluded-files.js` - Configuration for files to exclude by default
- `docs/` - Documentation
  - `excluded-files.md` - Documentation for the file exclusion feature

## Libraries Used

- Electron - Desktop application framework
- React - UI library
- TypeScript - Type safety
- Vite - Build tool and development server
- tiktoken - Token counting for LLM context estimation
- ignore - .gitignore-style pattern matching for file exclusions
- chokidar - File Watcher

## Customization

You can customize which files are excluded by default by editing the `excluded-files.js` file. See the [excluded files documentation](docs/excluded-files.md) for more details.

## Troubleshooting

### "Cannot find module 'ignore'" error

If you encounter this error when running the packaged application:

```
Error: Cannot find module 'ignore'
Require stack:
- /Applications/PasteMax.app/Contents/Resources/app.asar/main.js
```

This is caused by dependencies not being properly included in the package. To fix it:

1. Run the dependency fixer script:

   ```
   node fix-dependencies.js
   ```

2. Rebuild the application:

   ```
   npm run build-electron && npm run package
   ```

3. Install the new version

### Build Command Issues

If you encounter issues with the standard `npm run package` command:

1. Try using the platform-specific build command:
   - Windows: `npm run package:win`
   - macOS: `npm run package:mac`
   - Linux: `npm run package:linux`

2. Check the `release-builds` directory for output files after building

### Other Issues

If you encounter other issues, please [report them on GitHub](https://github.com/kleneway/pastemax/issues).

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
