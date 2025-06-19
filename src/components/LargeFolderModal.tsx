import React from 'react';
import '../styles/modals/LargeFolderModal.css';

interface LargeFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: {
    totalTokens: number;
    folderPath: string;
  };
  onProceed: () => void;
  onLoadDeselected: () => void;
  onCancel: () => void;
}

const LargeFolderModal: React.FC<LargeFolderModalProps> = ({
  isOpen,
  onClose,
  details,
  onProceed,
  onLoadDeselected,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="large-folder-modal-overlay">
      <div className="large-folder-modal">
        <div className="modal-header">
          <h3>Large Folder Detected</h3>
          <button className="icon-button close-button" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-content">
          <p>
            The selected folder contains approximately <strong>{details.totalTokens.toLocaleString()}</strong> tokens, 
            which may impact application performance. How would you like to proceed?
          </p>
        </div>
        <div className="modal-actions">
          <button className="primary proceed-button" onClick={onProceed}>
            Proceed Anyway
          </button>
          <button className="primary load-deselected-button" onClick={onLoadDeselected}>
            Load with Files Deselected
          </button>
          <button className="secondary cancel-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LargeFolderModal;