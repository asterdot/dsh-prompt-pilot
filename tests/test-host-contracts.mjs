import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, generate } from '../host/llm.js';
import { addDraftSkill, selectDraftSkill } from '../host/skills.js';
import { REASONING_HEADROOM_TOKENS } from '../host/config.js';

test('pin, session next, last-used and default routes are lazy alternatives', () => {
  const next = { provider: 'n', model: 'one', reasoningEffort: 'high' };
  const lastUsed = { provider: 'l', model: 'two' };
  const fallback = { provider: 'd', model: 'three' };
  let selection = { next, lastUsed };
  const services = { sessions: { get: () => ({}) }, sessionProjections: { snapshot: () => ({ values: { modelSelection: selection } }) }, agentDefaultModel: { currentSelection: () => fallback } };
  const scope = { get: key => services[key] };
  const pin = { enhanceProvider: 'p', enhanceModel: 'four', useCustomModel: true };
  assert.deepEqual(resolveRoute({ get: assert.fail }, 's', pin), { provider: 'p', model: 'four' });
  assert.equal(resolveRoute(scope, 's', { ...pin, useCustomModel: false }), next);
  selection = { next: { provider: 'partial' }, lastUsed };
  assert.equal(resolveRoute(scope, 's', {}), lastUsed);
  selection.lastUsed = { provider: 'old', model: ' ' };
  assert.equal(resolveRoute(scope, 's', {}), fallback);
  selection = { lastUsed };
  assert.equal(resolveRoute(scope, 's', { ...pin, enhanceModel: '' }), lastUsed);
  services.sessionProjections.snapshot = () => { throw Error('offline'); };
  assert.equal(resolveRoute(scope, 's', {}), fallback);
});

function fixture(stream, signal, provider = 'local') {
  const budgets = [], requests = [];
  const llm = {
    listProviders: () => [{ id: provider }], resolveModelInfo: async () => ({}),
    prepareCall: async ({ maxTokens }) => {
      budgets.push(maxTokens);
      return { config: {}, stream: request => { requests.push(request); return stream(budgets.length); } };
    },
  };
  const run = () => generate({ llm }, { maxOutputTokens: 300, maxOutputChars: 500, ruleSet: 'legacy' }, { provider, model: 'mock' }, 'draft', { hasContext: false, turns: [] }, [], signal, new Map(), 'session');
  return { run, budgets, requests };
}

for (const cause of ['reasoning', 'max-tokens']) test('retry discards prior stream: ' + cause, async () => {
  function* stream(attempt) {
    if (attempt === 1 && cause === 'reasoning') yield { type: 'reasoning-delta', text: 'private' };
    else if (attempt === 1) {
      yield { type: 'text-delta', text: 'partial' };
      yield { type: 'finish', reason: { kind: 'max-tokens' } };
    } else yield { type: 'text-delta', text: 'final answer' };
  }
  const detached = cause === 'reasoning';
  const f = fixture(stream, new AbortController().signal, detached ? 'mock-deepseek' : 'local');
  assert.equal(await f.run(), 'final answer');
  const first = 300 + REASONING_HEADROOM_TOKENS;
  assert.deepEqual(f.budgets, [first, first * 2]);
  for (const request of f.requests) assert.equal(Object.hasOwn(request, 'sessionId'), false);
});

test('abort during streaming closes iterator and never retries', async () => {
  const controller = new AbortController();
  const reason = Error('caller cancelled');
  let closed = false;
  function* stream() {
    try { controller.abort(reason); yield { type: 'finish', reason: { kind: 'max-tokens' } }; }
    finally { closed = true; }
  }
  const f = fixture(stream, controller.signal);
  await assert.rejects(f.run(), err => err === reason);
  assert.ok(closed);
  assert.equal(f.budgets.length, 1);
});

test('two-tier selection respects attachment evidence, opt-out and invocation rights', async () => {
  const skills = ['office', 'office-docx', 'private-check'].map(name => ({ name, invocation: { modelInvocable: name !== 'private-check' } }));
  const services = { agents: { get: () => ({ session: { header: { cwd: '/work' } } }) }, tools: { get: () => ({}) }, skills: { snapshot: async () => ({ skills }) } };
  const outcome = { kind: 'unchanged', text: '整理材料' };
  const choose = draft => addDraftSkill({ get: key => services[key] }, 's', draft, ['report.docx', 'scan.pdf'], outcome);
  assert.deepEqual(await choose('整理材料 private-check'), { outcome, skillAdvice: { likely: ['office-docx'], possible: ['office'] } });
  assert.deepEqual(await choose('整理材料，不要使用技能'), { outcome, skillAdvice: null });
});

test('pure skill ranking is deterministic and never mutates catalog input', () => {
  const catalog = [{ name: 'office-docx', invocation: { modelInvocable: true }, description: '触发词：文档、docx' }, { name: 'private-check', invocation: { modelInvocable: false } }];
  const snapshot = JSON.stringify(catalog);
  assert.deepEqual(selectDraftSkill('制作文档', ['report.docx'], catalog), { likely: ['office-docx'], possible: [] });
  assert.equal(JSON.stringify(catalog), snapshot);
  assert.deepEqual(selectDraftSkill('整理材料，不要使用技能', [], catalog), { likely: [], possible: [] });
});

