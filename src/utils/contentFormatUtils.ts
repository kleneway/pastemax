/**
 * Utility functions for formatting content for copying
 */

import { FileData } from '../types/FileTypes';
import { generateAsciiFileTree, normalizePath } from './pathUtils';
import { getLanguageFromFilename } from './languageUtils';

/**
 * Interface defining parameters for formatting file content
 */
interface FormatContentParams {
  files: FileData[]; // All files in the project
  selectedFiles: string[]; // Paths of selected files
  sortOrder: string; // Current sort order (e.g., "tokens-desc")
  includeFileTree: boolean; // Whether to include file tree in output
  includeBinaryPaths: boolean; // Whether to include binary file paths in output
  selectedFolder: string | null; // Current selected folder path
  userInstructions: string; // User instructions to append to content
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
export const formatBaseFileContent = ({
  files,
  selectedFiles,
  sortOrder,
  includeFileTree,
  includeBinaryPaths,
  selectedFolder,
}: Omit<FormatContentParams, 'userInstructions'>): string => {
  // Sort files according to current sort settings
  const sortedSelected = files
    .filter((file: FileData) => selectedFiles.includes(file.path))
    .sort((a: FileData, b: FileData) => {
      let comparison = 0;
      const [sortKey, sortDir] = sortOrder.split('-');

      if (sortKey === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortKey === 'tokens') {
        comparison = a.tokenCount - b.tokenCount;
      } else if (sortKey === 'size') {
        comparison = a.size - b.size;
      }

      return sortDir === 'asc' ? comparison : -comparison;
    });

  if (sortedSelected.length === 0) {
    return '';
  }

  // Separate files into text and binary
  const normalFiles = sortedSelected.filter((file) => !file.isBinary);
  const binaryFiles = sortedSelected.filter((file) => file.isBinary);

  let concatenatedString = '';

  // Add ASCII file tree if enabled within <file_map> tags
  if (includeFileTree && selectedFolder) {
    const normalizedFolder = normalizePath(selectedFolder);
    const asciiTree = generateAsciiFileTree(sortedSelected, selectedFolder);
    concatenatedString += `<file_map>\n${normalizedFolder}\n${asciiTree}\n</file_map>\n\n`;
  }

  // Add file contents section with consistent spacing
  concatenatedString += `<file_contents>\n`;

  // Add each text file with its path and language-specific syntax highlighting
  normalFiles.forEach((file: FileData) => {
    const language = getLanguageFromFilename(file.name);
    const normalizedPath = normalizePath(file.path);
    concatenatedString += `File: ${normalizedPath}\n\`\`\`${language}\n${file.content}\n\`\`\`\n\n`;
  });

  // Add binary files section if enabled and files exist
  if (includeBinaryPaths && binaryFiles.length > 0) {
    concatenatedString += `<binary_files>\n`;
    binaryFiles.forEach((file: FileData) => {
      const normalizedPath = normalizePath(file.path);
      const fileType = getLanguageFromFilename(file.name);
      concatenatedString += `File: ${normalizedPath}\nThis is a file of the type: ${fileType.charAt(0).toUpperCase() + fileType.slice(1)}\n\n`;
    });
    concatenatedString += `</binary_files>\n\n`;
  }

  // Consistent closing of file_contents section
  concatenatedString += `</file_contents>\n`;

  return concatenatedString;
};

export const formatUserInstructionsBlock = (userInstructions: string): string => {
  if (!userInstructions.trim()) return '';
  return `<user_instructions>\n${userInstructions.trim()}\n</user_instructions>\n`;
};

export const formatContentForCopying = ({
  files,
  selectedFiles,
  sortOrder,
  includeFileTree,
  includeBinaryPaths,
  selectedFolder,
  userInstructions,
}: FormatContentParams): string => {
  // Sort files according to current sort settings
  const sortedSelected = files
    .filter((file: FileData) => selectedFiles.includes(file.path))
    .sort((a: FileData, b: FileData) => {
      let comparison = 0;
      const [sortKey, sortDir] = sortOrder.split('-');

      if (sortKey === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortKey === 'tokens') {
        comparison = a.tokenCount - b.tokenCount;
      } else if (sortKey === 'size') {
        comparison = a.size - b.size;
      }

      return sortDir === 'asc' ? comparison : -comparison;
    });

  if (sortedSelected.length === 0) {
    return 'No files selected.';
  }

  // Separate files into text and binary
  const normalFiles = sortedSelected.filter((file) => !file.isBinary);
  const binaryFiles = sortedSelected.filter((file) => file.isBinary);

  let concatenatedString = '';

  // Add user instructions block FIRST if present
  if (userInstructions.trim()) {
    concatenatedString += `<user_instructions>\n${userInstructions.trim()}\n</user_instructions>\n`;
  }

  // Add ASCII file tree if enabled within <file_map> tags
  if (includeFileTree && selectedFolder) {
    const normalizedFolder = normalizePath(selectedFolder);
    const asciiTree = generateAsciiFileTree(sortedSelected, selectedFolder);
    concatenatedString += `<file_map>\n${normalizedFolder}\n${asciiTree}\n</file_map>`;
    // Add consistent double newline after section
    concatenatedString += '\n\n';
  }

  // Add file contents section with consistent spacing
  concatenatedString += `<file_contents>`;
  // Always add newline after opening tag
  concatenatedString += '\n';

  // Add each text file with its path and language-specific syntax highlighting
  normalFiles.forEach((file: FileData) => {
    // Use the enhanced getLanguageFromFilename utility for optimal language detection
    const language = getLanguageFromFilename(file.name);
    // Normalize the file path for cross-platform compatibility
    const normalizedPath = normalizePath(file.path);

    // Add file path and content with language-specific code fencing
    concatenatedString += `File: ${normalizedPath}\n\`\`\`${language}\n${file.content}\n\`\`\`\n\n`;
  });

  // Add binary files section if enabled and files exist
  if (includeBinaryPaths && binaryFiles.length > 0) {
    // Remove extra newline before binary_files tag for consistency
    concatenatedString += `<binary_files>\n`;

    // Add each binary file entry
    binaryFiles.forEach((file: FileData) => {
      const normalizedPath = normalizePath(file.path);
      // Get better file type description using language detection
      const fileType = getLanguageFromFilename(file.name);
      concatenatedString += `File: ${normalizedPath}\nThis is a file of the type: ${fileType.charAt(0).toUpperCase() + fileType.slice(1)}\n\n`;
    });

    // Close binary files section with an extra newline for spacing
    concatenatedString += `</binary_files>\n\n`;
  }

  // Consistent closing of file_contents section
  concatenatedString += `</file_contents>`;
  // Add consistent double newline after section
  concatenatedString += '\n\n';

  return concatenatedString;
};
