# Contributing to PasteMax

Thank you for considering contributing to PasteMax! We welcome all contributions, from bug reports to feature requests and code changes.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/your-username/pastemax.git
    cd pastemax
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Create a new branch** for your feature or bugfix:
    ```bash
    git checkout -b feature/your-amazing-feature
    ```

## Development Workflow

To run the application in development mode with hot-reloading for both the frontend (React) and backend (Electron), use the following command:

```bash
npm run dev:all
```

This will:
- Start the Vite dev server for the React app.
- Start the Electron main process, which will load the app from the Vite server.
- Automatically restart the Electron process when you make changes to files in the `electron/` directory.

### Scripts

- `npm run dev`: Starts only the Vite dev server.
- `npm run dev:electron`: Starts only the Electron process (expects the Vite server to be running).
- `npm run lint`: Runs ESLint to check for code quality issues.
- `npm run lint:fix`: Attempts to automatically fix linting issues.
- `npm run format:all`: Formats all code using Prettier.

## Making Changes

1.  Make your code changes in your feature branch.
2.  Ensure your code follows the existing style and conventions.
3.  Add or update documentation in the `docs/` directory if you are changing functionality.
4.  Run the linter to ensure your code is clean:
    ```bash
    npm run lint
    ```
5.  Commit your changes with a clear and descriptive commit message.

## Submitting a Pull Request

1.  Push your feature branch to your fork on GitHub:
    ```bash
    git push origin feature/your-amazing-feature
    ```
2.  Open a **Pull Request** from your feature branch to the `main` branch of the `kleneway/pastemax` repository.
3.  Provide a clear title and description for your pull request, explaining the changes you've made and why.
4.  The maintainers will review your PR as soon as possible. Thank you for your contribution!

## Reporting Issues

- Use the [GitHub Issues](https://github.com/kleneway/pastemax/issues) page to report bugs or suggest new features.
- Before creating a new issue, please check if a similar one already exists.
- When reporting bugs, please include:
  - Steps to reproduce the issue.
  - The expected behavior.
  - The actual behavior.
  - Your operating system and app version.

## License

By contributing to PasteMax, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
