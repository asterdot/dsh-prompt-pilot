// Prompt Pilot v2 — host entry.
//
// Registers three HTTP routes on the connection face: the settings read/write
// pair, the composer's context-status probe, and the enhancement endpoint.
// The enhancement route is registered only once the host llm service exists,
// because without a model there is nothing to enhance.

import { CONTEXT_STATUS_PATH, ROUTE_PATH, SETTINGS_PATH, resolveConfig } from './host/config.js';
import { handleSettings } from './host/settings.js';
import { handle } from './host/handle.js';
import { sessionHasContext } from './host/session-log.js';

import z from '@deepseek-ai/schemastery';

// DSH uses volatile schema fields to expose settings that can be saved at runtime.
export const Config = z.object({
  useCustomModel: z.boolean().volatile(),
  enhanceProvider: z.string().volatile(),
  enhanceModel: z.string().volatile(),
  contextEnabled: z.boolean().volatile(),
  contextImages: z.boolean().volatile(),
  contextFileContents: z.boolean().volatile(),
  composerImages: z.boolean().volatile(),
  composerFiles: z.boolean().volatile(),
  contextImageCount: z.number().volatile(),
  contextFileCount: z.number().volatile(),
  composerImageCount: z.number().volatile(),
  composerFileCount: z.number().volatile(),
  referenceImages: z.boolean().volatile(),
  referenceFiles: z.boolean().volatile(),
  referenceContext: z.boolean().volatile(),
  shortcutEnabled: z.boolean().volatile(),
  ruleSet: z.string().volatile(),
});

export const name = 'dsh-prompt-pilot';
export const inject = ['connection'];

/**
 * @param ctx - the plugin context; the connection face is guaranteed by inject.
 * @param rawConfig - volatile fields from the profile entry, already typed.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  // One lifetime for every in-flight enhancement: plugin unload or config
  // change aborts them all, and each request adds its own timeout on top.
  const lifetime = new AbortController();
  // Context-window metadata cache, keyed by provider and model, shared by all
  // requests so the adapter is asked once per route.
  const windowCache = new Map();
  ctx.effect(() => () => lifetime.abort());

  const mount = route => ctx.effect(() => ctx.connection.fetch.register(route));
  mount({
    path: SETTINGS_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: (request) => handleSettings(ctx, config, request),
  });

  mount({
    path: CONTEXT_STATUS_PATH,
    methods: ['GET'],
    fetch: (request) => {
      const sessionId = new URL(request.url).searchParams.get('sessionId') ?? undefined;
      return Response.json({ ok: true, hasContext: sessionHasContext(ctx, sessionId) });
    },
  });

  ctx.inject(['llm'], (scope) => {
    scope.effect(() => scope.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => handle(scope, config, request, lifetime, windowCache),
    }));
  });
}
