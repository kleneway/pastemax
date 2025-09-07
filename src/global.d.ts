// src/global.d.ts
/// <reference types="react" />
/// <reference types="react-dom" />

export {}; // make this a module

// Global types for Electron API
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, data?: any) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (channel: string, func: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };

    llmApi: {
      getAllConfigs: () => Promise<import('./types/llmTypes').AllLlmConfigs>;
      setAllConfigs: (
        configs: import('./types/llmTypes').AllLlmConfigs
      ) => Promise<{ success: boolean; error?: string }>;
      sendPrompt: (params: {
        messages: { role: import('./types/llmTypes').MessageRole; content: string }[];
        provider: import('./types/llmTypes').LlmProvider;
        model: string;
        apiKey: string;
        baseUrl?: string | null;
      }) => Promise<{ content: string; provider?: string; error?: string }>;
      saveFile: (params: {
        filePath: string;
        content: string;
      }) => Promise<{ success: boolean; message: string }>;
    };
  }
}

// Add missing TypeScript definitions
declare namespace React {
  interface MouseEvent<T = Element> extends globalThis.MouseEvent {
    readonly currentTarget: T;
  }
  interface ChangeEvent<T = Element> extends Event {
    readonly target: T;
  }
}

// Type declarations for external modules
declare module 'react';
declare module 'react-dom/client';
declare module 'react/jsx-runtime';
declare module 'electron';
declare module 'tiktoken';
declare module 'ignore';
declare module 'gpt-3-encoder';

// asset imports
declare module '*.css' {
  const c: Record<string, string>;
  export default c;
}
declare module '*.svg' {
  const c: string;
  export default c;
}
declare module '*.png' {
  const c: string;
  export default c;
}
declare module '*.jpg' {
  const c: string;
  export default c;
}
