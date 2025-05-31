import React from 'react';
import { MessageSquare } from 'lucide-react';

interface ChatButtonProps {
  onClick: () => void;
  className?: string;
  text?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Button component to initiate chat functionality
 */
const ChatButton: React.FC<ChatButtonProps> = ({
  onClick,
  className = '',
  text = 'Chat with AI',
  disabled = false,
  title = 'Start AI chat',
}) => {
  return (
    <button
      className={`chat-button ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {text ? text : <MessageSquare size={16} />}
    </button>
  );
};

export default ChatButton;
