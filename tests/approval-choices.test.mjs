import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeApprovalChoices, nativeApprovalAnswer, isNativeToolApproval } from '../server/approval-choices.mjs';

const command = params => ({ method: 'item/commandExecution/requestApproval', params });
const file = params => ({ method: 'item/fileChange/requestApproval', params });
const mcp = meta => ({ method: 'mcpServer/elicitation/request', params: { mode: 'form', requestedSchema: { type: 'object', properties: {} }, _meta: meta } });
const exec = prefix => ({ acceptWithExecpolicyAmendment: { execpolicy_amendment: prefix } });
const network = (host, action = 'allow') => ({ applyNetworkPolicyAmendment: { network_policy_amendment: { host, action } } });

test('older v2 command requests preserve explicit decisions without inventing reusable grants', () => {
  const question = command({});
  assert.deepEqual(nativeApprovalChoices(question).map(choice => choice.answer), ['accept', 'decline', 'cancel'].map(decision => ({ decision })));
  for (const decision of ['accept', 'decline', 'cancel']) assert.deepEqual(nativeApprovalAnswer(question, { decision }), { decision });
  assert.throws(() => nativeApprovalAnswer(question, { decision: 'acceptForSession' }));
});

test('native file request schema exposes its session choice without an availableDecisions field', () => {
  const question = file({ threadId: 'worker', turnId: 'turn', itemId: 'changes', startedAtMs: 1, reason: 'Apply reviewed changes', grantRoot: '/example/project' });
  const choices = nativeApprovalChoices(question);
  assert.deepEqual(choices.map(choice => choice.answer.decision), ['accept', 'acceptForSession', 'decline', 'cancel']);
  const session = choices.find(choice => choice.key === 'session');
  assert.equal(session.label, 'Allow for this session'); assert.match(session.scope, /\/example\/project/);
  assert.equal(session.persistent, false);
  assert.deepEqual(nativeApprovalAnswer(question, session.answer), { decision: 'acceptForSession' });
  assert.ok(choices.every(choice => choice.label !== 'Allow always'));
  assert.throws(() => nativeApprovalAnswer(question, session.answer, { allowPersistent: false }));
});

test('explicit file decision restrictions remain authoritative despite the static native fallback', () => {
  for (const availableDecisions of [[], ['accept', 'cancel']]) {
    const question = file({ availableDecisions });
    assert.deepEqual(nativeApprovalChoices(question).map(choice => choice.answer.decision), availableDecisions);
    assert.throws(() => nativeApprovalAnswer(question, { decision: 'acceptForSession' }));
  }
});

test('native command prefix proposal produces the exact native saved-rule payload and displays its scope', () => {
  const question = command({ proposedExecpolicyAmendment: ['git', 'push', 'origin'] });
  const choice = nativeApprovalChoices(question).find(choice => choice.persistent);
  assert.equal(choice.label, 'Allow always');
  assert.match(choice.scope, /\["git","push","origin"\]/);
  assert.deepEqual(nativeApprovalAnswer(question, choice.answer), { decision: exec(['git', 'push', 'origin']) });
  assert.throws(() => nativeApprovalAnswer(question, { decision: exec(['git']) }));
  assert.throws(() => nativeApprovalAnswer(question, { decision: exec(['git', 'push', 'origin']), rules: ['*'] }));
});

test('native network proposals expose only allow entries, preserving each exact host', () => {
  const question = command({ networkApprovalContext: { host: 'api.example.com' }, proposedNetworkPolicyAmendments: [{ host: 'api.example.com', action: 'allow' }, { host: 'blocked.example.com', action: 'deny' }, { host: 'other.example.com', action: 'allow' }] });
  const choices = nativeApprovalChoices(question).filter(choice => choice.persistent);
  assert.equal(new Set(choices.map(choice => choice.key)).size, 2);
  assert.deepEqual(choices.map(choice => nativeApprovalAnswer(question, choice.answer)), [{ decision: network('api.example.com') }, { decision: network('other.example.com') }]);
  assert.throws(() => nativeApprovalAnswer(question, { decision: network('*.example.com') }));
  assert.throws(() => nativeApprovalAnswer(question, { decision: network('blocked.example.com', 'deny') }));
});

test('availableDecisions restrict every decision including proposals and session grants', () => {
  const question = command({ proposedExecpolicyAmendment: ['git', 'push'], availableDecisions: ['accept', 'cancel'] });
  assert.deepEqual(nativeApprovalChoices(question).map(choice => choice.key), ['accept', 'cancel']);
  for (const decision of ['decline', 'acceptForSession', exec(['git', 'push'])]) assert.throws(() => nativeApprovalAnswer(question, { decision }));
  for (const availableDecisions of [[], 'accept', {}]) assert.deepEqual(nativeApprovalChoices(command({ availableDecisions })), []);
});

test('explicit native available decisions can carry exact supported amendments without separate proposal fields', () => {
  const offered = [exec(['npm', 'test']), network('api.example.com'), 'acceptForSession', 'cancel'];
  const question = command({ availableDecisions: offered });
  assert.equal(nativeApprovalChoices(question).length, 4);
  for (const decision of offered) assert.deepEqual(nativeApprovalAnswer(question, { decision }), { decision });
  const session = nativeApprovalChoices(question).find(choice => choice.key === 'session');
  assert.equal(session.label, 'Allow for this session');
  assert.equal(session.persistent, false);
});

test('stale saved-rule answers are rejected against changed current native proposals', () => {
  const previous = nativeApprovalChoices(command({ proposedExecpolicyAmendment: ['git', 'push'] })).find(choice => choice.persistent).answer;
  assert.throws(() => nativeApprovalAnswer(command({ proposedExecpolicyAmendment: ['git', 'fetch'] }), previous));
  assert.throws(() => nativeApprovalAnswer(command({}), previous));
});

test('malformed native amendments, deny amendments and unsupported fields never create saved choices', () => {
  const bad = [exec([]), exec(['']), exec([true]), { ...exec(['git']), extra: true }, { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git'], extra: true } }, network('api.example.com', 'deny'), network('bad host'), { applyNetworkPolicyAmendment: { network_policy_amendment: { host: 'api.example.com', action: 'allow', extra: true } } }];
  assert.deepEqual(nativeApprovalChoices(command({ availableDecisions: bad })), []);
  for (const decision of bad) assert.throws(() => nativeApprovalAnswer(command({ availableDecisions: bad }), { decision }));
  assert.deepEqual(nativeApprovalChoices(command({ proposedExecpolicyAmendment: [] })).map(choice => choice.key), ['accept', 'decline', 'cancel']);
});

test('file approval session choices never masquerade as permanent file permissions', () => {
  const question = file({ grantRoot: '/example/project', availableDecisions: ['accept', 'acceptForSession', exec(['git']), network('api.example.com'), 'cancel'] });
  assert.deepEqual(nativeApprovalChoices(question).map(choice => choice.key), ['accept', 'session', 'cancel']);
  assert.ok(nativeApprovalChoices(question).every(choice => !choice.persistent));
  assert.deepEqual(nativeApprovalAnswer(question, { decision: 'acceptForSession' }), { decision: 'acceptForSession' });
});

test('only privileged native MCP tool approval metadata enables one-click tool approval', () => {
  assert.equal(isNativeToolApproval(mcp({ codex_approval_kind: 'mcp_tool_call' })), true);
  for (const question of [mcp({ persist: 'always' }), mcp({ codex_approval_kind: 'browser_auth', persist: 'always' }), { ...mcp({ codex_approval_kind: 'mcp_tool_call', persist: 'always' }), params: { mode: 'url', _meta: { codex_approval_kind: 'mcp_tool_call', persist: 'always' } } }, { method: 'claude/mcp/elicitation/request', params: mcp({ codex_approval_kind: 'mcp_tool_call' }).params }]) {
    assert.equal(isNativeToolApproval(question), false);
    assert.deepEqual(nativeApprovalChoices(question), []);
    assert.throws(() => nativeApprovalAnswer(question, { decision: 'accept', persistence: 'always' }));
  }
  const question = mcp({ codex_approval_kind: 'mcp_tool_call' });
  assert.deepEqual(nativeApprovalAnswer(question, { decision: 'accept' }), { action: 'accept', content: null, _meta: null });
  assert.throws(() => nativeApprovalAnswer(question, { decision: 'accept', persistence: 'always' }));
});

test('MCP saved approvals return native persist metadata only when that exact scope was offered', () => {
  for (const persist of ['always', ['session', 'always']]) {
    const question = mcp({ codex_approval_kind: 'mcp_tool_call', persist });
    assert.deepEqual(nativeApprovalAnswer(question, { decision: 'accept', persistence: 'always' }), { action: 'accept', content: null, _meta: { persist: 'always' } });
    if (Array.isArray(persist)) assert.deepEqual(nativeApprovalAnswer(question, { decision: 'accept', persistence: 'session' }), { action: 'accept', content: null, _meta: { persist: 'session' } });
    for (const decision of ['decline', 'cancel']) {
      assert.deepEqual(nativeApprovalAnswer(question, { decision }), { action: decision, content: null, _meta: null });
      assert.throws(() => nativeApprovalAnswer(question, { decision, persistence: 'always' }));
    }
  }
  for (const persist of [true, ['always', 'arbitrary'], 'session']) assert.throws(() => nativeApprovalAnswer(mcp({ codex_approval_kind: 'mcp_tool_call', persist }), { decision: 'accept', persistence: 'always' }));
});

test('coordinator-style controls suppress both durable and session-reusable permissions', () => {
  const options = { allowPersistent: false };
  for (const question of [command({ availableDecisions: ['accept', 'acceptForSession', exec(['git']), network('api.example.com'), 'cancel'] }), file({ availableDecisions: ['accept', 'acceptForSession', 'cancel'] }), mcp({ codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] })]) {
    assert.ok(nativeApprovalChoices(question, options).every(choice => !choice.persistent && !choice.answer.persistence && choice.answer.decision !== 'acceptForSession'));
    assert.throws(() => nativeApprovalAnswer(question, { decision: 'acceptForSession' }, options));
    assert.throws(() => nativeApprovalAnswer(question, { decision: 'accept', persistence: 'always' }, options));
    assert.deepEqual(nativeApprovalAnswer(question, { decision: 'accept' }, options), question.method === 'mcpServer/elicitation/request' ? { action: 'accept', content: null, _meta: null } : { decision: 'accept' });
  }
});

test('native values are copied and client payloads cannot inject raw wire metadata or extra fields', () => {
  const question = command({ proposedExecpolicyAmendment: ['git', 'push'] });
  const choice = nativeApprovalChoices(question).find(choice => choice.persistent);
  choice.answer.decision.acceptWithExecpolicyAmendment.execpolicy_amendment.pop();
  assert.deepEqual(question.params.proposedExecpolicyAmendment, ['git', 'push']);
  assert.throws(() => nativeApprovalAnswer(question, choice.answer));
  for (const answer of [null, [], { decision: 'accept', _meta: { persist: 'always' } }, { decision: 'accept', scope: 'session' }, { decision: 'accept', content: {} }, { decision: { ...exec(['git', 'push']), extra: true } }, { decision: exec({ 0: 'git', 1: 'push' }) }]) assert.throws(() => nativeApprovalAnswer(question, answer));
  for (const method of ['item/permissions/requestApproval', 'item/tool/requestUserInput', 'execCommandApproval', 'applyPatchApproval', 'future/requestApproval']) assert.deepEqual(nativeApprovalChoices({ method, params: {} }), []);
});

test('distinct native amendments have unique choice keys without changing their payloads', () => {
  const question = command({ availableDecisions: [exec(['git', 'fetch']), exec(['git', 'push']), exec(['git', 'fetch']), network('api.example.com'), network('files.example.com')] });
  const choices = nativeApprovalChoices(question);
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map(choice => choice.key)).size, 4);
  assert.deepEqual(choices.map(choice => nativeApprovalAnswer(question, choice.answer).decision), [exec(['git', 'fetch']), exec(['git', 'push']), network('api.example.com'), network('files.example.com')]);
});
