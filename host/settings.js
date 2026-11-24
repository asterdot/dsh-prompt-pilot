// Settings route: reads and writes the row's volatile fields, plus the about
// and changelog payloads the settings page renders. The namespace mirrors the
// bundle row id so the profile entry and the UI always agree.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_SET_VALUES } from './config.js';
import { ATTACHMENT_FILE_POLICY, readAttachmentImageLimits } from './attachments.js';

/** The volatile keys this plugin exposes to the settings page. */
export const SETTING_KEYS = Object.freeze([
  'useCustomModel',
  'enhanceProvider',
  'enhanceModel',
  'contextEnabled',
  'contextImages',
  'contextFileContents',
  'composerImages',
  'composerFiles',
  'contextImageCount',
  'contextFileCount',
  'composerImageCount',
  'composerFileCount',
  'referenceImages',
  'referenceFiles',
  'referenceContext',
  'shortcutEnabled',
  'ruleSet',
]);

/** Directory containing the package manifest and changelog. */
export function packageRoot() {
  // settings.js lives in <root>/host; the manifest sits one level up.
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

/**
 * The settings namespace for this plugin instance.
 *
 * Bundle rows may report the entry id as an include path (a colon appears);
 * only the short id is a valid namespace, so the suffix after the last colon
 * is used. The profile context's entry id is the fallback.
 */
export function settingsNamespace(ctx) {
  const entryId = ctx?.fiber?.entry?.options?.id ?? ctx?.profileContext?.entryId ?? 'dsh-prompt-pilot';
  const value = String(entryId);
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(colon + 1);
}

/** Read the about payload from the package manifest. */
export function readAbout(root) {
  const base = root ?? packageRoot();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
    let url = manifest.repository?.url ?? (typeof manifest.repository === 'string' ? manifest.repository : undefined) ?? manifest.homepage;
    if (typeof url === 'string') {
      url = url.replace(/^git\+/u, '').replace(/\.git\/?$/u, '').trim();
      if (url.length === 0) url = undefined;
    }
    return { version: String(manifest.version ?? ''), ...(url === undefined ? {} : { url }) };
  } catch {
    return { version: '' };
  }
}

/** Parse CHANGELOG.md into entries; the Chinese block carries the items. */
export function readChangelog(root) {
  const base = root ?? packageRoot();
  try {
    const text = fs.readFileSync(path.join(base, 'CHANGELOG.md'), 'utf8');
    const entries = [];
    for (const section of text.split(/^## /mu).slice(1)) {
      const lines = section.split(/\r?\n/u);
      const version = (lines.shift() ?? '').trim();
      let inChinese = false;
      const items = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^\*\*中文\*\*$/u.test(trimmed)) {
          inChinese = true;
          continue;
        }
        if (/^\*\*English\*\*$/u.test(trimmed)) break;
        if (!inChinese) continue;
        if (/^-\s+/u.test(trimmed)) items.push(trimmed.replace(/^-\s+/u, '').replace(/\*\*/gu, '').trim());
      }
      if (version.length > 0 && items.length > 0) entries.push({ version, items });
    }
    return entries;
  } catch {
    return [];
  }
}

/** Merge stored volatile settings over the resolved boot config. */
export function readPreferences(ctx, namespace, config) {
  // DSH projects acknowledged volatile changes onto this entry. Read it on
  // every request: the activation config can predate the user's last save.
  const stored = ctx?.fiber?.entry?.options?.config;
  const pick = (key, fallback) => {
    const value = stored?.[key];
    if (value === undefined || value === null) return fallback;
    if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback;
    if (key === 'ruleSet') return RULE_SET_VALUES.has(value) ? value : fallback;
    return typeof value === 'string' ? value : fallback;
  };
  const count = (key, fallback) => {
    const value = stored?.[key];
    const max = key.toLowerCase().includes('image') ? 4 : 2;
    return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
  };
  return {
    useCustomModel: pick('useCustomModel', config.useCustomModel),
    enhanceProvider: pick('enhanceProvider', config.enhanceProvider),
    enhanceModel: pick('enhanceModel', config.enhanceModel),
    contextEnabled: pick('contextEnabled', pick('referenceContext', config.contextEnabled)),
    contextImages: pick('contextImages', config.contextImages),
    contextFileContents: pick('contextFileContents', config.contextFileContents),
    composerImages: pick('composerImages', pick('referenceImages', config.composerImages)),
    composerFiles: pick('composerFiles', pick('referenceFiles', config.referenceFiles)),
    contextImageCount: count('contextImageCount', config.contextImageCount),
    contextFileCount: count('contextFileCount', config.contextFileCount),
    composerImageCount: count('composerImageCount', config.composerImageCount),
    composerFileCount: count('composerFileCount', config.composerFileCount),
    referenceImages: pick('referenceImages', config.referenceImages),
    referenceFiles: pick('referenceFiles', config.referenceFiles),
    referenceContext: pick('referenceContext', config.referenceContext),
    shortcutEnabled: pick('shortcutEnabled', config.shortcutEnabled),
    ruleSet: pick('ruleSet', config.ruleSet),
  };
}

/** Human-readable wording for a refused settings write. */
export function describeSettingsFailure(error, namespace) {
  const detail = String(error?.message ?? error ?? '');
  if (detail.includes('No configurable plugin entry')) {
    return '保存设置失败：当前运行的插件还没有可写的配置项。请重启 DeepSeek Harness 后重试。（' + namespace + '）';
  }
  if (detail.includes('has no volatile fields')) {
    return '保存设置失败：插件配置没有声明可写字段，这是一个插件缺陷。请反馈该问题。（' + namespace + '）';
  }
  if (error?.code === 'SETTINGS_CONFLICT' || detail.includes('revision')) {
    return '设置已在别处被修改，请关闭设置面板后重新打开再试。';
  }
  return '保存设置失败：' + detail;
}

/** Serve GET and POST for the settings route. */
export async function handleSettings(ctx, config, request) {
  const url = new URL(request.url);
  const namespace = settingsNamespace(ctx);
  if (request.method === 'GET') {
    const values = readPreferences(ctx, namespace, config);
    let imageLimits;
    try {
      imageLimits = readAttachmentImageLimits(ctx?.get?.('attachments')?.imageLimits);
    } catch {
      imageLimits = readAttachmentImageLimits(undefined);
    }
    if (url.searchParams.get('scope') === 'composer') {
      return Response.json({ ok: true, values, imageLimits, fileLimits: ATTACHMENT_FILE_POLICY });
    }
    return Response.json({
      ok: true,
      values,
      imageLimits,
      fileLimits: ATTACHMENT_FILE_POLICY,
      about: readAbout(),
      changelog: readChangelog(),
    });
  }

  const failure = (code, message) => Response.json({ ok: false, code, message });
  let input;
  try {
    input = await request.json();
  } catch {
    return failure('BAD_REQUEST', '设置请求不是有效的 JSON。');
  }
  if (!input || Array.isArray(input) || typeof input !== 'object') return failure('BAD_REQUEST', '需要设置项对象。');
  const patch = {};
  for (const key of SETTING_KEYS) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if ((key.endsWith('Count') ? typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > (key.toLowerCase().includes('image') ? 4 : 2) : typeof value !== typeof config[key]) || (key === 'ruleSet' && !RULE_SET_VALUES.has(value))) {
      return failure('BAD_REQUEST', '设置项无效：' + key);
    }
    patch[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (!Object.keys(patch).length) return failure('BAD_REQUEST', '没有可保存的设置项。');
  const service = ctx.get?.('settings') ?? ctx.settings;
  if (!service?.update) return failure('SETTINGS_UNAVAILABLE', '当前环境未提供设置服务。');
  try {
    await service.update(namespace, patch);
    return Response.json({ ok: true, values: { ...readPreferences(ctx, namespace, config), ...patch } });
  } catch (error) {
    return failure('SETTINGS_WRITE_FAILED', describeSettingsFailure(error, namespace));
  }
}
