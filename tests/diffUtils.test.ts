import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseUnifiedDiff } from '../src/utils/diffUtils';

const DIFF_SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index 123..456 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
-import { old } from './old';
+import { changed } from './changed';
 const foo = 1;
@@ -20,2 +21,5 @@
 const value = 4;
+function helper() {
+  return true;
+}
@@ -40 +44 @@
-const removed = true;
+const added = false;
`;

test('parseUnifiedDiff merges hunks by file', () => {
  const diffMap = parseUnifiedDiff(DIFF_SAMPLE);
  const entry = diffMap.get('src/foo.ts');
  assert.ok(entry, 'Expected diff entry for src/foo.ts');
  assert.equal(entry.length, 3);
  assert.deepEqual(entry[0], { start: 1, end: 4 });
  assert.deepEqual(entry[1], { start: 21, end: 25 });
  assert.deepEqual(entry[2], { start: 44, end: 44 });
});

test('parseUnifiedDiff ignores deleted files', () => {
  const diff = `diff --git a/old.txt b/old.txt\nindex 123..456 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-old\n-lines\n`;
  const diffMap = parseUnifiedDiff(diff);
  assert.equal(diffMap.size, 0);
});
