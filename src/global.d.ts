// src/global.d.ts
/// <reference types="react" />
/// <reference types="react-dom" />

export {}; // make this a module

// Global types for Electron API
declare global {
  interface Window {
    electron: {
      getSelectedFilesDiff?: (data: any) => Promise<any>;
      ipcRenderer: {
        send: (channel: string, data?: any) => void;
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (channel: string, func: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
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
