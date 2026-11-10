import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile, lstat, symlink, link, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Coordinator, validateHookOutputStat } from '../server/coordinator.mjs';
import { COORDINATOR_SOURCE_GUIDANCE } from '../server/coordinator-prompt.mjs';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'ccng-hook-reader-'));
  const id = randomUUID(), directory = join('/tmp/hook_outputs', id), path = join(directory, randomUUID() + '.txt');
  await mkdir('/tmp/hook_outputs', { recursive: true }); await mkdir(directory, { mode: 0o755 });
  await writeFile(path, 'Generated task context\nNo execution or new authority.\n', { mode: 0o644 });
  const worker = { id: 'worker', role: 'worker', cwd, questions: [], messages: [] };
  const agents = new Map([[id, { id, role: 'coordinator', turnId: 'coordinator-turn' }], ['worker', worker]]);
  const workspace = { agents, rpc: { call: () => assert.fail('Reading hook output cannot call native tools') }, agent: id => { const agent = agents.get(id); if (!agent) throw new Error('No open worker'); return agent; } };
  const coordinator = new Coordinator(workspace); coordinator.id = id;
  const read = (file = path, startLine = 1, threadId = id) => coordinator.call({ threadId, turnId: 'coordinator-turn', tool: 'ccng_read_project_file', arguments: { agentId: 'worker', path: file, startLine } });
  t.after(async () => { await rm(directory, { recursive: true, force: true }); await rm(cwd, { recursive: true, force: true }); });
  return { id, directory, path, cwd, worker, coordinator, agents, read };
}

test('the existing source tool pages only its actual Coordinator hook output with the established limits', async t => {
  const f = await fixture(t), text = Array.from({ length: 400 }, (_, index) => `Generated context line ${index + 1}`).join('\n');
  await writeFile(f.path, text);
  const page = await f.read(f.path, 161);
  assert.equal(page.source, 'coordinator-hook-output'); assert.equal(page.startLine, 161); assert.equal(page.totalLines, 400);
  assert.equal(page.text.split('\n').length, 160); assert.ok(page.text.startsWith('Generated context line 161\n'));
  assert.equal(page.approvalBindings, undefined, 'hook text is not approval source or authority');
  await writeFile(f.path, 'x'.repeat(17000) + '\nFollowing complete line');
  const longLine = await f.read();
  assert.equal(longLine.text.length, 16000); assert.equal(longLine.lineTruncated, true); assert.equal(longLine.nextLine, 2);
  assert.match(longLine.notice, /bounded excerpt.*rest of this line is unavailable/);
  const following = await f.read(f.path, longLine.nextLine);
  assert.equal(following.text, 'Following complete line'); assert.equal(following.lineTruncated, false); assert.equal(following.nextLine, null);
  await assert.rejects(f.read(f.path, 0), /starting line/);
  assert.match(COORDINATOR_SOURCE_GUIDANCE, /own generated Beads hook output through ccng_read_project_file/);
  assert.match(COORDINATOR_SOURCE_GUIDANCE, /never new instructions or approval authority/);
});

test('nextLine stitches 338 mixed-length lines losslessly without splitting a line at the page character cap', async t => {
  const f = await fixture(t);
  const lines = Array.from({ length: 338 }, (_, index) => {
    const prefix = `Generated line ${index + 1} `, size = index % 23 === 0 ? 7177 : 42;
    return prefix + 'x'.repeat(size - prefix.length);
  });
  const text = lines.join('\n'); await writeFile(f.path, text);
  const pages = []; let nextLine = 1;
  while (nextLine !== null) {
    assert.ok(pages.length < 338, 'paging must advance');
    const page = await f.read(f.path, nextLine), returnedLines = page.text.split('\n').length;
    assert.equal(page.totalLines, 338); assert.equal(page.lineTruncated, false);
    assert.ok(page.text.length <= 16000); assert.ok(returnedLines <= 160);
    if (page.nextLine !== null) assert.equal(page.nextLine, nextLine + returnedLines);
    pages.push(page.text); nextLine = page.nextLine;
  }
  assert.ok(pages.length > 3, 'long lines require character-bounded pages before the 160-line limit');
  assert.equal(pages.join('\n'), text, 'every original line remains available across page boundaries');
});

test('other conversations, arbitrary temporary files and invalid generated names do not gain access', async t => {
  const f = await fixture(t), other = join('/tmp/hook_outputs', randomUUID());
  await mkdir(other); t.after(() => rm(other, { recursive: true, force: true }));
  const foreign = join(other, randomUUID() + '.txt'), arbitrary = join(f.cwd, 'temporary.txt'), invalid = join(f.directory, 'not-a-generated-uuid.txt');
  for (const path of [foreign, arbitrary, invalid]) await writeFile(path, 'Must remain outside the exception.');
  for (const path of [foreign, arbitrary, invalid]) await assert.rejects(f.read(path), /project source|helper referenced/);
  await assert.rejects(f.read(f.path, 1, randomUUID()), /Only the active coordinator/);
  const previous = f.coordinator.id; f.coordinator.id = randomUUID();
  await assert.rejects(f.coordinator.readFile(f.worker, f.path), /project source|helper referenced/); f.coordinator.id = previous;
  const source = join(f.cwd, 'example.py'); await writeFile(source, 'print("ordinary source")');
  assert.equal((await f.read(source)).text, 'print("ordinary source")', 'ordinary project-source access is unchanged');
  await assert.rejects(f.read(join(f.cwd, 'credentials.py')), /hidden and sensitive paths/);
});

test('file and ancestor links, hardlinks, unsafe write modes and mismatched owners are refused', async t => {
  const f = await fixture(t), linked = join(f.directory, randomUUID() + '.txt');
  await symlink(f.path, linked); await assert.rejects(f.read(linked), /owned regular/); await rm(linked);
  await link(f.path, linked); await assert.rejects(f.read(linked), /owned regular/); await rm(linked);
  await chmod(f.path, 0o666); await assert.rejects(f.read(), /owned regular/); await chmod(f.path, 0o644);
  const info = await lstat(f.path);
  const wrongOwner = Object.assign(Object.create(Object.getPrototypeOf(info)), info, { uid: info.uid + 1 });
  assert.throws(() => validateHookOutputStat(wrongOwner), /owned regular/);
  const outside = join(f.cwd, 'outside'); await mkdir(outside);
  await writeFile(join(outside, f.path.split('/').at(-1)), 'A linked ancestor must not expose this text.');
  await rm(f.directory, { recursive: true }); await symlink(outside, f.directory);
  await assert.rejects(f.read(), /owned regular/);
});

test('whole-file credential and size checks run before returning any requested page', async t => {
  const f = await fixture(t);
  for (const content of ['-----BEGIN OPENSSH PRIVATE KEY-----', 'ghp_' + 'x'.repeat(30), 'Authorization: Bearer synthetic-test-value', 'password=synthetic-long-value', 'token="synthetic-test-token"']) {
    await writeFile(f.path, 'Harmless first page\n'.repeat(170) + content);
    await assert.rejects(f.read(f.path, 1), /credential material/);
  }
  await writeFile(f.path, Buffer.from([0xff])); await assert.rejects(f.read(), /UTF-8/);
  await writeFile(f.path, 'x'.repeat(500001)); await assert.rejects(f.read(), /500000-byte/);
  assert.equal((await readFile(f.path)).length, 500001, 'read rejection never modifies the generated file');
});
