import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  onClick: () => Promise<void>;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CopyButton = ({ onClick, disabled = false, className = '', children }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyClick = async () => {
    if (disabled) return;
    try {
      await onClick();
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Copy operation failed:', err);
    }
  };

  const buttonStyle = {
    outline: 'none',
  };

  return (
    <button
      type="button"
      className={`${className}`}
      onClick={handleCopyClick}
      disabled={disabled || copied}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      style={buttonStyle}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {children}
    </button>
  );
};

export default CopyButton;
