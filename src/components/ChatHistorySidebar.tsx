import React from 'react';
import { MessageSquare, Trash2, Clock } from 'lucide-react';
import '../styles/modals/ChatHistorySidebar.css';
import { ChatMessage, ProviderSpecificConfig } from '../types/llmTypes';

export interface ChatSession {
  id: string;
  title: string;
  lastUpdated: number;
  messages: ChatMessage[];
  targetType?: 'file' | 'selection' | 'general';
  targetName?: string;
  targetContent?: string;
  userPreview?: string;
  isLoading?: boolean;
  llmError?: string | null;
  modelId?: string;
  providerConfig?: ProviderSpecificConfig;
}

interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateNewSession: () => void;
  isSearching?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onClearSearch?: () => void;
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onCreateNewSession,
  // isSearching = false,
  searchQuery = '',
  onSearchChange,
  onClearSearch,
}) => {
  // Format date for display
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Today, show time
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      // Yesterday
      return 'Yesterday';
    } else if (diffDays < 7) {
      // Within a week
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      // Older than a week
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="chat-history-sidebar">
      <div className="chat-history-header">
        <h3>Chat History</h3>
        <button className="new-chat-button" onClick={onCreateNewSession} title="Start a new chat">
          <MessageSquare size={16} />
          <span>New Chat</span>
        </button>
      </div>

      {onSearchChange && (
        <div className="chat-history-search">
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="chat-history-search-input"
          />
          {searchQuery && onClearSearch && (
            <button className="chat-history-search-clear" onClick={onClearSearch}>
              ×
            </button>
          )}
        </div>
      )}

      <div className="chat-history-list">
        {sessions.length === 0 ? (
          <div className="chat-history-empty">
            <p>No chat history yet</p>
            <button className="start-new-chat-button" onClick={onCreateNewSession}>
              Start your first chat
            </button>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`chat-history-item ${currentSessionId === session.id ? 'active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="chat-session-info">
                <div className="chat-session-title">
                  {session.targetType === 'file' ? (
                    <span title={`Chat about file: ${session.targetName}`}>
                      <i className="file-icon">📄</i> {session.userPreview || session.title}
                    </span>
                  ) : session.targetType === 'selection' ? (
                    <span title="Chat about code selection">
                      <i className="selection-icon">✂️</i> {session.userPreview || session.title}
                    </span>
                  ) : (
                    <span>
                      <MessageSquare size={14} /> {session.userPreview || session.title}
                    </span>
                  )}
                </div>
                <div className="chat-session-date">
                  <Clock size={12} />
                  <span>{formatDate(session.lastUpdated)}</span>
                </div>
              </div>
              <button
                className="delete-session-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                title="Delete this chat"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ChatHistorySidebar;
