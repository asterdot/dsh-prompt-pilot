// Session-log probing. Whether a session has earlier user messages decides two
// things: the context-aware system prompt and the context dot in the composer.
// The in-memory transcript answers for live sessions; for anything else the
// plugin reads the session store on disk, including zstd-compressed logs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Bounded FIFO cache so repeated probes stay off the disk. */
function makeCache(limit) {
  const entries = new Map();
  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, value);
      if (entries.size > limit) entries.delete(entries.keys().next().value);
    },
  };
}

const fileCache = makeCache(256);
const userCache = makeCache(256);
const WORKSPACE_CACHE_MS = 30000;
const workspaceCache = new Map();

/** Root of the session store: DSH_SESSIONS_DIR when set, else ~/.dsh/sessions. */
export function sessionStoreRoot() {
  const override = process.env.DSH_SESSIONS_DIR;
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();
  return path.join(os.homedir(), '.dsh', 'sessions');
}

/** Workspace directories under the session store, with a short TTL cache. */
function sessionWorkspaces(root) {
  const cached = workspaceCache.get(root);
  if (cached !== undefined && Date.now() - cached.at < WORKSPACE_CACHE_MS && cached.dirs.length > 0) return cached.dirs;
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    dirs = [];
  }
  workspaceCache.set(root, { at: Date.now(), dirs });
  return dirs;
}

/**
 * Latest session log for one session id, walking every workspace directory.
 *
 * The store nests sessions under a workspace directory name the plugin cannot
 * derive from a workspace root path, so the walk enumerates the store's own
 * directories instead of guessing a name. The resolved path is cached per
 * session id so the walk runs once per session.
 */
export function findSessionLog(root, sessionId) {
  const key = root + '|' + sessionId;
  const cached = fileCache.get(key);
  if (cached !== undefined) {
    try {
      if (fs.statSync(cached).isFile()) return cached;
    } catch {
      fileCache.set(key, undefined);
    }
  }
  for (const workspace of sessionWorkspaces(root)) {
    const dir = path.join(root, workspace, String(sessionId));
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const candidates = names.filter((name) => /^session\.v\d+\.jsonl(?:\.zstd)?$/u.test(name)).sort((a, b) => versionOf(b) - versionOf(a));
    if (candidates.length > 0) {
      const found = path.join(dir, candidates[0]);
      fileCache.set(key, found);
      return found;
    }
  }
  return undefined;
}

function versionOf(name) {
  const match = /session\.v(\d+)\./u.exec(name);
  return match === null ? 0 : Number(match[1]);
}

/** Does the raw log text contain a user message? Bounded scan, no full parse. */
function logTextHasUser(text) {
  return text.includes('"role":"user"') || text.includes('"role": "user"');
}

function persistedLogHasUser(file) {
  const key = file;
  try {
    const stat = fs.statSync(file);
    const cached = userCache.get(key);
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs) return cached.hasUser;
    const buffer = fs.readFileSync(file);
    let hasUser = false;
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(ZSTD_MAGIC)) {
      // Frame boundaries are unknown; scan every 4-byte window for the magic and
      // try to decompress from there. Logs are small, so this stays cheap.
      for (let offset = 0; offset + 4 <= buffer.length && !hasUser; offset += 1) {
        if (!buffer.subarray(offset, offset + 4).equals(ZSTD_MAGIC)) continue;
        try {
          const text = zstdDecompressSync(buffer.subarray(offset)).toString('utf8');
          if (logTextHasUser(text)) hasUser = true;
        } catch {
          // Not a frame start; keep scanning.
        }
      }
    } else if (logTextHasUser(buffer.toString('utf8'))) {
      hasUser = true;
    }
    userCache.set(key, { mtimeMs: stat.mtimeMs, hasUser });
    return hasUser;
  } catch {
    return false;
  }
}

/** In-memory transcript for one session, when the host exposes one. */
export function readDerivedMessages(ctx, sessionId) {
  try {
    const sessions = ctx.get('sessions');
    const session = sessions?.get?.(sessionId) ?? sessions?.get?.(String(sessionId));
    if (session === undefined || session === null) return [];
    const derived = typeof session.deriveMessages === 'function' ? session.deriveMessages() : undefined;
    return Array.isArray(derived) ? derived : [];
  } catch {
    return [];
  }
}

/**
 * Does this session have user context? In-memory first (authoritative), then a
 * workspace-keyed disk probe with a short cache.
 */
export function sessionHasContext(ctx, sessionId) {
  if (sessionId === undefined || sessionId === null || String(sessionId).length === 0) return false;
  const derived = readDerivedMessages(ctx, sessionId);
  let sawAny = false;
  for (const message of derived) {
    if (message?.role !== 'user') continue;
    const text = typeof message.content === 'string' ? message.content : '';
    if (text.trim().length > 0) return true;
    sawAny = true;
  }
  if (sawAny && derived.length > 0) return false;
  // Disk probe: the store's own directory layout is the authority, so the
  // walk needs no workspace knowledge at all.
  try {
    const root = sessionStoreRoot();
    const cacheKey = root + '|' + String(sessionId);
    const cached = workspaceCache.get(cacheKey);
    if (cached !== undefined && Date.now() - cached.at < WORKSPACE_CACHE_MS) return cached.hasContext;
    const file = findSessionLog(root, String(sessionId));
    const hasContext = file !== undefined ? persistedLogHasUser(file) : false;
    workspaceCache.set(cacheKey, { at: Date.now(), hasContext });
    return hasContext;
  } catch {
    return false;
  }
}

