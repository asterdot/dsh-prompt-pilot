// 技能目录只在本机筛选，不会交给改写模型。
export function isProductInterfaceWork(text) {
	return /(?:界面|\b(?:ui|interface)\b)/iu.test(text)
		&& /美化|打磨|视觉|布局|改进|优化|重新设计|\b(?:redesign|polish|visual|layout|beautify)\b/iu.test(text)
		&& /开发|实现|修改|调整|设计|改进|优化|美化|打磨|\b(?:build|develop|implement|redesign|polish|beautify)\b/iu.test(text);
}

function selectDraftSkill(draft, fileNames, skills, rewritten = '') {
	const groups = { likely: [], possible: [] };
	const text = draft.normalize('NFKC').toLowerCase();
	if (/不(?:要|用|必|需要|使用|调用|启用)[^。！？\n]{0,12}(?:技能|skill)|\b(?:no|without|do not use|don't use)\s+(?:any\s+)?skills?\b/i.test(text)) return groups;
	const files = fileNames.join(' ').normalize('NFKC').toLowerCase();
	const formats = {
		'office-docx': /\b(?:word|docx)\b/u,
		'office-pptx': /\b(?:pptx?|powerpoint)\b|演示文稿|幻灯片/u,
		'office-xlsx': /\b(?:excel|xlsx)\b|电子表格/u,
		office: /\b(?:office|pdf)\b/u,
	};
	const ranked = new Map();
	for (const skill of skills) {
		const { name, description, whenToUse, invocation } = skill;
		if (invocation?.modelInvocable !== true || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) continue;
		const named = new RegExp('(?:^|[^a-z0-9-])' + name + '(?=$|[^a-z0-9-])', 'iu');
		if (named.test(rewritten)) continue;
		if (new RegExp("(?:不(?:要|用|必|需要|使用|调用|启用)|(?:do not use|don't use|without)\\s+)\\s*[/`]?" + name + '(?=$|[^a-z0-9-])', 'iu').test(text)) continue;
		const summaries = [description, whenToUse].filter((value) => typeof value === 'string');
		let score = Object.hasOwn(formats, name) && formats[name].test(text + ' ' + files) ? (name === 'office' ? 1 : 4) : 0;
		if (name.includes('-') && named.test(text)) score = Math.max(score, 9);
		if (name === 'impeccable' && isProductInterfaceWork(text)) score = Math.max(score, 8);
		if (name === 'browser-skill' && isProductInterfaceWork(text) && /验证|测试|验收|\b(?:verify|test|validate)\b/iu.test(text)) score = Math.max(score, 2);
		if (name === 'browser-skill' && /(?:浏览器|browser).{0,20}(?:实测|验证|测试|test|verify)|(?:用|在|verify in|test in).{0,10}(?:浏览器|browser)/iu.test(text)) score = Math.max(score, 4);
		for (const summary of summaries) {
			const triggers = /(?:触发词|关键词|triggers?|keywords?)\s*[:：]\s*([^。；;\n]+)/iu.exec(summary)?.[1] ?? '';
			for (const item of triggers.normalize('NFKC').toLowerCase().split(/[、，,|]/u)) {
				const term = item.trim();
				if (/^[\p{Script=Han}]{2,12}$/u.test(term) && text.includes(term)) score = Math.max(score, 2 + Math.min(term.length, 5));
				else if (/^[a-z0-9][a-z0-9 /-]{2,30}$/u.test(term)
					&& new RegExp('(?:^|[^a-z0-9])' + term + '(?=$|[^a-z0-9])', 'u').test(text)) score = Math.max(score, 5);
			}
		}
		if (score) ranked.set(name, Math.max(score, ranked.get(name) ?? 0));
	}
	// 直接命中用途、格式或触发词归为大概率；辅助场景归为小概率。
	for (const [name, score] of [...ranked].sort((a, b) => b[1] - a[1])) {
		groups[score >= 4 ? 'likely' : 'possible'].push(name);
	}
	return groups;
}

export async function addDraftSkill(scope, sessionId, draft, fileNames, outcome, signal) {
	if (sessionId === undefined || !['enhanced', 'unchanged'].includes(outcome.kind)) return { outcome, skillAdvice: null };
	try {
		const agent = scope.get('agents')?.get(sessionId);
		const registry = scope.get('skills');
		if (!agent || !registry || !scope.get('tools')?.get('skill', agent)) return { outcome, skillAdvice: null };
		const cwd = scope.get('workingDirectory')?.get(agent.session) ?? agent.session.header.cwd;
		const catalog = await registry.snapshot({ scope: agent, cwd, signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]) });
		const { likely, possible } = selectDraftSkill(draft, fileNames, catalog.skills, outcome.text);
		return { outcome, skillAdvice: likely.length || possible.length ? { likely, possible } : null };
	} catch {
		// 技能发现失败时保留已完成的改写，并让前端明确没有推荐结果。
		return { outcome, skillAdvice: null };
	}
}

export const REWRITE_ONLY_DIRECTIVE = 'Rewrite the draft for the user to review before sending; do not start the task. Unless explicitly asked in the original draft, do not add a requirement or promise to report skill usage after completion, and do not invent skill names.';

export const MODE_ADVICE_DIRECTIVE = [
	'For this first message, assess the underlying task (not the act of rewriting) and its complete expected workflow. Emit one separate first line before the rewrite result, even when the result is UNCHANGED: MODE_ADVICE <id> | <one short task-specific reason in the draft language>.',
	'When the draft asks you to read handover documents, inspect a codebase, take over an existing project, continue unfinished work, or follow up on TODOs, treat it as project onboarding and sustained delivery: first understand the handover, then reconcile it with the actual workspace, map completed work, open tasks, dependencies and risks, plan multiple stages, execute incrementally, verify each stage, and leave a follow-up state. Do not judge only the first file read or Git check. Consider attachment count/size, repository size, TODO count, dependency chains, and whether later validation or follow-up is required.',
	'For a substantial handover or multi-stage project, do not default to standard and do not pre-exclude ops or ptc. Choose ptc when the work needs coordinated batches of inspection, implementation, testing, and follow-up; choose ops when the dominant first phase is large-scale local file or repository retrieval, filtering, or aggregation; choose creative for developing or customizing DSH itself; choose extreme only for intentionally testing an agent with minimal tools. Choose standard only after the project scope is demonstrably small and sequential.',
	'Keep constraints from the handover: avoid repeating completed work, use the actual workspace as authority when documents differ, and never commit, push, or add a remote repository unless explicitly authorized. Give a concrete brief reason (up to 120 characters) based on the evidence. Do not use standard as a catch-all for uncertainty. Keep the original rewrite status and text format after this line. Never put the recommendation inside the rewrite.',
].join(' ');

export function isProjectHandoverWork(text) {
	const value = text.normalize('NFKC');
	const handover = /交接|接手|续作|继续推进|承接|handover|take over|continue (?:the )?project|onboarding/iu.test(value);
	const scope = /项目|代码库|仓库|工作区|待办|依赖|里程碑|交付|验证|后续|文档|资料|project|codebase|repository|workspace|todo|dependency|milestone|follow-?up|validate/iu.test(value);
	return handover && scope;
}

export function strengthenHandoverAdvice(text, advice) {
	if (!isProjectHandoverWork(text) || (advice && advice.mode !== 'standard')) return advice;
	return { mode: 'ptc', reason: /\p{Script=Han}/u.test(text)
		? '交接需核对资料与工作区，分阶段推进、验证并跟进依赖，适合工具编排。'
		: 'The handover needs staged inspection, execution, validation, and dependency follow-up, so coordinated tool orchestration fits.' };
}

export function splitModeAdvice(raw) {
	const lines = raw.trimStart().split(/\r?\n/u);
	const header = (line) => line.trimStart().replace(/^(\*\*|__|\x60)(MODE_ADVICE)\1/iu, '$2');
	const tagged = /^MODE_ADVICE(?:\s|[:：]|$)/iu;
	if (!tagged.test(header(lines[0]))) return { text: raw };
	const result = /^MODE_ADVICE(?:[\t ]*[:：][\t ]*|[\t ]+)(standard|ptc|ops|extreme|creative)[\t ]*[|｜][\t ]*(.+)$/iu.exec(header(lines.shift()));
	const text = lines.filter((line) => !tagged.test(header(line))).join('\n');
	const reason = result?.[2].trim();
	if (!reason || reason.length > 120 || /[\p{Cc}\p{Cf}]/u.test(reason)) return { text };
	return { text, advice: { mode: result[1].toLowerCase(), reason } };
}
