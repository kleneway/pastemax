/**
 * Browser-compatible path utilities to replace Node.js path module
 */

/**
 * Extract the basename from a path string
 * @param path The path to extract the basename from
 * @returns The basename (last part of the path)
 */
export function basename(path: string | null | undefined): string {
  if (!path) return "";

  // Ensure path is a string
  const pathStr = String(path);

  // Handle both forward and backslashes
  const normalizedPath = pathStr.replace(/\\/g, "/");
  // Remove trailing slashes
  const trimmedPath = normalizedPath.endsWith("/")
    ? normalizedPath.slice(0, -1)
    : normalizedPath;
  // Get the last part after the final slash
  const parts = trimmedPath.split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Extract the directory name from a path string
 * @param path The path to extract the directory from
 * @returns The directory (everything except the last part)
 */
export function dirname(path: string | null | undefined): string {
  if (!path) return ".";

  // Ensure path is a string
  const pathStr = String(path);

  // Handle both forward and backslashes
  const normalizedPath = pathStr.replace(/\\/g, "/");
  // Remove trailing slashes
  const trimmedPath = normalizedPath.endsWith("/")
    ? normalizedPath.slice(0, -1)
    : normalizedPath;
  // Get everything before the final slash
  const lastSlashIndex = trimmedPath.lastIndexOf("/");
  return lastSlashIndex === -1 ? "." : trimmedPath.slice(0, lastSlashIndex);
}

/**
 * Join path segments together
 * @param segments The path segments to join
 * @returns The joined path
 */
export function join(...segments: (string | null | undefined)[]): string {
  return segments
    .filter(Boolean)
    .map((seg) => String(seg))
    .join("/")
    .replace(/\/+/g, "/"); // Replace multiple slashes with a single one
}

/**
 * Get the file extension
 * @param path The path to get the extension from
 * @returns The file extension including the dot
 */
export function extname(path: string | null | undefined): string {
  if (!path) return "";

  const basenameValue = basename(path);
  const dotIndex = basenameValue.lastIndexOf(".");
  return dotIndex === -1 || dotIndex === 0 ? "" : basenameValue.slice(dotIndex);
}

/**
 * Get the top-level directories from a list of files
 * @param files Array of file objects with path property
 * @param rootPath The root directory path
 * @returns Array of top-level directory paths
 */
export function getTopLevelDirectories(files: { path: string }[], rootPath: string): string[] {
  const topLevelDirs = new Set<string>();
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");

  files.forEach(file => {
    const normalizedPath = file.path.replace(/\\/g, "/");
    if (normalizedPath.startsWith(normalizedRoot + "/")) {
      const relativePath = normalizedPath.substring(normalizedRoot.length + 1);
      const parts = relativePath.split("/");
      if (parts.length > 0) {
        topLevelDirs.add(`${normalizedRoot}/${parts[0]}`);
      }
    }
  });

  return Array.from(topLevelDirs);
}

/**
 * Get all directories (including nested ones) from a list of files
 * @param files Array of file objects with path property
 * @param rootPath The root directory path
 * @returns Array of all directory paths
 */
export function getAllDirectories(files: { path: string }[], rootPath: string): string[] {
  const directories = new Set<string>();
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");

  files.forEach(file => {
    const normalizedPath = file.path.replace(/\\/g, "/");
    if (normalizedPath.startsWith(normalizedRoot + "/")) {
      // Extract all parent directories from file path
      let currentPath = dirname(normalizedPath);
      while (currentPath !== normalizedRoot && currentPath.length > normalizedRoot.length) {
        directories.add(currentPath);
        currentPath = dirname(currentPath);
      }
    }
  });

  return Array.from(directories);
}

/**
 * Generate an ASCII representation of the file tree for the selected files
 * @param items Array of objects containing path and isFile flag
 * @param rootPath The root directory path
 * @returns ASCII string representing the file tree
 */
export function generateAsciiFileTree(items: { path: string; isFile?: boolean }[], rootPath: string): string {
  if (!items.length) return "No files selected.";

  // Normalize the root path for consistent path handling
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
  
  // Create a tree structure from the file paths
  interface TreeNode {
    name: string;
    isFile: boolean;
    children: Record<string, TreeNode>;
  }
  
  const root: TreeNode = { name: basename(normalizedRoot), isFile: false, children: {} };
  
  // Insert a file path into the tree
  const insertPath = (item: { path: string; isFile?: boolean }, node: TreeNode) => {
    const { path: itemPath, isFile = true } = item;
    const normalizedPath = itemPath.replace(/\\/g, "/");
    if (!normalizedPath.startsWith(normalizedRoot)) return;
    
    const relativePath = normalizedPath.substring(normalizedRoot.length).replace(/^\//, "");
    if (!relativePath) return;
    
    const pathParts = relativePath.split("/");
    let currentNode = node;
    
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLast = i === pathParts.length - 1;
      const nodeIsFile = isLast && isFile;
      
      if (!currentNode.children[part]) {
        currentNode.children[part] = {
          name: part,
          isFile: nodeIsFile,
          children: {}
        };
      } else if (isLast) {
        // If we're overriding an existing node and it's the last part,
        // respect the isFile flag
        currentNode.children[part].isFile = nodeIsFile;
      }
      
      currentNode = currentNode.children[part];
    }
  };
  
  // Insert all items into the tree
  items.forEach(item => insertPath(item, root));
  
  // Generate ASCII representation
  const generateAscii = (node: TreeNode, prefix = "", isLast = true, isRoot = true): string => {
    if (!isRoot) {
      let result = prefix;
      result += isLast ? "└── " : "├── ";
      result += node.name;
      result += "\n";
      prefix += isLast ? "    " : "│   ";
      
      const children = Object.values(node.children).sort((a, b) => {
        // Sort by type (directories first) then by name
        if (a.isFile !== b.isFile) {
          return a.isFile ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
      
      return result + children
        .map((child, index) =>
          generateAscii(child, prefix, index === children.length - 1, false)
        )
        .join("");
    } else {
      // Root node special handling
      const children = Object.values(node.children).sort((a, b) => {
        // Sort by type (directories first) then by name
        if (a.isFile !== b.isFile) {
          return a.isFile ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
      
      return children
        .map((child, index) =>
          generateAscii(child, prefix, index === children.length - 1, false)
        )
        .join("");
    }
  };
  
  return generateAscii(root);
}