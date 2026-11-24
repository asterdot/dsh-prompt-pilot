import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('const bytesToBase64');
const end = source.indexOf('const taskStore', start);
assert.ok(start >= 0 && end > start);
const api = vm.runInNewContext(source.slice(start, end) + ';({readComposerFiles,readComposerImages})', { TextDecoder, Uint8Array, btoa });
const owner = (...entries) => ({ resolveDraftAttachments: () => entries });

test('names-only mode returns the leaf without opening a file', async () => {
  let reads = 0;
  const file = { name: 'D:/local/course.txt', arrayBuffer() { reads++; throw Error('must not open'); } };
  const result = await api.readComposerFiles(owner({ kind: 'file', file }), null, ['one'], { values: { referenceFiles: false } });
  assert.deepEqual(Array.from(result.names), ['course.txt']);
  assert.equal(reads, 0);
  assert.equal(result.files.length, 0);
});

test('a browser File supplies a bounded text preview, not a URL', async () => {
  const file = new File(['sample text'], 'course.txt', { type: 'text/plain' });
  const result = await api.readComposerFiles(owner({ kind: 'file', file }), null, ['one'], { values: { referenceFiles: true }, fileLimits: { textPreviewChars: 3 } });
  assert.equal(result.files[0]?.name, 'course.txt');
  assert.equal(result.files[0]?.textPreview, 'sam');
  assert.equal(result.skipped, 0);
});

test('image reader honours aggregate byte limit and ignores ordinary files', async () => {
  const image = { kind: 'image', file: new File(['abc'], 'diagram.png', { type: 'image/png' }) };
  const other = { kind: 'file', file: new File(['x'], 'course.txt') };
  const result = await api.readComposerImages(owner(other, image, image), null, ['a','b','c'], { referenceImages: true, maxMessageImageBytes: 4 });
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].data, 'YWJj');
  assert.equal(result.skipped, 1);
});
