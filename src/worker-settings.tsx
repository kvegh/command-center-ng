import React, { useState } from 'react';

export function WorkerSettings({ agentId, minutes = 0, disabled, paused, error, save }: {
  agentId: string; minutes?: number; disabled: boolean; paused: boolean; error?: string | null;
  save: (minutes: number) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  return <section className="worker-settings" aria-label="Worker specific settings">
    <h3 className="context-label">Worker specific settings</h3>
    <fieldset disabled={disabled || saving}>
      <legend>Task report every</legend>
      <div className="report-options">{[[60, '1h'], [15, '15min'], [5, '5min'], [0, 'Never']].map(([value, label]) =>
        <label key={value}><input type="radio" name={`report-interval-${agentId}`} value={value}
          checked={minutes === value} onChange={async () => {
            setSaving(true); try { await save(Number(value)); } finally { setSaving(false); }
          }} /><span>{label}</span></label>)}</div>
    </fieldset>
    {minutes > 0 && <p className="field-note">{paused ? 'Reports are paused with the coordinator.' : 'Reports wait for idle; pending questions stay open.'}</p>}
    {error && <p className="error-text" role="alert">{error} Change the interval to reset reporting.</p>}
  </section>;
}
