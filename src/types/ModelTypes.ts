/**
 * Types for LLM model information
 */

/**
 * Interface defining a model's information including context window size
 */
export interface ModelInfo {
  id: string; // Model identifier (e.g., "google/gemini-pro-1.5")
  name: string; // Display name (e.g., "Google: Gemini 1.5 Pro")
  description?: string; // Optional description of the model
  context_length: number; // Maximum token limit (context window size)
  pricing?: string; // Optional pricing information
  available?: boolean; // Whether the model is currently available
}

/**
 * Storage key for caching models in local storage
 */
export const STORAGE_KEY_MODELS_CACHE = 'llm-models-cache';

/**
 * Storage key for last models fetch timestamp
 */
export const STORAGE_KEY_MODELS_FETCH_TIME = 'llm-models-fetch-time';