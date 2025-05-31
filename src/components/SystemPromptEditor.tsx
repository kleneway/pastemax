import React, { useState, useEffect } from 'react';
import { SystemPrompt } from '../types/llmTypes';
import { DEFAULT_SYSTEM_PROMPTS, NONE_PROMPT_ID } from '../config/defaultSystemPrompts'; // For reset and NONE_PROMPT_ID
import '../styles/modals/SystemPromptEditor.css';

interface SystemPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompts: SystemPrompt[];
  selectedSystemPromptId: string | null;
  onSaveSystemPrompt: (prompt: SystemPrompt) => void;
  onDeleteSystemPrompt: (promptId: string) => void;
  onSelectSystemPrompt: (promptId: string | null) => void;
  onAddNewSystemPrompt: () => void;
}

const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  isOpen,
  onClose,
  systemPrompts,
  selectedSystemPromptId,
  onSaveSystemPrompt,
  onDeleteSystemPrompt,
  onSelectSystemPrompt,
  onAddNewSystemPrompt,
}) => {
  const [currentName, setCurrentName] = useState('');
  const [currentContent, setCurrentContent] = useState('');
  const [currentPromptIsDefault, setCurrentPromptIsDefault] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPrompt = systemPrompts.find((p) => p.id === selectedSystemPromptId);

  useEffect(() => {
    if (selectedPrompt) {
      setCurrentName(selectedPrompt.name);
      setCurrentContent(selectedPrompt.content);
      setCurrentPromptIsDefault(!!selectedPrompt.isDefault);
      setIsEditingName(false); // Reset editing mode on prompt change
      setError(null);
    } else {
      // No prompt selected, or selected prompt not found (e.g., after deletion)
      // Clear form or select a default if appropriate
      setCurrentName('');
      setCurrentContent('');
      setCurrentPromptIsDefault(false);
      setError(null);
    }
  }, [selectedSystemPromptId, systemPrompts, selectedPrompt]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentName(e.target.value);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentContent(e.target.value);
  };

  const handleSelectPrompt = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSelectedId = e.target.value;
    onSelectSystemPrompt(newSelectedId);
  };

  const handleSave = () => {
    if (!selectedPrompt) {
      setError('No prompt selected to save.');
      return;
    }
    if (!currentName.trim()) {
      setError('Prompt name cannot be empty.');
      return;
    }
    if (selectedPrompt.id !== NONE_PROMPT_ID && !currentContent.trim()) {
      setError('Prompt content cannot be empty.');
      return;
    }

    const promptToSave: SystemPrompt = {
      ...selectedPrompt, // Preserve ID and isDefault status
      name: currentName.trim(),
      content: currentContent.trim(),
    };
    onSaveSystemPrompt(promptToSave);
    setError(null);
    setIsEditingName(false);
    // Optionally close modal after save, or let user continue editing/selecting
    // onClose(); // Consider if this is desired UX
  };

  const handleDelete = () => {
    if (selectedPrompt && !selectedPrompt.isDefault) {
      onDeleteSystemPrompt(selectedPrompt.id);
    } else if (selectedPrompt && selectedPrompt.isDefault) {
      setError('Cannot delete a default system prompt.');
    }
  };

  const handleAddNew = () => {
    onAddNewSystemPrompt(); // App.tsx will create, add, and select the new prompt
    // The useEffect in this component will then pick it up and set the form fields
  };

  const handleResetToDefault = () => {
    if (selectedPrompt && selectedPrompt.isDefault) {
      const defaultVersion = DEFAULT_SYSTEM_PROMPTS.find((dp) => dp.id === selectedPrompt.id);
      if (defaultVersion) {
        setCurrentName(defaultVersion.name);
        setCurrentContent(defaultVersion.content);
        setError(null);
      }
    } else {
      setError('Only default prompts can be reset.');
    }
  };

  const toggleNameEditing = () => {
    if (selectedPrompt && selectedPrompt.isDefault) {
      setError('Cannot edit the name of a default system prompt.');
      return;
    }
    setIsEditingName(!isEditingName);
  };

  if (!isOpen) return null;

  // Sort prompts: default first, then custom by name
  const sortedPrompts = [...systemPrompts].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="system-prompt-modal-overlay" onClick={onClose}>
      <div className="system-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="system-prompt-modal-header">
          <h3>System Prompt Editor</h3>
          <button onClick={onClose} className="system-prompt-modal-close-button" aria-label="Close">
            &times;
          </button>
        </div>

        <div className="system-prompt-modal-content">
          <div className="system-prompt-selector-container">
            <label htmlFor="systemPromptSelect">Select Prompt:</label>
            <select
              id="systemPromptSelect"
              value={selectedSystemPromptId || ''}
              onChange={handleSelectPrompt}
              className="system-prompt-select"
            >
              <option value="" disabled>
                -- Select a Prompt --
              </option>
              {sortedPrompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name} {prompt.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>
            <button onClick={handleAddNew} className="system-prompt-button add-new-button">
              Add New Prompt
            </button>
          </div>

          {selectedPrompt && (
            <div className="system-prompt-form">
              <div className="form-group name-group">
                <label htmlFor="systemPromptName">Prompt Name:</label>
                {isEditingName && !currentPromptIsDefault ? (
                  <input
                    type="text"
                    id="systemPromptName"
                    value={currentName}
                    onChange={handleNameChange}
                    onBlur={() => setIsEditingName(false)} // Save/cancel on blur could be an option
                    autoFocus
                  />
                ) : (
                  <span
                    className={`prompt-name-display ${currentPromptIsDefault ? 'default-name' : ''}`}
                    onClick={!currentPromptIsDefault ? toggleNameEditing : undefined}
                    title={
                      currentPromptIsDefault
                        ? 'Default prompt name cannot be changed'
                        : 'Click to edit name'
                    }
                  >
                    {currentName}
                  </span>
                )}
                {!currentPromptIsDefault && !isEditingName && (
                  <button
                    onClick={toggleNameEditing}
                    className="system-prompt-button edit-name-button"
                  >
                    Edit Name
                  </button>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="systemPromptContent">Prompt Content:</label>
                <textarea
                  id="systemPromptContent"
                  value={currentContent}
                  onChange={handleContentChange}
                  rows={10}
                  className="system-prompt-textarea"
                  placeholder="Enter the system prompt content..."
                />
              </div>
              {error && <p className="error-message">{error}</p>}
            </div>
          )}
        </div>

        <div className="system-prompt-modal-footer">
          <div className="system-prompt-actions">
            {selectedPrompt && currentPromptIsDefault && (
              <button onClick={handleResetToDefault} className="system-prompt-button reset-button">
                Reset to Default
              </button>
            )}
            {selectedPrompt && !currentPromptIsDefault && (
              <button onClick={handleDelete} className="system-prompt-button delete-button">
                Delete Prompt
              </button>
            )}
            <button
              onClick={handleSave}
              className="system-prompt-button save-button"
              disabled={
                !selectedPrompt ||
                !currentName.trim() ||
                (selectedPrompt.id !== NONE_PROMPT_ID && !currentContent.trim()) // Allow empty content only for NONE_PROMPT_ID
              }
            >
              Save Changes
            </button>
            <button onClick={onClose} className="system-prompt-button cancel-button">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemPromptEditor;
