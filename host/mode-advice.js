// Mode advice: the first-message directive sent to the model, and the parsing
// and strengthening of the MODE_ADVICE line it answers with. Everything here is
// advisory — the plugin never switches a mode by itself.

/** The rewrite-only preamble used when no mode advice is wanted. */
export const REWRITE_ONLY_DIRECTIVE = 'Rewrite the draft for the user to review before sending; do not start the task. Unless explicitly asked in the original draft, do not add a requirement or promise to report skill usage after completion, and do not invent skill names.';

/** The first-message preamble that additionally asks for one MODE_ADVICE line. */
export const MODE_ADVICE_DIRECTIVE = [
  'For this first message, assess the underlying task (not the act of rewriting) and its complete expected workflow. Emit one separate first line before the rewrite result, even when the result is UNCHANGED: MODE_ADVICE <id> | <one short task-specific reason in the draft language>.',
  'When the draft asks you to read handover documents, inspect a codebase, take over an existing project, continue unfinished work, or follow up on TODOs, treat it as project onboarding and sustained delivery: first understand the handover, then reconcile it with the actual workspace, map completed work, open tasks, dependencies and risks, plan multiple stages, execute incrementally, verify each stage, and leave a follow-up state. Do not judge only the first file read or Git check. Consider attachment count/size, repository size, TODO count, dependency chains, and whether later validation or follow-up is required.',
  'For a substantial handover or multi-stage project, do not default to standard and do not pre-exclude ops or ptc. Choose ptc when the work needs coordinated batches of inspection, implementation, testing, and follow-up; choose ops when the dominant first phase is large-scale local file or repository retrieval, filtering, or aggregation; choose creative for developing or customizing DSH itself; choose extreme only for intentionally testing an agent with minimal tools. Choose standard only after the project scope is demonstrably small and sequential.',
  'Keep constraints from the handover: avoid repeating completed work, use the actual workspace as authority when documents differ, and never commit, push, or add a remote repository unless explicitly authorized. Give a concrete brief reason (up to 120 characters) based on the evidence. Do not use standard as a catch-all for uncertainty. Keep the original rewrite status and text format after this line. Never put the recommendation inside the rewrite.',
].join('\n');

/** Split a leading MODE_ADVICE line off the model answer. */
export function splitModeAdvice(raw) {
  const lines = String(raw ?? '').trimStart().split(/\r?\n/u);
  const header = (line) => line.trimStart().replace(/^(\*\*|__|\x60)(MODE_ADVICE)\1/iu, '$2');
  const tagged = /^MODE_ADVICE(?:\s|[:：]|$)/iu;
  if (!tagged.test(header(lines[0]))) return { text: raw };
  const result = /^MODE_ADVICE(?:[\t ]*[:：][\t ]*|[\t ]+)(standard|ptc|ops|extreme|creative)[\t ]*[|｜][\t ]*(.+)$/iu.exec(header(lines.shift()));
  const text = lines.filter((line) => !tagged.test(header(line))).join('\n');
  const reason = result?.[2].trim();
  if (!reason || reason.length > 120 || /[\p{Cc}\p{Cf}]/u.test(reason)) return { text };
  return { text, advice: { mode: result[1].toLowerCase(), reason } };
}

/** Does this draft describe taking over or continuing an existing project? */
export function isProjectHandoverWork(text) {
  const value = String(text ?? '').normalize('NFKC');
  const handover = /交接|接手|续作|继续推进|承接|handover|take over|continue (?:the )?project|onboarding/iu.test(value);
  const scope = /项目|代码库|仓库|工作区|待办|依赖|里程碑|交付|验证|后续|文档|资料|project|codebase|repository|workspace|todo|dependency|milestone|follow-?up|validate/iu.test(value);
  return handover && scope;
}

/**
 * A handover task must not get a casual "standard" suggestion: replace it with
 * ptc, whose staged orchestration matches onboarding work.
 */
export function strengthenHandoverAdvice(text, advice) {
  if (!isProjectHandoverWork(text) || (advice && advice.mode !== 'standard')) return advice;
  return {
    mode: 'ptc',
    reason: /\p{Script=Han}/u.test(text)
      ? '交接需核对资料与工作区，分阶段推进、验证并跟进依赖，适合工具编排。'
      : 'The handover needs staged inspection, execution, validation, and dependency follow-up, so coordinated tool orchestration fits.',
  };
}
