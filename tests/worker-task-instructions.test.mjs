import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKER_BASE_INSTRUCTIONS, WORKER_REPORT_INSTRUCTIONS, WORKER_QUESTION_INSTRUCTIONS } from '../server/worker-instructions.mjs';

const heading = '## Task lifecycle\n';
const section = WORKER_BASE_INSTRUCTIONS.split(heading)[1]?.split('\n## ')[0];

test('ordinary task lifecycle guidance remains worker-scoped with existing report and question rules', () => {
  assert.ok(section, 'the runtime-loaded worker instruction source contains the task lifecycle section');
  assert.ok(WORKER_BASE_INSTRUCTIONS.indexOf(heading) < WORKER_BASE_INSTRUCTIONS.indexOf('## Standard Task Report\n'));
  assert.doesNotMatch(WORKER_REPORT_INSTRUCTIONS, /## Task lifecycle|withdrew native Goal integration/);
  assert.doesNotMatch(WORKER_QUESTION_INSTRUCTIONS, /## Task lifecycle|withdrew native Goal integration/);
  assert.match(WORKER_REPORT_INSTRUCTIONS, /high-priority user request/);
  assert.match(WORKER_QUESTION_INSTRUCTIONS, /structured request-user-input\/question tool/);
});

test('Goal automation and its announcement are withdrawn without a replacement continuation mechanism', () => {
  assert.match(section, /The user withdrew native Goal integration and its announcement format/);
  assert.match(section, /Do not\nstart, resume or require native Goals as part of this workflow/);
  assert.match(section, /or replace them\nwith a custom continuation loop, dispatcher or fallback scheduler/);
  assert.match(section, /Preserve\nexplicit native pause and stop instructions/);
  assert.doesNotMatch(WORKER_BASE_INSTRUCTIONS, /## Native Goals|\*\*New Goal:\*\*|\*\*Task title:\*\*|\*\*Beads ID:\*\*|standing user instruction authorizes a supported native Goal|Inspect the current native Goal before starting another|Only after the supported native Goal tool confirms creation/);
});

test('authorized work retains clarified Beads outcomes without requiring native Goals', () => {
  assert.match(section, /already authorized in this conversation/);
  assert.match(section, /record its clarified outcome and acceptance criteria/);
  assert.match(section, /Keep dependent or\ndeferred work visible using its actual Beads state and dependencies/);
});

test('task lifecycle reconsideration preserves verification, authorized parallel work and blocked stopping rules', () => {
  assert.match(section, /completion, blocking, input waits, deferral,\nwithdrawal, failure, reopening or unblocking/);
  assert.match(section, /Close tasks only when their\nown outcomes are verified/);
  assert.match(section, /answered question is resolved only after its\nactual answer is processed/);
  assert.match(section, /inspect newly ready work within the existing\nuser authorization/);
  assert.match(section, /delegate independent\nstreams under the native concurrency limits/);
  assert.match(section, /If all remaining authorized work is blocked, report the exact input\nor external condition needed and stop/);
  assert.match(section, /Do not keep an empty loop running to\nmanufacture progress/);
  assert.match(section, /Status-only and Standard Task Report requests do not\nauthorize additional work/);
});
