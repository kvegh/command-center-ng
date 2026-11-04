import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/open-questions.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const module = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace(/from ['"]react['"]/, `from '${pathToFileURL(require.resolve('react')).href}'`)).toString('base64'));

test('an attention flag without request details does not claim another client owns the request', () => {
  const html = renderToStaticMarkup(React.createElement(module.OpenQuestions, { agentId: 'worker', questions: [], attention: true }));
  assert.doesNotMatch(html, /another Codex client|Answer it there/i);
  assert.match(html, /details.*not.*loaded|details.*unavailable/i);
});
