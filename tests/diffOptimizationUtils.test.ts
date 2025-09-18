import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  detectNewFilesInDiff,
  optimizeGitDiff,
  createNewFileSummary,
  isNewFileStatus,
} from '../src/utils/diffOptimizationUtils';

const NEW_FILE_DIFF = `diff --git a/src/newFile.ts b/src/newFile.ts
new file mode 100644
--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,5 @@
+export function hello() {
+  return 'world';
+}
+
+export default hello;`;

const MODIFIED_FILE_DIFF = `diff --git a/src/existing.ts b/src/existing.ts
index abc123..def456 100644
--- a/src/existing.ts
+++ b/src/existing.ts
@@ -1,3 +1,4 @@
 import { something } from './lib';
+import { newImport } from './new';

 export const value = 42;`;

const MIXED_DIFF = `diff --git a/src/newFile.ts b/src/newFile.ts
new file mode 100644
--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,5 @@
+export function hello() {
+  return 'world';
+}
+
+export default hello;
diff --git a/src/existing.ts b/src/existing.ts
index abc123..def456 100644
--- a/src/existing.ts
+++ b/src/existing.ts
@@ -1,3 +1,4 @@
 import { something } from './lib';
+import { newImport } from './new';

 export const value = 42;`;

test('detectNewFilesInDiff identifies new files correctly', () => {
  const newFiles = detectNewFilesInDiff(MIXED_DIFF);

  assert.equal(newFiles.size, 1);
  assert.ok(newFiles.has('src/newFile.ts'));

  const fileInfo = newFiles.get('src/newFile.ts');
  assert.ok(fileInfo);
  assert.equal(fileInfo.isNew, true);
  assert.equal(fileInfo.lineCount, 5);
});

test('detectNewFilesInDiff returns empty map for modified files only', () => {
  const newFiles = detectNewFilesInDiff(MODIFIED_FILE_DIFF);
  assert.equal(newFiles.size, 0);
});

test('optimizeGitDiff replaces new file content with placeholder', () => {
  const optimized = optimizeGitDiff(NEW_FILE_DIFF);

  // Should contain the header
  assert.ok(optimized.includes('diff --git a/src/newFile.ts b/src/newFile.ts'));
  assert.ok(optimized.includes('new file mode 100644'));
  assert.ok(optimized.includes('--- /dev/null'));
  assert.ok(optimized.includes('+++ b/src/newFile.ts'));
  assert.ok(optimized.includes('@@ -0,0 +1,5 @@'));

  // Should have placeholder instead of actual content
  assert.ok(optimized.includes('\\ New file: src/newFile.ts (5 lines)'));
  assert.ok(optimized.includes('\\ Full content included in <file_contents> section above'));

  // Should NOT contain the actual file content
  assert.ok(!optimized.includes('export function hello()'));
  assert.ok(!optimized.includes("return 'world'"));
});

test('optimizeGitDiff preserves modified file diffs', () => {
  const optimized = optimizeGitDiff(MODIFIED_FILE_DIFF);

  // Should preserve the entire diff for modified files
  assert.ok(optimized.includes('diff --git a/src/existing.ts b/src/existing.ts'));
  assert.ok(optimized.includes('import { something } from \'./lib\';'));
  assert.ok(optimized.includes('+import { newImport } from \'./new\';'));
  assert.ok(optimized.includes('export const value = 42;'));
});

test('optimizeGitDiff handles mixed new and modified files', () => {
  const optimized = optimizeGitDiff(MIXED_DIFF);

  // New file should be optimized
  assert.ok(optimized.includes('\\ New file: src/newFile.ts (5 lines)'));
  assert.ok(!optimized.includes('export function hello()'));

  // Modified file should be preserved
  assert.ok(optimized.includes('+import { newImport } from \'./new\';'));
});

test('optimizeGitDiff with preserveMetadata false', () => {
  const optimized = optimizeGitDiff(NEW_FILE_DIFF, false);

  // Should still have headers but no metadata messages
  assert.ok(optimized.includes('diff --git a/src/newFile.ts b/src/newFile.ts'));
  assert.ok(optimized.includes('@@ -0,0 +1,5 @@'));

  // Should not have our custom messages
  assert.ok(!optimized.includes('\\ New file:'));
  assert.ok(!optimized.includes('\\ Full content included'));
});

test('createNewFileSummary generates correct summary', () => {
  const summary = createNewFileSummary('path/to/file.ts', 150);

  assert.ok(summary.includes('diff --git a/path/to/file.ts b/path/to/file.ts'));
  assert.ok(summary.includes('new file mode 100644'));
  assert.ok(summary.includes('--- /dev/null'));
  assert.ok(summary.includes('+++ b/path/to/file.ts'));
  assert.ok(summary.includes('@@ -0,0 +1,150 @@'));
  assert.ok(summary.includes('\\ New file: path/to/file.ts (150 lines)'));
  assert.ok(summary.includes('\\ Full content included in <file_contents> section above'));
});

test('isNewFileStatus identifies new file statuses', () => {
  assert.equal(isNewFileStatus('??'), true);  // Untracked
  assert.equal(isNewFileStatus('A'), true);   // Added
  assert.equal(isNewFileStatus('AM'), true);  // Added and modified
  assert.equal(isNewFileStatus('A '), true);  // Added (with space)
  assert.equal(isNewFileStatus('M'), false);  // Modified
  assert.equal(isNewFileStatus('D'), false);  // Deleted
  assert.equal(isNewFileStatus('R'), false);  // Renamed
});

test('optimizeGitDiff handles edge cases', () => {
  // Empty diff
  assert.equal(optimizeGitDiff(''), '');

  // Null-like inputs
  assert.equal(optimizeGitDiff(null as any), null);
  assert.equal(optimizeGitDiff(undefined as any), undefined);

  // Diff with only headers (no content)
  const headerOnly = `diff --git a/file.ts b/file.ts
new file mode 100644
--- /dev/null
+++ b/file.ts`;

  const optimizedHeader = optimizeGitDiff(headerOnly);
  assert.ok(optimizedHeader.includes('diff --git'));
});

test('detectNewFilesInDiff handles multiple new files', () => {
  const multiNewDiff = `diff --git a/file1.ts b/file1.ts
new file mode 100644
--- /dev/null
+++ b/file1.ts
@@ -0,0 +1,10 @@
+content1
diff --git a/file2.ts b/file2.ts
new file mode 100644
--- /dev/null
+++ b/file2.ts
@@ -0,0 +1,20 @@
+content2`;

  const newFiles = detectNewFilesInDiff(multiNewDiff);
  assert.equal(newFiles.size, 2);
  assert.ok(newFiles.has('file1.ts'));
  assert.ok(newFiles.has('file2.ts'));
  assert.equal(newFiles.get('file1.ts')?.lineCount, 10);
  assert.equal(newFiles.get('file2.ts')?.lineCount, 20);
});