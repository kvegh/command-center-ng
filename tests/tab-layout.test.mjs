import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import postcss from 'postcss';

const source = await readFile(new URL('../src/tab-layout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { tabGridLayout, tabScrollOffset } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const workers = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];

test('six conversation tabs stay on one row; Coordinator counts toward the seventh', () => {
  for (const [ids, coordinator] of [[workers, false], [workers.slice(0, 5), true], [[], true]]) {
    const layout = tabGridLayout(ids, coordinator, ids[0]);
    assert.equal(layout.twoRows, false);
    assert.deepEqual(layout.positions.map(tab => tab.row), ids.map(() => 1));
    assert.deepEqual(layout.positions.map(tab => tab.column), ids.map((_, index) => index + 1));
  }
  assert.equal(tabGridLayout(workers, true).twoRows, true);
  assert.equal(tabGridLayout([...workers, 'eta'], false).twoRows, true);
});

test('selection swaps visual rows while saved membership, column order and worker numbering remain stable', () => {
  const ids = Object.freeze([...workers]);
  const before = tabGridLayout(ids, true, 'zeta');
  const after = tabGridLayout(ids, true, 'alpha');
  assert.deepEqual(ids, workers, 'layout never mutates the persisted order');
  assert.deepEqual(after.positions.map(({ id, column }) => [id, column]), before.positions.map(({ id, column }) => [id, column]));
  assert.deepEqual(before.positions.map(tab => tab.row), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(after.positions.map(tab => tab.row), [2, 2, 2, 1, 1, 1]);
  assert.deepEqual(tabGridLayout(ids, true, 'beta'), after, 'another selection in the same row does not reshuffle it');
  assert.deepEqual(tabGridLayout(ids, true, 'coordinator'), tabGridLayout(ids, true), 'Coordinator remains on the lower edge independently');
  assert.deepEqual(tabGridLayout(ids, true, 'closed-worker'), tabGridLayout(ids, true));
});

test('all sixteen workers remain addressable in exactly two rows as tabs open, close or reorder', () => {
  const ids = Array.from({ length: 16 }, (_, index) => `worker-${index}`);
  for (const order of [ids, [...ids.slice(1), ids[0]], ids.slice(0, 15)]) {
    for (const selected of order) {
      const layout = tabGridLayout(order, true, selected);
      assert.equal(layout.twoRows, true);
      assert.deepEqual(layout.positions.map(tab => tab.id), order);
      assert.equal(layout.positions.find(tab => tab.id === selected).row, 2);
      assert.equal(new Set(layout.positions.map(tab => `${tab.row}:${tab.column}`)).size, order.length);
      assert.deepEqual([...new Set(layout.positions.map(tab => tab.row))].sort(), [1, 2]);
    }
  }
});

test('selection and hover reveal clipped edges horizontally without shifting an already-visible title', () => {
  const strip = { left: 100, right: 600 };
  assert.equal(tabScrollOffset({ left: 120, right: 290 }, strip), 0);
  assert.equal(tabScrollOffset({ left: 80, right: 250 }, strip), -20);
  assert.equal(tabScrollOffset({ left: 520, right: 690 }, strip), 90);
  assert.equal(tabScrollOffset({ left: 500, right: 1100 }, strip), 400, 'a title wider than the strip keeps its start visible and its end scrollable');
  assert.equal(tabScrollOffset({ left: 100, right: 1100 }, strip), 0);
});

test('desktop CSS grows intrinsic tab width without vertical growth or Coordinator overlap', async () => {
  const sheet = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
  const declarations = selector => {
    const result = {};
    sheet.walkRules(rule => {
      if (rule.selectors.includes(selector) && rule.parent.type === 'root') rule.walkDecls(decl => { result[decl.prop] = decl.value; });
    });
    return result;
  };
  assert.equal(declarations('.tabs').display, 'grid');
  assert.equal(declarations('.tabs')['grid-auto-columns'], 'max-content');
  assert.equal(declarations('.tabs')['overflow-x'], 'auto');
  assert.equal(declarations('.tabs')['scrollbar-width'], 'none', 'scrolling does not introduce a gutter between the selected row and chat');
  assert.equal(declarations('.tabs')['min-width'], '0');
  assert.equal(declarations('.tabs[data-two-rows="true"]')['grid-template-rows'], 'repeat(2, 40px)');
  assert.equal(declarations('.tabs > .tab-wrap').height, '34px');
  assert.equal(declarations('.tabs > .tab-wrap.active').height, '40px');
  assert.equal(declarations('.coordinator-tab-group')['flex-shrink'], '0');
  assert.equal(declarations('.coordinator-tab-group')['align-items'], 'flex-end');
  const hover = sheet.nodes.find(node => node.type === 'atrule' && node.params === '(min-width: 901px) and (hover: hover) and (pointer: fine)');
  assert.ok(hover, 'hover expansion is absent on compact/touch layouts');
  const expansion = hover.nodes.find(rule => rule.selector === '.tabs:not(.reordering) > .tab-wrap:hover');
  assert.equal(expansion.nodes.find(decl => decl.prop === 'width').value, 'max-content');
  assert.equal(expansion.nodes.find(decl => decl.prop === 'min-width').value, '170px');
  assert.ok(!expansion.nodes.some(decl => /height|transform|position/.test(decl.prop)), 'hover cannot raise or overlay the tab');
});

test('main keeps keyed tab siblings, global indices and native drag controls while applying visual row positions', async () => {
  const text = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const main = ts.createSourceFile('main.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  const visit = node => { nodes.push(node); ts.forEachChild(node, visit); };
  visit(main);
  const attribute = (node, name) => node.attributes?.properties.find(value => ts.isJsxAttribute(value) && value.name.text === name)?.initializer;
  const wrap = nodes.find(node => ts.isJsxOpeningElement(node) && attribute(node, 'data-worker-tab'));
  assert.equal(attribute(wrap, 'key').expression.getText(main), 'agent.id');
  assert.match(attribute(wrap, 'style').expression.getText(main), /gridRow: tabLayout.positions\[index\].row, gridColumn: tabLayout.positions\[index\].column/);
  const strip = nodes.find(node => ts.isJsxElement(node) && attribute(node.openingElement, 'data-two-rows'));
  assert.equal(strip.children.filter(ts.isJsxExpression)[0].expression.getText(main), 'workers.map(tab)', 'row changes do not remount tabs in different parents');
  assert.match(text, /tabGridLayout\(ids, !!state.coordinator, active\?\.id\)/);
  assert.match(text, /workers\[index \+ \(event.key === 'ArrowLeft' \? -1 : 1\)\]/);
  assert.match(text, /tabReorder.current\?\.down\(event, agent.id\)/);
  assert.match(text, /desktopTabRows.current = tabLayout.twoRows && !compactLayout/);
  assert.match(text, /allowVerticalStart: \(\) => desktopTabRows.current/);
  assert.match(text, /String\(index \+ 1\).padStart/);
  assert.match(text, /strip.scrollLeft \+= tabScrollOffset/);
  assert.doesNotMatch(text, /scrollIntoView/, 'tab visibility does not scroll the document or chat');
});

test('actual tab reveal and pointer handlers scroll only the owning strip and leave touch/drag alone', async () => {
  const text = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const main = ts.createSourceFile('main.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let reveal, pointerEnter;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(main) === 'revealTab') reveal = node.initializer;
    if (ts.isJsxAttribute(node) && node.name.text === 'onPointerEnter') pointerEnter = node.initializer.expression;
    ts.forEachChild(node, visit);
  };
  visit(main);
  assert.ok(reveal && pointerEnter);
  const compiled = ts.transpileModule(`
    export const makeReveal = ({ tabStrip, tabScrollOffset }) => (${reveal.getText(main)});
    export const makeEnter = ({ compactLayout, tabDrag, revealTab }) => (${pointerEnter.getText(main)});
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { makeReveal, makeEnter } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  const tab = { getBoundingClientRect: () => ({ left: 450, right: 750 }) };
  const strip = { scrollLeft: 10, contains: element => element === tab, getBoundingClientRect: () => ({ left: 100, right: 600 }) };
  const revealTab = makeReveal({ tabStrip: { current: strip }, tabScrollOffset });
  revealTab({ getBoundingClientRect: () => assert.fail('Coordinator is outside this strip') });
  assert.equal(strip.scrollLeft, 10);
  const enter = options => makeEnter({ compactLayout: false, tabDrag: null, revealTab, ...options });
  for (const [handler, pointerType] of [[enter({ compactLayout: true }), 'mouse'], [enter({ tabDrag: { source: 'alpha' } }), 'mouse'], [enter({}), 'touch']]) {
    handler({ currentTarget: tab, pointerType });
    assert.equal(strip.scrollLeft, 10);
  }
  enter({})({ currentTarget: tab, pointerType: 'mouse' });
  assert.equal(strip.scrollLeft, 160);
  makeReveal({ tabStrip: { current: null }, tabScrollOffset })(tab);
});
