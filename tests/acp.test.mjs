import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { AcpRpc } from '../server/acp.mjs';

function fixture(options = {}) {
  const child = new EventEmitter(); Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
  child.kill = () => { child.exitCode = 0; child.emit('close', 0); };
  const sent = []; let buffer = '';
  child.stdin.on('data', data => { buffer += data; let at; while ((at = buffer.indexOf('\n')) >= 0) { sent.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); } });
  child.stdin.on('finish', () => { child.exitCode = 0; child.emit('close', 0); });
  const rpc = new AcpRpc({ executable: '/synthetic/vibe-acp', spawnProcess: (_executable, _args, nativeOptions) => { assert.equal(nativeOptions.shell, false); queueMicrotask(() => child.emit('spawn')); return child; }, ...options });
  const receive = value => child.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
  return { rpc, child, sent, receive };
}

test('ACP binds exact numeric/string request identities and newline UTF-8 chunks', async t => {
  const f = fixture(); t.after(() => f.rpc.close()); await f.rpc.start();
  const pending = f.rpc.call('initialize', { protocolVersion: 1 }); await pending.written;
  const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: f.sent[0].id, result: { text: 'Grüße' } }) + '\n');
  const split = bytes.indexOf(Buffer.from('ü')) + 1; f.child.stdout.write(bytes.subarray(0, split)); f.child.stdout.write(bytes.subarray(split));
  assert.deepEqual(await pending, { text: 'Grüße' });
  const requested = once(f.rpc, 'request'); f.receive({ id: 'native-7', method: 'session/request_permission', params: { sessionId: 'session' } });
  assert.equal((await requested)[0].id, 'native-7');
  await assert.rejects(f.rpc.respond(7, {}), /no longer current/);
  await f.rpc.respond('native-7', { outcome: { outcome: 'cancelled' } });
  assert.deepEqual(f.sent.at(-1), { jsonrpc: '2.0', id: 'native-7', result: { outcome: { outcome: 'cancelled' } } });
  await assert.rejects(f.rpc.respond('native-7', {}), /no longer current/);
});

test('ACP request timeout remains unknown and late responses are never rebound or replayed', async t => {
  const f = fixture({ timeoutMs: 8 }); t.after(() => f.rpc.close()); await f.rpc.start();
  const pending = f.rpc.call('session/new'); await assert.rejects(pending, error => error.unconfirmed === true && /outcome is unknown/.test(error.message));
  assert.equal(f.sent.length, 1); f.receive({ id: 1, result: { sessionId: 'late' } });
  const next = f.rpc.call('session/list', {}, { timeoutMs: 500 }); f.receive({ id: 2, result: { sessions: [] } });
  assert.deepEqual(await next, { sessions: [] }); assert.equal(f.sent.length, 2);
});

test('ACP disconnect rejects outstanding work, retains no callback authority and never reconnects', async () => {
  const f = fixture(); await f.rpc.start(); const pending = f.rpc.call('session/prompt');
  f.receive({ id: 44, method: 'session/request_permission', params: {} });
  f.child.emit('close', 2); await assert.rejects(pending, /execution is unconfirmed/);
  assert.equal(f.rpc.pending.size, 0); assert.equal(f.rpc.requests.size, 0);
  await assert.rejects(f.rpc.call('session/list'), /process ended/); await assert.rejects(f.rpc.start(), /cannot be started again/);
  assert.equal(f.sent.length, 1);
});

test('ACP rejects malformed, duplicate and oversized native frames', async t => {
  for (const input of ['not json\n', JSON.stringify({ jsonrpc: '2.0', id: null, method: 'x', params: {} }) + '\n', 'x'.repeat(300), Buffer.from([0xff, 0x0a]), JSON.stringify({ jsonrpc: '2.0', id: 1, error: null }) + '\n']) {
    const f = fixture({ maxMessageBytes: 256 }); t.after(() => f.rpc.close()); await f.rpc.start();
    const ended = once(f.rpc, 'disconnected'); f.child.stdout.write(input); assert.match((await ended)[0].message, /invalid or oversized/);
  }
  const f = fixture(); t.after(() => f.rpc.close()); await f.rpc.start();
  f.receive({ id: 'same', method: 'x', params: {} }); f.receive({ id: 'same', method: 'x', params: {} }); assert.equal(f.rpc.closed, true);
});

test('ACP never forwards raw native stderr', async t => {
  const f = fixture(); t.after(() => f.rpc.close()); await f.rpc.start(); const logs = [];
  f.rpc.on('diagnostic', message => logs.push(message)); f.child.stderr.write('token=synthetic-private-value\n'); f.child.stderr.write('second\n');
  assert.equal(logs.length, 1); assert.doesNotMatch(logs[0], /synthetic-private|token|second/);
});

test('ACP built-in subprocess transport completes a synthetic round trip without Vibe', async t => {
  const source = `import readline from 'node:readline'; for await (const line of readline.createInterface({input:process.stdin})) { const request=JSON.parse(line); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{method:request.method}})+'\\n'); }`;
  const rpc = new AcpRpc({ executable: process.execPath, args: ['--input-type=module', '-e', source] }); t.after(() => rpc.close()); await rpc.start();
  assert.deepEqual(await rpc.call('synthetic/echo'), { method: 'synthetic/echo' });
});
