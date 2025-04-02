/**
 * Utility functions for formatting content for copying
 */

import { FileData } from "../types/FileTypes";
import { generateAsciiFileTree, normalizePath } from "./pathUtils";
import { getLanguageFromFilename } from "./languageUtils";

/**
 * Interface defining parameters for formatting file content
 */
interface FormatContentParams {
  files: FileData[];           // All files in the project
  selectedFiles: string[];     // Paths of selected files
  sortOrder: string;           // Current sort order (e.g., "tokens-desc")
  includeFileTree: boolean;    // Whether to include file tree in output
  selectedFolder: string | null; // Current selected folder path
  userInstructions: string;    // User instructions to append to content
}

/**
 * Assembles the formatted content for copying
 * The content is assembled in the following order:
 * 1. File tree (if enabled) within <file_map> tags
 * 2. All selected file content within <file_contents> tags
 * 3. User instructions at the end within <user_instructions> tags
 * 
 * Each section is clearly separated with the appropriate tags
 * File contents include the full file path and language syntax highlighting
 * 
 * @param {FormatContentParams} params - Parameters for formatting content
 * @returns {string} The concatenated content ready for copying
 */
export const formatContentForCopying = ({
  files,
  selectedFiles,
  sortOrder,
  includeFileTree,
  selectedFolder,
  userInstructions
}: FormatContentParams): string => {
  // Sort files according to current sort settings
  const sortedSelected = files
    .filter((file: FileData) => selectedFiles.includes(file.path))
    .sort((a: FileData, b: FileData) => {
      let comparison = 0;
      const [sortKey, sortDir] = sortOrder.split("-");

      if (sortKey === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortKey === "tokens") {
        comparison = a.tokenCount - b.tokenCount;
      } else if (sortKey === "size") {
        comparison = a.size - b.size;
      }

      return sortDir === "asc" ? comparison : -comparison;
    });

  if (sortedSelected.length === 0) {
    return "No files selected.";
  }

  let concatenatedString = "";
  
  // Add ASCII file tree if enabled within <file_map> tags
  if (includeFileTree && selectedFolder) {
    const normalizedFolder = normalizePath(selectedFolder);
    const asciiTree = generateAsciiFileTree(sortedSelected, selectedFolder);
    concatenatedString += `<file_map>\n${normalizedFolder}\n${asciiTree}\n</file_map>\n\n`;
  }
  
  // Add file contents section
  concatenatedString += `<file_contents>\n`;
  
  // Add each file with its path and language-specific syntax highlighting
  sortedSelected.forEach((file: FileData) => {
    // Use the enhanced getLanguageFromFilename utility for optimal language detection
    const language = getLanguageFromFilename(file.name);
    // Normalize the file path for cross-platform compatibility
    const normalizedPath = normalizePath(file.path);
    
    // Add file path and content with language-specific code fencing
    concatenatedString += `File: ${normalizedPath}\n\`\`\`${language}\n${file.content}\n\`\`\`\n\n`;
  });
  
  concatenatedString += `</file_contents>\n\n`;
  
  // Add user instructions at the end if present
  if (userInstructions.trim()) {
    concatenatedString += `<user_instructions>\n${userInstructions.trim()}\n</user_instructions>`;
  }

  return concatenatedString;
}; 