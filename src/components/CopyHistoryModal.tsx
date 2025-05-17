import React, { useState } from 'react';
import { Copy, Clock, X} from 'lucide-react';

export interface CopyHistoryItem {
  content: string;
  timestamp: number;
  label?: string;
}

interface CopyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  copyHistory: CopyHistoryItem[];
  onCopyItem: (content: string) => void;
  onClearHistory: () => void;
}

const CopyHistoryModal = ({
  isOpen,
  onClose,
  copyHistory,
  onCopyItem,
  onClearHistory,
}: CopyHistoryModalProps) => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailView, setShowDetailView] = useState(false);

  if (!isOpen) {
    return null;
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Extract folder path from content
  const extractFolderPath = (content: string) => {
    // Look for a folder path in different formats
    const folderPathMatch = content.match(/(\/[\w/.-]+)/);
    if (folderPathMatch) {
      return folderPathMatch[0];
    }
    return '';
  };

  // Get a simple preview of the content without technical tags
  const getSimplePreview = (content: string) => {
    // Remove XML-like tags
    let simplified = content.replace(/<\/?[^>]+(>|$)/g, '');

    // Remove file paths and technical formatting
    simplified = simplified.replace(/\/[\w/.-]+\s+├──/g, '');

    // Extract user instructions if available
    const instructionsMatch = content.match(/user_instructions>\s*([^<]+)/);
    if (instructionsMatch && instructionsMatch[1]) {
      return (
        instructionsMatch[1].trim().substring(0, 100) +
        (instructionsMatch[1].length > 100 ? '...' : '')
      );
    }

    // Fall back to first 100 chars of simplified content
    return simplified.trim().substring(0, 100) + (simplified.length > 100 ? '...' : '');
  };

  const handleItemClick = (index: number) => {
    setSelectedItem(index);
    // Immediately show detail view when an item is clicked
    setShowDetailView(true);
  };

  const handleCloseDetailView = () => {
    setShowDetailView(false);
  };

  // Process content to make it more readable
  const processContentForDisplay = (content: string) => {
    // Remove XML-like tags but preserve content
    const processedContent = content.replace(
      /<file_map>|<\/file_map>|<file_contents>|<\/file_contents>|<binary_files>|<\/binary_files>|<user_instructions>|<\/user_instructions>/g,
      ''
    );

    // Keep code blocks intact but remove extra formatting
    return processedContent.trim();
  };

  return (
    <>
      <div className="copy-history-modal-overlay" onClick={onClose}>
        <div className="copy-history-modal" onClick={(e) => e.stopPropagation()}>
          <div className="copy-history-modal-header">
            <h3>Copy History</h3>
            <button
              className="copy-history-modal-close-button"
              onClick={onClose}
              aria-label="Close copy history modal"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="copy-history-modal-content">
            {copyHistory.length === 0 ? (
              <div className="copy-history-empty">
                <Clock size={24} />
                <p>No copy history available</p>
              </div>
            ) : (
              <>
                <div className="copy-history-list">
                  {copyHistory.map((item, index) => (
                    <div
                      key={index}
                      className={`copy-history-item ${selectedItem === index ? 'selected' : ''}`}
                      onClick={() => handleItemClick(index)}
                    >
                      <div className="copy-history-item-header">
                        <span className="copy-history-item-date">{formatDate(item.timestamp)}</span>
                        <div className="copy-history-item-actions">
                          <button
                            className="copy-history-item-copy-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCopyItem(item.content);
                            }}
                            title="Copy to clipboard"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="copy-history-item-preview">
                        {extractFolderPath(item.content)}
                        <br />
                        <span className="copy-history-item-content-preview">
                          {getSimplePreview(item.content)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="copy-history-footer">
                  <button className="copy-history-clear-button" onClick={onClearHistory}>
                    Clear History
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Detail View Modal */}
      {showDetailView && selectedItem !== null && (
        <div className="copy-detail-modal-overlay" onClick={handleCloseDetailView}>
          <div className="copy-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="copy-detail-modal-header">
              <h3>Copied Content Detail</h3>
              <button
                className="copy-detail-modal-close-button"
                onClick={handleCloseDetailView}
                aria-label="Close detail view"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="copy-detail-modal-content">
              <div className="copy-detail-date">
                Copied on {formatDate(copyHistory[selectedItem].timestamp)}
              </div>
              <pre className="copy-detail-content">
                {processContentForDisplay(copyHistory[selectedItem].content)}
              </pre>
              <div className="copy-detail-footer">
                <button
                  className="copy-detail-copy-button"
                  onClick={() => onCopyItem(copyHistory[selectedItem].content)}
                >
                  <Copy size={16} />
                  <span>Copy to Clipboard</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CopyHistoryModal;
