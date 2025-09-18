import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatBaseFileContent, formatContentForCopying } from '../src/utils/contentFormatUtils';
import type { FileData } from '../src/types/FileTypes';

type TestFile = FileData;

const makeFile = (overrides?: Partial<TestFile>): TestFile => ({
  name: 'example.ts',
  path: '/repo/example.ts',
  content: 'console.log("hello");',
  tokenCount: 4,
  size: 32,
  isBinary: false,
  isSkipped: false,
  excludedByDefault: false,
  ...overrides,
});

const baseParams = {
  files: [makeFile()],
  selectedFiles: ['/repo/example.ts'],
  sortOrder: 'name-asc',
  includeFileTree: false,
  includeBinaryPaths: false,
  selectedFolder: '/repo',
};

test('formatBaseFileContent appends git diff block after file contents', () => {
  const diff = 'diff --git a/example.ts b/example.ts\n@@\n+added line\n';
  const output = formatBaseFileContent({ ...baseParams, gitDiff: diff });

  assert.ok(output.includes('<git_diff>'), 'git diff block missing');

  const closingIndex = output.indexOf('</file_contents>');
  const diffIndex = output.indexOf('<git_diff>');
  assert.ok(diffIndex > closingIndex, 'git diff block should appear after file contents');

  const match = output.match(/<git_diff>\n```diff\n([\s\S]*?)\n```\n<\/git_diff>/);
  assert.ok(match, 'expected fenced diff block');
  assert.equal(match[1], diff.trimEnd());
});

test('formatBaseFileContent omits git diff block when diff absent', () => {
  const output = formatBaseFileContent(baseParams);
  assert.equal(output.includes('<git_diff>'), false);
});

test('formatContentForCopying places git diff before instructions', () => {
  const diff = 'diff --git a/example.ts b/example.ts\n@@\n-line\n+line\n';
  const output = formatContentForCopying({
    ...baseParams,
    userInstructions: 'Review carefully.',
    gitDiff: diff,
  });

  const diffIndex = output.indexOf('<git_diff>');
  const instructionsIndex = output.indexOf('<user_instructions>');

  assert.ok(diffIndex >= 0, 'git diff block missing');
  assert.ok(
    instructionsIndex > diffIndex,
    'instructions should appear after git diff block'
  );

  const match = output.match(/<git_diff>\n```diff\n([\s\S]*?)\n```\n<\/git_diff>/);
  assert.ok(match, 'expected fenced diff block');
  assert.equal(match[1], diff.trimEnd());
});
