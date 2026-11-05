const fail = message => Object.assign(new Error(message), { status: 400 });

export async function readModelCatalog(rpc) {
  const models = []; const cursors = new Set(); let cursor;
  for (let page = 0; page < 20; page++) {
    const result = await rpc.call('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(result.data)) throw fail('The native runtime returned an invalid model catalog.');
    for (const row of result.data) {
      if (row.hidden || typeof row.model !== 'string' || models.some(model => model.model === row.model)) continue;
      models.push({ model: row.model, displayName: row.displayName || row.model, description: row.description || '', defaultEffort: row.defaultReasoningEffort || null, efforts: (row.supportedReasoningEfforts || []).filter(option => typeof option.reasoningEffort === 'string').map(option => ({ value: option.reasoningEffort, description: option.description || '' })) });
    }
    if (!result.nextCursor) return models;
    if (cursors.has(result.nextCursor)) throw fail('The native model catalog repeated a pagination cursor.');
    cursor = result.nextCursor; cursors.add(cursor);
  }
  throw fail('The native model catalog exceeds the supported size.');
}

export function validateModelChoice(models, choice) {
  if (!choice || typeof choice !== 'object' || Array.isArray(choice) || Object.keys(choice).some(key => !['model', 'effort'].includes(key))) throw fail('Choose only a model and reasoning effort.');
  const model = models.find(row => row.model === choice.model);
  if (!model) throw fail('Choose a model offered by the native runtime.');
  if (model.efforts.length ? !model.efforts.some(option => option.value === choice.effort) : choice.effort !== null) throw fail('Choose a supported reasoning effort for this model.');
  return { model: model.model, ...(choice.effort !== null ? { effort: choice.effort } : {}) };
}
