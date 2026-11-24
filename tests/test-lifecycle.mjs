import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the production registration function with a disposable host registry.
const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const marker = 'export function apply';
assert.ok(source.includes(marker));
const base = '/api/prompt-pilot';
const apply = vm.runInNewContext('(' + source.slice(source.indexOf(marker) + 7).trim() + ')', {
  AbortController, resolveConfig: () => ({}), ROUTE_PATH: base,
  SETTINGS_PATH: base + '/settings', CONTEXT_STATUS_PATH: base + '/context-status',
});
test('unload removes every route and permits a second mount', () => {
  const active = new Set();
  for (const modelReady of [false, true]) {
    const disposers = [];
    const ctx = {
      connection: { fetch: { register({path}) {
        assert.ok(!active.has(path), 'duplicate route: ' + path);
        active.add(path);
        return () => active.delete(path);
      } } },
      effect(setup) { disposers.push(setup()); },
      inject(keys, mount) { assert.deepEqual(Array.from(keys), ['llm']); if (modelReady) mount(ctx); },
    };
    apply(ctx, {});
    const expected = [base + '/context-status', base + '/settings'];
    if (modelReady) expected.push(base);
    assert.deepEqual([...active].sort(), expected.sort());
    for (const dispose of disposers.reverse()) dispose();
    assert.deepEqual([...active], [], 'unload must clear the registry');
  }
});
