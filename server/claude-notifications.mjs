// The SDK's normal history projection drops native origin metadata. Read once
// through its import API, then let the SDK keep ownership of chain/meta filtering.
// This collector is request-scoped and is never used for a query or resume.
export async function readClaudeMessages(sdk, sessionId, options = {}) {
  if (typeof sdk.importSessionToStore !== 'function' || typeof sdk.getSessionMessages !== 'function') return sdk.getSessionMessages(sessionId, options);
  const entries = [], notifications = new Set(), subagents = new Map();
  let projectKey, active = true;
  const matches = key => key?.sessionId === sessionId && key.subpath === undefined
    && typeof key.projectKey === 'string' && (projectKey === undefined || key.projectKey === projectKey);
  const collector = {
    async append(key, batch) {
      if (!active || !matches(key) || !Array.isArray(batch)) throw new Error('Unexpected Claude history import scope.');
      projectKey ??= key.projectKey;
      entries.push(...batch);
      for (const entry of batch) {
        if (typeof entry?.uuid !== 'string') continue;
        if (entry.type === 'user' && entry.sessionId === sessionId && entry.origin?.kind === 'task-notification') notifications.add(entry.uuid);
        else notifications.delete(entry.uuid);
        const subagent = ['assistant', 'user'].includes(entry.type) && entry.sessionId === sessionId
          ? claudeSubagentBinding({ ...entry, session_id: entry.sessionId }, sessionId) : null;
        if (subagent) subagents.set(entry.uuid, { type: entry.type, binding: subagent }); else subagents.delete(entry.uuid);
      }
    },
    async load(key) {
      if (!active || !matches(key)) throw new Error('Unexpected Claude history import scope.');
      return entries;
    }
  };
  try {
    await sdk.importSessionToStore(sessionId, collector, { dir: options.dir, includeSubagents: false });
    const messages = await sdk.getSessionMessages(sessionId, { ...options, sessionStore: collector });
    return messages.map(message => {
      if (message.session_id !== sessionId) return message;
      if (message.type === 'user' && notifications.has(message.uuid)) return { ...message, origin: { kind: 'task-notification' } };
      const source = subagents.get(message.uuid);
      const subagent = source?.type === message.type && source.binding;
      // Restore metadata only for rows returned by the SDK's normal projection.
      // Never insert hidden sidechains or infer an author from message text.
      return subagent ? { ...message, parent_tool_use_id: subagent.id, ...(subagent.name ? { task_description: subagent.name } : {}) } : message;
    });
  } finally {
    active = false;
    entries.length = 0;
    notifications.clear();
    subagents.clear();
  }
}

export function claudeSubagentName(value) {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) : '';
}

export function claudeSubagentBinding(message, sessionId) {
  const id = message.parent_tool_use_id;
  if (!sessionId || message.session_id !== sessionId || typeof id !== 'string' || !id || id.length > 512 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(id)) return null;
  const name = claudeSubagentName(message.task_description) || claudeSubagentName(message.subagent_type);
  // This ID identifies the spawning native tool call, not the child's agent ID.
  return { id, ...(name ? { name } : {}) };
}

export function claudeTaskNotification(message, sessionId, text) {
  if (message.type !== 'user' || !sessionId || message.session_id !== sessionId || message.origin?.kind !== 'task-notification') return null;
  // Origin establishes identity. These fields only improve presentation; raw
  // contents remain available and cannot change native task or permission state.
  const visible = text.slice(0, 32_000);
  const rawStatus = /<status>([\s\S]*?)<\/status>/.exec(visible)?.[1].trim();
  const state = ['completed', 'failed', 'stopped'].includes(rawStatus) ? rawStatus : 'unknown';
  const summary = (/<summary>([\s\S]*?)<\/summary>/.exec(visible)?.[1] || '')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  const title = state === 'unknown' ? 'Claude task notification' : `Claude task ${state}`;
  return { activityTitle: title + (summary ? ` — ${summary}` : ''), state };
}
