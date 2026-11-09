export const SUMMARY_LIMIT = 2000;
export const SUMMARY_REQUEST = 'Prepare a concise handoff summary of this branch for its parent conversation.';
export const HANDOFF_CHECKPOINT_REQUEST = 'Prepare branch handback at the next safe checkpoint.';
export const SUMMARY_SCHEMA = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false };

export function summaryPrompt(goal, tasks = []) {
  return `${SUMMARY_REQUEST}
Branch task: ${goal}
${tasks.length ? 'Linked Beads tasks (stored states, not inferred completion): ' + JSON.stringify(tasks.map(task => ({ id: task.id, title: task.text, status: task.state }))) + '\nInclude relevant task IDs and unfinished work in the handoff. Do not change task states as part of this summary request.' : ''}
Use your existing conversation context. Summarize the branch's conclusions, decisions and their reasons, work or verification completed, unresolved questions, and useful next steps. Include only the points that apply. Preserve exact external running-job IDs and monitoring ownership if any work continues outside this native session. Distinguish confirmed results from proposals or incomplete work. Omit inherited background, chat transcripts, long quotations, commands, and implementation logs.
Return at most 200 words and ${SUMMARY_LIMIT} characters in the summary field. Do not perform more work, call tools, modify files, or start subagents. This request is only to summarize the discussion already held.`;
}

export function isBranchControlMessage(text) {
  return String(text).startsWith(SUMMARY_REQUEST) || String(text).startsWith(HANDOFF_CHECKPOINT_REQUEST) || String(text).startsWith('Branch summary from "');
}

export function readSummary(text) {
  let summary;
  try { summary = JSON.parse(text).summary; } catch { /* Report invalid model output below. */ }
  if (typeof summary !== 'string' || !summary.trim() || summary.trim().length > SUMMARY_LIMIT) throw Object.assign(new Error('Codex did not return a concise summary. Try preparing it again.'), { status: 502 });
  return summary.trim();
}
