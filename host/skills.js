// Tiered skill suggestions. The catalog is filtered locally and never sent to
// the rewriting model; only the chosen skill NAMES reach the draft so the user
// can review them before sending. Nothing is loaded or executed here.

/** Is this draft asking for product/interface work (drives special cases)? */
export function isProductInterfaceWork(text) {
  return /(?:界面|\b(?:ui|interface)\b)/iu.test(text)
    && /美化|打磨|视觉|布局|改进|优化|重新设计|\b(?:redesign|polish|visual|layout|beautify)\b/iu.test(text)
    && /开发|实现|修改|调整|设计|改进|优化|美化|打磨|\b(?:build|develop|implement|redesign|polish|beautify)\b/iu.test(text);
}

// Only explicitly labeled keywords count; ordinary catalog prose is not evidence.
function keywordWeight(text, descriptions) {
  let strongest = 0;
  for (const description of descriptions) {
    const label = /(?:触发词|关键词|triggers?|keywords?)\s*[:：]\s*/iu.exec(description);
    if (!label) continue;
    const list = description.slice(label.index + label[0].length).split(/[。；;\n]/u, 1)[0];
    for (const fragment of list.normalize('NFKC').toLowerCase().split(/[、，,|]/u)) {
      const word = fragment.trim();
      if (/^\p{Script=Han}{2,12}$/u.test(word)) {
        if (text.includes(word)) strongest = Math.max(strongest, 2 + Math.min(5, word.length));
      } else if (/^[a-z0-9][a-z0-9 /-]{2,30}$/u.test(word)) {
        const boundary = new RegExp('(?:^|[^a-z0-9])' + word + '(?![a-z0-9])', 'u');
        if (boundary.test(text)) strongest = Math.max(strongest, 5);
      }
    }
  }
  return strongest;
}

export function selectDraftSkill(draft, fileNames, skills, rewritten = '') {
  const groups = { likely: [], possible: [] };
  const text = draft.normalize('NFKC').toLowerCase();
  if (/不(?:要|用|必|需要|使用|调用|启用)[^。！？\n]{0,12}(?:技能|skill)|\b(?:no|without|do not use|don't use)\s+(?:any\s+)?skills?\b/iu.test(text)) return groups;
  const files = fileNames.join(' ').normalize('NFKC').toLowerCase();
  const formats = {
    'office-docx': /\b(?:word|docx)\b/u,
    'office-pptx': /\b(?:pptx?|powerpoint)\b|演示文稿|幻灯片/u,
    'office-xlsx': /\b(?:excel|xlsx)\b|电子表格/u,
    office: /\b(?:office|pdf)\b/u,
  };
  const ranked = new Map();
  for (const skill of skills) {
    const name = skill?.name;
    const description = skill?.description;
    const whenToUse = skill?.whenToUse;
    const invocation = skill?.invocation;
    if (typeof name !== 'string' || invocation?.modelInvocable !== true || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) continue;
    const named = new RegExp('(?:^|[^a-z0-9-])' + name + '(?=$|[^a-z0-9-])', 'iu');
    if (named.test(rewritten)) continue;
    if (new RegExp('(?:不(?:要|用|必|需要|使用|调用|启用)|(?:do not use|don\'t use|without)\\s+)\\s*[/\x60]?' + name + '(?=$|[^a-z0-9-])', 'iu').test(text)) continue;
    const summaries = [description, whenToUse].filter((value) => typeof value === 'string');
    let score = Object.hasOwn(formats, name) && formats[name].test(text + ' ' + files) ? (name === 'office' ? 1 : 4) : 0;
    if (name.includes('-') && named.test(text)) score = Math.max(score, 9);
    if (name === 'impeccable' && isProductInterfaceWork(text)) score = Math.max(score, 8);
    if (name === 'browser-skill' && isProductInterfaceWork(text) && /验证|测试|验收|\b(?:verify|test|validate)\b/iu.test(text)) score = Math.max(score, 2);
    if (name === 'browser-skill' && /(?:浏览器|browser).{0,20}(?:实测|验证|测试|test|verify)|(?:用|在|verify in|test in).{0,10}(?:浏览器|browser)/iu.test(text)) score = Math.max(score, 4);
    score = Math.max(score, keywordWeight(text, summaries));
    if (score) ranked.set(name, Math.max(score, ranked.get(name) ?? 0));
  }
  // A direct hit on purpose, format or trigger words is "likely"; supporting
  // signals land in "possible".
  for (const entry of ranked) {
    groups[entry[1] >= 4 ? 'likely' : 'possible'].push(entry[0]);
  }
  groups.likely.sort((a, b) => (ranked.get(b) ?? 0) - (ranked.get(a) ?? 0));
  groups.possible.sort((a, b) => (ranked.get(b) ?? 0) - (ranked.get(a) ?? 0));
  return groups;
}

/**
 * Attach tiered skill suggestions to a finished enhancement.
 * @returns the outcome plus skillAdvice (null when nothing qualifies).
 */
export async function addDraftSkill(scope, sessionId, draft, fileNames, outcome, signal) {
  if (sessionId === undefined || !['enhanced', 'unchanged'].includes(outcome.kind)) return { outcome, skillAdvice: null };
  try {
    const agent = scope.get('agents')?.get(sessionId);
    const registry = scope.get('skills');
    if (!agent || !registry || !scope.get('tools')?.get('skill', agent)) return { outcome, skillAdvice: null };
    const cwd = scope.get('workingDirectory')?.get(agent.session) ?? agent.session.header.cwd;
    const deadline = AbortSignal.timeout(1000);
    const discoverySignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const catalog = await registry.snapshot({ scope: agent, cwd, signal: discoverySignal });
    const selection = selectDraftSkill(draft, fileNames, catalog.skills, outcome.text);
    return { outcome, skillAdvice: selection.likely.length || selection.possible.length ? selection : null };
  } catch {
    // Skill discovery must never fail a finished rewrite; the client shows that
    // there is simply no recommendation.
    return { outcome, skillAdvice: null };
  }
}
