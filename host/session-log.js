// Session context comes only from the active session object's derived messages.
// Persisted logs are deliberately outside the prompt context boundary.

/** In-memory transcript for one active session, when the host exposes one. */
export function readDerivedMessages(ctx, sessionId) {
  if (sessionId === undefined || sessionId === null || String(sessionId).length === 0) return [];
  try {
    const sessions = ctx?.get?.('sessions') ?? ctx?.sessions;
    const session = sessions?.get?.(sessionId) ?? sessions?.get?.(String(sessionId));
    if (session === undefined || session === null) return [];
    const derived = typeof session.deriveMessages === 'function' ? session.deriveMessages() : undefined;
    return Array.isArray(derived) ? derived : [];
  } catch {
    return [];
  }
}

/** Whether an active in-memory session contains a non-empty user message. */
export function sessionHasContext(ctx, sessionId) {
  return readDerivedMessages(ctx, sessionId).some((message) => {
    if (message?.role !== 'user') return false;
    if (typeof message.content === 'string') return message.content.trim().length > 0;
    return Array.isArray(message.content) && message.content.some((part) => part?.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0);
  });
}
