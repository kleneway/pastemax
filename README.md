# PasteMax

<p align="center">
   <img src="https://github.com/user-attachments/assets/fe5ed9f2-fcb1-41d7-bc38-fb130fadf116" width="150" alt="PasteMaxIcon">
</p>

<p align="center">
   A modern file viewer application for developers to easily navigate, search, and copy code from repositories.<br/>
   Ideal for pasting into ChatGPT or your LLM of choice. Built with Electron, React, and TypeScript.
</p>

<p align="center">
   <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
   <a href="https://github.com/kleneway/pastemax/issues"><img src="https://img.shields.io/github/issues/kleneway/pastemax" alt="GitHub issues"></a>
   <a href="https://github.com/kleneway/pastemax/releases/latest"><img src="https://img.shields.io/github/v/release/kleneway/pastemax" alt="GitHub releases"></a>
</p>

## Overview

PasteMax is a simple desktop app built for developers using AI coding assistants. It makes sharing your code with LLMs easy, thanks to a smart file explorer with token counting, file filtering, quick copy, and a previewer. Select the files you need, skip binaries and junk, and get clean, formatted snippets ready for your LLM.

![PasteMax](https://github.com/user-attachments/assets/c2eea45f-2696-4bfa-8eaf-a6b07e7ca522)
![FilePreview](https://github.com/user-attachments/assets/9bb9b6ff-b9cc-4655-b8a8-318f23c2e2b0)
![ModelList](https://github.com/user-attachments/assets/e045f4f0-1bdd-4a30-8696-b388d598dcc5)

## Video

[YouTube Link](https://youtu.be/YV-pZSDNnPo)

## Features

### 📁 File Navigation & Management

- **File Tree Navigation**: Browse directories and files with an expandable tree view
- **Search Capabilities**: Quickly find files by name or content
- **Sorting Options**: Sort files by name, size, or token count
- **File Change Watcher**: Automatically updates the file list when files are added, modified, or deleted
- **Manual Refresh**: Option to perform a full directory re-scan when needed

### 🤖 AI-Ready Features

- **Token Counting**: View approximate token count for each file
- **Model Context Limit**: Select different models (Claude-3.7, GPT-4o, Gemini 2.5, etc.)
- **Context Limit Warning**: Get alerted when selections exceed the model's context limit

### 🔍 Content & Preview

- **File Previewer**: View file contents in a dedicated preview pane
- **Selection Management**: Select multiple files and copy their contents together
- **Binary File Detection**: Automatic detection and exclusion of binary files
- **Smart File Exclusion**: Auto-excludes package-lock.json, node_modules, etc.

### 💼 Workflow Enhancements

- **Workspace Management**: Save and load workspaces for quick directory access
- **Automatic Update Checker**: Stay current with the latest releases
- **Dark Mode**: Toggle between light and dark themes for comfortable viewing
- **Cross-Platform**: Available for Windows, Mac, Linux and WSL

## Installation

### Download Binary

Download the latest PasteMax version from the [releases page](https://github.com/kleneway/pastemax/releases/latest).

### Build from Source

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
npm run build:electron
```

4. Package the app for your platform:
```
# For macOS
npm run package:mac

# For Windows
npm run package:win

# For Linux
npm run package:linux
```

After successful packaging, you'll find the executable files inside the `release-builds` directory.

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm

### Running in Development Mode

To run the application in development mode with hot-reloading for both the frontend and backend:

```
npm run dev:all
```

This will start the Vite dev server for the React app and the Electron main process concurrently.

### Building for Production

To build the application for production:

```
# Build the React app with Vite and update paths for Electron
npm run build:electron

# Create platform-specific distributables
npm run package:mac    # macOS
npm run package:win    # Windows  
npm run package:linux  # Linux
```

## Project Structure

- **`src/`** - React application source code (Renderer Process)
  - `components/` - Reusable React components
  - `context/` - React context providers (e.g., ThemeContext)
  - `hooks/` - Custom React hooks for stateful logic
  - `types/` - TypeScript type definitions
  - `utils/` - Utility functions for the frontend
  - `styles/` - Modularized CSS stylesheets
- **`electron/`** - Electron-Backend related files (Main Process)
  - `main.js` - Main process entry point, window management, and IPC handling
  - `preload.js` - Preload script for secure IPC communication
  - `file-processor.js` - Logic for reading files, counting tokens, etc.
  - `ignore-manager.js` - Logic for handling `.gitignore` and other ignore patterns
  - `update-manager.js` - Logic for managing update checks
  - `watcher.js` - File system watcher logic using Chokidar
- **`public/`** - Static assets (e.g., icons)
- **`scripts/`** - Utility scripts for building, testing, and debugging

## Libraries Used

- **Electron** - Desktop application framework
- **React** & **TypeScript** - For building the user interface
- **Vite** - Build tool and development server
- **Tiktoken** - Fast BPE tokenization for LLM context estimation
- **ignore** - For `.gitignore`-style pattern matching
- **Chokidar** - Advanced file system watcher

## Troubleshooting

### Getting "Warning: Not trusted" on Windows

If you see a warning about the app not being trusted, you can bypass this by clicking "More info" -> "Run anyway". This is a common issue with unsigned Electron apps.

### Getting "App can't be opened" on Mac

If you encounter this message on macOS, it may be due to security settings.
1. Right-click the `PasteMax.app` file and select "Open".
2. You may see a warning dialog. Click "Open" again to confirm.
You should only need to do this the first time you run the app.

### Other Issues

If you encounter other issues, please [report them on GitHub](https://github.com/kleneway/pastemax/issues).

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.

## Star History ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=kleneway/pastemax&type=Date)](https://www.star-history.com/#kleneway/pastemax&Date)

---
