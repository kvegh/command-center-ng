import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  .replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`);
const timeModule = 'data:text/javascript;base64,' + Buffer.from(compile(await readFile(new URL('../src/message-time.tsx', import.meta.url), 'utf8'))).toString('base64');
const source = await readFile(new URL('../src/task-ping-schedule.tsx', import.meta.url), 'utf8');
const compiled = compile(source).replace(/from ['"]\.\/message-time['"]/, `from '${timeModule}'`);
const { TaskPingSchedule } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const nextAt = '2027-01-15T16:45:00.000Z';
const fixture = (props = {}) => TaskPingSchedule({ nextAt, paused: false, running: true, connected: true, ...props });

test('coordinator displays the exact label and backend dispatch time as a local HH:MM semantic time', () => {
  const html = renderToStaticMarkup(fixture());
  const localTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(nextAt));
  assert.match(html, /Next chat task-ping to send/);
  assert.ok(html.includes(`<time dateTime="${nextAt}"`) || html.includes(`<time datetime="${nextAt}"`));
  assert.ok(html.includes(`>${localTime}</time>`));
  assert.match(html, /class="field-note coordinator-task-ping"/);
  assert.match(html, /Delivery may wait for current work or pending requests/);
  assert.doesNotMatch(html, /<input|<button|minutes? remaining|countdown/i);
});

test('paused, stopped and disconnected schedules show their real state rather than an unavailable future send', () => {
  for (const [props, label] of [[{ paused: true }, 'Paused'], [{ running: false }, 'Stopped'], [{ connected: false }, 'Disconnected']]) {
    const html = renderToStaticMarkup(fixture(props));
    assert.ok(html.includes(`<span>${label}</span>`));
    assert.doesNotMatch(html, /<time/);
  }
  for (const nextAt of [null, undefined, '', 'invalid timestamp']) {
    const html = renderToStaticMarkup(fixture({ nextAt }));
    assert.match(html, /Not scheduled/);
    assert.doesNotMatch(html, /<time|Invalid Date/);
  }
});

test('the coordinator uses backend scheduling availability rather than requiring a native coordinator conversation', async () => {
  const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.tsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let control;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'TaskPingSchedule') control = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)]));
    ts.forEachChild(node, visit);
  }; visit(ast);
  assert.equal(control.nextAt, 'coordinator?.nextTaskPingAt');
  assert.equal(control.paused, '!!coordinator?.paused');
  assert.equal(control.running, '!!coordinator');
  assert.equal(control.connected, "runtimeReady(state, 'codex')");
});
