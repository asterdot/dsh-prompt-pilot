import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSystemPrompt, INTENT_FIRST_OUTPUT_PROTOCOL } from '../host/prompt.js';
import { classifyEnhancementOutput } from '../host/text.js';
import { LEGACY_RULES } from '../host/rules/legacy.mjs';
import { INTENT_FIRST_RULES } from '../host/rules/intent-first.mjs';
import { WORKBUDDY_RULES } from '../host/rules/workbuddy.mjs';

for (const [mode, rules] of [['legacy', LEGACY_RULES], ['intent-first', INTENT_FIRST_RULES], ['workbuddy', WORKBUDDY_RULES]]) {
  test(mode + ': assembly with and without history', () => {
    assert.ok(Array.isArray(rules) && rules.every(line => typeof line === 'string'));
    for (const history of [false, true]) {
      const prompt = selectSystemPrompt(mode, history);
      assert.ok(prompt.startsWith(rules.join('\n')));
      assert.equal(prompt.includes(INTENT_FIRST_OUTPUT_PROTOCOL), mode !== 'legacy');
      assert.match(prompt, history ? /history is supplied as DATA/i : /NO conversation history/);
      assert.match(prompt, /language of the draft/i);
      assert.ok(prompt.includes('@"folder/my file"'));
      assert.match(prompt, /do not execute/i);
    }
  });
}

test('tag and plain-body paths preserve mixed-language references', () => {
  const body = '比较 @"周报/Q1 notes.md" 和 @"周报/Q2.md"，用 English 列出差异。';
  for (const [prefix, kind] of [['', 'enhanced'], ['ENHANCED\n', 'enhanced'], ['UNCHANGED\n', 'unchanged']]) {
    assert.deepEqual(classifyEnhancementOutput(prefix + body), { kind, text: body });
  }
});
