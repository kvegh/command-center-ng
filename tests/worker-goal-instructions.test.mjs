import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKER_BASE_INSTRUCTIONS, WORKER_REPORT_INSTRUCTIONS, WORKER_QUESTION_INSTRUCTIONS } from '../server/worker-instructions.mjs';

const heading = '## Native Goals and task lifecycle\n';
const section = WORKER_BASE_INSTRUCTIONS.split(heading)[1]?.split('\n## ')[0];

test('native Goal guidance is included for workers without leaking into coordinator report or question fragments', () => {
  assert.ok(section, 'the runtime-loaded worker instruction source contains the Goal lifecycle section');
  assert.ok(WORKER_BASE_INSTRUCTIONS.indexOf(heading) < WORKER_BASE_INSTRUCTIONS.indexOf('## Standard Task Report\n'));
  assert.doesNotMatch(WORKER_REPORT_INSTRUCTIONS, /Native Goals and task lifecycle|standing user instruction authorizes/);
  assert.doesNotMatch(WORKER_QUESTION_INSTRUCTIONS, /Native Goals and task lifecycle|standing user instruction authorizes/);
  assert.match(WORKER_REPORT_INSTRUCTIONS, /high-priority user request/);
  assert.match(WORKER_QUESTION_INSTRUCTIONS, /structured request-user-input\/question tool/);
});

test('clarified authorized work gets a truthful Goal announcement only after native confirmation', () => {
  assert.match(section, /already authorized in this conversation/);
  assert.match(section, /record its clarified outcome and acceptance criteria/);
  assert.match(section, /Only after the supported native Goal tool confirms creation, announce the Goal\nin chat as its own message using exactly these three lines/);
  assert.ok(section.includes('**New Goal:** $actual objective\n**Task title:** $task title\n**Beads ID:** $id'));
  assert.match(section, /Do not add a state or finish-check line to this announcement/);
  assert.match(section, /Until native\nconfirmation, explain proposed, pending or unavailable work separately in plain\ntext/);
  assert.match(section, /never use the New Goal announcement for an unconfirmed or reused Goal/);
  assert.match(section, /reports and creating a Beads record alone are\nnot requests to start a new Goal/);
});

test('one unfinished native Goal retains its accounting and explicit pause while other work stays queued', () => {
  assert.match(section, /Inspect the current native Goal before starting another/);
  assert.match(section, /one\nunfinished Goal/);
  assert.match(section, /preserving its objective,\nbudgets and usage accounting/);
  assert.match(section, /keep that task\nqueued and visible in Beads/);
  assert.match(section, /Do not\nfalsely complete, clear or reset the current Goal/);
  assert.match(section, /never automatically resume a Goal because a view opens, the backend restarts\nor a task record changes/);
  assert.match(section, /do not replace it with a custom dispatcher, fallback scheduler or clock loop/);
});

test('task lifecycle reconsideration preserves scope and native stopping rules without report-driven Goal changes', () => {
  assert.match(section, /completion, blocking, input waits, deferral,\nwithdrawal, failure, reopening or unblocking/);
  assert.match(section, /Completing a native Goal\ndoes not automatically close every linked task/);
  assert.match(section, /inspect newly ready work within the existing\nuser authorization/);
  assert.match(section, /delegate independent\nstreams under the native concurrency limits/);
  assert.match(section, /If all remaining authorized work is blocked, report the exact input\nor external condition needed and stop/);
  assert.match(section, /native blocked state only when\nits own transition\/stopping criteria permit/);
  assert.match(section, /Status-only and Standard Task Report requests must not set or complete Goals/);
});
