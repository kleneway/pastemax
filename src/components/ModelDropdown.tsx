import React, { useState, useEffect, useRef } from 'react';
import { ModelInfo } from '../types/ModelTypes';
import { formatContextLength } from '../utils/modelUtils';
import { useModels } from '../hooks/useModels';

interface ModelDropdownProps {
  className?: string;
  externalSelectedModelId?: string;
  onModelSelect?: (modelId: string) => void;
  currentTokenCount?: number;
  onModelContextChange?: (model: ModelInfo | null) => void;
}

/**
 * ModelDropdown component for selecting LLM models
 * Displays models with their context window sizes
 */
const ModelDropdown = ({
  className = '',
  externalSelectedModelId,
  onModelSelect,
  currentTokenCount = 0,
  onModelContextChange,
}: ModelDropdownProps): JSX.Element => {
  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    isLoading,
    error,
    refreshModels,
  } = useModels();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null as HTMLDivElement | null);
  const searchInputRef = useRef(null as HTMLInputElement | null);

  // Sync with external selected model ID if provided
  useEffect(() => {
    if (externalSelectedModelId && externalSelectedModelId !== selectedModelId) {
      setSelectedModelId(externalSelectedModelId);
    }
  }, [externalSelectedModelId, selectedModelId, setSelectedModelId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle model selection
  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    const model = models.find((item: ModelInfo) => item.id === modelId) || null;
    if (onModelContextChange) {
      onModelContextChange(model);
    }
    if (onModelSelect) {
      onModelSelect(modelId);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  useEffect(() => {
    if (onModelContextChange) {
      onModelContextChange(selectedModel ?? null);
    }
  }, [selectedModel, onModelContextChange]);

  // Filter models based on search term
  const filteredModels = models.filter(
    (model: ModelInfo) =>
      model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if current token count exceeds model context limit
  const isContextExceeded = selectedModel && currentTokenCount > selectedModel.context_length;
  const exceedsByTokens = selectedModel ? currentTokenCount - selectedModel.context_length : 0;
  const exceedPercentage = selectedModel
    ? (currentTokenCount / selectedModel.context_length) * 100
    : 0;

  // Determine warning level
  const warningLevel =
    exceedPercentage >= 100
      ? 'critical'
      : exceedPercentage >= 90
        ? 'high'
        : exceedPercentage >= 75
          ? 'medium'
          : 'normal';

  return (
    <div className={`model-dropdown-container ${className}`} ref={dropdownRef}>
      <div className="model-dropdown-minimal">
        <button
          type="button"
          className={`model-dropdown-button-minimal ${warningLevel}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          {isLoading ? (
            <span className="loading-text">Loading models...</span>
          ) : selectedModel ? (
            <>
              <span className="model-name-minimal">{selectedModel.name}</span>
              <span className="model-context-length">
                ({formatContextLength(selectedModel.context_length)})
              </span>
            </>
          ) : (
            <span className="no-model-text">{error || 'No models available'}</span>
          )}
          <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>

        {selectedModel && (
          <div className="token-status-minimal">
            <div className="token-progress-container">
              <div
                className={`token-progress-bar ${warningLevel}`}
                style={{
                  width: `${Math.min(exceedPercentage, 100)}%`,
                }}
              ></div>
            </div>
            <div className="token-count-display">
              <div>
                <span className={`token-count ${warningLevel}`}>
                  {currentTokenCount.toLocaleString()}
                </span>{' '}
                / {selectedModel.context_length.toLocaleString()} tokens
              </div>
              {isContextExceeded && (
                <span className="context-warning">
                  Exceeds limit by {exceedsByTokens.toLocaleString()} tokens
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="model-dropdown-list-container">
          <div className="model-search-container">
            {/*  <Search size={14} className="search-icon" /> */}
            <input
              type="text"
              ref={searchInputRef}
              className="model-search-input"
              placeholder="Search models..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
            {searchTerm && (
              <button
                className="clear-search-button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <ul className="model-dropdown-list" role="listbox">
            {isLoading ? (
              <li className="model-dropdown-loading">Loading models...</li>
            ) : filteredModels.length > 0 ? (
              filteredModels.map((model: ModelInfo) => (
                <li
                  key={model.id}
                  role="option"
                  aria-selected={model.id === selectedModelId}
                  className={`model-dropdown-option ${
                    model.id === selectedModelId ? 'selected' : ''
                  }`}
                  onClick={() => handleModelSelect(model.id)}
                >
                  <div className="model-option-info">
                    <span className="model-option-name">{model.name}</span>
                    <span className="model-option-context">
                      {formatContextLength(model.context_length)}
                    </span>
                  </div>
                </li>
              ))
            ) : searchTerm ? (
              <li className="model-dropdown-no-results">No matching models found</li>
            ) : (
              <li className="model-dropdown-error">{error || 'No models available'}</li>
            )}

            {/* Refresh button at the bottom of the list */}
            <li className="model-dropdown-refresh">
              <button
                type="button"
                className="refresh-button"
                onClick={(e) => {
                  e.stopPropagation();
                  refreshModels();
                  setSearchTerm('');
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Refreshing...' : 'Refresh Models'}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default ModelDropdown;
