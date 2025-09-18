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
