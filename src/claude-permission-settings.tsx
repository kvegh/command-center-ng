import React, { useEffect, useRef, useState } from 'react';

export type ClaudePermissionMode = 'auto' | 'default';
export type ClaudePermissionChange = {
  mode: ClaudePermissionMode; status: 'pending' | 'acknowledged' | 'unconfirmed'; error?: string;
};
export type ClaudePermissionSettings = {
  available: boolean; mode: string | null; change: ClaudePermissionChange | null; configuredAuto?: boolean;
};
type Props = {
  agentId: string; connected: boolean; available: boolean; configuredAuto?: boolean;
  permissionMode?: string | null; permissionChange?: ClaudePermissionChange | null;
  load: () => Promise<ClaudePermissionSettings>;
  save: (choice: { mode: ClaudePermissionMode }) => Promise<ClaudePermissionSettings>;
};

const modeName = (mode: string) => mode === 'auto' ? 'Auto' : mode === 'default' ? 'Manual' : mode;

export function ClaudePermissionSettings({ agentId, connected, available, configuredAuto, permissionMode, permissionChange, load, save }: Props) {
  const context = useRef({ agentId, connected, available, configuredAuto, permissionMode, permissionChange });
  const latest = context.current;
  if (latest.agentId !== agentId || latest.connected !== connected || latest.available !== available || latest.configuredAuto !== configuredAuto
    || latest.permissionMode !== permissionMode || latest.permissionChange !== permissionChange) {
    context.current = { agentId, connected, available, configuredAuto, permissionMode, permissionChange };
  }
  type Readback = { context: typeof latest; settings: ClaudePermissionSettings };
  const [readback, setReadback] = useState<Readback | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ context: typeof latest; message: string; unconfirmed: boolean } | null>(null);
  const request = useRef(0); const writing = useRef(false);
  const settings = readback?.context === context.current ? readback.settings
    : { available, mode: permissionMode ?? null, change: permissionChange ?? null };
  const error = failure?.context === context.current ? failure : null;
  const pending = settings.change?.status === 'pending';
  const enabled = connected && available && settings.available;
  const refresh = async () => {
    if (!connected || !available || writing.current) return;
    const current = context.current; const sequence = ++request.current;
    setLoading(true);
    try {
      const value = await load();
      if (sequence !== request.current || current !== context.current) return;
      setReadback({ context: current, settings: value }); setFailure(null);
    } catch (problem) {
      if (sequence === request.current && current === context.current) setFailure({ context: current, message: (problem as Error).message, unconfirmed: false });
    } finally { if (sequence === request.current) setLoading(false); }
  };
  useEffect(() => {
    if (connected && available) void refresh();
    else setLoading(false);
    return () => { request.current++; };
  }, [agentId, connected, available]);
  const changeMode = async (mode: ClaudePermissionMode) => {
    if (!enabled || loading || pending || writing.current || error?.unconfirmed) return;
    const current = context.current;
    writing.current = true; setSaving(true); setFailure(null); request.current++;
    try {
      const value = await save({ mode });
      if (current === context.current) setReadback({ context: current, settings: value });
    } catch (problem) {
      if (current === context.current) setFailure({ context: current, message: (problem as Error).message, unconfirmed: true });
    } finally { writing.current = false; setSaving(false); }
  };
  return <form className="worker-model-settings" aria-label="Claude permission mode" onSubmit={event => event.preventDefault()}>
    <h4 className="context-label">Claude permissions</h4>
    <p className="field-note" role="status">{settings.mode
      ? <>Claude reports {modeName(settings.mode)} mode.</>
      : 'Claude has not reported its current permission mode.'}</p>
    {(configuredAuto ?? settings.configuredAuto) && <p className="field-note" role="status">Auto is configured for this session’s next managed process.</p>}
    {!enabled && <p className="field-note">Available only while this Claude session is connected and managed by Command Center.</p>}
    {(loading || saving || pending || settings.change || error?.unconfirmed) && <p className="field-note" role="status">{
      loading ? 'Reading Claude permission settings…'
        : saving || pending ? 'Waiting for Claude to confirm the permission change…'
          : error?.unconfirmed || settings.change?.status === 'unconfirmed'
            ? 'Permission change is unconfirmed. Refresh settings before requesting another change.'
            : settings.change?.status === 'acknowledged'
              ? <>{modeName(settings.change.mode)} mode request acknowledged. The reported mode above remains authoritative.</>
              : ''
    }</p>}
    {(error?.message || settings.change?.error) && <p className="error-text" role="alert">{error?.message || settings.change?.error}</p>}
    <div className="button-row">
      <button type="button" className="button subtle small" disabled={!enabled || loading || saving || pending || !!error?.unconfirmed} onClick={() => changeMode('auto')}>Enable Auto</button>
      <button type="button" className="button subtle small" disabled={!enabled || loading || saving || pending || !!error?.unconfirmed} onClick={() => changeMode('default')}>Use Manual</button>
      <button type="button" className="button subtle small" disabled={!connected || !available || loading || saving} onClick={() => refresh()}>Refresh permissions</button>
    </div>
  </form>;
}
