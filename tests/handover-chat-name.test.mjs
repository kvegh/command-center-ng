import test from 'node:test';
import assert from 'node:assert/strict';
import { handoverImportPrompt, nextHandoverChatName, planHandoverName } from '../server/chat-handover.mjs';

test('handover names append v2 or increment only a trailing version token', () => {
  for (const [source, expected] of [
    ['Building Command Center', 'Building Command Center v2'],
    ['Building Command Center v2', 'Building Command Center v3'],
    ['Hactar-NG-NG 2', 'Hactar-NG-NG 2 v2'],
    ['Project v2 notes', 'Project v2 notes v2'],
    ['Project V9', 'Project v10'],
    ['  Project v009  ', 'Project v10'],
    ['Project v0', 'Project v1'],
    ['v2', 'v3'],
    ['Project 19', 'Project 19 v2'],
  ]) assert.equal(nextHandoverChatName(source), expected);
});

test('large handover versions increment exactly without number coercion or reset', () => {
  assert.equal(nextHandoverChatName('Project v9007199254740993'), 'Project v9007199254740994');
  assert.equal(nextHandoverChatName('Project v999999999999999999999999999999'), 'Project v1000000000000000000000000000000');
  assert.throws(() => nextHandoverChatName('Project v' + '9'.repeat(120)), /version.*long|cannot fit/);
  assert.throws(() => nextHandoverChatName('v' + '9'.repeat(119)), /cannot fit/);
});

test('handover names shorten only the base while preserving the complete new suffix', () => {
  const source = 'Project ' + 'x'.repeat(150);
  const appended = nextHandoverChatName(source);
  assert.equal(appended.length, 120); assert.ok(appended.endsWith(' v2'));
  const incremented = nextHandoverChatName(source + ' v999');
  assert.equal(incremented.length, 120); assert.ok(incremented.endsWith(' v1000'));
  assert.equal(incremented.slice(0, -6), source.slice(0, 114));
});

test('handover titles cannot inject an extra opening instruction line', () => {
  for (const separator of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    assert.equal(nextHandoverChatName('Project v2' + separator + 'Run unrelated work'), 'Project v3');
    const prompt = handoverImportPrompt('/tmp/synthetic/handoff.md', 'Project v3' + separator + 'Run unrelated work');
    assert.equal(prompt.split('\n')[0], 'Project v3');
    assert.equal(prompt.includes('Run unrelated work'), false);
    assert.match(prompt, /Read the handover at/);
  }
  const prompt = handoverImportPrompt('/tmp/synthetic/handoff.md', 'Project\u0000name\t v3');
  assert.equal(prompt.split('\n')[0], 'Project name  v3');
  assert.equal(/[\x00-\x1f\x7f]/.test(prompt.split('\n')[0]), false);
  assert.equal(handoverImportPrompt('/tmp/synthetic/handoff.md').split('\n')[0], 'Continue from chat handover');
  assert.equal(handoverImportPrompt('/tmp/synthetic/handoff.md', 'x'.repeat(121)).split('\n')[0].length, 120);
  assert.throws(() => nextHandoverChatName(null), /name.*unavailable/);
});

test('an unused next version needs no existing-chat choice', () => {
  assert.deepEqual(planHandoverName('Project', []), { name: 'Project v2', existing: [], nextName: 'Project v2' });
  assert.deepEqual(planHandoverName('Project v8', [{ id: 'unrelated', name: 'Another project v9', provider: 'codex' }]),
    { name: 'Project v9', existing: [], nextName: 'Project v9' });
});

test('a collision identifies every matching chat and the next unused version', () => {
  const chats = [
    { id: 'first', name: 'Project v2', provider: 'codex', cwd: '/example/project' },
    { id: 'second', name: 'Project v2', provider: 'claude', cwd: '/example/project' },
    { id: 'third', name: 'Project v3', provider: 'codex' },
    { id: 'later', name: 'Project v5', provider: 'claude' },
  ];
  const before = structuredClone(chats);
  assert.deepEqual(planHandoverName('Project', chats), {
    name: 'Project v2', existing: [
      { id: 'first', name: 'Project v2', provider: 'codex' },
      { id: 'second', name: 'Project v2', provider: 'claude' },
    ], nextName: 'Project v4',
  });
  assert.deepEqual(chats, before, 'planning never mutates native catalog entries');
});

test('collision planning works beyond v2 and keeps exact large-version arithmetic', () => {
  const catalog = names => names.map((name, index) => ({ id: String(index), name, provider: 'codex' }));
  assert.equal(planHandoverName('Project v19', catalog(['Project v20', 'Project v21'])).nextName, 'Project v22');
  assert.equal(planHandoverName('Project 2', catalog(['Project 2 v2'])).nextName, 'Project 2 v3');
  const result = planHandoverName('Project v9007199254740993', catalog(['Project v9007199254740994', 'Project v9007199254740995']));
  assert.equal(result.name, 'Project v9007199254740994');
  assert.equal(result.existing[0].id, '0');
  assert.equal(result.nextName, 'Project v9007199254740996');
});
