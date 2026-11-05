import React, { useEffect, useState } from 'react';

export type WorkerModel = { model: string; displayName: string; description: string; defaultEffort: string | null; efforts: { value: string; description: string }[] };
type Settings = { models: WorkerModel[]; model: string | null; effort: string | null; change?: { model: string; effort: string | null; status: string; error?: string } | null };

export function ModelControls({ models, model, effort, disabled, chooseModel, chooseEffort }: {
  models: WorkerModel[]; model: string; effort: string | null; disabled: boolean;
  chooseModel: (value: string) => void; chooseEffort: (value: string) => void;
}) {
  const selected = models.find(option => option.model === model);
  return <fieldset className="worker-model-controls" disabled={disabled}>
    <label><span>Model</span><select aria-label="Worker model" value={model} onChange={event => chooseModel(event.target.value)}>
      {!selected && <option value={model}>{model || 'Choose a model…'}</option>}
      {models.map(option => <option key={option.model} value={option.model}>{option.displayName}</option>)}
    </select></label>
    <label><span>Reasoning effort</span><select aria-label="Worker reasoning effort" disabled={disabled || !selected?.efforts.length} value={effort || ''} onChange={event => chooseEffort(event.target.value)}>
      {!selected?.efforts.some(option => option.value === effort) && <option value="">{selected?.efforts.length ? 'Choose effort…' : 'Not available'}</option>}
      {selected?.efforts.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}
    </select></label>
    {selected?.efforts.find(option => option.value === effort)?.description && <p className="field-note">{selected.efforts.find(option => option.value === effort)!.description}</p>}
  </fieldset>;
}

export function WorkerModelSettings({ agentId, connected, currentModel, currentEffort, change, load, save }: {
  agentId: string; connected: boolean; currentModel: string | null; currentEffort?: string | null;
  change?: Settings['change']; load: () => Promise<Settings>;
  save: (choice: { model: string; effort: string | null }) => Promise<unknown>;
}) {
  const [models, setModels] = useState<WorkerModel[]>([]); const [model, setModel] = useState(currentModel || '');
  const [effort, setEffort] = useState(currentEffort || null); const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const refresh = async () => {
    setLoading(true); setError('');
    try { const data = await load(); setModels(data.models); if (!dirty) { setModel(data.model || ''); setEffort(data.effort); } }
    catch (problem) { setError((problem as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { if (connected) void refresh(); else setLoading(false); }, [agentId, connected]);
  useEffect(() => { if (!dirty) { setModel(currentModel || ''); setEffort(currentEffort || null); } }, [currentModel, currentEffort]);
  useEffect(() => { if (change?.status === 'saved') setError(''); }, [change?.status]);
  const selected = models.find(option => option.model === model);
  const valid = !!selected && (!selected.efforts.length || selected.efforts.some(option => option.value === effort));
  return <form className="worker-model-settings" onSubmit={async event => {
    event.preventDefault(); if (!valid || saving || !connected) return;
    setSaving(true); setError('');
    try { await save({ model, effort: selected!.efforts.length ? effort : null }); setDirty(false); }
    catch (problem) { setError((problem as Error).message); } finally { setSaving(false); }
  }}>
    <ModelControls models={models} model={model} effort={effort} disabled={!connected || loading || saving || change?.status === 'pending'} chooseModel={value => { const next = models.find(option => option.model === value); setModel(value); setEffort(next?.efforts.some(option => option.value === effort) ? effort : next?.defaultEffort || next?.efforts[0]?.value || null); setDirty(true); }} chooseEffort={value => { setEffort(value); setDirty(true); }} />
    <p className="field-note" role="status">{loading ? 'Loading native model choices…' : change?.status === 'pending' ? 'Change requested; waiting for native confirmation. Current work continues.' : change?.status === 'unconfirmed' ? 'Native confirmation is missing. Refresh choices to check the saved settings before retrying.' : change?.status === 'saved' ? 'Saved for subsequent turns. Current work is not interrupted.' : 'Changes apply to subsequent turns for this worker.'}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="button-row"><button className="button subtle small" disabled={!connected || !dirty || !valid || saving || change?.status === 'pending'}>{saving ? 'Saving…' : 'Save model settings'}</button><button type="button" className="button subtle small" disabled={!connected || loading || saving} onClick={() => void refresh()}>Refresh choices</button></div>
  </form>;
}
