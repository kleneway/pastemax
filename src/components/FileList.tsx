// src/components/FileList.tsx
import { useState, useMemo, useCallback } from 'react';
import { FileListProps, FileData } from '../types/FileTypes';
import FileCard from './FileCard';
import FilePreviewModal from './FilePreviewModal';
import { arePathsEqual } from '../utils/pathUtils';

// Add proper memoization to avoid unnecessary re-renders
const FileList = ({
  files,
  selectedFiles,
  toggleFileSelection,
  onChatAbout,
  isLlmConfigured,
}: FileListProps) => {
  // Only show files that are in the selectedFiles array and not binary/skipped
  const displayableFiles = useMemo(
    () =>
      files.filter(
        (file: FileData) =>
          selectedFiles.some((selectedPath) => arePathsEqual(selectedPath, file.path)) &&
          !file.isSkipped &&
          !file.excludedByDefault
      ),
    [files, selectedFiles]
  );

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [activePreviewFile, setActivePreviewFile] = useState('' as string); // Track active file

  // Get live file data for preview instead of using stale snapshot
  const previewFiles = useMemo(() => {
    if (!activePreviewFile) return [];
    const fileToPreview = files.find((f) => f.path === activePreviewFile);
    return fileToPreview ? [fileToPreview] : [];
  }, [files, activePreviewFile]);

  // Memoize the handlePreview to prevent recreation on each render
  const handlePreview = useCallback(
    (filePath: string) => {
      const fileToPreview = files.find((f) => f.path === filePath);
      if (fileToPreview) {
        setActivePreviewFile(filePath);
        setPreviewModalOpen(true);
      }
    },
    [files]
  );

  // Memoize the handleClosePreview to prevent recreation on each render
  const handleClosePreview = useCallback(() => {
    setPreviewModalOpen(false);
    setActivePreviewFile('');
  }, []);

  // Memoize the rendered file cards to prevent unnecessary re-renders
  const renderedFileCards = useMemo(() => {
    return displayableFiles.map((file: FileData) => (
      <FileCard
        key={file.path}
        file={file}
        isSelected={true} // All displayed files are selected
        toggleSelection={toggleFileSelection}
        onPreview={handlePreview} // Pass the preview handler
        onChatAbout={onChatAbout} // Pass the chat handler
        isLlmConfigured={isLlmConfigured} // Pass LLM configuration status
      />
    ));
  }, [displayableFiles, toggleFileSelection, handlePreview, onChatAbout, isLlmConfigured]);

  return (
    <div className="file-list-container">
      {displayableFiles.length > 0 ? (
        <div className="file-list">{renderedFileCards}</div>
      ) : (
        <div className="file-list-empty">
          {files.length > 0
            ? 'No files selected. Select files from the sidebar.'
            : 'Select a folder to view files'}
        </div>
      )}
      <FilePreviewModal
        isOpen={previewModalOpen}
        onClose={handleClosePreview}
        files={previewFiles}
        initialActiveFile={activePreviewFile}
      />
    </div>
  );
};

export default FileList;
