const tokenCache = new Map<string, number>();

type EncoderLike = {
  encode: (text: string) => Uint32Array | number[];
};

let offlineEncoderPromise: Promise<EncoderLike | null> | null = null;

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
    const accurate = await countTokensOffline(text);
    const value = typeof accurate === 'number' ? accurate : fallbackEstimate(text);
    tokenCache.set(key, value);
    return value;
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

async function countTokensOffline(text: string): Promise<number | null> {
  try {
    const encoder = await loadOfflineEncoder();
    if (!encoder) {
      return null;
    }
    const sanitized = sanitizeForEncoding(text);
    const tokens = encoder.encode(sanitized);
    if (Array.isArray(tokens)) {
      return tokens.length;
    }
    return tokens.length;
  } catch (error) {
    console.error('Error counting tokens offline:', error);
    return null;
  }
}

async function loadOfflineEncoder(): Promise<EncoderLike | null> {
  if (offlineEncoderPromise) {
    return offlineEncoderPromise;
  }

  offlineEncoderPromise = (async () => {
    try {
      if (typeof window === 'undefined') {
        const mod = await import('tiktoken');
        if (mod && typeof mod.get_encoding === 'function') {
          return mod.get_encoding('o200k_base');
        }
        return null;
      }

      const [{ Tiktoken }, model] = await Promise.all([
        import('tiktoken/lite'),
        import('tiktoken/encoders/o200k_base.json'),
      ]);

      return new Tiktoken(model.bpe_ranks, model.special_tokens, model.pat_str);
    } catch (error) {
      console.error('Failed to initialize offline tokenizer:', error);
      return null;
    }
  })();

  const encoder = await offlineEncoderPromise;
  if (!encoder) {
    offlineEncoderPromise = null;
  }
  return encoder;
}

function sanitizeForEncoding(text: string): string {
  return text.replace(/<\|endoftext\|>/g, '');
}
