import test from 'node:test';
import assert from 'node:assert/strict';
import { formFields, formContent, manualRequestAnswer, isHumanRequest } from '../server/native-requests.mjs';

test('MCP primitive forms preserve false, numbers, titled choices, multiselects and optional fields', () => {
  const schema = { type: 'object', properties: {
    allow: { type: 'boolean' }, count: { type: 'integer', minimum: 1, maximum: 3 },
    choice: { type: 'string', oneOf: [{ const: 'once', title: 'Once' }, { const: 'deny', title: 'No' }] },
    selected: { type: 'array', items: { anyOf: [{ const: 'first', title: 'First' }, { const: 'second', title: 'Second' }] }, minItems: 1, maxItems: 2 },
    note: { type: 'string', minLength: 2, maxLength: 10 }
  }, required: ['allow', 'count', 'choice', 'selected'] };
  assert.equal(formFields(schema).length, 5);
  const content = { allow: false, count: 2, choice: 'once', selected: ['second'] };
  assert.deepEqual(formContent(schema, content), content);
  for (const patch of [{ allow: 'true' }, { count: 4 }, { count: 1.5 }, { choice: 'session' }, { selected: ['first', 'first'] }, { selected: ['other'] }, { note: 'x' }, { extra: 'injected' }]) assert.throws(() => formContent(schema, { ...content, ...patch }));
  assert.throws(() => formContent(schema, { ...content, count: undefined }), /Answer count/);
  assert.equal(formFields({ type: 'object', properties: { nested: { type: 'object', properties: {} } } }), null);
  assert.equal(formFields({ ...schema, allOf: [] }), null);
});

test('manual permission grants return only the native requested access and current-turn scope', () => {
  const permissions = { fileSystem: { read: ['/example/project'], write: null }, network: null };
  const question = { method: 'item/permissions/requestApproval', params: { permissions } };
  const answer = manualRequestAnswer(question, { decision: 'accept', permissions: { network: { enabled: true }, fileSystem: { write: ['/'] } }, scope: 'session' });
  assert.deepEqual(answer, { permissions: { fileSystem: permissions.fileSystem }, scope: 'turn' });
  assert.deepEqual(manualRequestAnswer(question, { decision: 'decline' }), { permissions: {}, scope: 'turn' });
  assert.throws(() => manualRequestAnswer(question, { decision: 'acceptForSession' }));
  assert.throws(() => manualRequestAnswer({ ...question, params: { permissions: { futurePrivilege: true } } }, { decision: 'accept' }));
});

test('MCP actions match native response shape and unsupported schemas cannot be accepted', () => {
  const schema = { type: 'object', properties: { decision: { type: 'string', enum: ['once', 'deny'] } }, required: ['decision'] };
  for (const mode of ['form', 'openai/form', 'openaiForm']) {
    const question = { method: 'mcpServer/elicitation/request', params: { mode, requestedSchema: schema } };
    assert.deepEqual(manualRequestAnswer(question, { decision: 'accept', content: { decision: 'once' } }), { action: 'accept', content: { decision: 'once' }, _meta: null });
    assert.deepEqual(manualRequestAnswer(question, { decision: 'cancel' }), { action: 'cancel', content: null, _meta: null });
    assert.throws(() => manualRequestAnswer(question, { decision: 'accept', content: { decision: 'always' } }));
  }
  const unknown = { method: 'mcpServer/elicitation/request', params: { mode: 'future' } };
  assert.throws(() => manualRequestAnswer(unknown, { decision: 'accept' }), /native client/);
  assert.deepEqual(manualRequestAnswer(unknown, { decision: 'decline' }), { action: 'decline', content: null, _meta: null });
  assert.deepEqual(manualRequestAnswer({ ...unknown, params: { mode: 'url' } }, { decision: 'accept' }), { action: 'accept', content: null, _meta: null });
});

test('human blocking requests include unknown approval variants but exclude internal protocol exchanges', () => {
  for (const method of ['item/tool/requestUserInput', 'item/permissions/requestApproval', 'mcpServer/elicitation/request', 'item/future/requestApproval', 'execCommandApproval', 'applyPatchApproval']) assert.equal(isHumanRequest(method), true);
  for (const method of ['account/chatgptAuthTokens/refresh', 'attestation/generate', 'item/tool/call', 'currentTime/read']) assert.equal(isHumanRequest(method), false);
});
