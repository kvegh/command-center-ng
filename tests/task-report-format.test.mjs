import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_STATUSES, REPORT_FORMAT_INSTRUCTIONS, taskReportFormatError } from '../server/task-report-format.mjs';
import { WORKER_BASE_INSTRUCTIONS, WORKER_REPORT_REQUEST, WORKER_DETAILED_REPORT_REQUEST } from '../server/worker-instructions.mjs';

const header = '| Task | Status | Outcome / next step |\n| --- | --- | --- |';
const release = 'Release: 1.2.3; publication: verified source; deployment: unverified.';
const report = `${header}\n| Build application | 🟨 In progress | Finish validation. |\n\n${release}`;

test('task reports use all canonical coloured statuses without inferring task truth', () => {
  for (const status of REPORT_STATUSES) assert.equal(taskReportFormatError(report.replace('🟨 In progress', status)), null);
  assert.equal(taskReportFormatError('## Standard Task Report\n\n' + report), null);
  assert.equal(taskReportFormatError(report.replaceAll('\n', '\r\n')), null);
  assert.equal(taskReportFormatError(report + '\n\n### Build application (example-1)\n  - Time unknown — Started validation; outcome unknown.'), null, 'detailed history follows the normal overview');
});

test('empty and unavailable task lists use explicit truthful empty formats', () => {
  for (const summary of ['Tasks: none in scope.', 'Tasks: unavailable — Existing task evidence is missing.']) {
    assert.equal(taskReportFormatError(`${header}\n\n${summary}\n${release}`), null);
  }
  for (const summary of ['', 'Tasks: unavailable — ', 'Tasks: none.', '| None | 🟩 Done | |']) {
    assert.notEqual(taskReportFormatError(`${header}\n\n${summary}\n${release}`), null);
  }
});

test('reports require exact columns, populated cells, canonical statuses and release evidence', () => {
  for (const text of [
    report.replace('Outcome / next step', 'Notes'), report.replace('| --- | --- | --- |', '| --- | --- |'),
    report.replace('Build application', ''), report.replace('Finish validation.', ''),
    report.replace('🟨 In progress', 'In progress'), report.replace('🟨 In progress', '🟩 In progress'),
    report.replace('Finish validation.', 'Finish | validation.'), report.replace('Finish validation.', '** **'),
    report.replace('\n\nRelease:', '\nRelease:'), report.replace(release, ''),
    report.replace('; publication: verified source', ''), report.replace('; deployment: unverified.', ''),
    report.replace('publication: verified source', 'publication: '),
    '- 🟩 Done: Released.\n- 🟨 In progress: Build.\n- 🟦 Next: Verify.',
    report + 'x'.repeat(32_000), null
  ]) assert.notEqual(taskReportFormatError(text), null, String(text).slice(0, 150));
});

test('escaped pipes inside task and outcome cells preserve a three-column GFM table', () => {
  assert.equal(taskReportFormatError(report.replace('Build application', 'Build A \\| B').replace('Finish validation.', '`result \\| expected`')), null);
  assert.equal(taskReportFormatError(report.replace('Finish validation.', 'Path ends in \\\\')), null, 'even backslashes leave the closing pipe a delimiter');
  assert.notEqual(taskReportFormatError(report.replace('Finish validation. |', 'Finish validation. \\|')), null, 'escaped closing pipe is content, not a delimiter');
});

test('quoted, code, comment and preamble examples cannot acknowledge a visible table report', () => {
  for (const text of [
    report.split('\n').map(line => '> ' + line).join('\n'),
    report.split('\n').map(line => '    ' + line).join('\n'),
    '```markdown\n' + report + '\n```', '~~~markdown\n' + report + '\n~~~',
    '```text\n```still-code\n' + report + '\n```',
    '`\n' + report + '\n`', '<!--\n' + report + '\n-->',
    'Here is an example:\n\n' + report, '## Other heading\n\n' + report,
    report.split('\n').reverse().join('\n')
  ]) assert.notEqual(taskReportFormatError(text), null);
});

test('base and every report trigger carry the fixed schema for new and already active workers', () => {
  for (const text of [WORKER_BASE_INSTRUCTIONS, WORKER_REPORT_REQUEST, WORKER_DETAILED_REPORT_REQUEST]) {
    for (const value of REPORT_STATUSES) assert.ok(text.includes(value), value);
    for (const value of ['| Task | Status | Outcome / next step |', '| --- | --- | --- |', 'Tasks: none in scope.', 'Tasks: unavailable — <reason>.', 'Release:', 'publication:', 'deployment:']) assert.ok(text.includes(value), value);
    assert.match(text, /[Ss]tart the reply/);
    assert.match(text, /blank line/);
    assert.match(text, /Format validation does not establish factual correctness/);
  }
  assert.ok(WORKER_REPORT_REQUEST.includes(REPORT_FORMAT_INSTRUCTIONS));
  assert.ok(WORKER_DETAILED_REPORT_REQUEST.includes(REPORT_FORMAT_INSTRUCTIONS));
  assert.match(WORKER_REPORT_REQUEST, /known evidence without additional commands/);
  assert.match(WORKER_DETAILED_REPORT_REQUEST, /bounded read-only lookups/);
});
