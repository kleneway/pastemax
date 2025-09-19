export interface SavedPrompt {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}

export const STORAGE_KEY_SAVED_PROMPTS = 'pastemax-saved-prompts';

