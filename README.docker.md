# Docker Setup for PasteMax

This guide explains how to use Docker for building the PasteMax Electron application.

## Prerequisites

- Docker
- Docker Compose

## Setup and Usage

### 1. Build the Docker Image

```bash
docker compose build
```

### 2. Start and enter the Container

```bash
docker compose run --rm pastemax-dev bash
```

### 3. Inside the Container

Once inside the container, you can run the build commands:

```bash
# Install dependencies
npm install

# Package the application for your platform
npm run package:win    # For Windows
npm run package:mac    # For macOS
npm run package:linux  # For Linux
npm run package:all    # For all platforms
```

### 4. Ensure the host can access the built artifacts

From the host, run:
```bash
chmod -R 777 release-builds
```

### 5. Run the Application

The built application will be available in the `release-builds` directory on your host machine. You can run it directly from there.

For example, on Windows, it is built at:
```
`.\pastemax\release-builds\win-unpacked\PasteMax.exe`
```

## Workflow

1. Develop and edit code on your host machine
2. Use the container for building and packaging
3. Run the packaged application on your host machine

## Notes

- This setup is for building only. The Electron app cannot run inside the container with a GUI.
- The project directory is mounted as a volume, so any changes you make on your host are immediately available in the container.
- Build artifacts created in the container are immediately available on your host.
