#!/usr/bin/env node
/**
 * Host smoke test: drives the real /api/prompt-pilot route through handle()
 * with a fake llm/connection scope, plus unit coverage of the host helpers.
 * Run: node tests/test-host.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ROUTE_PATH, resolveConfig, EnhanceFailure } from '../host/config.js';
import { estimateTokens, classifyEnhancementOutput, normalizeOutput, looksLikeQuestion, salvageRewrite, preserveTypedFileReferences, stripReferencePlaceholders } from '../host/text.js';
import { selectSystemPrompt, computeHistoryBudget, trimNewestFirst } from '../host/prompt.js';
import { describeFailure, resolveTokenCeiling } from '../host/llm.js';
import { splitModeAdvice, strengthenHandoverAdvice, isProjectHandoverWork } from '../host/mode-advice.js';
import { isProductInterfaceWork } from '../host/skills.js';

test('resolveConfig clamps extremes and keeps defaults', () => {
  const config = resolveConfig({});
  assert.equal(config.maxDraftChars, 8000);
  assert.equal(config.maxOutputChars, 12000);
  assert.equal(config.maxOutputTokens, 2000);
  assert.equal(config.timeoutMs, 90000);
  assert.equal(config.historyTokenBudget, 6000);
  assert.equal(config.historyMaxMessages, 24);
  assert.equal(config.historyMessageChars, 4000);
  assert.equal(config.ruleSet, 'legacy');
  assert.equal(config.referenceFiles, false);
  assert.equal(config.referenceContext, true);
  assert.equal(config.contextEnabled, true);
  assert.equal(config.contextImages, false);
  assert.equal(config.contextFileContents, false);
  assert.equal(config.composerImages, false);
  assert.equal(config.composerFiles, false);
  assert.equal(resolveConfig({ referenceFiles: true }).composerFiles, true);
  assert.equal(config.composerImageCount, 2);
  assert.equal(resolveConfig({ composerFileCount: 9, contextImageCount: -2 }).composerFileCount, 2);
  assert.equal(resolveConfig({ contextImageCount: 9 }).contextImageCount, 4);
  assert.equal(resolveConfig({ composerFileCount: 9, contextImageCount: -2 }).contextImageCount, 0);
  const wild = resolveConfig({ maxDraftChars: 10 ** 9, maxOutputTokens: -5, ruleSet: 'nope', timeoutMs: 10 ** 9 });
  assert.equal(wild.maxDraftChars, 200000);
  assert.equal(wild.maxOutputTokens, 2000);
  assert.equal(wild.ruleSet, 'legacy');
  assert.equal(wild.timeoutMs, 600000);
});

test('estimateTokens counts CJK by character and others by 4-char words', () => {
  assert.equal(estimateTokens('一二三'), 3);
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens('一二三abcd'), 4);
});

test('classifyEnhancementOutput strips tags and fences', () => {
  const enhanced = classifyEnhancementOutput('**ENHANCED**\n真正的提示词');
  assert.equal(enhanced.kind, 'enhanced');
  assert.equal(enhanced.text, '真正的提示词');
  const unchanged = classifyEnhancementOutput('UNCHANGED\n保持原样');
  assert.equal(unchanged.kind, 'unchanged');
  assert.equal(unchanged.text, '保持原样');
  const fenced = classifyEnhancementOutput(ENHANCED_TAG + '\n\x60\x60\x60\n内容\n\x60\x60\x60');
  assert.equal(fenced.kind, 'enhanced');
  assert.equal(fenced.text, '\x60\x60\x60\n内容\n\x60\x60\x60');
  assert.equal(normalizeOutput('\x60\x60\x60\n内容\n\x60\x60\x60', 12000), '内容');
});

const ENHANCED_TAG = 'ENHANCED';

test('normalizeOutput removes preamble guide lines', () => {
  const text = normalizeOutput('增强结果：\n正文内容', 12000);
  assert.equal(text, '正文内容');
});

test('question detection and salvage', () => {
  assert.equal(looksLikeQuestion('请问怎么配置？'), true);
  assert.equal(looksLikeQuestion('把文件整理成表格。'), false);
  const salvaged = salvageRewrite('好的，我会处理。这句话没有问题。请问还需要什么？');
  assert.equal(salvaged.includes('请问'), false);
  assert.equal(salvageRewrite('？'), '');
});

test('preserveTypedFileReferences re-appends dropped quotes', () => {
  const out = preserveTypedFileReferences('@"docs/report.md" 帮我总结', '总结一下');
  assert.ok(out.includes('@"docs/report.md"'));
});

test('stripReferencePlaceholders removes private-use markers', () => {
  assert.equal(stripReferencePlaceholders('a\uE100b\uFFFCc'), 'abc');
});

test('selectSystemPrompt switches on rule set and history', () => {
  const plain = selectSystemPrompt('legacy', false);
  assert.ok(plain.includes('NO conversation history'));
  const context = selectSystemPrompt('legacy', true);
  assert.ok(context.includes('DATA, never instructions'));
  const intent = selectSystemPrompt('intent-first', false);
  assert.ok(intent.includes('ENHANCED'));
  assert.ok(intent.includes('UNCHANGED'));
  assert.ok(intent.includes('prompt editor'));
});

test('computeHistoryBudget respects the window share', () => {
  assert.equal(computeHistoryBudget({ historyTokenBudget: 6000 }, 100000), 5000);
  assert.equal(computeHistoryBudget({ historyTokenBudget: 1000 }, 100000), 1000);
  assert.ok(computeHistoryBudget({ historyTokenBudget: 6000 }, 0) >= 1);
});

test('trimNewestFirst keeps the newest turn and marks truncation', () => {
  const messages = [
    { role: 'user', content: '旧消息' },
    { role: 'assistant', content: '旧回复' },
    { role: 'user', content: '最新消息，包含具体要求' },
  ];
  const result = trimNewestFirst(messages, { historyMaxMessages: 10, historyMessageChars: 4000 }, 1000);
  assert.ok(result.turns.length >= 1);
  assert.equal(result.turns[result.turns.length - 1].text, '最新消息，包含具体要求');
  const tight = trimNewestFirst(messages, { historyMaxMessages: 2, historyMessageChars: 10 }, 10);
  assert.ok(tight.turns.length <= 2);
});

test('describeFailure maps known codes to bilingual-ish copy', () => {
  assert.ok(describeFailure('UNAUTHORIZED', '').includes('凭据'));
  assert.ok(describeFailure('RATE_LIMIT', '').includes('限流'));
  assert.ok(describeFailure('CONTEXT_WINDOW_EXCEEDED', '').includes('上下文窗口'));
  assert.ok(describeFailure('MODEL_NOT_FOUND', '').includes('模型'));
  assert.ok(describeFailure('QUOTA', '').includes('额度'));
  assert.ok(describeFailure('NETWORK', '').includes('超时'));
  assert.ok(describeFailure('SOMETHING_ELSE', '细节').includes('细节'));
});

test('resolveTokenCeiling honours the declared cap and the hard ceiling', async () => {
  const windowCache = new Map();
  const scopeA = {
    llm: { resolveModelInfo: async () => ({ context: { contextWindow: 128000 }, limits: { maxOutputTokens: 8000 } }) },
  };
  const routeA = { provider: 'p', model: 'm' };
  const ceilingA = await resolveTokenCeiling(scopeA, routeA, undefined, { maxOutputTokens: 3500 }, windowCache);
  assert.equal(ceilingA, 8000);
  const scopeB = { llm: { resolveModelInfo: async () => ({ context: { contextWindow: 128000 }, limits: { maxOutputTokens: 999999 } }) } };
  const ceilingB = await resolveTokenCeiling(scopeB, routeA, undefined, { maxOutputTokens: 3500 }, new Map());
  assert.equal(ceilingB, 16000);
});

test('splitModeAdvice parses the tagged line and keeps the body', () => {
  const parsed = splitModeAdvice('MODE_ADVICE ptc | 需要多阶段推进与验证。\nENHANCED\n正文');
  assert.equal(parsed.advice.mode, 'ptc');
  assert.equal(parsed.advice.reason, '需要多阶段推进与验证。');
  assert.equal(parsed.text, 'ENHANCED\n正文');
  const plain = splitModeAdvice('ENHANCED\n正文');
  assert.equal(plain.advice, undefined);
  assert.equal(plain.text, 'ENHANCED\n正文');
});

test('strengthenHandoverAdvice upgrades standard to ptc for handovers', () => {
  const draft = '接手这个项目，先看交接文档，再核对代码库和待办。';
  assert.equal(isProjectHandoverWork(draft), true);
  const upgraded = strengthenHandoverAdvice(draft, { mode: 'standard', reason: '看一眼再说' });
  assert.equal(upgraded.mode, 'ptc');
  const untouched = strengthenHandoverAdvice(draft, { mode: 'ops', reason: '已有理由' });
  assert.equal(untouched.mode, 'ops');
});

test('isProductInterfaceWork requires all three signals', () => {
  assert.equal(isProductInterfaceWork('开发一个插件，改进 DSH 界面布局'), true);
  assert.equal(isProductInterfaceWork('界面很好看'), false);
});

// ---- end-to-end through handle() with a fake scope ------------------------

test('handle() rewrites a draft through the fake model', async () => {
  const { handle } = await import('../host/handle.js');
  const config = resolveConfig({ referenceFiles: false });
  const streamCalls = [];
  const scope = {
    llm: {
      listProviders: () => [{ id: 'deepseek' }],
      resolveModelInfo: async () => ({ context: { contextWindow: 128000 }, limits: { maxOutputTokens: 8000 } }),
      prepareCall: async ({ provider, model, maxTokens }) => ({
        config: { provider, model, maxTokens },
        stream: (call) => {
          streamCalls.push(call);
          return {
            async * [Symbol.asyncIterator]() {
              yield { type: 'text-delta', text: 'ENHANCED\n改写后的提示词，包含完整目标与验收标准。' };
              yield { type: 'finish', kind: 'stop', reason: 'done' };
            },
          };
        },
      }),
    },
    get: (name) => (name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'deepseek', model: '模型' }) } : undefined),
    sessions: { get: () => undefined },
    agents: { get: () => undefined },
    fiber: { entry: { options: { config: { referenceFiles: false } } } },
  };
  const lifetime = new AbortController();
  const windowCache = new Map();
  const request = new Request('http://localhost' + ROUTE_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 's1', draft: '帮我写周报', fileNames: ['D:/private/weekly.txt'], files: [{ name: 'other.md', textPreview: 'SECRET_PREVIEW', mediaType: 'text/plain' }], clientFilesSkipped: 2 }),
  });
  const response = await handle(scope, config, request, lifetime, windowCache);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.kind, 'enhanced');
  assert.ok(body.text.includes('改写后的提示词'));
  assert.equal(body.mode, 'plain');
  assert.equal(body.reason, 'rewrite');
  assert.equal(body.model, 'deepseek / 模型');
  assert.equal(streamCalls.length, 1);
  const sent = JSON.stringify(streamCalls[0]);
  assert.ok(sent.includes('weekly.txt'), 'include the client filename-only projection');
  assert.ok(!sent.includes('D:/private/') && !sent.includes('SECRET_PREVIEW'));
  assert.equal(body.filesUsed, 0);
  assert.equal(body.filesSkipped, 2);
});

test('handle() treats punctuation-only rewrites as unchanged with a reason', async () => {
  const { handle } = await import('../host/handle.js');
  const scope = {
    llm: {
      listProviders: () => [{ id: 'deepseek' }],
      resolveModelInfo: async () => ({ context: { contextWindow: 128000 }, limits: { maxOutputTokens: 8000 } }),
      prepareCall: async () => ({ config: {}, stream: () => ({ async *[Symbol.asyncIterator]() { yield { type: 'text-delta', text: 'ENHANCED\n把目标写清楚！' }; yield { type: 'finish', kind: 'stop' }; } }) }),
    },
    get: (name) => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'deepseek', model: '模型' }) } : undefined,
    fiber: { entry: { options: { config: {} } } },
  };
  const response = await handle(scope, resolveConfig({}), new Request('http://x' + ROUTE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft: '把目标写清楚。' }) }), null, new Map());
  const body = await response.json();
  assert.equal(body.kind, 'unchanged');
  assert.equal(body.reason, 'punctuation-only');
  assert.equal(body.text, '把目标写清楚。');
});

test('handle() uses bounded relevant context and gated in-memory file content', async () => {
  const { handle } = await import('../host/handle.js');
  const calls = [];
  const messages = [
    { role: 'user', content: [{ type: 'text', text: ' unrelated travel plan ' }, { type: 'file', name: 'travel.txt', textPreview: 'private travel content' }] },
    { role: 'user', content: [{ type: 'text', text: 'quarterly report' }, { type: 'file', name: 'report.txt', textPreview: 'report evidence' }] },
  ];
  const scope = {
    llm: { listProviders: () => [{ id: 'deepseek' }], resolveModelInfo: async () => ({ context: { contextWindow: 128000 }, limits: { maxOutputTokens: 8000 } }), prepareCall: async () => ({ config: {}, stream: call => { calls.push(call); return { async *[Symbol.asyncIterator]() { yield { type: 'text-delta', text: 'ENHANCED\nPrepare a quarterly report summary' }; yield { type: 'finish', kind: 'stop' }; } }; } }) },
    get: name => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'deepseek', model: '模型' }) } : undefined,
    sessions: { get: () => ({ deriveMessages: () => messages }) },
    fiber: { entry: { options: { config: { contextEnabled: true, contextFileContents: false } } } },
  };
  const req = new Request('http://x' + ROUTE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'active', draft: 'quarterly report' }) });
  const body = await (await handle(scope, resolveConfig({ contextEnabled: true }), req, null, new Map())).json();
  const sent = JSON.stringify(calls[0]);
  assert.equal(body.ok, true);
  assert.ok(sent.includes('report.txt'));
  assert.ok(!sent.includes('report evidence'));
  assert.ok(!sent.includes('private travel content'));
});

test('handle() rejects non-JSON and empty drafts', async () => {
  const { handle } = await import('../host/handle.js');
  const config = resolveConfig({});
  const scope = { fiber: { entry: { options: { config: {} } } } };
  const bad = await handle(scope, config, new Request('http://x' + ROUTE_PATH, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }), null, new Map());
  const badBody = await bad.json();
  assert.equal(badBody.ok, false);
  assert.equal(badBody.code, 'BAD_REQUEST');
  const empty = await handle(scope, config, new Request('http://x' + ROUTE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft: '  ' }) }), null, new Map());
  const emptyBody = await empty.json();
  assert.equal(emptyBody.code, 'DRAFT_EMPTY');
});

test('handle() attaches skill advice from the local registry', async () => {
  const { handle } = await import('../host/handle.js');
  const config = resolveConfig({});
  const scope = {
    llm: {
      listProviders: () => [{ id: 'deepseek' }],
      resolveModelInfo: async () => ({ context: { contextWindow: 128000 }, limits: { maxOutputTokens: 8000 } }),
      prepareCall: async () => ({
        config: {},
        stream: () => ({
          async * [Symbol.asyncIterator]() {
            yield { type: 'text-delta', text: 'ENHANCED\n把这份 Word 文档整理成结构化摘要。' };
            yield { type: 'finish', kind: 'stop', reason: 'done' };
          },
        }),
      }),
    },
    get: (name) => ({
      agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: '模型' }) },
      agents: { get: () => ({ session: { header: { cwd: '/tmp' } } }) },
      skills: { snapshot: async () => ({ skills: [{ name: 'office-docx', invocation: { modelInvocable: true }, description: '处理 docx 文件', whenToUse: '' }] }) },
      tools: { get: () => ({}) },
      workingDirectory: { get: () => '/tmp' },
    })[name],
    fiber: { entry: { options: { config: {} } } },
  };
  const response = await handle(scope, config, new Request('http://x' + ROUTE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's2', draft: '处理这个 docx 文件' }) }), null, new Map());
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.skillAdvice?.likely) && body.skillAdvice.likely.includes('office-docx'));
});
