import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../host/config.js';
import { handleSettings } from '../host/settings.js';

const endpoint = 'http://localhost/api/prompt-pilot/settings';
function fixture(update) {
  const settings = { get: () => ({}), update };
  const ctx = { get: key => key === 'settings' ? settings : undefined, fiber: { entry: { options: { id: 'include:dsh-prompt-pilot' } } } };
  return async (data, query = '') => {
    const init = data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
    return (await handleSettings(ctx, resolveConfig({}), new Request(endpoint + query, init))).json();
  };
}

test('a successful save reports the acknowledged values even before the read cache refreshes', async () => {
  const calls = [];
  const request = fixture(async (ns, patch) => { await Promise.resolve(); calls.push([ns, patch]); });
  const body = await request({ enhanceModel: '  selected  ', referenceContext: false });
  assert.deepEqual(calls, [['dsh-prompt-pilot', { enhanceModel: 'selected', referenceContext: false }]]);
  assert.equal(body.ok, true);
  assert.equal(body.values.enhanceModel, 'selected');
  assert.equal(body.values.referenceContext, false);
});

test('composer reads the current entry after a switch changes without restarting', async () => {
  const config = resolveConfig({});
  const options = { config: {} };
  const ctx = { fiber: { entry: { options } }, get: () => undefined };
  const read = async () => (await (await handleSettings(ctx, config, new Request(endpoint + '?scope=composer'))).json()).values;
  assert.equal((await read()).contextEnabled, true);
  assert.equal((await read()).composerImages, false);
  options.config = { referenceContext: false, referenceImages: true, referenceFiles: true };
  const values = await read();
  assert.equal(values.contextEnabled, false);
  assert.equal(values.composerImages, true);
  assert.equal(values.composerFiles, true);
  assert.equal(values.contextImageCount, 2);
  assert.equal(values.contextFileContents, false);
});

test('reject a mixed patch atomically when a switch has the wrong type', async () => {
  let writes = 0;
  const body = await fixture(() => { writes++; })({ enhanceModel: 'm', referenceFiles: 'false' });
  assert.equal(writes, 0);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'BAD_REQUEST');
});

test('reject counts above per-type host limits', async () => {
  let writes = 0;
  const body = await fixture(() => { writes++; })({ contextImageCount: 5, contextFileCount: 3 });
  assert.equal(writes, 0);
  assert.equal(body.code, 'BAD_REQUEST');
});

test('surface a refused write without reporting success', async () => {
  const body = await fixture(() => { throw Object.assign(new Error('revision mismatch'), { code: 'SETTINGS_CONFLICT' }); })({ shortcutEnabled: true });
  assert.equal(body.ok, false);
  assert.equal(body.code, 'SETTINGS_WRITE_FAILED');
  assert.match(body.message, /重新打开/u);
});

test('full settings identify the feedback repository; composer reads omit metadata', async () => {
  const request = fixture(() => assert.fail('unexpected write'));
  const full = await request();
  assert.equal(full.about.url + '/issues', 'https://github.com/asterdot/dsh-prompt-pilot/issues');
  const compact = await request(undefined, '?scope=composer');
  assert.deepEqual(compact.values, full.values);
  assert.equal(Object.hasOwn(compact, 'about'), false);
  assert.equal(Object.hasOwn(compact, 'changelog'), false);
});
