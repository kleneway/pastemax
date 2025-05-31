import React, { useState, useEffect, useRef } from 'react';
import { ModelInfo } from '../types/ModelTypes';
import '../styles/modals/ChatModelSelector.css';

interface ChatModelSelectorProps {
  onModelSelect?: (modelId: string) => void;
  currentModelId?: string;
}

const ChatModelSelector: React.FC<ChatModelSelectorProps> = ({ onModelSelect, currentModelId }) => {
  const [recentModels, setRecentModels] = useState<{ [provider: string]: string[] }>({});
  const [flattenedModels, setFlattenedModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recently used models from localStorage
  useEffect(() => {
    setIsLoading(true);
    try {
      const savedModels = localStorage.getItem('pastemax-recent-models');
      if (savedModels) {
        const parsedModels = JSON.parse(savedModels) as { [provider: string]: string[] | string }; // Allow string for graceful handling
        setRecentModels(parsedModels as { [provider: string]: string[] }); // Keep state as expected

        const models: ModelInfo[] = [];
        Object.entries(parsedModels).forEach(([provider, modelNamesValue]) => {
          let modelNameArray: string[] = [];
          if (Array.isArray(modelNamesValue)) {
            modelNameArray = modelNamesValue;
          } else if (typeof modelNamesValue === 'string') {
            // If it's a string, wrap it in an array to handle older/malformed data
            modelNameArray = [modelNamesValue];
            console.warn(
              `[ChatModelSelector] Corrected modelNames for provider ${provider} from string to array.`
            );
          } else {
            // If it's neither an array nor a string, skip this provider
            console.warn(
              `[ChatModelSelector] modelNames for provider ${provider} is not an array or string, skipping. Value:`,
              modelNamesValue
            );
            return; // Skip to the next provider
          }

          modelNameArray.forEach((modelName: string) => {
            // Ensure modelName is not empty and provider is valid before pushing
            if (provider && modelName && typeof modelName === 'string') {
              // Extra check for modelName type
              models.push({
                id: `${provider}/${modelName}`, // MODIFIED: Composite ID
                name: modelName, // RETAINED: Display name is just model name
                context_length: 0, // This info isn't in recentModels, default to 0
                // No explicit 'provider' field in ModelTypes.ModelInfo, it's part of ID
              });
            }
          });
        });

        setFlattenedModels(models);

        if (currentModelId && models.some((model) => model.id === currentModelId)) {
          setSelectedModelId(currentModelId);
        } else if (models.length > 0) {
          setSelectedModelId(models[0].id);
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading recent models:', error);
      setError('Failed to load models');
      setIsLoading(false);
    }
  }, [currentModelId]); // currentModelId is the full 'provider/modelName'

  // Sync with external model ID if provided
  useEffect(() => {
    if (currentModelId && currentModelId !== selectedModelId) {
      setSelectedModelId(currentModelId);
    }
  }, [currentModelId, selectedModelId]);

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

  // Handle model selection
  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    if (onModelSelect) {
      onModelSelect(modelId);
    }
    setIsOpen(false);
  };

  // Get the selected model object
  const selectedModel = flattenedModels.find((model) => model.id === selectedModelId);

  // Sort models with currently selected one first
  const sortedModels = [...flattenedModels].sort((a, b) => {
    if (a.id === selectedModelId) return -1;
    if (b.id === selectedModelId) return 1;
    return 0;
  });

  return (
    <div className="chat-model-selector" ref={dropdownRef}>
      <button
        className="chat-model-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Select AI model"
      >
        {isLoading ? (
          <span>Loading...</span>
        ) : selectedModel ? (
          <span>{selectedModel.name}</span>
        ) : (
          <span>Select model</span>
        )}
        <span className="chat-model-dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="chat-model-dropdown">
          <div className="chat-model-list">
            {isLoading ? (
              <div className="chat-model-loading">Loading models...</div>
            ) : sortedModels.length > 0 ? (
              sortedModels.map((model) => (
                <div
                  key={model.id}
                  className={`chat-model-option ${model.id === selectedModelId ? 'selected' : ''}`}
                  onClick={() => handleModelSelect(model.id)}
                >
                  <div className="chat-model-name">{model.name}</div>
                </div>
              ))
            ) : (
              <div className="chat-model-error">
                {error || 'No models available. Configure in LLM settings.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatModelSelector;
