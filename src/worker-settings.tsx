import React, { useState } from 'react';

export function WorkerSettings({ agentId, minutes = 0, compact = false, disabled, paused, error, reportState, settingPending, save, reportNow, children }: {
  agentId: string; minutes?: number; disabled: boolean; paused: boolean; error?: string | null;
  compact?: boolean;
  reportState?: 'queued' | 'generating' | null; settingPending?: boolean;
  save: (minutes: number) => Promise<boolean>;
  reportNow: () => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const requestReport = async () => { setRequesting(true); try { await reportNow(); } finally { setRequesting(false); } };
  const reportDisabled = disabled || saving || requesting || !!reportState;
  const cadence = minutes === 60 ? '1h' : minutes > 0 ? `${minutes}min` : 'Never';
  const feedback = <>
    {((!compact && minutes > 0) || reportState || settingPending) && <p className="field-note" role="status">{reportState === 'queued' ? paused ? 'Report queued. Delivery is paused with the coordinator.' : 'Report queued for the next safe checkpoint. Pending questions stay open.' : reportState === 'generating' ? 'Generating task report…' : settingPending ? paused ? 'Reporting update queued. Delivery is paused with the coordinator.' : 'Reporting update queued for this agent.' : 'Command Center schedules reports at this interval. Request prompts stay hidden.'}</p>}
    {error && <p className="error-text" role="alert">{error} Check the agent before requesting another report.</p>}
  </>;
  return <section className={`worker-settings${compact ? ' compact' : ''}`} aria-label="Worker specific settings">
    <details className="worker-settings-disclosure" open={!compact}>
      <summary className="worker-settings-summary">Worker settings <span className="worker-settings-cadence">Reports: {cadence}</span></summary>
      <h3 className="context-label">Worker specific settings</h3>
      <fieldset disabled={disabled || saving}>
        <legend>Task report every</legend>
        <div className="report-options">{[[60, '1h'], [15, '15min'], [5, '5min'], [0, 'Never']].map(([value, label]) =>
          <label key={value}><input type="radio" name={`report-interval-${agentId}`} value={value}
            checked={minutes === value} onChange={async () => {
              setSaving(true); try { await save(Number(value)); } finally { setSaving(false); }
            }} /><span>{label}</span></label>)}<button type="button" className="button subtle small worker-report-desktop" disabled={reportDisabled} onClick={requestReport}>{requesting ? 'Queuing…' : 'Report now'}</button></div>
      </fieldset>
      {!compact && feedback}
      {children}
    </details>
    <button type="button" className="button subtle small worker-report-mobile" disabled={reportDisabled} onClick={requestReport}>{requesting ? 'Queuing…' : 'Report now'}</button>
    {compact && feedback}
  </section>;
}
