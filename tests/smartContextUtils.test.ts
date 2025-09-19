import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assembleSmartContextContent } from '../src/utils/smartContextUtils';
import type { FileData } from '../src/types/FileTypes';

const countTokensStub = async (text: string): Promise<number> => {
  return Math.ceil(text.length / 10);
};

const makeFile = (overrides: Partial<FileData>): FileData => ({
  name: 'file.ts',
  path: '/repo/file.ts',
  content: '',
  tokenCount: 0,
  size: 0,
  isBinary: false,
  isSkipped: false,
  excludedByDefault: false,
  ...overrides,
});

test('smart context assembles excerpts with range markers', async () => {
  const content = [
    'import { something } from "./lib";',
    'const one = 1;',
    'const two = 2;',
    'const three = 3;',
    'const four = 4;',
    'function change() {',
    '  return two + four;',
    '}',
    'export const value = change();',
  ].join('\n');

  const file = makeFile({
    name: 'feature.ts',
    path: '/repo/src/feature.ts',
    content,
    tokenCount: 120,
    size: content.length,
  });

  const diff = `diff --git a/src/feature.ts b/src/feature.ts\nindex 1..2 100644\n--- a/src/feature.ts\n+++ b/src/feature.ts\n@@ -5,2 +5,5 @@\n const four = 4;\n+function change() {\n+  return two + four;\n+}\n export const value = two;\n`;

  const result = await assembleSmartContextContent({
    files: [file],
    selectedFiles: ['/repo/src/feature.ts'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo',
    diffText: diff,
    diffPaths: ['/repo/src/feature.ts'],
    includeGitDiffs: false,
    gitDiff: undefined,
    budgetTokens: 1000,
    contextLines: 2,
    joinThreshold: 5,
    smallFileTokenThreshold: 400,
    tokenCounter: countTokensStub,
  });

  assert.ok(
    result.content.includes('File: /repo/src/feature.ts (excerpt)'),
    'Expected excerpt marker'
  );
  assert.ok(result.content.includes('[lines '), 'Expected range header in excerpt');
  assert.ok(result.content.includes('function change() {'), 'Expected changed code in excerpt');
  assert.ok(result.tokenCount > 0, 'Token count should be computed');
});

test('budget drops low priority files but keeps essential diffs', async () => {
  const changedContent = 'line1\nline2\nline3\n';
  const largeContent = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');

  const changedFile = makeFile({
    name: 'changed.ts',
    path: '/repo/changed.ts',
    content: changedContent,
    tokenCount: 60,
    size: changedContent.length,
  });

  const largeFile = makeFile({
    name: 'large.ts',
    path: '/repo/large.ts',
    content: largeContent,
    tokenCount: 5000,
    size: largeContent.length,
  });

  const diff = `diff --git a/changed.ts b/changed.ts\nindex 1..2 100644\n--- a/changed.ts\n+++ b/changed.ts\n@@ -1,1 +1,3 @@\n-line1\n+line1\n+line2\n+line3\n`;

  const result = await assembleSmartContextContent({
    files: [changedFile, largeFile],
    selectedFiles: ['/repo/changed.ts', '/repo/large.ts'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo',
    diffText: diff,
    diffPaths: ['/repo/changed.ts'],
    includeGitDiffs: false,
    gitDiff: undefined,
    budgetTokens: 15,
    contextLines: 1,
    joinThreshold: 2,
    smallFileTokenThreshold: 400,
    tokenCounter: countTokensStub,
  });

  assert.ok(
    result.content.includes('File: /repo/changed.ts (excerpt)'),
    'Essential diff should remain'
  );
  assert.ok(
    !result.content.includes('File: /repo/large.ts'),
    'Large file should be dropped under budget'
  );
});

test('small non-diff files included when under threshold', async () => {
  const helperContent = 'export const helper = () => true;\n';
  const helperFile = makeFile({
    name: 'helper.ts',
    path: '/repo/helper.ts',
    content: helperContent,
    tokenCount: 20,
    size: helperContent.length,
  });

  const result = await assembleSmartContextContent({
    files: [helperFile],
    selectedFiles: ['/repo/helper.ts'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo',
    diffText: '',
    diffPaths: [],
    includeGitDiffs: false,
    gitDiff: undefined,
    budgetTokens: 1000,
    contextLines: 2,
    joinThreshold: 5,
    smallFileTokenThreshold: 400,
    tokenCounter: countTokensStub,
  });

  assert.ok(
    result.content.includes('File: /repo/helper.ts'),
    'Small file should be included in full'
  );
});

test('diff tokens reduce budget available for non-essential files', async () => {
  const changedFile = makeFile({
    name: 'changed.ts',
    path: '/repo/changed.ts',
    content: 'line1\nline2\nline3\n',
    tokenCount: 60,
    size: 18,
  });

  const helperFile = makeFile({
    name: 'helper.ts',
    path: '/repo/helper.ts',
    content: 'helper line\n',
    tokenCount: 20,
    size: 12,
  });

  const diff = `diff --git a/changed.ts b/changed.ts\nindex 1..2 100644\n--- a/changed.ts\n+++ b/changed.ts\n@@ -1,1 +1,4 @@\n-line1\n+line1\n+line2\n+line3\n+line4\n`;

  const result = await assembleSmartContextContent({
    files: [changedFile, helperFile],
    selectedFiles: ['/repo/changed.ts', '/repo/helper.ts'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo',
    diffText: diff,
    diffPaths: ['/repo/changed.ts'],
    includeGitDiffs: true,
    gitDiff: diff,
    budgetTokens: 5,
    contextLines: 1,
    joinThreshold: 2,
    smallFileTokenThreshold: 400,
    tokenCounter: countTokensStub,
  });

  assert.ok(result.content.includes('<git_diff>'), 'Diff section should be included');
  assert.ok(
    result.content.includes('File: /repo/changed.ts (excerpt)'),
    'Changed file excerpt should remain as essential content'
  );
  assert.ok(
    !result.content.includes('File: /repo/helper.ts'),
    'Helper file should be dropped when budget consumed by diff'
  );
});

test('diff path without hunks uses capped non-essential snippet', async () => {
  const content = Array.from({ length: 150 }, (_, idx) => `line ${idx + 1}`).join('\n');
  const ghostFile = makeFile({
    name: 'ghost.ts',
    path: '/repo/src/ghost.ts',
    content,
    tokenCount: 2000,
    size: content.length,
  });

  const result = await assembleSmartContextContent({
    files: [ghostFile],
    selectedFiles: ['/repo/src/ghost.ts'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo',
    diffText: '',
    diffPaths: ['/repo/src/ghost.ts'],
    includeGitDiffs: false,
    gitDiff: undefined,
    budgetTokens: 500,
    contextLines: 3,
    joinThreshold: 2,
    smallFileTokenThreshold: 100,
    tokenCounter: countTokensStub,
  });

  assert.ok(
    result.content.includes('File: /repo/src/ghost.ts (capped excerpt)'),
    'Expected capped excerpt label'
  );
  assert.ok(result.content.includes('// [lines 1-80]'), 'Expected head range');
  assert.ok(result.content.includes('// [lines 111-150]'), 'Expected tail range');
  assert.ok(result.content.includes('// ...'), 'Expected ellipsis separating ranges');
  assert.ok(!result.content.includes('line 90'), 'Middle lines should be omitted');
});

test('excerpt selection prefers smallest variant when budget allows larger', async () => {
  const lines = Array.from({ length: 30 }, (_, idx) => `line ${idx + 1}`);
  lines[19] = 'line 20 changed';
  const content = lines.join('\n');

  const file = makeFile({
    name: 'change.ts',
    path: '/repo/src/change.ts',
    content,
    tokenCount: 600,
    size: content.length,
  });

  const diff = `diff --git a/src/change.ts b/src/change.ts\nindex 1..2 100644\n--- a/src/change.ts\n+++ b/src/change.ts\n@@ -18,3 +18,3 @@\n-line 19\n-line 20\n-line 21\n+line 19\n+line 20 changed\n+line 21\n`;

  const result = await assembleSmartContextContent({
    files: [file],
    selectedFiles: ['/repo/src/change.ts'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo',
    diffText: diff,
    diffPaths: ['/repo/src/change.ts'],
    includeGitDiffs: false,
    gitDiff: undefined,
    budgetTokens: 500,
    contextLines: 6,
    joinThreshold: 2,
    smallFileTokenThreshold: 100,
    tokenCounter: countTokensStub,
  });

  assert.ok(result.content.includes('line 20 changed'), 'Changed line should be present');
  assert.ok(
    !result.content.includes('line 14'),
    'Large-context surrounding lines should be skipped when smaller variant fits budget'
  );
});

test('diff hunks respect unique suffix matching to avoid collisions', async () => {
  const uiContent = ['export const Button = () => null;', 'export const Flag = true;'].join('\n');
  const coreContent = ['export const Button = () => true;', 'export const Badge = false;'].join(
    '\n'
  );

  const uiFile = makeFile({
    name: 'Button.tsx',
    path: '/repo/packages/ui/Button.tsx',
    content: uiContent,
    tokenCount: 200,
    size: uiContent.length,
  });

  const coreFile = makeFile({
    name: 'Button.tsx',
    path: '/repo/packages/core/Button.tsx',
    content: coreContent,
    tokenCount: 200,
    size: coreContent.length,
  });

  const diff = `diff --git a/packages/ui/Button.tsx b/packages/ui/Button.tsx\nindex 1..2 100644\n--- a/packages/ui/Button.tsx\n+++ b/packages/ui/Button.tsx\n@@ -1,2 +1,2 @@\n-export const Button = () => null;\n-export const Flag = true;\n+export const Button = () => true;\n+export const Flag = false;\n`;

  const result = await assembleSmartContextContent({
    files: [uiFile, coreFile],
    selectedFiles: ['/repo/packages/ui/Button.tsx', '/repo/packages/core/Button.tsx'],
    sortOrder: 'name-asc',
    includeFileTree: false,
    includeBinaryPaths: false,
    selectedFolder: '/repo/packages',
    diffText: diff,
    diffPaths: ['/repo/packages/ui/Button.tsx'],
    includeGitDiffs: false,
    gitDiff: undefined,
    budgetTokens: 500,
    contextLines: 2,
    joinThreshold: 2,
    smallFileTokenThreshold: 0,
    tokenCounter: countTokensStub,
  });

  assert.ok(
    result.content.includes('File: /repo/packages/ui/Button.tsx (excerpt)'),
    'UI button should produce an excerpt'
  );
  assert.ok(
    !result.content.includes('File: /repo/packages/core/Button.tsx (excerpt)'),
    'Core button should not inherit UI diff hunks'
  );
});
