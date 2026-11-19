import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEnvironmentInstructions, environmentInstructionContext } from '../server/environment-instructions.mjs';

const repository = 'Setup-Agentic-Dev-Environment';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ccng-environment-'));
  return { root, close: () => rm(root, { recursive: true, force: true }) };
}

test('runtime instruction import finds the local repository and rereads full source without recursive imports', async () => {
  const f = await fixture();
  try {
    const project = join(f.root, 'git', 'example-project', 'nested');
    const shared = join(f.root, 'git', repository); const path = join(shared, 'AGENTS.md');
    await mkdir(project, { recursive: true }); await mkdir(shared, { recursive: true });
    const text = '# Shared rules\nImport this AGENTS.md once, not recursively.\n' + 'Apply project scope.\n'.repeat(900);
    await writeFile(path, text);
    const result = await readEnvironmentInstructions(project, { workspaceCwd: f.root });
    assert.equal(result.status, 'loaded'); assert.equal(result.path, path); assert.equal(result.text, text);
    const context = environmentInstructionContext(result)['command-center-environment-instructions'];
    assert.equal(context.kind, 'application'); assert.ok(context.value.endsWith(text));
    assert.match(context.value, /higher-priority role restrictions/);
    await writeFile(path, '# Updated rules\nNew runtime guidance.\n');
    assert.match((await readEnvironmentInstructions(project, { workspaceCwd: f.root })).text, /Updated rules/);
    const self = await readEnvironmentInstructions(shared, { workspaceCwd: f.root });
    assert.equal(self.path, path, 'working inside the shared repository reads its own source exactly once');
  } finally { await f.close(); }
});

test('backend workspace supplies the named source for a worker outside its directory tree', async () => {
  const f = await fixture(); const worker = await fixture();
  try {
    const shared = join(f.root, repository); await mkdir(shared);
    await writeFile(join(shared, 'AGENTS.md'), '# Backend environment rules\n');
    const result = await readEnvironmentInstructions(worker.root, { workspaceCwd: f.root });
    assert.equal(result.status, 'loaded'); assert.match(result.text, /Backend environment rules/);
  } finally { await f.close(); await worker.close(); }
});

test('a missing source is explicit and does not fabricate instructions or fetch a repository', async () => {
  const f = await fixture();
  try {
    const result = await readEnvironmentInstructions(f.root, { workspaceCwd: f.root });
    assert.equal(result.status, 'missing'); assert.equal(result.text, undefined);
    const context = environmentInstructionContext(result)['command-center-environment-instructions'].value;
    assert.match(context, /were not imported/); assert.match(context, /Do not clone, fetch, install or change permissions/);
  } finally { await f.close(); }
});

test('unreadable source shapes fail visibly instead of returning partial or unrelated rules', async () => {
  const f = await fixture();
  try {
    const shared = join(f.root, repository); const path = join(shared, 'AGENTS.md'); await mkdir(shared);
    await writeFile(path, '# Too large\n' + 'x'.repeat(128 * 1024));
    let result = await readEnvironmentInstructions(f.root, { workspaceCwd: f.root });
    assert.equal(result.status, 'unavailable'); assert.equal(result.text, undefined);
    await writeFile(path, 'binary\u0000data');
    assert.equal((await readEnvironmentInstructions(f.root, { workspaceCwd: f.root })).status, 'unavailable');
    await rm(path); const unrelated = join(f.root, 'unrelated.md'); await writeFile(unrelated, '# Unrelated rules\n'); await symlink(unrelated, path);
    result = await readEnvironmentInstructions(f.root, { workspaceCwd: f.root });
    assert.equal(result.status, 'unavailable'); assert.equal(result.text, undefined);
  } finally { await f.close(); }
});

test('an explicit source outside both directory trees overrides discovery and is reread', async () => {
  const f = await fixture();
  try {
    const worker = join(f.root, 'worker', 'project');
    const backend = join(f.root, 'backend');
    const discovered = join(backend, repository);
    const selected = join(f.root, 'separate-source', 'instructions.md');
    await mkdir(worker, { recursive: true }); await mkdir(discovered, { recursive: true });
    await mkdir(join(f.root, 'separate-source'));
    await writeFile(join(discovered, 'AGENTS.md'), '# Discovered source must not win\n');
    await writeFile(selected, '# Selected shared rules\n');
    const options = { workspaceCwd: backend, sourcePath: selected };
    let result = await readEnvironmentInstructions(worker, options);
    assert.equal(result.status, 'loaded'); assert.equal(result.path, selected);
    assert.equal(result.text, '# Selected shared rules\n');
    assert.ok(environmentInstructionContext(result)['command-center-environment-instructions'].value.endsWith(result.text));
    await writeFile(selected, '# Selected rules changed\n');
    result = await readEnvironmentInstructions(worker, options);
    assert.equal(result.text, '# Selected rules changed\n');
  } finally { await f.close(); }
});

test('a missing explicit source does not fall back to a discoverable source', async () => {
  const f = await fixture();
  try {
    const shared = join(f.root, repository); await mkdir(shared);
    await writeFile(join(shared, 'AGENTS.md'), '# Discoverable rules\n');
    const sourcePath = join(f.root, 'missing.md');
    const result = await readEnvironmentInstructions(f.root, { workspaceCwd: f.root, sourcePath });
    assert.equal(result.status, 'missing'); assert.equal(result.path, sourcePath);
    assert.equal(result.text, undefined);
    const context = environmentInstructionContext(result)['command-center-environment-instructions'].value;
    assert.match(context, /configured shared AGENTS.md was not found/);
    assert.ok(!context.includes('# Discoverable rules'));
  } finally { await f.close(); }
});

test('invalid explicit sources retain file protections without falling back', async () => {
  const f = await fixture();
  try {
    const shared = join(f.root, repository); await mkdir(shared);
    await writeFile(join(shared, 'AGENTS.md'), '# Discoverable rules\n');
    const selected = join(f.root, 'selected.md');
    const options = { workspaceCwd: f.root, sourcePath: selected };
    for (const text of ['binary\u0000data', '', 'x'.repeat(128 * 1024 + 1)]) {
      await writeFile(selected, text);
      const result = await readEnvironmentInstructions(f.root, options);
      assert.equal(result.status, 'unavailable'); assert.equal(result.path, selected);
      assert.equal(result.text, undefined);
    }
    await rm(selected); await symlink(join(shared, 'AGENTS.md'), selected);
    let result = await readEnvironmentInstructions(f.root, options);
    assert.equal(result.status, 'unavailable'); assert.equal(result.path, selected);
    assert.equal(result.text, undefined);
    await rm(selected); await mkdir(selected);
    result = await readEnvironmentInstructions(f.root, options);
    assert.equal(result.status, 'unavailable'); assert.equal(result.path, selected);
    assert.equal(result.text, undefined);
  } finally { await f.close(); }
});
