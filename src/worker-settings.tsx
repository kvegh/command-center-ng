import React, { useState } from 'react';

export function WorkerSettings({ agentId, minutes = 0, disabled, paused, error, reportState, settingPending, save, reportNow, children }: {
  agentId: string; minutes?: number; disabled: boolean; paused: boolean; error?: string | null;
  reportState?: 'queued' | 'generating' | null; settingPending?: boolean;
  save: (minutes: number) => Promise<boolean>;
  reportNow: () => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  return <section className="worker-settings" aria-label="Worker specific settings">
    <h3 className="context-label">Worker specific settings</h3>
    <fieldset disabled={disabled || saving}>
      <legend>Task report every</legend>
      <div className="report-options">{[[60, '1h'], [15, '15min'], [5, '5min'], [0, 'Never']].map(([value, label]) =>
        <label key={value}><input type="radio" name={`report-interval-${agentId}`} value={value}
          checked={minutes === value} onChange={async () => {
            setSaving(true); try { await save(Number(value)); } finally { setSaving(false); }
          }} /><span>{label}</span></label>)}<button type="button" className="button subtle small" disabled={requesting || !!reportState} onClick={async () => { setRequesting(true); try { await reportNow(); } finally { setRequesting(false); } }}>{requesting ? 'Queuing…' : 'Report now'}</button></div>
    </fieldset>
    {(minutes > 0 || reportState || settingPending) && <p className="field-note" role="status">{reportState === 'queued' ? paused ? 'Report queued. Delivery is paused with the coordinator.' : 'Report queued. It will run after current work and questions are finished.' : reportState === 'generating' ? 'Generating task report…' : settingPending ? paused ? 'Reporting instruction queued. Delivery is paused with the coordinator.' : 'Reporting instruction queued for this agent.' : 'The agent handles this interval. Command Center sends no recurring reminders.'}</p>}
    {error && <p className="error-text" role="alert">{error} The instruction was not confirmed. Check the agent before changing the interval.</p>}
    {children}
  </section>;
}
