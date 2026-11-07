export const RECAP_WORD_TARGET = 20;
export const RECAP_WORD_LIMIT = 25;
const fields = ['summary', 'blocker', 'nextStep'];
const normalized = value => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
const wordCount = value => value ? value.split(' ').length : 0;

export function progressWordCount(progress) {
  return fields.reduce((total, field) => total + wordCount(normalized(progress[field])), 0);
}

// Keep old recaps readable without cutting a qualification or user decision in
// half. The caller retains the full source in an explicit details control.
export function compactProgressRecap(progress) {
  const result = Object.fromEntries(fields.map(field => [field, normalized(progress[field])]));
  if (progressWordCount(result) <= RECAP_WORD_LIMIT) return { ...result, condensed: false };
  if (result.blocker) return {
    summary: '', nextStep: '', condensed: true,
    blocker: wordCount(result.blocker) <= RECAP_WORD_LIMIT ? result.blocker
      : 'A blocker needs attention. Open the full recap for its complete context.',
  };
  if (result.summary && wordCount(result.summary) <= RECAP_WORD_LIMIT) return { summary: result.summary, blocker: '', nextStep: '', condensed: true };
  if (result.nextStep && wordCount(result.nextStep) <= RECAP_WORD_LIMIT) return { summary: '', blocker: '', nextStep: result.nextStep, condensed: true };
  return { summary: 'A detailed progress update is available. Open the full recap.', blocker: '', nextStep: '', condensed: true };
}
