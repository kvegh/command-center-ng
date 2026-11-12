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
  for (const name of ['ResizableComposer', 'WorkerSettings', 'CoordinatorContext']) {
    const elements = findNodes(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(main) === name);
    assert.equal(elements.length, 1, `${name} has one responsive entry point`);
    const compact = elements[0].attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'compact');
    assert.equal(compact?.initializer?.expression?.getText(main), 'compactLayout', `${name} uses the shared responsive state`);
  }
  const matchingQueries = findNodes(node => ts.isCallExpression(node) && node.expression.getText(main) === 'window.matchMedia'
    && node.arguments[0]?.getText(main) === 'compactLayoutQuery');
  assert.equal(matchingQueries.length, 2, 'initial state and responsive updates use the same query');
});

test('compact layout uses normal page flow, full-width overview and one scrollable tab row', () => {
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
    assert.deepEqual(properties('.topbar > .tabs-row .tabs', ['display', 'width', 'flex-wrap', 'overflow'], media), { display: 'flex', width: 'auto', 'flex-wrap': 'nowrap', overflow: 'auto hidden' });
    assert.equal(declarations('.topbar > .tabs-row', media).display, 'flex', 'Coordinator remains beside the same scrolling row');
    assert.equal(declarations('.topbar .tabs .tab-wrap', media).flex, '0 0 170px', 'touch tabs keep a stable width instead of shrinking or wrapping');
    assert.match(declarations('.tab-wrap[data-worker-tab] > .agent-tab', media)['touch-action'], /pan-x/, 'finger swipes can scroll the tabs horizontally');
    for (const selector of ['.overview-section[data-section="recap"]', '.sidebar-divider', '.overview-section-divider', '.composer-divider']) {
      assert.equal(declarations(selector, media).display, 'none', `${selector} stays hidden on narrow and wide coarse-pointer devices`);
    }
  }
});

test('mobile history uses document scrolling while the input retains six internally scrolling lines', () => {
  for (const media of [[compactQuery], [desktopQuery, compactQuery]]) {
    assert.deepEqual(properties('.conversation', ['flex', 'min-height', 'max-height', 'overflow'], media), {
      flex: 'none', 'min-height': '0', 'max-height': 'none', overflow: 'visible',
    }, 'narrow and landscape coarse-pointer devices have no nested history scroll region');
  }
  assert.equal(declarations('.conversation', [desktopQuery]).overflow, 'auto', 'desktop keeps its independent history scroller');
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
    assert.deepEqual(properties('.context', ['display', 'height'], media), { display: 'block', height: 'auto' });
    assert.deepEqual(properties('.overview-sections', ['flex', 'overflow'], media), { flex: 'none', overflow: 'visible' });
    assert.equal(declarations('.overview-scroll-sections', media).display, 'contents', 'the desktop scrolling group does not add a separate mobile scroll region');
    assert.deepEqual(properties('.overview-section-bottom', ['display', 'flex', 'max-height', 'overflow'], media), { display: 'block', flex: 'none', 'max-height': 'none', overflow: 'visible' });
    assert.deepEqual(properties('.overview-section-bottom > .overview-section-body', ['flex', 'overflow'], media), { flex: 'none', overflow: 'visible' });
  }
  assert.equal(declarations('.task-summary > .task-scroll')['overflow-y'], 'auto', 'the existing measured three-task viewport keeps its own scrolling');
});

test('desktop bounds both overview scroll regions and pins settings without losing coordinator content', () => {
  assert.deepEqual(properties('.context', ['display', 'height', 'min-height', 'overflow'], [desktopQuery]), {
    display: 'flex', height: '100%', 'min-height': '0', overflow: 'hidden',
  });
  assert.deepEqual(properties('.overview-sections', ['flex', 'min-height', 'overflow'], [desktopQuery]), {
    flex: '1 1 0', 'min-height': '0', overflow: 'hidden',
  });
  assert.deepEqual(properties('.overview-scroll-sections', ['display', 'flex', 'min-height', 'overflow-y'], [desktopQuery]), {
    display: 'flex', flex: '1 1 0', 'min-height': '0', 'overflow-y': 'auto',
  });
  assert.equal(declarations('.overview-scroll-sections > .overview-section', [desktopQuery]).flex, '0 0 auto', 'oversized saved content scrolls instead of shrinking or removing sections');
  assert.deepEqual(properties('.overview-section-bottom', ['flex', 'min-height', 'max-height', 'overflow'], [desktopQuery]), {
    flex: '0 1 auto', 'min-height': '0', 'max-height': '55%', overflow: 'hidden',
  });
  assert.deepEqual(properties('.overview-section-bottom > .overview-section-body', ['flex', 'min-height', 'overflow-y'], [desktopQuery]), {
    flex: '1 1 auto', 'min-height': '0', 'overflow-y': 'auto',
  });
  const calls = findNodes(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(main) === 'OverviewSections');
  assert.equal(calls.length, 2, 'worker and coordinator each retain one overview');
  const footer = node => node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'bottomSection')?.initializer?.text;
  const worker = calls.find(node => footer(node) === 'settings');
  assert.ok(worker, 'worker settings are assigned to the bounded bottom section');
  assert.equal(calls.filter(node => footer(node) === undefined).length, 1, 'coordinator remains wholly inside its scrolling group');
});

test('mobile overview reduces spacing while desktop retains its existing layout', () => {
  assert.equal(declarations('.context', [desktopQuery]).padding, '22px 18px');
  assert.equal(declarations('.goal-row', [desktopQuery]).display, 'grid');
  assert.equal(declarations('.task-summary > .task-heading', [desktopQuery])['flex-direction'], 'column');
  assert.equal(declarations('.coordinator-worker', [desktopQuery]).padding, '12px 0');
  assert.equal(declarations('.worker-settings-summary', [desktopQuery]).display, 'none');
  for (const media of [[compactQuery], [desktopQuery, compactQuery]]) {
    assert.equal(declarations('.context', media).padding, '8px 12px');
    assert.equal(declarations('.overview-sections', media).gap, '8px');
    assert.equal(declarations('.goal-row', media).display, 'flex');
    assert.deepEqual(properties('.task-summary > .task-heading', ['flex-direction', 'flex-wrap'], media), { 'flex-direction': 'row', 'flex-wrap': 'wrap' });
    assert.equal(declarations('.coordinator-worker', media).padding, '6px 0');
    assert.equal(declarations('.coordinator-guidance', media).display, 'none');
    assert.equal(declarations('.worker-settings.compact .worker-settings-summary', media).display, 'list-item');
  }
  for (const selector of ['.coordinator-worker-summary .coordinator-input-label', '.coordinator-worker-summary .coordinator-input-task']) {
    assert.equal(declarations(selector, [desktopQuery, compactQuery]).display, 'block', 'input needs remain visible when coordinator cards are compacted');
  }
});

test('responsive settings expose one Report now button and a focusable mobile disclosure', () => {
  assert.equal(declarations('.worker-report-mobile', [desktopQuery]).display, 'none', 'desktop hides the duplicate mobile button from layout and keyboard navigation');
  assert.equal(declarations('.button', [desktopQuery]).display, 'inline-flex');
  assert.notEqual(declarations('.worker-settings.compact .worker-report-desktop', [desktopQuery]).display, 'none');
  for (const media of [[compactQuery], [desktopQuery, compactQuery]]) {
    assert.equal(declarations('.worker-settings.compact .worker-report-desktop', media).display, 'none', 'opening mobile settings does not reveal a second Report now button');
    assert.deepEqual(properties('.worker-settings.compact .worker-report-mobile', ['display', 'position', 'margin-top'], media), {
      display: 'flex', position: undefined, 'margin-top': '6px',
    });
    assert.equal(declarations('.worker-settings.compact', media).position, 'relative');
    const summary = declarations('.worker-settings.compact .worker-settings-summary', media);
    assert.equal(summary.display, 'list-item');
    assert.equal(summary['min-height'], '36px');
    assert.equal(summary.padding, '7px 0', 'the report row follows in normal flow without reserving overlapping header space');
    assert.ok(declarations('.worker-settings.compact .worker-settings-summary:focus-visible', media).outline, 'keyboard focus remains visible on the disclosure');
  }
});

test('empty native questions disappear only on mobile; pending and undelivered attention remain visible', () => {
  const ownStatus = findNodes(node => ts.isVariableDeclaration(node) && node.name.getText(main) === 'activeOwnStatus')[0];
  const evaluateOwnStatus = new Function('active', `return (${ownStatus.initializer.getText(main)});`);
  for (const id of ['questions', 'coordinator-questions']) {
    const sections = findNodes(node => ts.isObjectLiteralExpression(node) && node.properties.some(property =>
      ts.isPropertyAssignment(property) && property.name.getText(main) === 'id' && property.initializer.text === id));
    assert.equal(sections.length, 1, `one ${id} section`);
    const visible = sections[0].properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(main) === 'visible');
    assert.ok(visible, `${id} has a visibility condition`);
    // Evaluate the actual bounded JSX condition rather than copying its logic.
    const evaluate = new Function('compact', 'compactLayout', 'agent', 'active', 'activeOwnStatus', `return (${visible.initializer.getText(main)});`);
    for (const compact of [false, true]) {
      for (const [status, questions, mobileVisible] of [
        ['idle', [], false], ['running', [], false],
        ['attention', [], true], ['idle', [{ id: 'pending-question' }], true],
        ['attention', [{ id: 'pending-question' }], true],
      ]) {
        const worker = { status, questions };
        assert.equal(evaluate(compact, compact, worker, worker, evaluateOwnStatus(worker)), !compact || mobileVisible,
          `${id}: compact=${compact}, status=${status}, requests=${questions.length}`);
      }
      if (id === 'coordinator-questions') assert.equal(evaluate(compact, compact, undefined, undefined), false, 'missing coordinator does not create a questions section');
      if (id === 'questions') {
        const worker = { status: 'attention', ownStatus: 'idle', questions: [] };
        assert.equal(evaluate(compact, compact, worker, worker, evaluateOwnStatus(worker)), !compact,
          'child-only attention does not create a missing parent request on mobile');
      }
    }
  }
});


test('mobile page scrolling preserves saved desktop chat positions across tab changes', () => {
  const restore = findNodes(node => ts.isCallExpression(node) && node.expression.getText(main) === 'useLayoutEffect'
    && node.arguments[0]?.getText(main).includes('node.scrollTop'))[0];
  const choose = findNodes(node => ts.isVariableDeclaration(node) && node.name.getText(main) === 'choose')[0].initializer;
  const history = findNodes(node => ts.isJsxOpeningElement(node) && node.attributes.properties.some(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.text === 'className' && attribute.initializer?.text === 'conversation'))[0];
  const onScroll = history.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'onScroll').initializer.expression;
  const compile = (node, environment) => new Function(...Object.keys(environment), ts.transpile(`return (${node.getText(main)});`, { target: ts.ScriptTarget.ES2022 }))(...Object.values(environment));
  const positions = { current: { first: 240, second: 480 } }, bottom = { current: { first: false, second: false } };
  const node = { scrollTop: 0, scrollHeight: 1200, clientHeight: 600 };
  const desktopScrollNeedsRestore = { current: false };
  const previous = { current: 'first' }, nearBottom = { current: false }, focusTarget = { current: null };
  let selected, saves = 0;
  const environment = { compactLayout: true, scroll: { current: node }, active: { id: 'first' }, positions, bottom, previous, nearBottom, focusTarget, desktopScrollNeedsRestore,
    flushSync: callback => callback(), setSelected: id => { selected = id; }, focusComposer() {}, scheduleBrowserSave: () => { saves++; } };
  compile(restore.arguments[0], environment)();
  assert.equal(previous.current, 'first', 'mobile keeps current-chat tracking for branch return');
  environment.compactLayout = false; compile(restore.arguments[0], environment)();
  assert.equal(node.scrollTop, 240, 'same chat restores after desktop to mobile to desktop rotation');
  environment.compactLayout = true; node.scrollTop = 0; compile(restore.arguments[0], environment)();
  compile(onScroll, environment)({ currentTarget: node });
  compile(choose, environment)('second');
  assert.deepEqual(positions.current, { first: 240, second: 480 });
  assert.deepEqual(bottom.current, { first: false, second: false });
  assert.equal(saves, 0); assert.equal(selected, 'second'); assert.equal(node.scrollTop, 0);
  environment.active = { id: 'second' }; compile(restore.arguments[0], environment)();
  assert.equal(previous.current, 'second', 'mobile branch return follows the actual current chat');
  environment.compactLayout = false; environment.active = { id: 'second' };
  compile(restore.arguments[0], environment)();
  assert.equal(node.scrollTop, 480, 'desktop restores its saved position after mobile use');
  node.scrollTop = 520; compile(onScroll, environment)({ currentTarget: node });
  assert.equal(positions.current.second, 520); assert.equal(saves, 1);
});
