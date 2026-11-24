#!/usr/bin/env node
/**
 * Syntax gate for every file the package ships.
 * Run: node scripts/check-syntax.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  'index.js',
  'client.js',
  'host/config.js',
  'host/text.js',
  'host/prompt.js',
  'host/llm.js',
  'host/attachments.js',
  'host/session-log.js',
  'host/mode-advice.js',
  'host/skills.js',
  'host/settings.js',
  'host/handle.js',
  'host/rules/legacy.mjs',
  'host/rules/intent-first.mjs',
  'host/rules/workbuddy.mjs',
];

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.log('FAIL ' + file);
    console.log(result.stderr);
  } else {
    console.log('ok   ' + file);
  }
}
if (failed > 0) {
  console.log(failed + ' file(s) failed the syntax check');
  process.exitCode = 1;
} else {
  console.log('all ' + files.length + ' files passed the syntax check');
}
