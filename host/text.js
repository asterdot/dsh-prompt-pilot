// Text shaping for the enhancement pipeline: token estimation, message text
// extraction, output normalization and classification, question handling and
// typed-reference preservation.

/** CJK blocks checked numerically; estimateTokens runs per character. */
const CJK_RANGES = Object.freeze([
  [0x2e80, 0x9fff], // CJK radicals through unified ideographs
  [0xf900, 0xfaff], // compatibility ideographs
  [0xac00, 0xd7af], // Hangul syllables
  [0x3040, 0x30ff], // Hiragana and Katakana
]);

function isCjkCodePoint(code) {
  for (const range of CJK_RANGES) {
    if (code >= range[0] && code <= range[1]) return true;
  }
  return false;
}

/** Rough token estimate: one token per CJK character, one per 4 other chars. */
export function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const character of String(text ?? '')) {
    if (isCjkCodePoint(character.codePointAt(0))) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

/**
 * Join the plain-text blocks of one message. Tool calls, tool results, reasoning
 * and attachments are skipped: they are the bulk of a transcript and contribute
 * nothing a rewrite should echo.
 */
export function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') parts.push(part.text);
  }
  return parts.join('\n');
}

/** Editor placeholders that must never leak into a prompt. */
const REFERENCE_PLACEHOLDER_RE = /[\uE100-\uE11D\uFFFC]/gu;

export function stripReferencePlaceholders(text) {
  return String(text ?? '').replace(REFERENCE_PLACEHOLDER_RE, '');
}

/** References the user typed as @"..." must survive into the rewrite. */
const TYPED_REFERENCE_RE = /@"[^"\n]{1,400}"/gu;

export function preserveTypedFileReferences(draft, text) {
  if (typeof draft !== 'string' || typeof text !== 'string' || text.length === 0) return text;
  const missing = [];
  for (const match of draft.matchAll(TYPED_REFERENCE_RE)) {
    const reference = match[0];
    if (!text.includes(reference)) missing.push(reference);
  }
  if (missing.length === 0) return text;
  return text + '\n\n' + missing.join('\n');
}

/** A leading "Enhanced prompt:"-style guide line the model must not add. */
const GUIDE_LINE_RE = /^(?:增强版|增强结果|优化版|enhanced prompt|enhanced version|rewritten prompt)\s*[:：]/iu;

/**
 * Normalize model output: LF line endings, no wrapping fence, no guide line,
 * capped length.
 */
export function normalizeOutput(raw, maxChars) {
  let text = String(raw ?? '').replace(/\r\n?/g, '\n').trim();
  const fence = /^\x60\x60\x60[^\n]*\n/u.exec(text);
  if (fence !== null && text.endsWith('\x60\x60\x60')) text = text.slice(fence[0].length, -3).trim();
  const lines = text.split('\n');
  if (lines.length > 1) {
    const first = lines[0].trim();
    if ((first.length <= 40 && /[:：]$/u.test(first)) || GUIDE_LINE_RE.test(first)) {
      lines.shift();
      text = lines.join('\n').trim();
    }
  }
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd();
  return text;
}

const RESULT_TAG_RE = /^\s*(?:\*\*|__|\x60)?(ENHANCED|UNCHANGED)(?:\*\*|__|\x60)?\s*$/iu;

/**
 * Split a tagged model answer into its kind and body. Rule sets that ship an
 * output contract answer with a leading ENHANCED/UNCHANGED tag; the legacy
 * playbook answers without one and falls through as 'enhanced'.
 */
export function classifyEnhancementOutput(raw) {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n').trim();
  const newline = text.indexOf('\n');
  const head = (newline === -1 ? text : text.slice(0, newline)).trim();
  const match = RESULT_TAG_RE.exec(head);
  if (match === null) return { kind: 'enhanced', text };
  const kind = match[1].toUpperCase() === 'UNCHANGED' ? 'unchanged' : 'enhanced';
  const rest = (newline === -1 ? '' : text.slice(newline + 1)).trim();
  return { kind, text: rest };
}

const QUESTION_START_RE = /^(?:请(?:你)?(?:先)?(?:告诉|回答|说明|确认|提供)|请问|你能|你可|能否|可否|是否|为什么|怎么|怎样|什么是|哪一|哪些|what\b|how\b|why\b|which\b|who\b|could you|can you|do you|does the|should (?:i|we)|would you)/iu;

/** Does this text read like a question to the user instead of a prompt? */
export function looksLikeQuestion(text) {
  const value = String(text ?? '').trim();
  if (value.length === 0) return false;
  if (/\?|？/u.test(value)) {
    const marks = (value.match(/[?？]/gu) ?? []).length;
    const sentences = value.split(/[.!?。！？\n]/u).filter((part) => part.trim().length > 0).length;
    if (marks >= 2 || sentences <= 2) return true;
  }
  return QUESTION_START_RE.test(value);
}

/**
 * Drop question sentences from an otherwise usable rewrite. Returns '' when
 * nothing usable remains.
 */
export function salvageRewrite(text) {
  const value = String(text ?? '').trim();
  if (value.length === 0) return '';
  const sentences = value.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu) ?? [];
  const kept = sentences.filter((sentence) => !looksLikeQuestion(sentence)).join('').trim();
  if (kept.length < 16 || looksLikeQuestion(kept)) return '';
  return kept;
}
