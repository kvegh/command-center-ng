import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Workspace } from '../server/workspace.mjs';
import { WORKER_BASE_INSTRUCTIONS, WORKER_AAP_REFERENCE_INSTRUCTIONS, WORKER_REPORT_INSTRUCTIONS, WORKER_QUESTION_INSTRUCTIONS } from '../server/worker-instructions.mjs';

const heading = '## Readable AAP references\n';

test('the runtime export contains exactly the saved AAP rule before task lifecycle guidance', async () => {
  const markdown = await readFile(new URL('../server/worker-instructions.md', import.meta.url), 'utf8');
  assert.equal(WORKER_BASE_INSTRUCTIONS, markdown);
  assert.equal(markdown.split(heading).length, 2);
  const start = markdown.indexOf(heading) + heading.length;
  const end = markdown.indexOf('## Task lifecycle\n', start);
  assert.ok(end > start);
  assert.equal(WORKER_AAP_REFERENCE_INSTRUCTIONS, markdown.slice(start, end).trim());
  assert.ok(WORKER_AAP_REFERENCE_INSTRUCTIONS.length > 0);
  assert.doesNotMatch(WORKER_AAP_REFERENCE_INSTRUCTIONS, /## Task lifecycle|## Standard Task Report|## Structured questions/);
  assert.doesNotMatch(WORKER_REPORT_INSTRUCTIONS + WORKER_QUESTION_INSTRUCTIONS, /## Readable AAP references|each referenced object ID/);
});

test('AAP instructions pair actual names with IDs across jobs, workflows and related resources', () => {
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /procedures, progress\/results, reports and input requests/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /each referenced object ID with its verified readable name/);
  for (const category of ['jobs', 'job templates', 'workflow templates and runs', 'projects', 'inventories', 'hosts', 'credentials', 'other AAP objects']) {
    assert.ok(WORKER_AAP_REFERENCE_INSTRUCTIONS.includes(category), category);
  }
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /actual job template and include the job's own name when it\ndiffers/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /workflow run, do the same with its actual workflow template and\nrun name/);
  for (const example of ['Job <id> — <actual job-template name>', 'Inventory <id> — <actual inventory name>', 'Credential <id> — <actual credential name>']) {
    assert.ok(WORKER_AAP_REFERENCE_INSTRUCTIONS.includes(example), example);
  }
  assert.doesNotMatch(WORKER_AAP_REFERENCE_INSTRUCTIONS, /\d/, 'published examples contain placeholder IDs only');
});

test('ad hoc and unavailable names stay truthful without requesting secrets or granting authority', () => {
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /ad hoc job without a job template/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /Ad hoc job <id> — <verified readable purpose>/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /do not invent a template/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /existing authorized evidence/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /<object type> <id> — name unavailable/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /do not guess or request secret\ncredential values/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /without real environment names or protected values/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /reporting rule only/);
  assert.match(WORKER_AAP_REFERENCE_INSTRUCTIONS, /no additional AAP access, configuration\nchange, diagnostic scope, native permission or model change/);
});

test('actual worker instruction context carries the rule for Codex and Claude without granting worker context to Coordinator', async () => {
  const workspace = { beads: null };
  for (const provider of ['codex', 'claude']) {
    const agent = { id: `example-${provider}`, provider, role: 'worker', cwd: '/synthetic-aap-project', reportIntervalMinutes: 0 };
    const context = await Workspace.prototype.instructionContext.call(workspace, agent);
    const worker = context['command-center-worker-instructions'];
    assert.equal(worker.kind, 'application');
    assert.ok(worker.value.includes(WORKER_AAP_REFERENCE_INSTRUCTIONS));
    assert.match(worker.value, /Current saved Standard Task Report interval: Never/);
    assert.equal(context['command-center-report-instructions'], undefined);
  }
  const coordinator = { id: 'example-coordinator', role: 'coordinator', cwd: '/synthetic-aap-project' };
  const context = await Workspace.prototype.instructionContext.call(workspace, coordinator);
  assert.equal(context['command-center-worker-instructions'], undefined, 'Coordinator receives its own separately assembled prompt');
  assert.equal(context['command-center-report-instructions'].value, WORKER_REPORT_INSTRUCTIONS);
});
