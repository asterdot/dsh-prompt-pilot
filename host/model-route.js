const hasId = value => typeof value === 'string' && value.trim().length > 0;
const usable = route => hasId(route?.provider) && hasId(route?.model);

function sessionChoice(scope, id) {
  if (!hasId(id)) return;
  try {
    const session = scope.get('sessions')?.get(id);
    if (!session) return;
    const selection = scope.get('sessionProjections')?.snapshot(session, ['modelSelection'])?.values?.modelSelection;
    return [selection?.next, selection?.lastUsed].find(usable);
  } catch {
    // A missing session projection must not mask the host default.
    return undefined;
  }
}

export function resolveRoute(scope, sessionId, config) {
  if (config?.useCustomModel === true) {
    const pin = { provider: config.enhanceProvider, model: config.enhanceModel };
    if (usable(pin)) return pin;
  }
  const choice = sessionChoice(scope, sessionId) ?? scope.get('agentDefaultModel')?.currentSelection();
  return usable(choice) ? choice : undefined;
}
