const tokenCache = new Map<string, number>();

function hashText(text: string): string {
  let hash = 0;
  const length = Math.min(text.length, 5000); // Limit to avoid large loops on huge strings
  for (let i = 0; i < length; i += 1) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `${text.length}:${hash}`;
}

function fallbackEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function countTokensCached(text: string): Promise<number> {
  if (!text) return 0;
  const key = hashText(text);
  const cached = tokenCache.get(key);
  if (typeof cached === 'number') {
    return cached;
  }

  if (typeof window === 'undefined' || !window.electron?.ipcRenderer) {
    const estimate = fallbackEstimate(text);
    tokenCache.set(key, estimate);
    return estimate;
  }

  try {
    const result = await window.electron.ipcRenderer.invoke('get-token-count', text);
    const tokenCount =
      typeof result?.tokenCount === 'number' ? result.tokenCount : fallbackEstimate(text);
    tokenCache.set(key, tokenCount);
    return tokenCount;
  } catch (error) {
    console.error('Error getting token count:', error);
    const estimate = fallbackEstimate(text);
    tokenCache.set(key, estimate);
    return estimate;
  }
}

export function clearTokenCache(): void {
  tokenCache.clear();
}
