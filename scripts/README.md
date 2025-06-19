# Build Scripts

This directory contains various utility scripts for building, packaging, debugging, and testing the Electron application.

## Available Scripts

### `verify-build.js`

Verifies that your `package.json` build configuration is correct for Electron builds. It checks that all required fields are present and that the main file exists.

**Usage:**
```bash
npm run verify-build
```

### `test-local-build.js`

Tests the complete build and packaging process for Electron locally. This is useful for debugging issues with the build process before pushing to GitHub.

**Usage:**
```bash
# Test the build for the current platform
npm run test-build

# Test for a specific platform
npm run test-build:mac
npm run test-build:win
npm run test-build:linux
```

### `notarize.js`

This script is called by `electron-builder` after signing a macOS app. It handles the notarization process with Apple, which is required for distribution on macOS. It uses environment variables (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `TEAM_ID`) for authentication.

**Usage:** This script is typically run automatically by the build process and does not need to be called manually.

### `fix-dependencies.js`

A utility script to help ensure that critical native dependencies (like `tiktoken` and `ignore`) are correctly unpacked from the ASAR archive in the final packaged application. It modifies the `asarUnpack` configuration in `package.json`.

**Usage:** Run this script if you encounter "module not found" errors in the packaged application.
```bash
node scripts/fix-dependencies.js
```

### `test-file-watcher.js`

A script to test the file watcher functionality. Run this script in a directory that PasteMax is currently watching to simulate file additions, modifications, and deletions.

**Usage:**
1. Open PasteMax and select a folder.
2. In your terminal, `cd` into that same folder.
3. Run the script:
   ```bash
   node /path/to/pastemax/scripts/test-file-watcher.js
   ```
4. Observe the output in the terminal and see the file list update in the PasteMax UI.

## Debugging GitHub Actions

If you're having issues with GitHub Actions not building the binaries correctly, use the debug workflow:

1.  Run the `debug-gh-release` script to create a debug tag:
    ```bash
    npm run debug-gh-release
    ```
2.  This will trigger the `.github/workflows/debug-build.yml` workflow, which includes extensive logging.
3.  Check the GitHub Actions logs for detailed information about the build process.

## Troubleshooting Common Issues

### No binaries in release

If your GitHub release only contains source code and no binaries:

1. Check that the workflow actually ran (look in GitHub Actions tab)
2. Verify that the workflow is configured to upload artifacts to the release
3. Make sure your electron-builder configuration in package.json is correct
4. Run the test-build script locally to see if it works on your machine
5. Use the debug-gh-release script to create a debug build with extra logging

### Incorrect artifact paths

If the workflow is failing to find artifacts:

1. Check that the output directory in package.json matches the paths in the workflow
2. Verify that electron-builder is actually creating the files in the expected location
3. Look at the logs to see where the files are actually being created
