import React, { useState, useEffect, useRef } from 'react';
import { LlmProvider, ProviderSpecificConfig, AllLlmConfigs } from '../types/llmTypes';
import { Edit, X } from 'lucide-react';

// Define a constant for the localStorage key
const LAST_SAVED_PROVIDER_KEY = 'pastemax-last-saved-llm-provider';

interface LlmSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfigs: AllLlmConfigs | null;
  onSaveAllConfigs: (configs: AllLlmConfigs) => Promise<void>;
  onOpenSystemPromptEditor?: () => void;
}

const LlmSettingsModal: React.FC<LlmSettingsModalProps> = ({
  isOpen,
  onClose,
  initialConfigs,
  onSaveAllConfigs,
  onOpenSystemPromptEditor,
}) => {
  const [allConfigs, setAllConfigs] = useState<AllLlmConfigs>(initialConfigs || {});
  const [currentProvider, setCurrentProvider] = useState<LlmProvider | ''>('');
  const [currentConfig, setCurrentConfig] = useState<ProviderSpecificConfig | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [defaultModelName, setDefaultModelName] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [recentModels, setRecentModels] = useState<{ [key: string]: string[] }>({});
  const [recentModelsForProvider, setRecentModelsForProvider] = useState<string[]>([]);

  const lastActiveProviderRef = useRef<LlmProvider | ''>('');

  useEffect(() => {
    if (isOpen) {
      setAllConfigs(initialConfigs || {});
      let providerToSet: LlmProvider | '' = '';

      // Determine provider to display when modal opens (not immediately post-save, handleSave handles that)
      // 1. Try to load the globally last saved provider
      const lastSavedProviderFromStorage = localStorage.getItem(
        LAST_SAVED_PROVIDER_KEY
      ) as LlmProvider | null;
      if (
        lastSavedProviderFromStorage &&
        initialConfigs &&
        initialConfigs[lastSavedProviderFromStorage]
      ) {
        providerToSet = lastSavedProviderFromStorage;
      }
      // 2. Else, try to use the in-session last active provider (e.g. user was tabbing)
      else if (
        lastActiveProviderRef.current &&
        initialConfigs &&
        initialConfigs[lastActiveProviderRef.current]
      ) {
        providerToSet = lastActiveProviderRef.current;
      }
      // 3. Else, fallback to existing logic (first with API key, then first overall)
      else if (initialConfigs && Object.keys(initialConfigs).length > 0) {
        const providerWithApiKey = Object.entries(initialConfigs).find(
          ([, config]) => !!config.apiKey
        ) as [LlmProvider, ProviderSpecificConfig] | undefined;
        if (providerWithApiKey) {
          providerToSet = providerWithApiKey[0];
        } else {
          providerToSet = Object.keys(initialConfigs)[0] as LlmProvider;
        }
      }

      // If currentProvider is already set (e.g. by handleSave), and providerToSet is different,
      // this useEffect will align it based on persisted state for subsequent views.
      // If they are the same, this call is okay.
      if (currentProvider !== providerToSet && providerToSet !== '') {
        setCurrentProvider(providerToSet);
      } else if (currentProvider === '' && providerToSet !== '') {
        setCurrentProvider(providerToSet); // Handles initial set if currentProvider is empty
      }

      // Ensure lastActiveProviderRef is updated if a provider is determined
      if (providerToSet) {
        lastActiveProviderRef.current = providerToSet;
      }
    } else {
      // Optional: Reset specific states when modal closes if desired, e.g., error messages
      // setErrorMessage(null); // Already handled by another useEffect
    }
  }, [initialConfigs, isOpen]);

  useEffect(() => {
    if (currentProvider) {
      const existingConfig = allConfigs[currentProvider];
      setCurrentConfig(
        existingConfig || {
          apiKey: '',
          defaultModel: '',
          baseUrl: '',
        }
      );
      setRecentModelsForProvider(
        JSON.parse(localStorage.getItem(`recentModels_${currentProvider}`) || '[]')
      );
    } else {
      setCurrentConfig(null);
      setRecentModelsForProvider([]);
    }
    setErrorMessage(null); // Clear error when provider changes
  }, [currentProvider, allConfigs]);

  useEffect(() => {
    if (currentProvider && allConfigs[currentProvider]) {
      const config = allConfigs[currentProvider];
      setApiKey(config.apiKey || '');
      setDefaultModelName(config.defaultModel || '');
      setBaseUrl(config.baseUrl || '');
    } else if (currentProvider) {
      setApiKey('');
      setDefaultModelName('');
      setBaseUrl('');
    } else {
      setApiKey('');
      setDefaultModelName('');
      setBaseUrl('');
    }
  }, [currentProvider, allConfigs]);

  useEffect(() => {
    try {
      const savedModels = localStorage.getItem('pastemax-recent-models');
      if (savedModels) {
        setRecentModels(JSON.parse(savedModels));
      }
    } catch (error) {
      console.error('Error loading recent models:', error);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
    }
  }, [isOpen]);

  const getProviderPlaceholder = () => {
    switch (currentProvider) {
      case 'openai':
        return 'Enter OpenAI API Key (sk-...)';
      case 'anthropic':
        return 'Enter Anthropic API Key';
      case 'gemini':
        return 'Enter Google AI API Key';
      case 'groq':
        return 'Enter Groq API Key';

      case 'openrouter':
        return 'Enter OpenRouter API Key';
      case 'mistral':
        return 'Enter Mistral API Key';
      default:
        return 'API Key';
    }
  };

  const getRecentModelsForProvider = () => {
    return recentModels[currentProvider] || [];
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as LlmProvider | '';
    setCurrentProvider(newProvider);
    lastActiveProviderRef.current = newProvider; // Keep this for correctly setting the ref when user changes dropdown
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentConfig((prevConfig) => ({
      ...(prevConfig || { apiKey: '', defaultModel: '', baseUrl: '' }), // Ensure prevConfig is an object
      [name]: value,
    }));
  };

  const handleSave = async () => {
    if (!currentProvider || !currentConfig) {
      setErrorMessage('Provider and configuration must be set.');
      return;
    }

    if (!currentConfig.apiKey) {
      setErrorMessage(`API Key is required for ${currentProvider}.`);
      return;
    }

    if (!currentConfig.defaultModel) {
      setErrorMessage(`Default Model Name is required for ${currentProvider}.`);
      return;
    }

    // Clear error if validation passes
    setErrorMessage(null);

    const providerBeingSaved = currentProvider; // Capture the provider being saved

    setIsSaving(true);

    try {
      // Use currentConfig directly for saving, as it reflects the form inputs
      const updatedProviderConfig: ProviderSpecificConfig = {
        apiKey: currentConfig.apiKey ? currentConfig.apiKey.trim() : null,
        defaultModel: currentConfig.defaultModel ? currentConfig.defaultModel.trim() : null,
        baseUrl: currentConfig.baseUrl ? currentConfig.baseUrl.trim() : null,
      };

      const newAllConfigs = {
        ...allConfigs, // Use local allConfigs as base
        [providerBeingSaved]: updatedProviderConfig,
      };

      // Propagate to parent/store, which will eventually update initialConfigs prop
      await onSaveAllConfigs(newAllConfigs);

      // Update local state immediately to ensure UI consistency post-save
      setAllConfigs(newAllConfigs);
      setCurrentProvider(providerBeingSaved); // Force UI to stick to the saved provider

      // Update persistent/semi-persistent stores
      localStorage.setItem(LAST_SAVED_PROVIDER_KEY, providerBeingSaved);
      lastActiveProviderRef.current = providerBeingSaved; // Reflect the save here too

      // Use currentConfig.defaultModel for recent models logic
      if (currentConfig.defaultModel && currentConfig.defaultModel.trim()) {
        const trimmedModelName = currentConfig.defaultModel.trim();
        const updatedRecentModels = { ...recentModels };
        const providerModels = updatedRecentModels[providerBeingSaved] || [];
        if (!providerModels.includes(trimmedModelName)) {
          updatedRecentModels[providerBeingSaved] = [trimmedModelName, ...providerModels].slice(
            0,
            5
          );
          setRecentModels(updatedRecentModels);
          localStorage.setItem('pastemax-recent-models', JSON.stringify(updatedRecentModels));
        }
      }
      setTimeout(() => {
        setErrorMessage('Settings saved successfully for ' + providerBeingSaved + '!');
        setTimeout(() => setErrorMessage(null), 3000);
      }, 150);
    } catch (error) {
      console.error('Error saving LLM config:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectRecentModel = (model: string) => {
    // When a recent model is selected, update the currentConfig state
    setCurrentConfig((prevConfig) => ({
      ...(prevConfig || { apiKey: '', defaultModel: '', baseUrl: '' }),
      defaultModel: model,
    }));
  };

  const handleDeleteRecentModel = (modelToDelete: string) => {
    if (!currentProvider) return;
    const updatedRecentModels = { ...recentModels };
    const providerModels = updatedRecentModels[currentProvider] || [];
    updatedRecentModels[currentProvider] = providerModels.filter(
      (model) => model !== modelToDelete
    );
    setRecentModels(updatedRecentModels);
    localStorage.setItem('pastemax-recent-models', JSON.stringify(updatedRecentModels));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>LLM Settings</h3>
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="llm-provider">LLM Provider</label>
            <select
              id="llm-provider"
              value={currentProvider}
              onChange={handleProviderChange}
              className="provider-select"
              disabled={isSaving}
            >
              <option value="">Select a provider</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq</option>

              <option value="openrouter">OpenRouter</option>
              <option value="mistral">Mistral</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="api-key">API Key</label>
            <input
              id="api-key"
              type="password"
              name="apiKey"
              value={currentConfig?.apiKey || ''}
              onChange={handleInputChange}
              placeholder={getProviderPlaceholder()}
              className="api-key-input"
              disabled={isSaving || !currentProvider}
            />
          </div>

          <div className="form-group">
            <label htmlFor="defaultModel">Default Model Name</label>
            <input
              id="defaultModel"
              name="defaultModel"
              type="text"
              placeholder="e.g., gpt-4o or gemini-1.5-pro-latest"
              value={currentConfig?.defaultModel || ''}
              onChange={handleInputChange}
              className="model-name-input"
              disabled={isSaving || !currentProvider}
            />

            {currentProvider && getRecentModelsForProvider().length > 0 && (
              <div className="recent-models">
                <small className="help-text">Recently used models for {currentProvider}:</small>
                <div className="recent-models-list">
                  {getRecentModelsForProvider().map((model, index) => (
                    <button
                      key={index}
                      type="button"
                      className="recent-model-button"
                      onClick={() => handleSelectRecentModel(model)}
                    >
                      {model}
                      <X
                        size={14}
                        className="delete-recent-model-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecentModel(model);
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className="form-group"
            style={{ marginBottom: showAdvanced ? 'var(--space-sm)' : 'var(--space-lg)' }}
          >
            <button
              type="button"
              className="advanced-toggle"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
            </button>
          </div>

          {showAdvanced && (
            <div className="form-group">
              <label htmlFor="base-url">Base URL (Optional)</label>
              <input
                id="base-url"
                name="baseUrl"
                type="text"
                placeholder="Optional: Custom API endpoint"
                value={currentConfig?.baseUrl || ''}
                onChange={handleInputChange}
                className="base-url-input"
                disabled={isSaving || !currentProvider}
              />
              <small className="help-text">
                Only set this if you're using a proxy or non-standard API endpoint.
              </small>
            </div>
          )}

          {onOpenSystemPromptEditor && (
            <div className="form-group system-prompt-section">
              <div className="system-prompt-header">
                <label>System Prompt</label>
                <button
                  type="button"
                  className="edit-system-prompt-button"
                  onClick={onOpenSystemPromptEditor}
                  title="Edit System Prompt"
                >
                  <Edit size={16} />
                  <span>Edit System Prompt</span>
                </button>
              </div>
              <small className="help-text">
                Customize how the AI behaves by editing the system prompt.
              </small>
            </div>
          )}

          {errorMessage && (
            <div
              className={`message ${errorMessage.startsWith('Settings saved') ? 'message-success' : 'error-message'}`}
            >
              {errorMessage}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving || !currentProvider}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LlmSettingsModal;
