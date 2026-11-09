import React, { useState } from 'react';

type ReportRequestResult = { detailed: boolean; upgradeUnavailable?: boolean; alreadyPending?: boolean; queued?: boolean; state?: 'queued' | 'generating' | null };

export function WorkerSettings({ agentId, minutes = 0, compact = false, disabled, paused, error, reportState, settingPending, save, reportNow, children }: {
  agentId: string; minutes?: number; disabled: boolean; paused: boolean; error?: string | null;
  compact?: boolean;
  reportState?: 'queued' | 'generating' | null; settingPending?: boolean;
  save: (minutes: number) => Promise<boolean>;
  reportNow: (detailed: boolean) => Promise<ReportRequestResult>;
  children?: React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [requestNotice, setRequestNotice] = useState('');
  const [requestError, setRequestError] = useState('');
  const reportDisabled = disabled || saving || requesting || !!reportState;
  const requestReport = async () => {
    if (reportDisabled) return;
    setRequesting(true); setRequestNotice(''); setRequestError('');
    try {
      const result = await reportNow(detailed);
      if (result?.upgradeUnavailable) setRequestNotice('The current report request cannot be changed. Check its status before requesting a detailed report.');
      else if (typeof result?.detailed === 'boolean') setRequestNotice(result.detailed ? 'Detailed report request accepted.' : 'Standard report request accepted.');
    } catch (problem) { setRequestError((problem as Error).message); }
    finally { setRequesting(false); }
  };
  const detailedChoice = <label title="Include up to 10 evidenced recent actions per in-progress task, with available timestamps."><input type="checkbox" checked={detailed} disabled={reportDisabled} onChange={event => setDetailed(event.target.checked)} /><span>Detailed report</span></label>;
  const cadence = minutes === 60 ? '1h' : minutes > 0 ? `${minutes}min` : 'Never';
  const feedback = <>
    {((!compact && minutes > 0) || reportState || settingPending || requestNotice) && <p className="field-note" role="status">{requestNotice && <>{requestNotice} </>}{reportState === 'queued' ? paused ? 'Report queued. Delivery is paused with the coordinator.' : 'Report queued for the next safe checkpoint. Pending questions stay open.' : reportState === 'generating' ? 'Report requested; waiting for response.' : settingPending ? paused ? 'Reporting update queued. Delivery is paused with the coordinator.' : 'Reporting update queued for this agent.' : !compact && minutes > 0 ? 'Command Center schedules reports at this interval. Request prompts stay hidden.' : ''}</p>}
    {(requestError || error) && <p className="error-text" role="alert">{requestError || error} Check the agent before requesting another report.</p>}
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
            }} /><span>{label}</span></label>)}<span className="report-options worker-report-desktop"><button type="button" className="button subtle small" disabled={reportDisabled} onClick={requestReport}>{requesting ? 'Queuing…' : 'Report now'}</button>{detailedChoice}</span></div>
      </fieldset>
      {!compact && feedback}
      {children}
    </details>
    <div className="worker-report-mobile"><div className="report-options"><button type="button" className="button subtle small" disabled={reportDisabled} onClick={requestReport}>{requesting ? 'Queuing…' : 'Report now'}</button>{detailedChoice}</div></div>
    {compact && feedback}
  </section>;
}
