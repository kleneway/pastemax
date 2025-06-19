import React from 'react';
import '../styles/modals/LargeSubfolderModal.css';

interface LargeSubfolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  details: {
    totalTokens: number;
    folderPath: string;
    hasEstimates: boolean;
  };
}

const LargeSubfolderModal = ({ isOpen, onClose, onConfirm, details }: LargeSubfolderModalProps) => {
  if (!isOpen) return null;

  const { totalTokens, folderPath, hasEstimates } = details;
  const folderName = folderPath.split(/[/\\]/).pop() || folderPath;

  return (
    <div className="large-subfolder-modal-overlay">
      <div className="large-subfolder-modal">
        <div className="large-subfolder-modal-header">
          <h2>Large Folder Selection</h2>
          <button className="large-subfolder-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className="large-subfolder-modal-content">
          <div className="large-subfolder-modal-warning">
            ⚠️ Large Folder Detected
          </div>
          
          <div className="large-subfolder-modal-details">
            <p>
              The folder <strong>"{folderName}"</strong> contains approximately{' '}
              <strong>
                {hasEstimates ? '~' : ''}{totalTokens.toLocaleString()}
                {hasEstimates && <span className="estimate-indicator"> (estimated)</span>}
              </strong>{' '}
              tokens.
            </p>
            
            {hasEstimates && (
              <p className="estimate-notice">
                Some token counts are estimated. Actual counts may differ when files are processed.
              </p>
            )}
            
            <p>
              Selecting this folder may impact application performance. Do you want to proceed?
            </p>
          </div>
        </div>
        
        <div className="large-subfolder-modal-actions">
          <button 
            className="large-subfolder-modal-btn large-subfolder-modal-btn-secondary" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="large-subfolder-modal-btn large-subfolder-modal-btn-primary" 
            onClick={onConfirm}
          >
            Select Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default LargeSubfolderModal;