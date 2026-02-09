# Token Counting with Tiktoken in PasteMax

PasteMax uses [`tiktoken`](https://github.com/openai/tiktoken) for accurate token counting to help you understand how much content fits within AI model context limits.

## What is Tiktoken?

Tiktoken is a fast, open-source tokenizer developed by OpenAI. It converts text into tokens - the basic units that AI models process. For example, the text "tiktoken is great!" might be split into tokens like `["t", "ik", "token", " is", " great", "!"]`.

## Why Token Counting Matters

Understanding token counts helps you:

- Know if your selected files fit within a model's context limit
- Estimate API costs (usage is priced by token)
- Optimize your file selections for AI assistance

## Supported Encodings

PasteMax supports multiple encodings for different AI models:

| Encoding      | Models                                      |
| ------------- | ------------------------------------------- |
| `o200k_base`  | GPT-4o, GPT-4o-mini                         |
| `cl100k_base` | GPT-4, GPT-3.5-turbo, text-embedding models |
| `p50k_base`   | Codex models, text-davinci-002/003          |
| `r50k_base`   | GPT-3 models                                |

## How PasteMax Uses Tiktoken

### Default Configuration

- **Primary encoding**: `o200k_base` (GPT-4o encoding)
- **Fallback method**: Character count ÷ 4 (when tiktoken unavailable)
- **Real-time counting**: Updates automatically when files change

### Token Counting Process

1. **File Reading**: Content is read from selected files
2. **Text Cleaning**: Special tokens like `<|endoftext|>` are removed
3. **Encoding**: Text is converted to tokens using the appropriate encoder
4. **Display**: Token counts appear in the UI next to each file

### Code Implementation

```javascript
function countTokens(text) {
  if (!encoder) {
    return Math.ceil(text.length / 4); // Fallback estimation
  }

  try {
    const cleanText = text.replace(/<\|endoftext\|>/g, '');
    const tokens = encoder.encode(cleanText);
    return tokens.length;
  } catch (err) {
    console.error('Error counting tokens:', err);
    return Math.ceil(text.length / 4); // Fallback
  }
}
```

## Model Context Limits

PasteMax includes context limits for popular models:

- **GPT-4o**: 128K tokens
- **GPT-4**: 8K-32K tokens (depending on variant)
- **Claude 3.5 Sonnet**: 200K tokens
- **Gemini 1.5 Pro**: 1M tokens

## Best Practices

### Accurate Counting

- Token counts update automatically when files are modified
- Binary files are excluded from token counting
- Large files (>5MB) are skipped to maintain performance

### Context Management

- Use the total token count display to monitor context usage
- Select files strategically to stay within model limits
- Consider breaking large codebases into smaller, focused selections

## Technical Details

### Installation

Tiktoken is installed as a Node.js dependency:

```json
{
  "dependencies": {
    "tiktoken": "^1.0.21"
  }
}
```

### Error Handling

- Graceful fallback when tiktoken fails to load
- Automatic retry with character-based estimation
- Logging for debugging token counting issues

### Performance

- Efficient encoding for real-time updates
- Caching to avoid re-processing unchanged content
- Minimal impact on file loading performance

## Troubleshooting

### Token Count Not Updating

1. Check if the file is being watched correctly
2. Verify tiktoken is properly installed
3. Look for errors in the developer console

### Inaccurate Counts

- Remember that different models use different encodings
- Binary files show 0 tokens (expected behavior)
- Very large files may be skipped for performance

### Missing Tiktoken

If tiktoken fails to load, PasteMax falls back to a simple estimation (text length ÷ 4), which provides a rough approximation but may not be as accurate as the proper tokenizer.
