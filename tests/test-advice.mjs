import test from 'node:test';
import assert from 'node:assert/strict';

import { REWRITE_ONLY_DIRECTIVE, MODE_ADVICE_DIRECTIVE, splitModeAdvice, strengthenHandoverAdvice, isProjectHandoverWork } from '../host/mode-advice.js';
import { isProductInterfaceWork, addDraftSkill, selectDraftSkill } from '../host/skills.js';

test('keyword evidence respects labels, phrase boundaries and Chinese lists', () => {
  const skill = { name: 'sample', invocation: { modelInvocable: true }, whenToUse: '关键词：排版、page layout；ignored' };
  const likely = draft => selectDraftSkill(draft, [], [skill]).likely;
  assert.deepEqual(likely('调整排版'), ['sample']);
  assert.deepEqual(likely('Check PAGE LAYOUT.'), ['sample']);
  assert.deepEqual(likely('check webpage layouts; ignored'), []);
});

test('directives exist and are stable strings', () => {
  assert.ok(REWRITE_ONLY_DIRECTIVE.includes('do not start the task'));
  assert.ok(MODE_ADVICE_DIRECTIVE.includes('MODE_ADVICE'));
});

test('splitModeAdvice separates the tag line from the rewrite', () => {
  const raw = 'MODE_ADVICE ptc | 交接任务需要分阶段推进与验证。\n改写后的提示词正文';
  const { text, advice } = splitModeAdvice(raw);
  assert.deepEqual(advice, { mode: 'ptc', reason: '交接任务需要分阶段推进与验证。' });
  assert.equal(text, '改写后的提示词正文');
});

test('splitModeAdvice accepts bold-wrapped tags and full-width separators', () => {
  const raw = '**MODE_ADVICE** standard｜范围很小，顺序执行即可。\n正文';
  const { advice } = splitModeAdvice(raw);
  assert.deepEqual(advice, { mode: 'standard', reason: '范围很小，顺序执行即可。' });
});

test('splitModeAdvice drops overlong or control-laden reasons', () => {
  const long = 'x'.repeat(121);
  const dropped = splitModeAdvice('MODE_ADVICE ops | ' + long + '\n正文');
  assert.equal(dropped.advice, undefined);
  const control = splitModeAdvice('MODE_ADVICE ops | 理由\u200b含零宽\n正文');
  assert.equal(control.advice, undefined);
});

test('splitModeAdvice passes untagged text through', () => {
  const raw = '没有标签的正文';
  const out = splitModeAdvice(raw);
  assert.equal(out.text, raw);
  assert.equal(out.advice, undefined);
});

test('strengthenHandoverAdvice upgrades standard to ptc for handovers', () => {
  assert.equal(isProjectHandoverWork('接手这个项目，继续推进待办'), true);
  const upgraded = strengthenHandoverAdvice('接手这个项目，继续推进待办', { mode: 'standard', reason: '小任务' });
  assert.equal(upgraded.mode, 'ptc');
  assert.ok(upgraded.reason.length > 0);
  const english = strengthenHandoverAdvice('Take over the project codebase and follow up', { mode: 'standard', reason: 'small' });
  assert.equal(english.mode, 'ptc');
  assert.ok(/[a-zA-Z]/u.test(english.reason));
  const kept = strengthenHandoverAdvice('普通任务', { mode: 'standard', reason: 'x' });
  assert.deepEqual(kept, { mode: 'standard', reason: 'x' });
  const ptc = strengthenHandoverAdvice('接手这个项目', { mode: 'ptc', reason: 'x' });
  assert.deepEqual(ptc, { mode: 'ptc', reason: 'x' });
});

test('isProductInterfaceWork requires three signals', () => {
  assert.equal(isProductInterfaceWork('开发一个插件，改进 DSH 界面布局'), true);
  assert.equal(isProductInterfaceWork('界面很好看'), false);
  assert.equal(isProductInterfaceWork('redesign the UI layout of the settings page'), true);
});

test('addDraftSkill ranks format hits as likely', async () => {
  const agent = { session: { header: { cwd: '/tmp' } } };
  const skills = [
    { invocation: { modelInvocable: true } }, // malformed entries must not suppress valid peers
    { name: 'office-docx', invocation: { modelInvocable: true }, description: '处理 docx 文件', whenToUse: '' },
    { name: 'ego-browser', invocation: { modelInvocable: false }, description: '不可由模型调用', whenToUse: '' },
  ];
  const scope = {
    get: (name) => ({
      agents: { get: () => agent },
      skills: { snapshot: async () => ({ skills }) },
      tools: { get: () => ({}) },
      workingDirectory: { get: () => '/tmp' },
    })[name],
  };
  const outcome = { kind: 'enhanced', text: '整理这份 docx 文档' };
  const { skillAdvice } = await addDraftSkill(scope, 's1', '帮我把这份 docx 文档整理成摘要', ['doc'], outcome, undefined);
  assert.deepEqual(skillAdvice, { likely: ['office-docx'], possible: [] });
});

test('addDraftSkill skips skills the rewrite already names', async () => {
  const agent = { session: { header: { cwd: '/tmp' } } };
  const skills = [{ name: 'office-docx', invocation: { modelInvocable: true }, description: '处理 docx', whenToUse: '' }];
  const scope = {
    get: (name) => ({
      agents: { get: () => agent },
      skills: { snapshot: async () => ({ skills }) },
      tools: { get: () => ({}) },
      workingDirectory: { get: () => '/tmp' },
    })[name],
  };
  const { skillAdvice } = await addDraftSkill(scope, 's1', '整理 docx 文档', [], { kind: 'enhanced', text: '使用 office-docx 技能处理' }, undefined);
  assert.equal(skillAdvice, null);
});

test('addDraftSkill refuses non-model outcomes and broken registries', async () => {
  const refused = await addDraftSkill({ get: () => undefined }, 's1', '草稿', [], { kind: 'refused', text: 'x' }, undefined);
  assert.equal(refused.skillAdvice, null);
  const noSession = await addDraftSkill({ get: () => undefined }, undefined, '草稿', [], { kind: 'enhanced', text: 'x' }, undefined);
  assert.equal(noSession.skillAdvice, null);
  let snapshotAttempts = 0;
  const broken = { get: (name) => ({ agents: { get: () => ({ session: { header: { cwd: '/tmp' } } }) }, skills: { snapshot: async () => { snapshotAttempts++; throw new Error('boom'); } }, tools: { get: () => ({}) } })[name] ?? undefined };
  const failed = await addDraftSkill(broken, 's1', '草稿', [], { kind: 'enhanced', text: 'x' }, undefined);
  assert.equal(snapshotAttempts, 1);
  assert.equal(failed.skillAdvice, null);
});
