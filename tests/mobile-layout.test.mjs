import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import ts from 'typescript';

const sheet = postcss.parse(await readFile(new URL('../src/style.css', import.meta.url), 'utf8'));
const main = ts.createSourceFile('main.tsx', await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNodes(predicate) {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(main); return found;
}
const compactQuery = findNodes(node => ts.isVariableDeclaration(node) && node.name.getText(main) === 'compactLayoutQuery')[0]?.initializer?.text;
const desktopQuery = '(min-width: 901px)';

// Only resolve the exact selectors and explicit media blocks under test, in
// source order. This is a bounded cascade check, not browser layout emulation.
function declarations(selector, media = []) {
  const result = {};
  const collect = rule => {
    if (rule.type === 'rule' && rule.selectors.includes(selector)) {
      for (const declaration of rule.nodes.filter(node => node.type === 'decl')) result[declaration.prop] = declaration.value;
    }
  };
  for (const node of sheet.nodes) {
    if (node.type === 'atrule' && node.name === 'media' && media.includes(node.params)) node.nodes.forEach(collect);
    else collect(node);
  }
  return result;
}
function properties(selector, names, media) {
  const values = declarations(selector, media);
  return Object.fromEntries(names.map(name => [name, values[name]]));
}

test('mobile CSS and composer share the width/coarse-pointer query and responsive state', () => {
  assert.equal(compactQuery, '(max-width: 900px), (hover: none) and (pointer: coarse)');
  assert.equal(sheet.nodes.filter(node => node.type === 'atrule' && node.name === 'media' && node.params === compactQuery).length, 1);
  const composer = findNodes(node => ts.isJsxOpeningElement(node) && node.tagName.getText(main) === 'ResizableComposer')[0];
  const compact = composer?.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'compact');
  assert.equal(compact?.initializer?.expression?.getText(main), 'compactLayout');
  const matchingQueries = findNodes(node => ts.isCallExpression(node) && node.expression.getText(main) === 'window.matchMedia'
    && node.arguments[0]?.getText(main) === 'compactLayoutQuery');
  assert.equal(matchingQueries.length, 2, 'initial state and responsive updates use the same query');
});

test('compact layout uses normal page flow, full-width overview and wrapping tabs', () => {
  const attribute = (element, name) => element.attributes.properties.find(value => ts.isJsxAttribute(value) && value.name.text === name)?.initializer;
  const panel = findNodes(node => ts.isJsxElement(node) && attribute(node.openingElement, 'id')?.text === 'agent-panel')[0];
  const historyIndex = panel.children.findIndex(node => ts.isJsxElement(node) && attribute(node.openingElement, 'className')?.text === 'conversation');
  const overviewIndex = panel.children.findIndex(node => ts.isJsxExpression(node) && ts.isConditionalExpression(node.expression)
    && node.expression.whenTrue.getText(main).startsWith('<CoordinatorContext')
    && ts.isJsxElement(node.expression.whenFalse) && attribute(node.expression.whenFalse.openingElement, 'id')?.text === 'overview-panel');
  assert.ok(overviewIndex >= 0 && historyIndex > overviewIndex, 'worker and coordinator overview branches precede messages in column page flow');
  for (const media of [[compactQuery], [desktopQuery, compactQuery]]) {
    assert.deepEqual(properties('.app-shell', ['height', 'min-height', 'overflow'], media), { height: 'auto', 'min-height': '100dvh', overflow: 'visible' });
    assert.deepEqual(properties('.workspace-frame', ['flex', 'overflow'], media), { flex: 'none', overflow: 'visible' });
    assert.deepEqual(properties('.workspace-frame .agent-panel', ['display', 'flex-direction', 'height', 'max-height'], media), { display: 'flex', 'flex-direction': 'column', height: 'auto', 'max-height': 'none' });
    assert.deepEqual(properties('.context', ['width', 'max-height', 'overflow'], media), { width: '100%', 'max-height': 'none', overflow: 'visible' });
    assert.equal(declarations('.task-summary', media)['flex-direction'], 'column', 'task header, list and notification controls stack without competing for mobile width');
    assert.deepEqual(properties('.topbar > .tabs-row .tabs', ['width', 'flex-wrap', 'overflow'], media), { width: '100%', 'flex-wrap': 'wrap', overflow: 'visible' });
    for (const selector of ['.overview-section[data-section="recap"]', '.sidebar-divider', '.overview-section-divider', '.composer-divider']) {
      assert.equal(declarations(selector, media).display, 'none', `${selector} stays hidden on narrow and wide coarse-pointer devices`);
    }
  }
});

test('mobile history and input scroll internally at approximately thirty and six text lines', () => {
  const history = declarations('.conversation', [compactQuery]);
  const bound = /^calc\((\d+) \* ([\d.]+) \* (\d+)px \+ (\d+)px\)$/.exec(history['max-height']);
  assert.ok(bound, 'history has a line-based height bound with room for padding');
  const [, lines, lineHeight, fontSize, padding] = bound.map(Number);
  assert.equal(lines, 30);
  assert.equal(padding, 40);
  assert.equal(lineHeight * fontSize, 25.2);
  assert.equal(history['overflow-y'], 'auto');
  assert.equal(history.flex, 'none');
  const input = declarations('.composer textarea', [compactQuery]);
  const inputLines = parseFloat(input['max-height']) / Number(input['line-height']);
  assert.ok(Math.abs(inputLines - 6) < 1e-9);
  assert.equal(input.height, input['max-height']);
  assert.equal(input['min-height'], input['max-height']);
  assert.equal(input['overflow-y'], 'auto');
  assert.equal(input.resize, 'none');
});

test('wide coarse phones override saved section sizes while desktop sizing remains available', () => {
  const tasks = '.overview-section[data-section="tasks"] .overview-section-body.sized .task-scroll';
  const section = '.overview-section-body.sized';
  assert.equal(declarations(section, [desktopQuery]).height, 'var(--section-height)');
  assert.equal(declarations(tasks, [desktopQuery])['max-height'], 'none');
  assert.equal(declarations('.workspace-frame .agent-panel', [desktopQuery]).display, 'grid');
  assert.equal(declarations('.app-shell', [desktopQuery]).height, '100dvh');
  assert.equal(declarations('.composer.sized textarea', [desktopQuery]).flex, '1');
  for (const media of [[compactQuery], [desktopQuery, compactQuery]]) {
    assert.deepEqual(properties(section, ['height', 'overflow'], media), { height: 'auto', overflow: 'visible' });
    assert.deepEqual(properties(tasks, ['max-height', 'flex'], media), { 'max-height': 'var(--task-viewport-height)', flex: 'none' });
  }
  assert.equal(declarations('.task-summary > .task-scroll')['overflow-y'], 'auto', 'the existing measured three-task viewport keeps its own scrolling');
});
