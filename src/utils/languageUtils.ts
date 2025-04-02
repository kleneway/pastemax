/**
 * Utility functions for language detection and syntax highlighting
 * This module provides comprehensive language identification for syntax highlighting
 * with support for various file types, extensions, and LLM-compatible formatting.
 */

/**
 * Common files without extensions and their corresponding language identifiers
 */
const NO_EXTENSION_MAP: Record<string, string> = {
  // Common no-extension files
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'makefile': 'makefile',
  'Jenkinsfile': 'groovy',
  'README': 'markdown',
  'LICENSE': 'text',
  'CODEOWNERS': 'text',
  'CONTRIBUTING': 'markdown',
  
  // Hidden configuration files
  '.gitignore': 'gitignore',
  '.gitattributes': 'gitattributes',
  '.gitmodules': 'gitconfig',
  '.env': 'shell',
  '.npmrc': 'ini',
  '.yarnrc': 'yaml',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  '.dockerignore': 'gitignore',
  '.htaccess': 'apacheconf',
  '.flowconfig': 'ini',
};

/**
 * Special compound extensions and their corresponding language identifiers
 * Important for files that use multiple extensions or specific naming patterns
 */
const COMPOUND_EXT_MAP: Record<string, string> = {
  // ESLint configurations
  '.eslintrc.js': 'javascript',
  '.eslintrc.cjs': 'javascript',
  '.eslintrc.mjs': 'javascript',
  '.eslintrc.json': 'json',
  '.eslintrc.yml': 'yaml',
  '.eslintrc.yaml': 'yaml',
  
  // Babel configurations
  '.babelrc.js': 'javascript',
  '.babelrc.cjs': 'javascript',
  '.babelrc.json': 'json',
  
  // TypeScript configurations
  '.tsconfig.json': 'json',
  'tsconfig.json': 'json',
  'tsconfig.app.json': 'json',
  'tsconfig.spec.json': 'json',
  
  // Prettier configurations
  '.prettierrc.js': 'javascript',
  '.prettierrc.cjs': 'javascript',
  '.prettierrc.json': 'json',
  '.prettierrc.yml': 'yaml',
  '.prettierrc.yaml': 'yaml',
  
  // Jest configurations
  'jest.config.js': 'javascript',
  'jest.config.ts': 'typescript',
  'jest.config.json': 'json',
  
  // TypeScript declaration files
  '.d.ts': 'typescript',
  
  // Test files
  '.test.js': 'javascript',
  '.test.jsx': 'jsx',
  '.test.ts': 'typescript',
  '.test.tsx': 'tsx',
  '.spec.js': 'javascript',
  '.spec.jsx': 'jsx',
  '.spec.ts': 'typescript',
  '.spec.tsx': 'tsx',
  '.e2e.js': 'javascript',
  '.e2e.ts': 'typescript',
  
  // Configuration files
  '.config.js': 'javascript',
  '.config.ts': 'typescript',
  
  // CSS Modules
  '.module.css': 'css',
  '.module.scss': 'scss',
  '.module.sass': 'sass',
  '.module.less': 'less',
  
  // React Native
  '.native.js': 'javascript',
  '.ios.js': 'javascript',
  '.android.js': 'javascript',
  '.native.jsx': 'jsx',
  '.ios.jsx': 'jsx',
  '.android.jsx': 'jsx',
  '.native.ts': 'typescript',
  '.ios.ts': 'typescript',
  '.android.ts': 'typescript',
  '.native.tsx': 'tsx',
  '.ios.tsx': 'tsx',
  '.android.tsx': 'tsx',
  
  // Webpack configs
  'webpack.config.js': 'javascript',
  'webpack.config.ts': 'typescript',
  'webpack.dev.js': 'javascript',
  'webpack.prod.js': 'javascript',
  'webpack.common.js': 'javascript',
  
  // Rollup configs
  'rollup.config.js': 'javascript',
  'rollup.config.ts': 'typescript',
  
  // Next.js
  'next.config.js': 'javascript',
  'next.config.mjs': 'javascript',
  
  // Vite configs
  'vite.config.js': 'javascript',
  'vite.config.ts': 'typescript',
  
  // Astro configs
  'astro.config.mjs': 'javascript',
  'astro.config.js': 'javascript',
  'astro.config.ts': 'typescript',
  
  // Svelte configs
  'svelte.config.js': 'javascript',
  'svelte.config.cjs': 'javascript',
  
  // Nuxt configs
  'nuxt.config.js': 'javascript',
  'nuxt.config.ts': 'typescript',
  
  // Tailwind CSS
  'tailwind.config.js': 'javascript',
  'tailwind.config.cjs': 'javascript',
  'tailwind.config.ts': 'typescript',
  
  // PostCSS
  'postcss.config.js': 'javascript',
  'postcss.config.cjs': 'javascript',
};

/**
 * File extensions and their corresponding language identifiers
 * Extensive collection of file extensions mapped to appropriate language syntaxes
 */
const EXTENSION_MAP: Record<string, string> = {
  // Web Technologies
  'html': 'html',
  'htm': 'html',
  'xhtml': 'html',
  'shtml': 'html',
  'css': 'css',
  'pcss': 'css', // PostCSS
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',
  'styl': 'stylus',
  'js': 'javascript',
  'jsx': 'jsx',
  'mjs': 'javascript', // ES modules
  'cjs': 'javascript', // CommonJS modules
  'ts': 'typescript',
  'tsx': 'tsx',
  'cts': 'typescript', // CommonJS TypeScript
  'mts': 'typescript', // ES Module TypeScript
  'json': 'json',
  'jsonc': 'jsonc', // JSON with comments
  'json5': 'json5',
  'webmanifest': 'json',
  'wasm': 'wasm',
  
  // Template Languages
  'pug': 'pug',
  'jade': 'pug',
  'ejs': 'ejs',
  'hbs': 'handlebars',
  'handlebars': 'handlebars',
  'mustache': 'mustache',
  'twig': 'twig',
  'liquid': 'liquid',
  'njk': 'nunjucks',
  'haml': 'haml',
  'slim': 'slim',
  
  // Modern Web Frameworks
  'vue': 'vue',
  'svelte': 'svelte',
  'astro': 'astro',
  'mdx': 'mdx',
  'cshtml': 'razor',
  'razor': 'razor',
  'cshtml.cs': 'csharp',
  'graphql': 'graphql',
  'gql': 'graphql',
  'apollo': 'graphql',
  
  // Documentation
  'md': 'markdown',
  'markdown': 'markdown',
  'txt': 'text',
  'text': 'text',
  'rst': 'restructuredtext',
  'rest': 'restructuredtext',
  'adoc': 'asciidoc',
  'asciidoc': 'asciidoc',
  'tex': 'latex',
  'latex': 'latex',
  'wiki': 'wiki',
  'org': 'org',
  
  // Configuration
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'ini': 'ini',
  'cfg': 'ini',
  'conf': 'ini',
  'config': 'ini',
  'properties': 'properties',
  'prop': 'properties',
  'env': 'shell',
  'dotenv': 'shell',
  'editorconfig': 'ini',
  'gitignore': 'gitignore',
  'gitattributes': 'gitattributes',
  'gitconfig': 'gitconfig',
  'dockerignore': 'gitignore',
  'htaccess': 'apacheconf',
  'nginx': 'nginx',
  'xml': 'xml',
  'plist': 'xml',
  'svg': 'svg',
  'ant': 'xml',
  'dtd': 'xml',
  'xsd': 'xml',
  'xsl': 'xsl',
  'xslt': 'xsl',
  'wsdl': 'xml',
  'xliff': 'xml',
  'xaml': 'xml',
  
  // Scripts and Shell
  'sh': 'shell',
  'bash': 'bash',
  'zsh': 'shell',
  'fish': 'shell',
  'ksh': 'shell',
  'csh': 'shell',
  'tcsh': 'shell',
  'bat': 'batch',
  'cmd': 'batch',
  'ps1': 'powershell',
  'psm1': 'powershell',
  'psd1': 'powershell',
  'ps1xml': 'powershell',
  
  // Programming Languages - Scripting
  'py': 'python',
  'pyi': 'python', // Python interface files
  'pyc': 'python',
  'pyd': 'python',
  'pyw': 'python',
  'pyx': 'cython',
  'pxd': 'cython',
  'ipynb': 'jupyter', // Jupyter notebook
  'rb': 'ruby',
  'erb': 'erb', // Ruby templating
  'gemspec': 'ruby',
  'rake': 'ruby',
  'php': 'php',
  'php4': 'php',
  'php5': 'php',
  'php7': 'php',
  'php8': 'php',
  'phps': 'php',
  'phpt': 'php',
  'phtml': 'php',
  'pl': 'perl',
  'pm': 'perl',
  't': 'perl',
  'pod': 'perl',
  'lua': 'lua',
  'r': 'r',
  'rmd': 'rmarkdown',
  'swift': 'swift',
  'tcl': 'tcl',
  'tk': 'tcl',
  'exp': 'tcl',
  
  // Programming Languages - JVM
  'java': 'java',
  'jsp': 'jsp',
  'jspx': 'jsp',
  'groovy': 'groovy',
  'gvy': 'groovy',
  'gy': 'groovy',
  'gsh': 'groovy',
  'gradle': 'gradle',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'ktm': 'kotlin',
  'scala': 'scala',
  'sc': 'scala',
  'clj': 'clojure',
  'cljs': 'clojure',
  'cljc': 'clojure',
  'edn': 'clojure',
  
  // Programming Languages - C-family
  'c': 'c',
  'h': 'c',
  'i': 'c',
  'cpp': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'c++': 'cpp',
  'hpp': 'cpp',
  'hh': 'cpp',
  'hxx': 'cpp',
  'h++': 'cpp',
  'ii': 'cpp',
  'ino': 'cpp', // Arduino
  'cs': 'csharp',
  'csx': 'csharp',
  'cake': 'csharp',
  'fs': 'fsharp',
  'fsi': 'fsharp',
  'fsx': 'fsharp',
  'fsproj': 'xml',
  'vb': 'vb',
  'vbs': 'vb',
  'vba': 'vb',
  'bas': 'vb',
  'frm': 'vb',
  'cls': 'vb',
  'm': 'objectivec', // Objective-C or Matlab
  'mm': 'objectivec',
  
  // Programming Languages - Others
  'go': 'go',
  'rs': 'rust',
  'dart': 'dart',
  'ex': 'elixir',
  'exs': 'elixir',
  'erl': 'erlang',
  'hrl': 'erlang',
  'hs': 'haskell',
  'lhs': 'haskell',
  'cabal': 'haskell',
  'agda': 'agda',
  'elm': 'elm',
  'lisp': 'lisp',
  'scm': 'scheme',
  'ss': 'scheme',
  'rkt': 'racket',
  'ml': 'ocaml',
  'mli': 'ocaml',
  'fs.js': 'javascript',  // Node.js filesystem module
  
  // Game Development
  'gd': 'gdscript', // Godot
  'unity': 'yaml',  // Unity metadata
  'prefab': 'yaml', // Unity prefab
  'mat': 'yaml',    // Unity material
  'anim': 'yaml',   // Unity animation
  
  // Infrastructure & DevOps
  'tf': 'terraform',
  'tfvars': 'terraform',
  'hcl': 'hcl',
  'workflow': 'yaml', // GitHub Actions
  'jenkinsfile': 'groovy',
  'dockerfile': 'dockerfile',
  'vagrantfile': 'ruby',
  'vagrantfile.local': 'ruby',
  'proto': 'protobuf',
  'bicep': 'bicep', // Azure Bicep
  'nomad': 'hcl',
  
  // Data Formats
  'csv': 'csv',
  'tsv': 'tsv',
  'sql': 'sql',
  'mysql': 'sql',
  'pgsql': 'sql',
  'sqlite': 'sql',
  'prisma': 'prisma',
  'graphqls': 'graphql',
  
  // Build configuration
  'makefile': 'makefile',
  'mk': 'makefile',
  'mak': 'makefile',
  'cmake': 'cmake',
  'cmakelists.txt': 'cmake',
  
  // Mobile Development
  'xcodeproj': 'json',
  'pbxproj': 'json',
  'storyboard': 'xml',
  'xib': 'xml',
  
  // Others
  'diff': 'diff',
  'patch': 'diff',
};

/**
 * LLM-compatible language identifiers for specific syntax highlighting
 * Some language identifiers need special mapping for LLM code blocks
 */
const LLM_LANGUAGE_MAP: Record<string, string> = {
  // Standardized names for LLM syntax highlighting
  'javascript': 'javascript',
  'typescript': 'typescript',
  'jsx': 'jsx',
  'tsx': 'tsx',
  'json': 'json',
  'css': 'css',
  'html': 'html',
  'markdown': 'markdown',
  'python': 'python',
  'ruby': 'ruby',
  'go': 'go',
  'rust': 'rust',
  'java': 'java',
  'c': 'c',
  'cpp': 'cpp',
  'csharp': 'csharp',
  'shell': 'shell',
  'bash': 'bash',
  'sql': 'sql',
  'yaml': 'yaml',
  'dockerfile': 'dockerfile',
  
  // Aliases and normalizations
  'yml': 'yaml',
  'sh': 'shell',
  'js': 'javascript',
  'ts': 'typescript',
  'md': 'markdown',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'cs': 'csharp',
  'c++': 'cpp',
  'makefile': 'makefile',
  'plaintext': 'text',
};

/**
 * Determines the appropriate language identifier for syntax highlighting
 * based on the file name/extension.
 * 
 * Handles common file types, config files, and files with multiple extensions
 * 
 * @param {string} filename - The name of the file
 * @returns {string} The language identifier for syntax highlighting optimized for LLM compatibility
 */
export const getLanguageFromFilename = (filename: string): string => {
  // Normalize filename to lowercase for case-insensitive matching
  const lowercaseFilename = filename.toLowerCase();
  
  // Handle files with no extension
  if (!lowercaseFilename.includes('.')) {
    const language = NO_EXTENSION_MAP[filename] || 'text';
    return getLLMCompatibleLanguage(language);
  }
  
  // Try to match exact filenames (case-insensitive) for configuration files
  if (COMPOUND_EXT_MAP[lowercaseFilename]) {
    return getLLMCompatibleLanguage(COMPOUND_EXT_MAP[lowercaseFilename]);
  }
  
  // Extract full extension including dots (e.g., ".eslint.js")
  const fullExtension = lowercaseFilename.substring(lowercaseFilename.indexOf('.'));
  
  // Check if the filename has a special compound extension
  for (const [ext, lang] of Object.entries(COMPOUND_EXT_MAP)) {
    if (lowercaseFilename.endsWith(ext.toLowerCase())) {
      return getLLMCompatibleLanguage(lang);
    }
  }
  
  // If not a compound extension, use just the last extension
  const extension = lowercaseFilename.split('.').pop() || '';
  
  // Get the language from the extension map or use the extension itself
  const language = EXTENSION_MAP[extension] || extension || 'text';
  
  return getLLMCompatibleLanguage(language);
};

/**
 * Converts a language identifier to an LLM-compatible format
 * This ensures code blocks are properly highlighted in LLM contexts
 * 
 * @param {string} language - The raw language identifier
 * @returns {string} The LLM-compatible language identifier
 */
function getLLMCompatibleLanguage(language: string): string {
  // Return the standardized LLM language name or the original if not mapped
  return LLM_LANGUAGE_MAP[language.toLowerCase()] || language;
} 