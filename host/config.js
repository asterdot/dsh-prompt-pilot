// Shared host configuration: route paths, rule-set ids, defensive defaults and
// the clamps that normalize whatever the profile row supplied. The clamps live
// here rather than in the schema so a malformed field degrades to its default
// instead of disabling the plugin.

export const RULE_SET_LEGACY = 'legacy';
export const RULE_SET_INTENT_FIRST = 'intent-first';
export const RULE_SET_WORKBUDDY = 'workbuddy';
export const RULE_SET_VALUES = new Set([RULE_SET_LEGACY, RULE_SET_INTENT_FIRST, RULE_SET_WORKBUDDY]);

/** Exact routes the browser half talks to. */
export const ROUTE_PATH = '/api/prompt-pilot';
export const SETTINGS_PATH = ROUTE_PATH + '/settings';
export const CONTEXT_STATUS_PATH = ROUTE_PATH + '/context-status';

/** Defensive defaults; every value is overridable through the row's config. */
export const DEFAULTS = Object.freeze({
  maxDraftChars: 8000,
  maxOutputChars: 12000,
  maxOutputTokens: 2000,
  timeoutMs: 90000,
  historyTokenBudget: 6000,
  historyMaxMessages: 24,
  historyMessageChars: 4000,
  // Empty means "follow the model this session already uses".
  enhanceProvider: '',
  enhanceModel: '',
  useCustomModel: false,
  referenceContext: true,
  contextImages: false,
  contextFileContents: false,
  composerImages: false,
  composerFiles: false,
  contextImageCount: 2,
  contextFileCount: 2,
  composerImageCount: 2,
  composerFileCount: 2,
  referenceImages: false,
  referenceFiles: false,
  // A plugin must not claim a global key unless the user opts in.
  shortcutEnabled: false,
  ruleSet: RULE_SET_LEGACY,
});

/** Hard stop for the adaptive output budget, independent of model metadata. */
export const MAX_OUTPUT_CEILING = 16000;

/** Share of a model's context window the history may ever consume. */
export const HISTORY_WINDOW_SHARE = 0.05;

/**
 * Extra completion budget on top of maxOutputTokens.
 *
 * Reasoning-capable models spend the completion budget on thinking AND visible
 * text; the adapter reports reasoning as reasoning-delta, which is never part of
 * the prompt. A budget sized only for the rewrite could be spent entirely on
 * thinking, producing zero text and a spurious "empty response" failure.
 */
export const REASONING_HEADROOM_TOKENS = 1500;

/** How many times a truncated run may be retried with a larger budget. */
export const MAX_BUDGET_ATTEMPTS = 3;

/** Machine-readable failure carrying a user-facing message. */
export class EnhanceFailure extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EnhanceFailure';
    this.code = code;
  }
}

/** Clamp one positive integer option against its default and ceiling. */
export function positiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

/** Read one optional non-empty string setting. */
export function optionalString(value, fallback) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

/** Read one optional boolean setting. */
export function optionalBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function boundedCount(value, fallback, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.floor(number))) : fallback;
}

/**
 * Normalize the row's config without trusting it: an unknown or malformed field
 * falls back to its default instead of disabling the plugin.
 * @param raw - the row config supplied by the Loader.
 */
export function resolveConfig(raw) {
  const source = raw ?? {};
  return {
    maxDraftChars: positiveInteger(source.maxDraftChars, DEFAULTS.maxDraftChars, 200000),
    maxOutputChars: positiveInteger(source.maxOutputChars, DEFAULTS.maxOutputChars, 200000),
    maxOutputTokens: positiveInteger(source.maxOutputTokens, DEFAULTS.maxOutputTokens, 64000),
    timeoutMs: positiveInteger(source.timeoutMs, DEFAULTS.timeoutMs, 600000),
    historyTokenBudget: positiveInteger(source.historyTokenBudget, DEFAULTS.historyTokenBudget, 100000),
    historyMaxMessages: positiveInteger(source.historyMaxMessages, DEFAULTS.historyMaxMessages, 200),
    historyMessageChars: positiveInteger(source.historyMessageChars, DEFAULTS.historyMessageChars, 100000),
    enhanceProvider: optionalString(source.enhanceProvider, DEFAULTS.enhanceProvider),
    enhanceModel: optionalString(source.enhanceModel, DEFAULTS.enhanceModel),
    useCustomModel: optionalBoolean(source.useCustomModel, DEFAULTS.useCustomModel),
    referenceContext: optionalBoolean(source.contextEnabled ?? source.referenceContext, DEFAULTS.referenceContext),
    contextEnabled: optionalBoolean(source.contextEnabled ?? source.referenceContext, DEFAULTS.referenceContext),
    contextImages: optionalBoolean(source.contextImages, DEFAULTS.contextImages),
    contextFileContents: optionalBoolean(source.contextFileContents, DEFAULTS.contextFileContents),
    composerImages: optionalBoolean(source.composerImages ?? source.referenceImages, DEFAULTS.composerImages),
    composerFiles: optionalBoolean(source.composerFiles ?? source.referenceFiles, DEFAULTS.composerFiles),
    contextImageCount: boundedCount(source.contextImageCount, DEFAULTS.contextImageCount, 4),
    contextFileCount: boundedCount(source.contextFileCount, DEFAULTS.contextFileCount, 2),
    composerImageCount: boundedCount(source.composerImageCount, DEFAULTS.composerImageCount, 4),
    composerFileCount: boundedCount(source.composerFileCount, DEFAULTS.composerFileCount, 2),
    referenceImages: optionalBoolean(source.referenceImages, DEFAULTS.referenceImages),
    referenceFiles: optionalBoolean(source.referenceFiles, source.composerFiles ?? DEFAULTS.referenceFiles),
    shortcutEnabled: optionalBoolean(source.shortcutEnabled, DEFAULTS.shortcutEnabled),
    ruleSet: RULE_SET_VALUES.has(source.ruleSet) ? source.ruleSet : DEFAULTS.ruleSet,
  };
}
