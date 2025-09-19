import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, List, Plus, Save, Trash2 } from 'lucide-react';
import { SavedPrompt, STORAGE_KEY_SAVED_PROMPTS } from '../types/PromptTypes';

interface SavedPromptsDropdownProps {
  onInsert: (text: string) => void;
  className?: string;
}

const defaultPrompts: SavedPrompt[] = [
  {
    id: 'sp_sample_architect',
    name: 'Architect',
    text:
      `You are a senior software architect. Analyze the repo structure and propose a pragmatic architecture that balances clarity, performance, and maintainability. Call out domain boundaries, modules, and clear interfaces.

When suggesting changes, preserve public contracts unless there's a strong reason to change them. Prefer incremental steps with migration notes.`,
    createdAt: Date.now(),
  },
  {
    id: 'sp_sample_engineer',
    name: 'Engineer',
    text:
      `You are a focused implementation engineer. Implement the requested change with minimal surface area, matching existing patterns and style. Optimize for readability first, performance second, unless specified.

Provide only necessary code edits with short context. Avoid unrelated refactors.`,
    createdAt: Date.now(),
  },
  {
    id: 'sp_sample_researcher',
    name: 'Researcher',
    text:
      `You are a research assistant. Break down the problem, list assumptions, outline options with trade-offs, and recommend a path. Cite relevant APIs/constraints from the codebase where useful.

Prefer crisp bullet points and prioritize actionable next steps.`,
    createdAt: Date.now(),
  },
];

const getPreview = (text: string, maxChars = 140): string => {
  if (!text) return '';
  // Take the first couple of sentences or up to maxChars.
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ');
  const base = sentences || text.trim();
  return base.length > maxChars ? base.slice(0, maxChars) + '…' : base;
};

const SavedPromptsDropdown = ({ onInsert, className = '' }: SavedPromptsDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompts, setPrompts] = useState<SavedPrompt[]>(defaultPrompts);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newText, setNewText] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Load saved prompts
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED_PROMPTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPrompts(parsed);
      } else {
        // Seed with sample prompts on first run only
        setPrompts(defaultPrompts);
      }
    } catch (e) {
      console.error('Failed to parse saved prompts:', e);
      // Fallback to samples if parsing fails
      setPrompts(defaultPrompts);
    }
  }, []);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED_PROMPTS, JSON.stringify(prompts));
    } catch (e) {
      console.error('Failed to save prompts:', e);
    }
  }, [prompts]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return prompts;
    return prompts.filter(
      (p) => p.name.toLowerCase().includes(term) || p.text.toLowerCase().includes(term)
    );
  }, [search, prompts]);

  const handleInsert = (text: string) => {
    onInsert(text);
    setIsOpen(false);
    setShowCreate(false);
  };

  const handleCreate = () => {
    const name = newName.trim();
    const text = newText.trim();
    if (!name || !text) return;
    const item: SavedPrompt = {
      id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      text,
      createdAt: Date.now(),
    };
    setPrompts((prev) => [item, ...prev]);
    setNewName('');
    setNewText('');
    setShowCreate(false);
    // Optionally insert immediately after create
    onInsert(text);
    setIsOpen(false);
  };

  const handleDelete = (id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className={`saved-prompts-dropdown ${className}`} ref={dropdownRef}>
      <button
        className="saved-prompts-button"
        title="Saved Prompts"
        onClick={() => {
          setIsOpen((v) => !v);
          setShowCreate(false);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <BookmarkPlus size={16} />
      </button>

      {isOpen && (
        <div className="saved-prompts-panel">
          <div className="saved-prompts-header">
            <div className="title">
              <List size={14} />
              <span>Saved Prompts</span>
            </div>
            <button className="create-button" onClick={() => setShowCreate((v) => !v)}>
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>

          <div className="saved-prompts-search">
            <input
              type="text"
              placeholder="Search prompts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search && (
              <button className="clear-search" onClick={() => setSearch('')} aria-label="Clear">
                ×
              </button>
            )}
          </div>

          {showCreate && (
            <div className="saved-prompt-create">
              <input
                type="text"
                className="name-input"
                placeholder="Prompt name (e.g., Architect)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <textarea
                className="text-input"
                placeholder="Write your prompt..."
                rows={5}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
              <div className="create-actions">
                <button className="primary" onClick={handleCreate} disabled={!newName || !newText}>
                  <Save size={14} />
                  <span>Save and Insert</span>
                </button>
                <button className="secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ul className="saved-prompts-list" role="listbox" aria-label="Saved prompts">
            {filtered.length === 0 ? (
              <li className="empty">No saved prompts</li>
            ) : (
              filtered.map((p) => (
                <li key={p.id} className="saved-prompt-item">
                  <button className="item-main" onClick={() => handleInsert(p.text)}>
                    <div className="item-name">{p.name}</div>
                    <div className="item-preview">{getPreview(p.text)}</div>
                  </button>
                  <button
                    className="item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    title="Delete prompt"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SavedPromptsDropdown;
