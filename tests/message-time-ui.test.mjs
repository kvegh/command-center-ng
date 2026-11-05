import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/message-time.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const { MessageTime, formatMessageTime } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('message clock uses 24-hour local-style display including midnight and explicit timezones', () => {
  assert.equal(formatMessageTime('2026-01-02T00:05:00Z', 'UTC'), '00:05');
  assert.equal(formatMessageTime('2026-01-02T16:35:00Z', 'UTC'), '16:35');
  assert.equal(formatMessageTime('2026-01-02T16:35:00Z', 'America/New_York'), '11:35');
  for (const value of [undefined, '', 'invalid']) assert.equal(formatMessageTime(value), null);
});

test('message headers retain machine-readable native time and identify receive-time or missing evidence', () => {
  const render = props => renderToStaticMarkup(React.createElement(MessageTime, props));
  const timestamp = '2026-01-02T16:35:00.000Z';
  const native = render({ timestamp, source: 'native' });
  assert.match(native, /<time dateTime="2026-01-02T16:35:00.000Z"/);
  assert.match(native, /Recorded by the agent runtime/);
  assert.match(render({ timestamp, source: 'received' }), /First received by Command Center/);
  const missing = render({ timestamp: 'invalid' });
  assert.match(missing, /Message time unavailable/); assert.doesNotMatch(missing, /<time/);
});
