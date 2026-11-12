export const REPORT_STATUSES = [
  '🟩 Done', '🟨 In progress', '🟥 Blocked', '🟥 Needs input', '🟥 Failed',
  '🟪 On hold', '🟦 Queued', '🟧 Deferred', '⬜ Unknown'
];

export const REPORT_FORMAT_INSTRUCTIONS = `Start the reply with this exact Markdown table header and separator (an optional ## Standard Task Report heading may precede it):
| Task | Status | Outcome / next step |
| --- | --- | --- |
Write one actual task per row, with a nonempty task name and outcome or next step. Use exactly one status per row: ${REPORT_STATUSES.join(', ')}. Keep the coloured marker and readable label together; do not use a bullet overview. Escape any literal pipe inside a cell as \\|. End the table with a blank line, then write: Release: <latest version or unknown>; publication: <evidence or unknown>; deployment: <verified scope or unverified>. Separate a newer working version from the latest release and never substitute CCNG's version for another project. If no tasks are in scope, leave the table without data rows and write Tasks: none in scope. before the Release line. If the task list is unavailable, use the empty table followed by Tasks: unavailable — <reason>. and the Release line. Never invent placeholder tasks. Format validation does not establish factual correctness.`;

function cells(line) {
  if (!line?.startsWith('|') || !line.endsWith('|')) return null;
  // A pipe is a delimiter only after an even number of backslashes, as in GFM.
  const parts = [];
  let start = 0, escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '|' && !escaped) { parts.push(line.slice(start, index)); start = index + 1; }
    escaped = character === '\\' ? !escaped : false;
  }
  parts.push(line.slice(start));
  if (parts.length !== 5 || parts[0] !== '' || parts[4] !== '') return null;
  return parts.slice(1, -1).map(value => value.trim());
}

const hasContent = value => !!value.replace(/[*_`\s]/g, '');
const releasePattern = /^Release:\s*\S.*; publication:\s*\S.*; deployment:\s*\S.*$/;

// This checks presentation only. Task truth and release evidence remain the
// worker's responsibility; a valid table is not proof of completed project work.
export function taskReportFormatError(text) {
  if (typeof text !== 'string' || text.length > 32_000) return 'Use a report within 32,000 characters.';
  const lines = text.split(/\r?\n/).map(line => line.trimEnd());
  let header = 0;
  while (lines[header] === '') header++;
  if (lines[header] === '## Standard Task Report') {
    header++;
    while (lines[header] === '') header++;
  }
  // A fixed overview at the beginning avoids recognizing tables inside code,
  // quotes, comments or another Markdown container as a visible task report.
  if (lines[header] !== '| Task | Status | Outcome / next step |') return 'Start with the table header | Task | Status | Outcome / next step | (optional ## Standard Task Report heading).';
  const separator = cells(lines[header + 1]);
  if (!separator?.every(value => /^:?-{3,}:?$/.test(value))) return 'Put a three-column Markdown separator directly below the report header.';
  let index = header + 2, rows = 0;
  while (lines[index]?.startsWith('|')) {
    const row = cells(lines[index]);
    if (!row || !hasContent(row[0]) || !hasContent(row[2])) return 'Each task row needs exactly three cells, a task name and an outcome or next step.';
    if (!REPORT_STATUSES.includes(row[1])) return 'Use a canonical coloured status: ' + REPORT_STATUSES.join(', ') + '.';
    rows++; index++;
  }
  if (lines[index] !== '') return 'End the task table with a blank line before the task-list or Release: evidence line.';
  while (lines[index] === '') index++;
  if (!rows) {
    if (lines[index] !== 'Tasks: none in scope.' && !/^Tasks: unavailable — \S.*$/.test(lines[index] || '')) return 'An empty table needs Tasks: none in scope. or Tasks: unavailable — <reason>.';
    index++;
    while (lines[index] === '') index++;
  }
  if (!releasePattern.test(lines[index] || '')) return 'Follow the table with Release: <version or unknown>; publication: <evidence or unknown>; deployment: <verified scope or unverified>.';
  return null;
}
