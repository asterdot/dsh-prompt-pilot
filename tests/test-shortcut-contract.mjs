import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');

test('shortcut preserves the saved command id and platform defaults', () => {
  assert.ok(source.includes("const SHORTCUT_ID = 'prompt-enhance.run';"));
  for (const row of [
    "'desktop:windows': { code: 'KeyE', modifiers: ['primary'] },",
    "'desktop:macos': { code: 'KeyE', modifiers: ['primary'] },",
    "'web:windows': { code: 'KeyE', modifiers: ['primary', 'alt'] },",
    "'web:macos': { code: 'KeyE', modifiers: ['primary', 'alt'] },",
  ]) assert.ok(source.includes(row), row);
});

test('registered shortcut callback honors opt-in and active-trigger gates', () => {
  const marker = 'const runCommand = () => {';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n              };', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start + 'const runCommand = '.length, end + '\n              }'.length);
  function run(enabled, hasTrigger) {
    let fired = 0, marked = 0;
    const taskStore = {
      shortcutAllowed: () => enabled,
      activeTrigger: () => hasTrigger ? () => { fired++; } : undefined,
      markHostFire: () => { marked++; },
    };
    vm.runInNewContext('(' + body + ')()', { taskStore });
    return { fired, marked };
  }
  assert.deepEqual(run(false, true), { fired: 0, marked: 0 });
  assert.deepEqual(run(true, false), { fired: 0, marked: 0 });
  assert.deepEqual(run(true, true), { fired: 1, marked: 1 });
});
