// This file contains static lists of patterns and extensions used for file exclusion and type identification.

// Default ignore patterns that should always be applied universally.
// These are fundamental ignores like .git, node_modules, common build outputs, etc.
const DEFAULT_PATTERNS = [
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'bin',
  'Debug',
  'Release',
  'x64',
  'x86',
  '.output',
  '*.min.js',
  '*.min.css',
  '*.bundle.js',
  '*.compiled.*',
  '*.generated.*',
  '.cache',
  '.parcel-cache',
  '.webpack',
  '.turbo',
  '.idea',
  '.vscode',
  '.vs',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.asar',
  'release-builds',
];

// Additional patterns to exclude *specifically* when in "Global" ignore mode.
// These supplement DEFAULT_PATTERNS in Global mode.
const GlobalModeExclusion = [
  // NPM/Yarn/Node related
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  'node_modules/**',
  // Disabled for now:
  // 'package-lock.json',
  // 'yarn.lock',
  // 'pnpm-lock.yaml',
  // '.npmrc',
  // '.yarnrc',
  // '.nvmrc',

  // JavaScript/TypeScript related
  // Disabled for now:
  // '.eslintrc*',
  // '.prettierrc*',
  // 'tsconfig*.json',
  // '*.d.ts',
  '*.min.js',
  '*.map',

  // Python related
  '__pycache__/**',
  '*.pyc',
  '*.pyo',
  '*.pyd',
  '.pytest_cache/**',
  '.coverage',
  '.python-version',
  'venv/**',
  '.venv/**',
  '*.egg-info/**',
  'pip-log.txt',
  'pip-delete-this-directory.txt',

  // Go related
  'go.sum',
  'go.mod',
  'vendor/**',

  // Java related
  '*.class',
  '*.jar',
  'target/**',
  '.gradle/**',

  // Ruby related
  'Gemfile.lock',
  '.bundle/**',

  // PHP related
  'composer.lock',
  'vendor/**',

  // Rust related
  'Cargo.lock',
  'target/**',

  // .NET related
  'bin/**',
  'obj/**',
  'obj/**',
  '*.suo',
  '*.user',

  // Binary and image files (general archive/compressed types)
  '*.zip',
  '*.tar.gz',
  '*.tgz',
  '*.rar',

  // IDE and editor files (some already in DEFAULT_PATTERNS)
  '.idea',
  '.vscode',
  '.vs',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.swp',
  '*.swo',

  // Log files
  'logs/**',
  '*.log',

  // Database files
  '*.sqlite',
  '*.db',

  // Environment and secrets
  '.env*',
  '.aws/**',
  '*.pem',
  '*.key',
];

// File extensions to always mark as binary/unselectable.
// This list helps identify files that shouldn't have their content read or processed as text.
const binaryExtensions = [
  // images:
  '.svg',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.tiff',
  '.ico',
  '.icns',
  '.webp',
  '.psd',
  '.heic',
  '.heif',

  // videos:
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',

  // audio:
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',

  // documents:
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',

  // other:
  '.zip',
  '.rar',
  '.tar',
  '.gz',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.class',
  '.o',
  '.pyc',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.bin',
  '.dat',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.cmap',
];

module.exports = {
  DEFAULT_PATTERNS,
  GlobalModeExclusion,
  binaryExtensions,
};
