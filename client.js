// Prompt Pilot v2 — browser half.
//
// A complete rewrite of the composer seat, the settings page and the keyboard
// binding layer. The seat enhances the draft in place with the session model,
// offers undo, and — on the first message of a conversation — shows mode and
// skill suggestions produced by the host. Nothing is ever sent automatically.

window.__ModuleLoader__.load({
  id: 'dsh-prompt-pilot',
  factory(require) {
    const react = require('react');
    const h = react.createElement;
    const { useCallback, useEffect, useRef, useState } = react;

    // ======================================================================
    // Icons
    // ======================================================================

    const Icon = ({ size = 16, children, ...rest }) =>
      h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        ...rest,
      }, children);

    /** The resting seat: a paper plane pointing up-right. */
    const PilotIcon = (props) => h(Icon, props,
      h('path', { d: 'M21 3 L10.6 13.4' }),
      h('path', { d: 'M21 3 L14.2 21 L10.6 13.4 L3 9.8 Z' }),
    );

    /** Undo: an arrow curling back left. */
    const UndoIcon = (props) => h(Icon, props,
      h('path', { d: 'M9 14 L4 9 L9 4' }),
      h('path', { d: 'M4 9 h9.5 a6.5 6.5 0 0 1 0 13 h-4' }),
    );

    /** Retry: a circular arrow, drawn clockwise. */
    const RetryIcon = (props) => h(Icon, props,
      h('path', { d: 'M20.5 12 a8.5 8.5 0 1 1 -2.6 -6.1' }),
      h('path', { d: 'M20.5 3.5 v4.6 h-4.6' }),
    );

    /** Copy: two offset rounded rectangles. */
    const CopyIcon = (props) => h(Icon, props,
      h('rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }),
      h('path', { d: 'M5 15 H4 a2 2 0 0 1 -2 -2 V4 a2 2 0 0 1 2 -2 h9 a2 2 0 0 1 2 2 v1' }),
    );

    // ======================================================================
    // Styles
    // ======================================================================

    // Palette rides the host's design tokens with muted fallbacks, so the seat
    // matches light and dark themes without shipping its own theme logic.
    const CSS = [
      '.dsh-pp_root{display:inline-flex;align-items:center;position:relative;margin-left:2px}',
      '.dsh-pp_button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-text-secondary,inherit);cursor:pointer;transition:background-color .15s ease,color .15s ease,transform .1s ease;padding:0}',
      '.dsh-pp_button:hover{background:var(--dsw-alias-fill-secondary,rgba(127,127,127,.14));color:var(--dsw-alias-text-primary,inherit)}',
      '.dsh-pp_button:active{transform:scale(.94)}',
      '.dsh-pp_button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4176e6);outline-offset:1px}',
      '.dsh-pp_button[data-busy="true"]{color:var(--dsw-alias-brand-primary,#4176e6)}',
      '.dsh-pp_button[data-state="undo"]{color:var(--dsw-alias-brand-primary,#4176e6)}',
      '.dsh-pp_button[data-state="error"]{color:var(--dsw-alias-status-danger,#d5484d)}',
      '.dsh-pp_button[data-context="true"]::after{content:"";position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-brand-primary,#4176e6);pointer-events:none}',
      '.dsh-pp_plane{display:block}',
      '.dsh-pp_plane.is-busy{animation:dsh-pp-fly 1.1s ease-in-out infinite}',
      '@keyframes dsh-pp-fly{0%{transform:translate(0,0) rotate(0deg)}25%{transform:translate(1.5px,-1.5px) rotate(6deg)}50%{transform:translate(0,-2.5px) rotate(0deg)}75%{transform:translate(-1.5px,-1.5px) rotate(-6deg)}100%{transform:translate(0,0) rotate(0deg)}}',
      '@media (prefers-reduced-motion:reduce){.dsh-pp_plane.is-busy{animation:none}}',
      '.dsh-pp_sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      '.dsh-pp_statusFrame{position:absolute;bottom:calc(100% + 8px);right:0;width:320px;max-width:78vw;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.25));background:var(--dsw-alias-background-secondary,rgba(24,26,31,.92));color:var(--dsw-alias-text-primary,inherit);box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:12px;line-height:1.55;display:flex;flex-direction:column;gap:6px;z-index:30;backdrop-filter:blur(10px)}',
      '.dsh-pp_statusFrame[data-tone="error"]{border-color:var(--dsw-alias-status-danger,#d5484d)}',
      '.dsh-pp_notice{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-pp_modeLine,.dsh-pp_skillLine{display:flex;align-items:baseline;gap:6px;min-width:0}',
      '.dsh-pp_modeName{font-weight:600;white-space:nowrap}',
      '.dsh-pp_modeReason,.dsh-pp_skillNames{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}',
      '.dsh-pp_skillCopy{margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-brand-primary,#4176e6);cursor:pointer;font-size:11px;padding:2px 4px;border-radius:6px;white-space:nowrap}',
      '.dsh-pp_skillCopy:hover{background:var(--dsw-alias-fill-secondary,rgba(127,127,127,.14))}',
      // Settings page
      '.dsh-pp-settings{display:flex;flex-direction:column;gap:18px;max-width:720px;font-size:13px}',
      '.dsh-pp-settingsHead{display:flex;align-items:center;gap:10px}',
      '.dsh-pp-settingsIntro{display:flex;align-items:center;gap:10px;margin:0;opacity:.9}',
      '.dsh-pp-star,.dsh-pp-feedbackLink,.dsh-pp-version{color:var(--dsw-alias-brand-primary,#4176e6);text-decoration:none}',
      '.dsh-pp-star:hover,.dsh-pp-feedbackLink:hover,.dsh-pp-version:hover{text-decoration:underline}',
      '.dsh-pp-version{margin-left:auto;opacity:.75;font-variant-numeric:tabular-nums}',
      '.dsh-pp-headSep{opacity:.4}',
      '.dsh-pp-settingsGroupHead{margin-top:4px}',
      '.dsh-pp-settingsGroupTitle{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.6;margin:0 0 2px}',
      '.dsh-pp-settingsRow{display:flex;flex-wrap:wrap;gap:8px 16px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.16));align-items:flex-start}',
      '.dsh-pp-settingsCopy{flex:1 1 260px;min-width:0}',
      '.dsh-pp-settingsTitle{font-weight:600}',
      '.dsh-pp-settingsHint{margin:4px 0 0;opacity:.65;line-height:1.5}',
      '.dsh-pp-settingsControl{flex:0 0 auto;display:flex;align-items:center;gap:8px}',
      '.dsh-pp-settingsExtra{flex-basis:100%}',
      '.dsh-pp-settingsError{color:var(--dsw-alias-status-danger,#d5484d);margin:6px 0 0}',
      '.dsh-pp-switch{position:relative;width:38px;height:22px;border-radius:11px;border:none;background:var(--dsw-alias-fill-secondary,rgba(127,127,127,.3));cursor:pointer;transition:background-color .15s ease;padding:0;flex:0 0 auto}',
      '.dsh-pp-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.2)}',
      '.dsh-pp-switch[data-on="true"]{background:var(--dsw-alias-brand-primary,#4176e6)}',
      '.dsh-pp-switch[data-on="true"]::after{transform:translateX(16px)}',
      '.dsh-pp-switch:disabled{opacity:.5;cursor:default}',
      '.dsh-pp-select{min-width:260px;max-width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.3));background:var(--dsw-alias-background-secondary,transparent);color:inherit;font:inherit}',
      '.dsh-pp-binding,.dsh-pp-reset{padding:6px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.3));background:transparent;color:inherit;font:inherit;cursor:pointer;font-variant-numeric:tabular-nums;min-width:120px}',
      '.dsh-pp-binding[data-recording="true"]{border-color:var(--dsw-alias-brand-primary,#4176e6);color:var(--dsw-alias-brand-primary,#4176e6)}',
      '.dsh-pp-binding:disabled,.dsh-pp-reset:disabled{opacity:.45;cursor:default}',
      '.dsh-pp-reset{min-width:0}',
      '.dsh-pp-shortcut{display:flex;gap:8px;align-items:center}',
      '.dsh-pp-rulesMore{flex-basis:100%}',
      '.dsh-pp-rulesMore summary{cursor:pointer;opacity:.75;padding:4px 0;user-select:none}',
      '.dsh-pp-ruleCard{border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.2));border-radius:10px;padding:10px 12px;margin-top:8px}',
      '.dsh-pp-ruleCard[data-current="true"]{border-color:var(--dsw-alias-brand-primary,#4176e6)}',
      '.dsh-pp-ruleCardHead{display:flex;align-items:center;gap:8px}',
      '.dsh-pp-ruleCardName{font-weight:600}',
      '.dsh-pp-ruleCardBadge{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-fill-secondary,rgba(127,127,127,.18));opacity:.8}',
      '.dsh-pp-ruleCardBadge.is-experimental{background:var(--dsw-alias-status-warning,rgba(216,150,16,.2))}',
      '.dsh-pp-ruleCardLine{margin:6px 0 0;opacity:.75;line-height:1.5}',
      '.dsh-pp-ruleCardFacts{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:8px 0 0;font-size:12px}',
      '.dsh-pp-ruleCardFacts dt{opacity:.55}',
      '.dsh-pp-ruleCardFacts dd{margin:0}',
      '.dsh-pp-changelog{border-top:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.16));padding-top:10px}',
      '.dsh-pp-changelogHead{display:flex;align-items:baseline;gap:10px}',
      '.dsh-pp-changelogTitle{font-weight:600}',
      '.dsh-pp-changelogCount{opacity:.6;font-size:12px}',
      '.dsh-pp-changelogList{display:flex;flex-direction:column}',
      '.dsh-pp-changelogEntry{display:flex;gap:10px;padding:6px 0}',
      '.dsh-pp-changelogDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-border-secondary,rgba(127,127,127,.4));margin-top:7px;flex:0 0 auto}',
      '.dsh-pp-changelogEntry[data-latest="true"] .dsh-pp-changelogDot{background:var(--dsw-alias-brand-primary,#4176e6)}',
      '.dsh-pp-changelogRow{flex:1;display:flex;align-items:center;gap:8px;border:none;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:2px 4px;border-radius:6px;text-align:left}',
      '.dsh-pp-changelogRow:hover{background:var(--dsw-alias-fill-secondary,rgba(127,127,127,.12))}',
      '.dsh-pp-changelogBadge{font-variant-numeric:tabular-nums;font-weight:600}',
      '.dsh-pp-changelogLatest{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-brand-primary,#4176e6);color:#fff}',
      '.dsh-pp-changelogMeta{opacity:.55;font-size:12px}',
      '.dsh-pp-changelogChevron{margin-left:auto;opacity:.5;transition:transform .15s ease}',
      '.dsh-pp-changelogChevron::after{content:"\\203A";font-size:16px;line-height:1;display:inline-block;transform:rotate(90deg)}',
      '.dsh-pp-changelogEntry[data-open="true"] .dsh-pp-changelogChevron::after{transform:rotate(-90deg)}',
      '.dsh-pp-changelogItems{margin:6px 0 0;padding-left:20px;opacity:.85;line-height:1.6}',
      '.dsh-pp-changelogFootRow{padding-top:8px}',
      '.dsh-pp-changelogFoot{color:var(--dsw-alias-brand-primary,#4176e6);text-decoration:none;font-size:12px}',
      '.dsh-pp-changelogFoot:hover{text-decoration:underline}',
      '@media (max-width:560px){.dsh-pp_statusFrame{width:240px}.dsh-pp-settingsRow{flex-direction:column;align-items:stretch}}',
    ].join('\n');

    const installStyles = () => {
      const tag = document.createElement('style');
      tag.dataset.promptPilot = '1';
      tag.textContent = CSS;
      document.head.append(tag);
      return () => tag.remove();
    };


    // ======================================================================
    // Locale
    // ======================================================================

    const NS = 'prompt-pilot';

    const ZH_DICT = {
      'label.idle': '把草稿改写得更清楚，保留你的原始要求',
      'label.busy': '正在用当前模型增强提示词，点击可停止',
      'label.undo': '回退到增强前的提示词',
      'label.contextAware': '{base}（已参考本会话上下文）',
      'shortcut.run': '增强提示词',
      'state.refused': '输入框没有接受替换，草稿保持不变。',
      'state.deferred': '消息正在发送，改写结果已保留，输入框空闲后自动写入。',
      'state.failed': '增强失败，草稿保持不变。',
      'state.failedWith': '增强失败：{reason}。点击可重试。',
      'state.cancelled': '已停止增强，草稿保持不变。',
      'state.stale': '增强已完成，但草稿在你离开期间被改动，结果未写入。',
      'state.transport': '增强接口不可用（HTTP {status}），请确认插件已启用。',
      'state.imagesSkipped': '有 {count} 张图片未能读取，本次增强未参考它们。',
      'state.evidenceSkipped': '有 {count} 个附件未能读取，本次增强未参考它们。',
      'state.noRewrite': '这次没有改写',
      'state.unchanged': '原稿已足够清晰，仅做了必要保留。',
      'nav': '提示词领航',
      'mode.standard': '建议：标准模式',
      'mode.ptc': '建议：PTC 模式',
      'mode.ops': '建议：OPS (PTC) 模式',
      'mode.extreme': '建议：极简模式',
      'mode.creative': '建议：创造模式',
      'mode.confirm': '发送前请确认对话模式',
      'skill.likely': '很可能用到',
      'skill.possible': '可能用到',
      'skill.copy': '复制技能名',
      'skill.copied': '已复制',
      'skill.copyFailed': '复制失败',
      'settings.shortcut.conflict': '与「{commands}」冲突，未生效。',
      'settings.shortcut.rejected': '快捷键不可用：{reason}',
      'settings.shortcut.unavailable': '当前环境不支持自定义快捷键。',
      "prefs.title": "改写偏好",
      "prefs.intro": "决定草稿如何改写，以及模型可以参考哪些内容。",
      "prefs.feedback": "反馈问题",
      "prefs.loading": "正在读取偏好设置…",
      "prefs.retry": "重试",
      "prefs.saving": "正在保存…",
      "prefs.saved": "更改已保存",
      "prefs.failure": "未保存，仍使用之前的设置。",
      "prefs.loadError": "暂时无法读取设置。",
      "prefs.strategy": "改写方式",
      "prefs.legacy": "忠实润色",
      "prefs.intent-first": "展开意图",
      "prefs.workbuddy": "精简规格",
      "prefs.legacyHint": "保留原意和具体信息，只补充执行所需的条件。",
      "prefs.intent-firstHint": "展开目标、输入和验收要求，适合简短草稿。",
      "prefs.workbuddyHint": "聚焦交付内容和约束，适合开发需求。",
      "prefs.model": "改写模型",
      "prefs.fixed": "固定模型",
      "prefs.follow": "跟随当前会话",
      "prefs.catalog": "暂时无法读取模型列表。",
      "prefs.context": "参考会话文字",
      "prefs.contextHint": "仅参考此前的文字，不读取历史图片。",
      "prefs.images": "参考草稿图片",
      "prefs.imagesHint": "开启后，本次附上的图片会交给模型。",
      "prefs.files": "读取附件内容",
      "prefs.filesHint": "最多 2 个文件，每个不超过 5 MiB；文本最多 6000 字符。关闭后只参考文件名。",
      "prefs.privacy": "参考范围",
      "prefs.shortcut": "键盘操作",
      "prefs.enabled": "使用快捷键",
      "prefs.record": "录制组合键",
      "prefs.escape": "按组合键，或按 Esc 取消",
      "prefs.reset": "还原默认组合键",
      "prefs.notes": "版本记录",
      "prefs.project": "项目主页",
    };

    const EN_DICT = {
      'label.idle': 'Make the draft clearer while preserving your requirements',
      'label.busy': 'Enhancing the draft with the current model; click to stop',
      'label.undo': 'Restore the prompt from before enhancement',
      'label.contextAware': '{base} (used this session context)',
      'shortcut.run': 'Enhance prompt',
      'state.refused': 'The composer refused the replacement; the draft is unchanged.',
      'state.deferred': 'A message is in flight; the rewrite is kept and lands once the composer is idle.',
      'state.failed': 'Enhancement failed; the draft is unchanged.',
      'state.failedWith': 'Enhancement failed: {reason}. Click to retry.',
      'state.cancelled': 'Enhancement stopped; the draft is unchanged.',
      'state.stale': 'The rewrite finished, but the draft changed while you were away, so it was not applied.',
      'state.transport': 'The enhancement endpoint is unavailable (HTTP {status}); check that the plugin is enabled.',
      'state.imagesSkipped': '{count} image(s) could not be read; this enhancement did not use them.',
      'state.evidenceSkipped': '{count} attachment(s) could not be read; this enhancement did not use them.',
      'state.noRewrite': 'Nothing was rewritten this time.',
      'state.unchanged': 'Your draft was already clear and was kept essentially unchanged.',
      'nav': 'Prompt Pilot',
      'mode.standard': 'Suggested: Standard',
      'mode.ptc': 'Suggested: PTC',
      'mode.ops': 'Suggested: OPS (PTC)',
      'mode.extreme': 'Suggested: Extreme',
      'mode.creative': 'Suggested: Creative',
      'mode.confirm': 'Check the conversation mode before sending',
      'skill.likely': 'Likely needed',
      'skill.possible': 'Possibly needed',
      'skill.copy': 'Copy skill names',
      'skill.copied': 'Copied',
      'skill.copyFailed': 'Copy failed',
      'settings.shortcut.conflict': 'Conflicts with "{commands}", not applied.',
      'settings.shortcut.rejected': 'Shortcut unavailable: {reason}',
      'settings.shortcut.unavailable': 'This environment does not support custom shortcuts.',
      "prefs.title": "Rewrite preferences",
      "prefs.intro": "Choose how drafts are edited and what the model may read.",
      "prefs.feedback": "Report an issue",
      "prefs.loading": "Reading preferences…",
      "prefs.retry": "Retry",
      "prefs.saving": "Saving…",
      "prefs.saved": "Changes saved",
      "prefs.failure": "Not saved. Your previous setting is still in use.",
      "prefs.loadError": "Preferences could not be loaded.",
      "prefs.strategy": "Rewrite style",
      "prefs.legacy": "Faithful edit",
      "prefs.intent-first": "Develop the brief",
      "prefs.workbuddy": "Compact specification",
      "prefs.legacyHint": "Preserve the original facts and clarify what is needed to act.",
      "prefs.intent-firstHint": "Expand a short draft into a brief with inputs and acceptance criteria.",
      "prefs.workbuddyHint": "Focus a development request on the deliverable and its constraints.",
      "prefs.model": "Rewrite model",
      "prefs.fixed": "Use a specific model",
      "prefs.follow": "Follow this conversation",
      "prefs.catalog": "The model list is unavailable.",
      "prefs.context": "Include earlier messages",
      "prefs.contextHint": "Use earlier text from this conversation, not historical images.",
      "prefs.images": "Include draft images",
      "prefs.imagesHint": "Allow the model to read images attached to this draft.",
      "prefs.files": "Read attached files",
      "prefs.filesHint": "Up to two files of 5 MiB each; text previews stop at 6,000 characters. When off, only names are used.",
      "prefs.privacy": "Sources",
      "prefs.shortcut": "Keyboard controls",
      "prefs.enabled": "Enable shortcut",
      "prefs.record": "Record binding",
      "prefs.escape": "Press a combination, or Esc to cancel",
      "prefs.reset": "Restore default binding",
      "prefs.notes": "Release notes",
      "prefs.project": "Project home",
    };


    // ======================================================================
    // Draft coordinate math
    // ======================================================================

    // A draft-reference chip renders one invisible placeholder character in the
    // text the editor reports, while its clipboard label is longer. The chip
    // "occupies" the placeholder (1 character) in detect-coordinates but its
    // label length in clipboard-coordinates; the shift below converts between
    // them. U+E100-U+E11D are private-use characters the composer uses as
    // placeholders; U+FFFC is the object-replacement character.
    const REFERENCE_PLACEHOLDER_RE = /[\uE100-\uE11D\uFFFC]/u;

    /** Shorten an attachment name the way the chip label does. */
    const shortenAttachmentLabel = (name) => {
      let value = String(name).trim();
      if (value.startsWith('@')) value = value.slice(1);
      try {
        if (/^https?:\/\//iu.test(value)) {
          const url = new URL(value);
          value = url.host + (url.pathname.length > 1 ? url.pathname : '');
        }
      } catch {
        // Not a URL; keep the raw text.
      }
      const parts = value.split(/[\\\\/]/u).filter(Boolean);
      if (parts.length > 1) value = parts[parts.length - 1];
      return value.length > 120 ? value.slice(0, 117) + '…' : value;
    };

    /**
     * Walk the draft and describe every reference chip it contains.
     *
     * Chips come from the composer itself: useInput reports occurrences for the
     * attachments currently in the draft, each with the editor span and the
     * label the user sees. When the face is unavailable the placeholder scan
     * still finds the chips — only their friendly labels degrade.
     * @returns sorted entries: {start, end, label, chip, number}.
     */
    const chipEntries = (draft, occurrences) => {
      const entries = [];
      const reported = Array.isArray(occurrences) ? occurrences : [];
      for (const item of reported) {
        const start = item?.offset ?? item?.start;
        const clipboard = item?.clipboardText;
        const size = clipboard?.length || item?.length || (item?.end - start);
        const end = start + size;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size <= 0 || end > draft.length || (clipboard && draft.slice(start, end) !== clipboard)) throw new Error('Attachment position no longer matches the draft');
        entries.push({ start, end, label: shortenAttachmentLabel(draft.slice(start, end)), chip: true });
      }
      if (entries.length === 0) {
        const walker = /[\uE100-\uE11D\uFFFC]/gu;
        for (const match of String(draft).matchAll(walker)) {
          entries.push({ start: match.index, end: match.index + 1, label: '', chip: true });
        }
      }
      entries.sort((left, right) => left.start - right.start);
      entries.forEach((entry, index) => {
        entry.number = index + 1;
        if (entry.label.length === 0) entry.label = '附件 ' + entry.number;
      });
      return entries;
    };

    /** The text the model should see: chips replaced by [附件N: 短名] markers. */
    const draftForModel = (draft, occurrences) => {
      const entries = chipEntries(draft, occurrences).filter((entry) => entry.chip);
      if (entries.length === 0) return draft;
      let out = '';
      let cursor = 0;
      for (const entry of entries) {
        out += draft.slice(cursor, entry.start) + '[附件' + entry.number + ': ' + entry.label + ']';
        cursor = entry.end;
      }
      return out + draft.slice(cursor);
    };

    /** Remove chip placeholders from a draft (used when storing the pre-rewrite text). */
    const stripChipLabels = (draft) => {
      if (!REFERENCE_PLACEHOLDER_RE.test(draft)) return draft;
      return draft.replace(/[\uE100-\uE11D\uFFFC]/gu, '');
    };

    // A disk path typed with a plausible extension — the model is told never to
    // write these, and the sanitizer shortens leftovers the model may produce.
    const ATTACHMENT_PATH_RE = /(?:[A-Za-z]:[\\\\/][^\s"'\x60<>|]{1,300}?\.(?:txt|md|markdown|json|jsonc|ya?ml|toml|ini|cfg|csv|tsv|log|xml|html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bat|ps1|sql|pdf|docx?|xlsx?|pptx?|zip|7z|rar|gz|tgz))(?=$|[\s.,;:!?)\]}】」』"'\x60])/u;

    /**
     * Clean model output before it enters the composer: strip reference
     * placeholder noise and shorten invented disk paths. A reference the user
     * typed themselves (an @-mention in the original draft) is preserved
     * verbatim; anything else gets the shortened leaf name.
     */
    const sanitizeForInsert = (text, typedDraft) => {
      let out = String(text).replace(/\uFFFC/gu, '').replace(/[\uE100-\uE11D]/gu, '');
      const typedRefs = new Set();
      const typedWalker = /[@＠]([^\s@，。；、"'\x60（）()【】\[\]<>]{1,240})/gu;
      for (const match of String(typedDraft ?? '').matchAll(typedWalker)) typedRefs.add(match[1]);
      out = out.replace(/[@＠]([^\s@，。；、"'\x60（）()【】\[\]<>]{1,240})/gu, (whole, name) => {
        if (typedRefs.has(name)) return whole;
        return '@' + shortenAttachmentLabel(name);
      });
      out = out.replace(ATTACHMENT_PATH_RE, (whole) => {
        const leaf = whole.split(/[\\\\/]/u).filter(Boolean).pop() ?? whole;
        if (typedRefs.has(leaf) || typedRefs.has(whole)) return whole;
        return leaf;
      });
      return out;
    };

    /**
     * Plan a segmented draft replacement around chips.
     *
     * Chips make detect- and clipboard-coordinates disagree, so the text cannot
     * be written as one span. The plan writes each gap between chips as its own
     * segment: segments are written from the end backwards (so earlier offsets
     * stay valid), the last segment carries the cleaned rewrite and the others
     * are emptied.
     */
    const planDraftReplacement = (cleanText, before, occurrences) => {
      const chips = chipEntries(before, occurrences);
      if (!chips.length) return { whole: true, text: cleanText };
      let clipboard = 0, detect = 0;
      const segments = [];
      for (const chip of chips) {
        const gap = chip.start - clipboard;
        if (gap < 0) throw new Error('Overlapping attachment positions');
        if (gap) segments.push({ start: detect, end: detect + gap, text: '' });
        detect += gap + 1;
        clipboard = chip.end;
      }
      const tail = before.length - clipboard;
      if (tail || !segments.length) segments.push({ start: detect, end: detect + tail, text: '' });
      segments.at(-1).text = cleanText;
      return { whole: false, segments };
    };

    // ======================================================================
    // Composer reading (images and files)
    // ======================================================================

    const bytesToBase64 = (bytes) => {
      let binary = '';
      const chunk = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
      }
      return btoa(binary);
    };

    /** Ask the conversation (or input actions) for descriptor lists of the draft attachments. */
    const resolveDraftDescriptors = async (conversation, actions, ids) => {
      for (const owner of [conversation, actions]) {
        try {
          const entries = await owner?.resolveDraftAttachments?.(ids);
          if (Array.isArray(entries)) return entries;
        } catch { /* Some shells expose only the action face. */ }
      }
      return [];
    };

    const readComposerPolicy = async () => {
      try {
        const response = await fetch('/api/prompt-pilot/settings?scope=composer', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) return null;
        const body = await response.json();
        return body?.ok === true ? body : null;
      } catch {
        return null;
      }
    };

    const limitOr = (value, fallback) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
    const readBoundedComposerBytes = async (file, cap) => {
      if (!file || cap <= 0 || file.size > cap) throw Error('Attachment exceeds limit');
      const part = typeof file.slice === 'function' ? file.slice(0, cap + 1) : file;
      if (part === file && !Number.isSafeInteger(file.size)) throw Error('Unknown attachment size');
      const bytes = new Uint8Array(await part.arrayBuffer());
      if (bytes.length > cap) throw Error('Attachment exceeds limit');
      return bytes;
    };
    const readComposerImages = async (conversation, actions, ids, limits) => {
      const images = [];
      let skipped = 0;
      if (limits.referenceImages !== true) return { images, skipped };
      let remaining = limitOr(limits.maxMessageImageBytes, 10000000);
      for (const entry of await resolveDraftDescriptors(conversation, actions, ids)) {
        if (entry?.kind !== 'image') continue;
        const file = entry.file;
        try {
          if (images.length >= limitOr(limits.maxImagesPerMessage, 4) || !file?.type?.startsWith('image/')) throw Error('Image not admitted');
          const bytes = await readBoundedComposerBytes(file, Math.min(remaining, limitOr(limits.maxImageBytes, 5000000)));
          remaining -= bytes.length;
          images.push({ name: safeComposerFileName(file.name), mediaType: file.type, data: bytesToBase64(bytes) });
        } catch { skipped++; }
      }
      return { images, skipped };
    };

    const decodeComposerText = (bytes) => {
      if (bytes.length >= 2) {
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
        if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        try { return new TextDecoder('gbk').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
      }
    };

    const makeComposerTextPreview = (text, limit) => text.slice(0, limitOr(limit, 6000));
    const safeComposerFileName = (name) => {
      const leaf = String(name ?? '').replaceAll(String.fromCharCode(92), '/').split('/').pop();
      return Array.from(leaf).filter(c => c.codePointAt(0) >= 32 && c.codePointAt(0) !== 127).join('').trim().slice(0, 120) || 'attachment';
    };

    const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'csv', 'tsv', 'log', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bat', 'ps1', 'sql']);

    const isTextualComposerFile = (descriptor) => {
      const media = String(descriptor?.mediaType ?? '').toLowerCase();
      if (media.startsWith('text/')) return true;
      if (/(?:json|xml|yaml|javascript|typescript|x-sh|x-python|sql)/iu.test(media)) return true;
      const leaf = safeComposerFileName(descriptor?.name);
      const dot = leaf.lastIndexOf('.');
      const extension = dot >= 0 ? leaf.slice(dot + 1).toLowerCase() : '';
      return TEXT_EXTENSIONS.has(extension);
    };

    const readComposerFiles = async (conversation, actions, ids, policy) => {
      const limits = policy?.fileLimits ?? {};
      const files = [], names = [];
      let skipped = 0;
      for (const entry of await resolveDraftDescriptors(conversation, actions, ids)) {
        if (entry?.kind === 'image') continue;
        const file = entry?.file;
        if (!file) { skipped++; continue; }
        const name = safeComposerFileName(file.name);
        const namesOnly = policy?.values?.referenceFiles !== true;
        if (names.length < limitOr(limits.maxFileNames, 8)) names.push(name);
        else if (namesOnly) skipped++;
        if (namesOnly) continue;
        if (files.length >= limitOr(limits.maxFilesPerMessage, 2)) { skipped++; continue; }
        try {
          const bytes = await readBoundedComposerBytes(file, limitOr(limits.maxFileBytes, 5242880));
          const mediaType = file.type || 'application/octet-stream';
          const descriptor = { name, mediaType };
          if (isTextualComposerFile(descriptor)) descriptor.textPreview = makeComposerTextPreview(decodeComposerText(bytes), limits.textPreviewChars);
          else descriptor.data = bytesToBase64(bytes);
          files.push(descriptor);
        } catch { skipped++; }
      }
      return { files, names, skipped };
    };


    // ======================================================================
    // Task store
    // ======================================================================

    // Per-session enhancement state. The composer seat reads this to decide what
    // its single button should do right now (enhance, stop, or undo), and the
    // keyboard command reaches the same trigger through activeTrigger.
    const taskStore = (() => {
      const tasks = new Map();
      const listeners = new Set();
      let version = 0;
      let activeSessionId = null;
      let lastHostFire = 0;
      let shortcutAllowed = false;

      const emit = () => {
        version += 1;
        for (const listener of listeners) {
          try { listener(); } catch { /* a broken subscriber must not break the rest */ }
        }
      };

      const ensure = (sessionId) => {
        let task = tasks.get(sessionId);
        if (task === undefined) {
          task = { phase: 'idle', failure: null, announce: null, notice: null, contextAware: false, restore: null, controller: null, origin: '', originRev: 0, applyResult: null, result: null, trigger: undefined };
          tasks.set(sessionId, task);
        }
        return task;
      };

      const patch = (sessionId, changes) => {
        const task = ensure(sessionId);
        Object.assign(task, changes);
        emit();
      };

      const clear = (sessionId) => {
        tasks.delete(sessionId);
        emit();
      };

      return {
        ensure,
        patch,
        clear,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getVersion: () => version,
        isActive: (id) => id != null && id === activeSessionId,
        activeTrigger: () => (activeSessionId === null ? undefined : ensure(activeSessionId).trigger),
        setActiveSession: (sessionId) => {
          activeSessionId = sessionId;
        },
        setShortcutAllowed: (value) => {
          shortcutAllowed = value === true;
        },
        shortcutAllowed: () => shortcutAllowed,
        markHostFire: () => {
          lastHostFire = Date.now();
        },
        hostFiredRecently: () => Date.now() - lastHostFire < 400,
      };
    })();

    // Module-level services, resolved in apply() and read lazily by components.
    let sessionService;
    let conversationResolver = () => undefined;

    const resolveConversation = (ctx) => {
      try {
        return ctx.get('conversation') ?? ctx.conversation;
      } catch {
        return undefined;
      }
    };

    // ======================================================================
    // Keyboard combination helpers
    // ======================================================================

    const DEFAULT_SHORTCUT = { code: 'KeyE', modifiers: ['primary', 'alt'] };

    /** A lone modifier press is never a binding. */
    const BARE_MODIFIERS = /^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$/u;

    /** Turn a KeyboardEvent into the host binding shape: {code, modifiers}. */
    const comboFromEvent = (event) => {
      const modifiers = [];
      if (event.ctrlKey || event.metaKey) modifiers.push('primary');
      if (event.altKey) modifiers.push('alt');
      if (event.shiftKey) modifiers.push('shift');
      const code = typeof event.code === 'string' && event.code.length > 0
        ? event.code
        : (/^[a-zA-Z]$/u.test(event.key ?? '') ? 'Key' + event.key.toUpperCase()
          : (/^[0-9]$/u.test(event.key ?? '') ? 'Digit' + event.key : ''));
      return { code, modifiers };
    };

    /** The host accepts chords with at least one modifier, or plain F-keys. */
    const isBindable = (binding) => {
      if (typeof binding?.code !== 'string' || binding.code.length === 0) return false;
      if (BARE_MODIFIERS.test(binding.code)) return false;
      if (/^F(?:[1-9]|1[0-2])$/u.test(binding.code)) return true;
      return binding.modifiers.length >= 1;
    };

    /** Human-readable chord, matching the host display conventions. */
    const formatCombo = (binding) => {
      if (typeof binding?.code !== 'string') return '';
      const isMac = typeof navigator === 'object' && /Mac/iu.test(navigator.platform ?? '');
      const order = ['primary', 'alt', 'shift'];
      const glyphs = isMac
        ? { primary: '⌃', alt: '⌥', shift: '⇧' }
        : { primary: 'Ctrl', alt: 'Alt', shift: 'Shift' };
      const parts = order.filter((key) => binding.modifiers.includes(key)).map((key) => glyphs[key]);
      let key = binding.code;
      if (key.startsWith('Key')) key = key.slice(3);
      else if (key.startsWith('Digit')) key = key.slice(5);
      return parts.concat([key]).join(isMac ? '' : '+');
    };

    /** Ctrl and Meta are interchangeable on the host; compare sets, not order. */
    const matchesCombo = (left, right) => {
      if (left?.code !== right?.code) return false;
      const norm = (list) => [...new Set(list ?? [])].map((item) => (item === 'meta' ? 'primary' : item)).sort().join(',');
      return norm(left?.modifiers) === norm(right?.modifiers);
    };


    // ======================================================================
    // Status widgets
    // ======================================================================

    /** One line of mode advice: the mode name plus a short reason. */
    const ModeStatus = ({ mode, reason, t }) =>
      h('div', { className: 'dsh-pp_modeLine' },
        h('span', { className: 'dsh-pp_modeName' }, t('mode.' + mode, { defaultValue: t('mode.confirm') })),
        typeof reason === 'string' && reason.length > 0 ? h('span', { className: 'dsh-pp_modeReason', title: reason }, reason) : null,
      );

    /** One tier of skill names; renders nothing when the tier is empty. */
    const SkillTier = ({ label, names }) => {
      if (!Array.isArray(names) || names.length === 0) return null;
      return h('div', { className: 'dsh-pp_skillLine' },
        h('span', { className: 'dsh-pp_skillTier' }, label),
        h('span', { className: 'dsh-pp_skillNames' }, names.join('、')),
      );
    };

    /** Skill suggestions in two tiers with a one-click copy of the names. */
    const SkillStatus = ({ skillAdvice, t }) => {
      const [copyState, setCopyState] = useState('idle');
      const copy = async () => {
        const names = [...(skillAdvice.likely ?? []), ...(skillAdvice.possible ?? [])];
        if (names.length === 0) return;
        try {
          await navigator.clipboard.writeText(names.join(' '));
          setCopyState('copied');
        } catch {
          setCopyState('error');
        }
        setTimeout(() => setCopyState('idle'), 1500);
      };
      return h('div', { className: 'dsh-pp_skillBox' },
        h(SkillTier, { label: t('skill.likely'), names: skillAdvice.likely ?? [] }),
        h(SkillTier, { label: t('skill.possible'), names: skillAdvice.possible ?? [] }),
        h('button', { type: 'button', className: 'dsh-pp_skillCopy', onClick: copy, title: t('skill.copy') },
          copyState === 'copied' ? t('skill.copied') : copyState === 'error' ? t('skill.copyFailed') : h(CopyIcon, { size: 12 }),
        ),
      );
    };

    // ======================================================================
    // The composer seat
    // ======================================================================

    /**
     * EnhanceControl — the one component mounted into the composer.
     *
     * Everything it shows lives inside one button plus one floating frame: the
     * button enhances (or stops, or undoes), the frame carries mode advice,
     * skill suggestions and the last failure. The control appears only when
     * there is something to act on.
     */
    function EnhanceControl({ sessionId, useInput, inputActions, t, useSession }) {
      const firstDraft = useSession((state) => state?.blank === true && state?.promptAttempted !== true && state?.running !== true && state?.subagent !== true);
      const input = useInput((state) => state);
      const draft = typeof input?.draft === 'string' ? input.draft : '';
      const draftRev = typeof input?.draftRev === 'number' ? input.draftRev : 0;
      const phase = typeof input?.phase === 'string' ? input.phase : 'plain';
      const attachmentIds = Array.isArray(input?.attachmentIds) ? input.attachmentIds : [];
      const occurrences = Array.isArray(input?.occurrences) ? input.occurrences : [];

      const [, bump] = useState(0);
      useEffect(() => taskStore.subscribe(() => bump((value) => value + 1)), []);
      const task = taskStore.ensure(sessionId);
      const busy = task.phase === 'running';
      const failure = task.failure;
      const notice = task.notice;
      const announce = task.announce;
      const restore = task.restore;
      const contextAware = task.contextAware === true;

      // Composer policy and context status are polled as a pair: both come from
      // the host, both only matter between runs, and one fetch each keeps the
      // seat quiet.
      const [policy, setPolicy] = useState(null);
      const [willUseContext, setWillUseContext] = useState(false);
      const [shortcutOn, setShortcutOn] = useState(false);

      useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        (async () => {
          try {
            const [policyResponse, contextResponse] = await Promise.all([
              fetch('/api/prompt-pilot/settings?scope=composer', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }),
              fetch('/api/prompt-pilot/context-status?sessionId=' + encodeURIComponent(sessionId ?? ''), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }),
            ]);
            if (!alive) return;
            if (policyResponse.ok) {
              const body = await policyResponse.json();
              if (alive && body?.ok === true) {
                setPolicy(body);
                setWillUseContext(body.values?.referenceContext !== false);
                setShortcutOn(body.values?.shortcutEnabled === true);
                taskStore.setShortcutAllowed(body.values?.shortcutEnabled === true);
              }
            }
            if (contextResponse.ok) {
              const body = await contextResponse.json();
              if (alive && body?.ok === true && body.hasContext === true) setWillUseContext((previous) => previous && true);
            }
          } catch {
            // An unreadable policy costs only the context dot; the seat stays.
          }
        })();
        return () => {
          alive = false;
          controller.abort();
        };
      }, [sessionId, task.phase]);

      const latestRev = useRef(draftRev);
      const latestDraft = useRef(draft);
      latestRev.current = draftRev;
      latestDraft.current = draft;
      const occurrencesRef = useRef(occurrences);
      occurrencesRef.current = occurrences;
      const phaseRef = useRef(phase);
      phaseRef.current = phase;

      // A new mount can have a different local revision for the same draft.
      const mount = useRef({});
      useEffect(() => {
        taskStore.setActiveSession(sessionId);
        return () => { if (taskStore.isActive(sessionId)) taskStore.setActiveSession(null); };
      }, [sessionId]);

      const replaceDraft = (text, before, beforeRev, inverse) => {
        if (!taskStore.isActive(sessionId) || phaseRef.current !== 'plain' || latestDraft.current !== before || latestRev.current !== beforeRev) return { ok: false };
        try {
          const revision = () => inputActions?.captureInsertion?.()?.draftRev;
          const initial = revision();
          if (Number.isFinite(initial) && initial !== beforeRev) return { ok: false };
          const chips = chipEntries(before, occurrencesRef.current);
          const clean = inverse ? text : sanitizeForInsert(text, before);
          const plan = planDraftReplacement(clean, before, occurrencesRef.current);
          // Save every gap (even empty ones). Undo restores each gap without
          // inserting chip labels as text or moving an attachment.
          let cursor = 0, detect = 0;
          const gaps = [], labels = [], segments = [];
          for (let i = 0; i <= chips.length; i++) {
            const chip = chips[i];
            const end = chip?.start ?? before.length;
            const gap = before.slice(cursor, end);
            gaps.push(gap);
            segments.push({ start: detect, end: detect + gap.length });
            if (chip) { labels.push(before.slice(chip.start, chip.end)); cursor = chip.end; detect += gap.length + 1; }
          }
          const target = inverse ? inverse.gaps : segments.map(s => plan.whole ? clean : (plan.segments.find(p => p.start === s.start && p.end === s.end)?.text ?? ''));
          if (inverse && (JSON.stringify(labels) !== JSON.stringify(inverse.labels) || target.length !== gaps.length)) return { ok: false };
          const produced = target.map((s,i) => s + (labels[i] ?? '')).join('');
          if (plan.whole && typeof inputActions?.setDraft === 'function') {
            if (inputActions.setDraft(produced) === false) return { ok: false };
          } else {
            const edits = segments.map((s,i) => ({...s, text:target[i], old:gaps[i]})).filter(s => s.text !== s.old);
            if (typeof inputActions?.insertText !== 'function' || (edits.length > 1 && !Number.isFinite(initial))) return { ok:false };
            for (const s of edits.reverse()) {
              if (inputActions.insertText(s.text, { start:s.start, end:s.end, draftRev:revision() ?? beforeRev }) !== true) return { ok:false };
            }
          }
          return { ok:true, produced, gaps, labels, rev:revision() };
        } catch { return { ok:false }; }
      };

      const undo = () => {
        if (!restore || restore.pending || !restore.inverse || restore.produced !== latestDraft.current || restore.adviceRev !== latestRev.current) return;
        const done = replaceDraft(restore.text, restore.produced, restore.adviceRev, restore.inverse);
        taskStore.patch(sessionId, { restore:null, notice:null, failure:done.ok ? null : t('state.refused') });
      };

      /** Run one enhancement against the host route. */
      const run = async () => {
        if (busy) {
          task.controller?.abort();
          return;
        }
        const before = latestDraft.current;
        if (before.trim().length === 0) {
          taskStore.patch(sessionId, { notice: null, announce: null, failure: null });
          return;
        }
        const originRev = latestRev.current; const originOccurrences = occurrencesRef.current.slice();
        const controller = new AbortController();
        taskStore.patch(sessionId, { phase: 'running', failure: null, notice: null, announce: null, origin: before, originRev, controller });
        (async () => {
          try {
            const conversation = conversationResolver();
            const live = attachmentIds?.length ? await readComposerPolicy() : null;
            controller.signal.throwIfAborted();
            const [imageResult, fileResult] = await Promise.all([
              readComposerImages(conversation, inputActions, attachmentIds, { ...live?.imageLimits, referenceImages: live?.values?.referenceImages === true }),
              readComposerFiles(conversation, inputActions, attachmentIds, live),
            ]);
            controller.signal.throwIfAborted();
            const payload = {
              sessionId,
              draft: draftForModel(before, originOccurrences),
              wantModeAdvice: firstDraft === true,
              images: imageResult.images,
              files: fileResult.files,
              fileNames: fileResult.names,
              clientFilesSkipped: fileResult.skipped,
              clientImagesSkipped: imageResult.skipped,
            };
            const response = await fetch('/api/prompt-pilot', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(t('state.transport', { status: response.status }));
            const body = await response.json();
            if (controller.signal.aborted || taskStore.ensure(sessionId).controller !== controller) return; if (body?.ok !== true) throw new Error(body?.message ?? t('state.failed'));
            const text = typeof body.text === 'string' ? body.text : '';
            let modeAdvice = null;
            if (body.modeAdvice !== undefined && body.modeAdvice !== null) {
              const advice = body.modeAdvice;
              if (advice && typeof advice.mode === 'string' && /^(?:standard|ptc|ops|extreme|creative)$/iu.test(advice.mode) && typeof advice.reason === 'string' && advice.reason.length > 0) {
                modeAdvice = advice;
              } else if (firstDraft === true) {
                modeAdvice = { mode: null };
              }
            }
            let skillAdvice = null;
            if (body.skillAdvice && typeof body.skillAdvice === 'object') {
              const valid = (list) => Array.isArray(list) && list.every((name) => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/iu.test(name));
              if (valid(body.skillAdvice.likely) && valid(body.skillAdvice.possible)) skillAdvice = body.skillAdvice;
            }
            if (text.length === 0) {
              taskStore.patch(sessionId, { restore: null, notice: t('state.noRewrite'), announce: null });
              return;
            }
            // Completion only publishes to its session. Never retain or call the
            // inputActions of the composer that happened to start the request.
            taskStore.patch(sessionId, { result:{ text, origin:before, originRev, mount:mount.current,
              projection:draftForModel(before, originOccurrences), attachments:JSON.stringify(attachmentIds),
              unchanged:body.kind === 'unchanged' && (text === before || text === draftForModel(before, originOccurrences)),
              modeAdvice, skillAdvice }, contextAware:body.mode === 'context', restore:null });
          } catch (error) {
            if (controller.signal.aborted) {
              taskStore.patch(sessionId, { announce: t('state.cancelled'), failure: null });
              return;
            }
            taskStore.patch(sessionId, { failure: error instanceof Error ? error.message : String(error) });
          } finally {
            const current = taskStore.ensure(sessionId);
            if (current.controller === controller) taskStore.patch(sessionId, { phase: 'idle', controller: null });
          }
        })();
      };

      const canUndo = !!restore?.inverse && !restore.pending && restore.produced === draft && restore.adviceRev === draftRev && !busy;
      const onClickRef = useRef(null);
      const onClick = canUndo ? undo : run;
      onClickRef.current = onClick;
      useEffect(() => {
        const record = taskStore.ensure(sessionId);
        const trigger = () => onClickRef.current();
        record.trigger = trigger;
        return () => { if (record.trigger === trigger) record.trigger = undefined; };
      }, [sessionId]);

      const result = task.result;
      useEffect(() => {
        if (!result || taskStore.ensure(sessionId).result !== result || !taskStore.isActive(sessionId) || phase !== 'plain') return;
        let matches = draft === result.origin && (result.mount !== mount.current || draftRev === result.originRev) && JSON.stringify(attachmentIds) === result.attachments;
        try { matches &&= draftForModel(draft, occurrences) === result.projection; } catch { matches = false; }
        const finish = changes => taskStore.patch(sessionId, { result:null, restore:null, ...changes });
        if (!matches) return finish({ announce:t('state.stale') });
        const advice = { modeAdvice:firstDraft ? result.modeAdvice : null, skillAdvice:result.skillAdvice };
        if (result.unchanged) return finish({ announce:t('state.unchanged'), restore:{ produced:draft, adviceRev:draftRev, ...advice } });
        const receipt = replaceDraft(result.text, draft, draftRev);
        if (!receipt.ok) return finish({ failure:t('state.refused') });
        finish({ restore:{ text:draft, produced:receipt.produced, inverse:receipt, pending:true, beforeRev:draftRev, ...advice } });
      }, [sessionId, result, phase, draft, draftRev]);

      // A successful write is not an undo offer until the host echoes exactly
      // the expected clipboard projection. A user edit is never adopted as it.
      useEffect(() => {
        if (!restore || taskStore.ensure(sessionId).restore !== restore) return;
        if (restore.pending && draft === restore.text && draftRev === restore.beforeRev) return;
        if (draft !== restore.produced || (!restore.pending && restore.adviceRev !== draftRev) || (restore.pending && Number.isFinite(restore.inverse.rev) && restore.inverse.rev !== draftRev)) {
          taskStore.patch(sessionId, {restore:null});
        } else if (restore.pending) {
          taskStore.patch(sessionId, {restore:{...restore, pending:false, adviceRev:draftRev}});
        }
      }, [sessionId, restore, draft, draftRev]);

      if (typeof inputActions?.insertText !== 'function' && typeof inputActions?.setDraft !== 'function') return null;


      const visible = busy || canUndo || failure !== null || notice !== null || draft.trim().length > 0;
      if (!visible || phase !== 'plain') return null;

      const mode = busy ? 'busy' : canUndo ? 'undo' : failure !== null ? 'error' : 'idle';
      const baseTitle = busy
        ? t('label.busy')
        : canUndo
          ? t('label.undo')
          : failure !== null
            ? t('state.failedWith', { reason: failure })
            : notice !== null
              ? notice
              : t('label.idle');
      const title = contextAware && !busy ? t('label.contextAware', { base: baseTitle }) : baseTitle;
      const status = announce !== null ? announce : title;
      const showContextMark = willUseContext && !busy && !canUndo;

      return h('div', {
        className: 'dsh-pp_root',
        'data-prompt-pilot': '1',
        'data-context': showContextMark ? 'true' : 'false',
        'data-notice': failure !== null || notice !== null ? 'true' : 'false',
      },
      h('button', {
        type: 'button',
        className: 'dsh-pp_button',
        title,
        'aria-label': title,
        'aria-busy': busy,
        'data-busy': busy,
        'data-state': mode,
        onMouseDown: (event) => event.preventDefault(),
        onClick: busy ? () => run() : canUndo ? () => undo() : () => run(),
      },
      h('span', { className: 'dsh-pp_plane' + (busy ? ' is-busy' : '') },
        busy ? h(PilotIcon, { size: 16 }) : canUndo ? h(UndoIcon, { size: 16 }) : failure !== null ? h(RetryIcon, { size: 16 }) : h(PilotIcon, { size: 16 }),
      ),
      ),
      (() => {
        const validRestore = !busy && restore !== null && ((restore.pending === true && restore.pendingDraft === draft) || (restore.pending !== true && restore.produced === draft && restore.adviceRev === draftRev));
        const advice = firstDraft === true && validRestore ? restore.modeAdvice : null;
        const skillAdvice = validRestore ? restore.skillAdvice : null;
        const message = failure !== null ? failure : (notice !== null && !busy ? notice : null);
        if (advice === null && skillAdvice === null && message === null) return null;
        return h('div', { className: 'dsh-pp_statusFrame', 'data-tone': failure !== null ? 'error' : 'info', role: failure !== null ? 'alert' : 'status' },
          advice !== null ? h(ModeStatus, { mode: advice.mode, reason: advice.reason, t }) : null,
          skillAdvice !== null ? h(SkillStatus, { skillAdvice, t }) : null,
          message !== null ? h('span', { className: 'dsh-pp_notice', 'data-tone': failure !== null ? 'error' : 'info', role: failure !== null ? 'alert' : undefined, title: message }, message) : null,
        );
      })(),
      h('span', { className: 'dsh-pp_sr', role: 'status', 'aria-live': 'polite' }, status),
      );
    }


    // ======================================================================
    // Keyboard binding (settings row)
    // ======================================================================

    /** The command id this plugin registers with the host shortcuts service. */
    // The host stores user bindings under this public command ID.
    const SHORTCUT_ID = 'prompt-enhance.run';

    /** Which settings row owns which control, for inline save errors. */
    const CONTROL_ROWS = {
      'settings.useCustomModel': 'model',
      'settings.model': 'model',
      'settings.ruleSet': 'ruleSet',
      'settings.context': 'context',
      'settings.images': 'images',
      'settings.files': 'files',
      'settings.shortcutEnabled': 'shortcut',
    };

    /** Composer file policy used only when the settings route cannot be read. */
    const FALLBACK_FILE_POLICY = {
      maxFileBytes: 5 * 1024 * 1024,
      maxFilesPerMessage: 2,
      textPreviewChars: 6000,
      maxFileNames: 8,
    };

    /** Whether a value behaves like the host shortcuts service. */
    const usableShortcuts = (candidate) => {
      if (candidate === undefined || candidate === null) return false;
      if (typeof candidate !== 'object' && typeof candidate !== 'function') return false;
      return typeof candidate.register === 'function';
    };

    /** Read a snapshot from a face that may expose it as a method or a value. */
    const readSnapshot = (face, key) => {
      if (face === undefined || face === null) return [];
      try {
        const raw = typeof face.getSnapshot === 'function' ? face.getSnapshot() : face;
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw?.[key])) return raw[key];
      } catch {
        // A throwing getter means not ready; callers treat that as empty.
      }
      return [];
    };

    /** Read the binding revision, tolerating both shapes and any throw. */
    const readRevision = (shortcuts) => {
      try {
        const config = shortcuts?.config;
        const raw = typeof config?.getSnapshot === 'function' ? config.getSnapshot() : config;
        return raw?.revision;
      } catch {
        return undefined;
      }
    };

    /**
     * Read and edit this plugin's keyboard binding through the host service.
     * The host owns the binding: display, persistence, conflict detection.
     * @returns {keys, isDefault, assign, reset, refresh}.
     */
    const useShortcutBinding = (resolveShortcuts, t) => {
      const shortcuts = typeof resolveShortcuts === 'function' ? resolveShortcuts() : resolveShortcuts;
      const [state, setState] = useState({ keys: '', isDefault: true, revision: undefined });

      const refresh = useCallback(() => {
        if (shortcuts === undefined) return;
        try {
          const snapshot = readSnapshot(shortcuts?.catalog, 'commands');
          const row = snapshot.find((entry) => entry?.id === SHORTCUT_ID);
          if (row === undefined) return;
          setState({
            keys: Array.isArray(row.keys) ? row.keys.filter((key) => key !== '+').join('+') : '',
            isDefault: row.modified !== true,
            revision: readRevision(shortcuts),
          });
        } catch {
          // A catalog that is not ready yet leaves the row at its last value.
        }
      }, [shortcuts]);

      const applyEdit = useCallback(async (operation) => {
        if (!usableShortcuts(shortcuts) || typeof shortcuts.edit !== 'function') return { status: 'unavailable' };
        try {
          let result = await shortcuts.edit(operation, readRevision(shortcuts));
          if (result?.status === 'stale') {
            refresh();
            result = await shortcuts.edit(operation, readRevision(shortcuts));
          }
          if (result?.status === 'saved') refresh();
          return result;
        } catch (error) {
          return { status: 'failed', reason: error?.message ?? 'exception' };
        }
      }, [refresh, shortcuts]);

      useEffect(() => {
        refresh();
        // The host may register the service a beat after this section mounts;
        // re-reading a few times covers that window without polling forever.
        let tries = 0;
        const retry = setInterval(() => {
          tries += 1;
          refresh();
          if (tries >= 10) clearInterval(retry);
        }, 120);
        let unsubscribe;
        try {
          if (typeof shortcuts?.catalog?.subscribe === 'function') unsubscribe = shortcuts.catalog.subscribe(refresh);
        } catch {
          // No subscription means the row does not live-update; it still works.
        }
        return () => {
          clearInterval(retry);
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }, [refresh, shortcuts]);

      const assign = useCallback(async (binding) => {
        if (!usableShortcuts(shortcuts)) return t('settings.shortcut.unavailable');
        try {
          const described = typeof shortcuts.describeBinding === 'function' ? shortcuts.describeBinding(binding) : undefined;
          if (described?.issue !== null && described?.issue !== undefined) {
            return t('settings.shortcut.rejected', { reason: described.issue });
          }
          const conflicts = (described?.conflicts ?? [])
            .filter((id) => id !== SHORTCUT_ID)
            .map((id) => {
              const snapshot = readSnapshot(shortcuts?.catalog, 'commands');
              const row = snapshot.find((entry) => entry?.id === id);
              const label = typeof row?.label === 'function' ? row.label() : row?.label;
              return label ?? id;
            });
          if (conflicts.length > 0) return t('settings.shortcut.conflict', { commands: conflicts.join('、') });
          const result = await applyEdit({ type: 'set', id: SHORTCUT_ID, binding });
          if (result !== undefined && result?.status !== 'saved') {
            return t('settings.shortcut.rejected', { reason: result?.status ?? 'no-status' });
          }
          return null;
        } catch (error) {
          return t('settings.shortcut.rejected', { reason: error?.message ?? 'exception' });
        }
      }, [applyEdit, shortcuts, t]);

      const reset = useCallback(async () => {
        if (!usableShortcuts(shortcuts)) return t('settings.shortcut.unavailable');
        try {
          const result = await applyEdit({ type: 'reset', id: SHORTCUT_ID });
          if (result !== undefined && result?.status !== 'saved') {
            return t('settings.shortcut.rejected', { reason: result?.status ?? 'no-status' });
          }
          return null;
        } catch (error) {
          return t('settings.shortcut.rejected', { reason: error?.message ?? 'exception' });
        }
      }, [applyEdit, shortcuts, t]);

      return { keys: state.keys, isDefault: state.isDefault, assign, reset, refresh };
    };


    // ======================================================================
    // Settings page
    // ======================================================================

    /**
     * SettingsSection — the plugin page in the Settings sidebar.
     *
     * Values live in the host profile entry, so a saved choice survives a
     * restart. The page reads once on mount, writes per control, and reports a
     * failure inline next to the control the user touched.
     */
    const projectHome = 'https://github.com/asterdot/dsh-prompt-pilot';
    async function preferencesRequest(signal, patch) {
      const options = { signal, credentials:'same-origin', cache:'no-store' };
      if (patch) Object.assign(options,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
      const response = await fetch('/api/prompt-pilot/settings', options);
      const data = await response.json();
      if (!response.ok || data?.ok !== true || !data.values) throw Error(data?.message || 'HTTP ' + response.status);
      return data;
    }

    function SettingsSection({ t, getRemote, getShortcuts }) {
      const tr = key => t('prefs.' + key);
      const [data,setData] = useState(null), [issue,setIssue] = useState(null), [attempt,reload] = useState(0);
      const [notice,report] = useState(''), [models,setModels] = useState(null), [recording,record] = useState(false);
      const [bindingError,setBindingError] = useState('');
      const life = useRef(null), writing = useRef(false);
      const shortcut = useShortcutBinding(getShortcuts,t);
      useEffect(() => {
        const ctl = new AbortController(); life.current = ctl;
        setIssue(null); report(''); setModels(null);
        preferencesRequest(ctl.signal).then(x=>{if(!ctl.signal.aborted)setData(x)},err=>{if(!ctl.signal.aborted)setIssue({message:err.message})});
        Promise.resolve().then(()=>getRemote().modelCatalog()).then(x=>{if(!ctl.signal.aborted)setModels(x?.ok ? x.value?.groups ?? [] : false)},()=>{if(!ctl.signal.aborted)setModels(false)});
        return ()=>ctl.abort();
      },[attempt]);
      async function save(patch) {
        if(writing.current || !life.current || life.current.signal.aborted)return;
        const {signal}=life.current; writing.current=true; report('saving');setIssue(null);
        try {const result=await preferencesRequest(signal,patch); if(!signal.aborted){setData(prev=>({...prev,values:{...prev.values,...result.values}})); report('saved');}}
        catch(err){if(!signal.aborted){report('');setIssue({message:err.message,patch});}}
        finally {writing.current=false;}
      }
      const values=data?.values, busy=notice==='saving';
      const link=(href,key)=>h('a',{href,target:'_blank',rel:'noopener noreferrer',className:'dsh-pp-feedbackLink'},tr(key));
      const toggle=(key,title,hint)=>h('label',{className:'dsh-pp-settingsRow',key},h('input',{type:'checkbox',checked:!!values[key],onChange:e=>save({[key]:e.target.checked})}),h('span',null,h('strong',null,tr(title)),hint&&h('span',{className:'dsh-pp-settingsHint',style:{display:'block'}},tr(hint))));
      const group=(title,...children)=>h('fieldset',{disabled:busy,style:{minWidth:0}},h('legend',null,tr(title)),...children);
      const select=(label,value,onChange,choices,disabled=false)=>h('label',{className:'dsh-pp-settingsRow'},tr(label),h('select',{className:'dsh-pp-select',value,onChange:e=>onChange(e.target.value),disabled},choices));
      const button=(label,action,props={})=>h('button',{type:'button',onClick:action,...props},label);
      const modelChoices=[h('option',{key:'session',value:''},tr('follow'))];
      for(const provider of models||[])modelChoices.push(h('optgroup',{key:provider.id,label:provider.name||provider.id},(provider.models||[]).map(m=>h('option',{key:m.id,value:JSON.stringify([provider.id,m.id])},m.name||m.id))));
      return h('section',{className:'dsh-pp-settings'},h('header',null,h('h2',null,tr('title')),h('p',null,tr('intro')),link(projectHome+'/issues','feedback'),'　',link(projectHome,'project'),data?.about?.version&&h('small',null,'　v'+data.about.version)),
        issue&&h('div',{role:'alert'},h('p',null,tr(issue.patch?'failure':'loadError')+' '+issue.message),button(tr('retry'),()=>issue.patch?save(issue.patch):reload(v=>v+1))),
        h('div',{role:'status','aria-live':'polite'},notice?tr(notice):!values&&!issue?tr('loading'):''),
        values&&group('strategy',select('strategy',values.ruleSet,id=>save({ruleSet:id}),['legacy','intent-first','workbuddy'].map(k=>h('option',{key:k,value:k},tr(k)))),h('p',null,tr(values.ruleSet+'Hint'))),
        values&&group('model',toggle('useCustomModel','fixed'),select('model',values.enhanceModel?JSON.stringify([values.enhanceProvider,values.enhanceModel]):'',raw=>{const [enhanceProvider,enhanceModel]=raw?JSON.parse(raw):['',''];save({enhanceProvider,enhanceModel})},modelChoices,!values.useCustomModel||!models),models===false&&h('p',null,tr('catalog'),' ',button(tr('retry'),()=>reload(v=>v+1)))),
        values&&group('privacy',toggle('referenceContext','context','contextHint'),toggle('referenceImages','images','imagesHint'),toggle('referenceFiles','files','filesHint')),
        values&&group('shortcut',toggle('shortcutEnabled','enabled'),button(recording?tr('escape'):shortcut.keys||tr('record'),()=>{record(!recording);setBindingError('')},{disabled:!values.shortcutEnabled,onKeyDown:e=>{if(!recording)return;e.preventDefault();e.stopPropagation();if(e.code==='Escape'){record(false);return;}if(BARE_MODIFIERS.test(e.code))return;record(false);shortcut.assign(comboFromEvent(e)).then(setBindingError);}}),button(tr('reset'),()=>shortcut.reset().then(setBindingError),{disabled:!values.shortcutEnabled||shortcut.isDefault}),bindingError&&h('p',{role:'alert'},bindingError)),
        !!data?.changelog?.length&&h('section',null,h('h3',null,tr('notes')),data.changelog.map(v=>h('details',{key:v.version},h('summary',null,'v'+v.version),h('ul',null,v.items.map((s,i)=>h('li',{key:i},s)))))));
    }

    // ======================================================================
    // Plugin entry
    // ======================================================================


    // Test seam: unit tests invoke the factory with a stub environment and read
    // the pure helpers back through this hook. It never runs in the browser —
    // no host code sets window.__promptPilotTestHooks.
    if (typeof window !== 'undefined' && window.__promptPilotTestHooks !== null && typeof window.__promptPilotTestHooks === 'object') {
      Object.assign(window.__promptPilotTestHooks, {
        chipEntries,
        draftForModel,
        sanitizeForInsert,
        planDraftReplacement,
        stripChipLabels,
        shortenAttachmentLabel,
        comboFromEvent,
        isBindable,
        formatCombo,
        matchesCombo,
        decodeComposerText,
        makeComposerTextPreview,
        safeComposerFileName,
        bytesToBase64,
        taskStore,
      });
    }

    return {
      name: 'dsh-prompt-pilot',
      // remote.session is required for the model picker; slots and locale are
      // the mounting surfaces. shortcuts is deliberately absent from this list:
      // Cordis activates a plugin only when every injected service exists, and
      // a missing keyboard bridge must not take the composer button down with it.
      inject: ['slots', 'locale', 'remote', 'remote.session'],
      apply(ctx) {
        ctx.effect(installStyles, 'dsh-prompt-pilot: styles');
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH_DICT, en: EN_DICT }), 'dsh-prompt-pilot: dictionaries');
        try { sessionService = ctx.get('sessions'); } catch { sessionService = undefined; }
        conversationResolver = () => resolveConversation(ctx);

        // The composer seat. conversation.input.right is a list slot sorted by
        // order ascending; 50 keeps the seat in the right-hand group without
        // fighting other plugins over the first position.
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'prompt-pilot', order: 50, locale: NS }, EnhanceControl),
        );

        const t = ctx.locale.bind(NS);
        const getSessionRemote = () => ctx.remote.session;
        const getShortcuts = () => (typeof ctx.get === 'function' ? ctx.get('shortcuts') : ctx.shortcuts);
        // One stable component identity: a per-render wrapper would remount the
        // section on every parent render and reset its hook state.
        const Section = (props) => h(SettingsSection, { ...props, t, getRemote: getSessionRemote, getShortcuts });
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'prompt-pilot', order: 50, label: () => t('nav'), locale: NS },
            Section,
          ),
        );

        // Keyboard command. Registered through the host so the default works
        // immediately, the override persists in the profile, and a clashing
        // combination is rejected with the colliding command's name.
        // resolve() is what dispatch invokes; run is kept for direct callers.
        ctx.inject(['shortcuts'], (scope) => {
          scope.effect(() => {
            try {
              const shortcutsFace = scope.shortcuts;
              if (typeof shortcutsFace?.register !== 'function') return undefined;
              const runCommand = () => {
                if (taskStore.shortcutAllowed() !== true) return;
                const trigger = taskStore.activeTrigger();
                if (trigger !== undefined) {
                  taskStore.markHostFire();
                  trigger();
                }
              };
              const dispose = shortcutsFace.register({
                id: SHORTCUT_ID,
                label: () => t('shortcut.run'),
                aliases: ['prompt pilot', 'enhance prompt', 'rewrite prompt'],
                defaults: {
                  'desktop:windows': { code: 'KeyE', modifiers: ['primary'] },
                  'desktop:macos': { code: 'KeyE', modifiers: ['primary'] },
                  'web:windows': { code: 'KeyE', modifiers: ['primary', 'alt'] },
                  'web:macos': { code: 'KeyE', modifiers: ['primary', 'alt'] },
                },
                resolve: () => ({ status: 'handled', run: runCommand }),
                run: runCommand,
                regions: ['page', 'editable', 'terminal'],
                modals: [],
              });
              return dispose;
            } catch {
              // A throw here is swallowed by the effect wrapper; the keydown
              // fallback below still serves the shortcut.
              return undefined;
            }
          }, 'dsh-prompt-pilot: shortcut');
        });

        // Keyboard fallback. The host owns the binding, but whether its catalog
        // actually dispatches depends on the runtime; watching the key directly
        // keeps the shortcut working. Double-fire is prevented three ways: the
        // host path marks markHostFire first, a handled event arrives with
        // defaultPrevented, and this listener runs in the bubble phase.
        ctx.effect(() => {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;

          const resolvedBinding = () => {
            try {
              const face = typeof ctx.get === 'function' ? ctx.get('shortcuts') : ctx.shortcuts;
              const snapshot = readSnapshot(face?.catalog, 'commands');
              const row = Array.isArray(snapshot) ? snapshot.find((entry) => entry.id === SHORTCUT_ID) : undefined;
              return row?.binding ?? undefined;
            } catch {
              return undefined;
            }
          };

          const evaluate = (event) => {
            if (event.defaultPrevented) return 'prevented';
            if (taskStore.shortcutAllowed() !== true) return 'gate';
            if (taskStore.hostFiredRecently()) return 'host-recent';
            const candidate = comboFromEvent(event);
            if (BARE_MODIFIERS.test(candidate.code ?? '')) return 'modifier-only';
            const target = resolvedBinding();
            if (target === undefined) return 'no-target';
            if (!matchesCombo(candidate, target)) return 'mismatch';
            if (taskStore.activeTrigger() === undefined) return 'no-trigger';
            return null;
          };

          const onKey = (event) => {
            const verdict = evaluate(event);
            if (verdict !== null) return;
            event.preventDefault();
            taskStore.activeTrigger()();
          };

          window.addEventListener('keydown', onKey);
          return () => {
            window.removeEventListener('keydown', onKey);
          };
        }, 'dsh-prompt-pilot: shortcut fallback');
      },
    };
  },
});







