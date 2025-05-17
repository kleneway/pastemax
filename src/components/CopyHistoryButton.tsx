import React from 'react';
import { History } from 'lucide-react';

interface CopyHistoryButtonProps {
  onClick: () => void;
  className?: string;
}

const CopyHistoryButton = ({ onClick, className = '' }: CopyHistoryButtonProps) => {
  return (
    <button
      className={`copy-history-button ${className}`}
      onClick={onClick}
      aria-label="View copy history"
      title="Copy History"
    >
      <History size={18} />
    </button>
  );
};

export default CopyHistoryButton;
