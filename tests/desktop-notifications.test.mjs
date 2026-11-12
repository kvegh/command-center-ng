import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/desktop-notifications.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { requestDesktopNotifications, showTaskDesktopNotification } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const engineSource = await readFile(new URL('../src/task-notifications.ts', import.meta.url), 'utf8');
const engineCompiled = ts.transpileModule(engineSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { TaskNotificationEngine } = await import('data:text/javascript;base64,' + Buffer.from(engineCompiled).toString('base64'));

// Exercise the application's actual event effect without mounting native sessions
// or a browser. TypeScript's existing parser keeps the extraction scoped to the
// effect, while the real engine and native-notification helper run below.
const appSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const appTree = ts.createSourceFile('main.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const eventEffects = [];
function collectEventEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(appTree) === 'useEffect'
    && node.arguments[0]?.getText(appTree).includes('notificationEngine.current.update(')) eventEffects.push(node.arguments[0]);
  ts.forEachChild(node, collectEventEffect);
}
collectEventEffect(appTree);
assert.equal(eventEffects.length, 1, 'exercise the single existing notification effect');
const effectCode = ts.transpileModule('const effect = ' + eventEffects[0].getText(appTree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const effectFactory = new Function('authenticated', 'state', 'taskWatches', 'notificationEngine', 'showTaskDesktopNotification', 'openTaskAlert', 'setNotificationNotice', 'document', effectCode + '\nreturn effect;');

function fixture({ permission = 'default', requested = 'granted', secure = true, requestError = false, constructorError = false } = {}) {
  const calls = { requests: 0, focus: 0, notifications: [], closed: 0 };
  class Native {
    static permission = permission;
    static async requestPermission() {
      calls.requests++;
      if (requestError) throw new Error('Synthetic permission error');
      Native.permission = requested;
      return requested;
    }
    constructor(title, options) {
      if (constructorError) throw new TypeError('Synthetic mobile constructor restriction');
      this.close = () => { calls.closed++; };
      calls.notifications.push({ title, options, notification: this });
    }
  }
  return { calls, browser: { isSecureContext: secure, Notification: Native, focus: () => { calls.focus++; } } };
}

test('permission is requested only when the explicit request function sees default permission', async () => {
  const f = fixture();
  assert.deepEqual(await requestDesktopNotifications(f.browser), { enabled: true, notice: 'Desktop notifications enabled.' });
  assert.equal(f.calls.requests, 1); assert.equal(f.calls.notifications.length, 0);
  assert.equal((await requestDesktopNotifications(f.browser)).enabled, true);
  assert.equal(f.calls.requests, 1, 'already granted permission is not requested again');
});

test('unsupported and insecure contexts explain unavailable browser alerts without promising an in-app fallback or prompting', async () => {
  for (const browser of [{ isSecureContext: true, focus() {} }, fixture({ secure: false }).browser]) {
    const result = await requestDesktopNotifications(browser);
    assert.equal(result.enabled, false); assert.match(result.notice, /not supported|require HTTPS/);
    const notice = showTaskDesktopNotification({ id: 'task-event', kind: 'completed' }, () => {}, browser);
    assert.match(notice, /not supported|require HTTPS/);
    assert.doesNotMatch(result.notice + notice, /in-app|remain available/i);
  }
  const f = fixture({ secure: false }); await requestDesktopNotifications(f.browser);
  assert.equal(f.calls.requests, 0); assert.equal(f.calls.notifications.length, 0);
});

test('denied permission is respected without another permission request or notification', async () => {
  const f = fixture({ permission: 'denied' });
  const result = await requestDesktopNotifications(f.browser);
  assert.equal(result.enabled, false); assert.match(result.notice, /blocked in browser settings/);
  assert.match(showTaskDesktopNotification({ id: 'event', kind: 'needs-input' }, () => {}, f.browser), /blocked/);
  assert.equal(f.calls.requests, 0); assert.equal(f.calls.notifications.length, 0);
});

test('dismissed, denied and thrown permission outcomes return truthful disabled notices', async () => {
  for (const requested of ['default', 'denied']) {
    const f = fixture({ requested }); const result = await requestDesktopNotifications(f.browser);
    assert.equal(result.enabled, false); assert.equal(f.calls.requests, 1); assert.match(result.notice, /not granted|blocked/);
  }
  const f = fixture({ requestError: true });
  const result = await requestDesktopNotifications(f.browser);
  assert.equal(result.enabled, false); assert.match(result.notice, /could not enable/);
});

test('show never prompts and only granted permission permits construction', () => {
  for (const permission of ['default', 'denied']) {
    const f = fixture({ permission });
    assert.equal(typeof showTaskDesktopNotification({ id: 'event', kind: 'error' }, () => {}, f.browser), 'string');
    assert.equal(f.calls.requests, 0); assert.equal(f.calls.notifications.length, 0);
  }
});

test('all four desktop alerts use generic text and a stable event tag, never task or request details', () => {
  const f = fixture({ permission: 'granted' });
  for (const kind of ['needs-input', 'error', 'completed', 'request']) {
    assert.equal(showTaskDesktopNotification({ id: 'synthetic-event', kind, title: 'Private task title', workerName: 'Private worker', command: 'Private command', question: 'Private question' }, () => {}, f.browser), null);
    const { title, options } = f.calls.notifications.at(-1);
    assert.equal(title, 'Command Center NG'); assert.match(options.body, /Open Command Center NG to review it\.$/);
    if (kind === 'request') assert.match(options.body, /^A worker you are following /, 'native requests do not claim task ownership');
    if (kind === 'completed') assert.match(options.body, /was marked completed/, 'a task record is not independent delivery proof');
    assert.equal(options.tag, 'ccng-task-watch:synthetic-event');
    assert.ok(!JSON.stringify({ title, options }).includes('Private'));
    assert.deepEqual(Object.keys(options), ['body', 'tag']);
  }
  assert.equal(f.calls.requests, 0);
});

test('the app emits opted-in browser alerts while focused or hidden, deduplicates updates and preserves click context', () => {
  for (const visibilityState of ['visible', 'hidden']) {
    const f = fixture({ permission: 'granted' });
    const task = { id: 'watched-task', text: 'Example task', state: 'open', blockedBy: [] };
    const state = { connected: true, agents: [{ id: 'worker', name: 'Example worker', status: 'running', questions: [], tracker: { status: 'ready', tasks: [task] } }] };
    const opened = [], notices = [];
    const effect = effectFactory(true, state, { worker: ['watched-task'] }, { current: new TaskNotificationEngine() },
      (event, open) => showTaskDesktopNotification(event, open, f.browser),
      { current: event => opened.push(event) }, notice => notices.push(notice), { visibilityState, hasFocus: () => true });
    effect();
    assert.equal(f.calls.notifications.length, 0, 'initial observations do not replay historical events');
    task.state = 'closed'; effect(); effect();
    assert.equal(f.calls.notifications.length, 1, visibilityState + ' new event is delivered exactly once');
    f.calls.notifications[0].notification.onclick({ preventDefault() {} });
    assert.equal(opened.length, 1);
    assert.equal(opened[0].workerId, 'worker'); assert.equal(opened[0].taskId, 'watched-task');
    assert.equal(f.calls.focus, 1); assert.equal(f.calls.closed, 1);
    assert.equal(f.calls.requests, 0, 'snapshot effects never prompt for permission');
    assert.deepEqual(notices, []);
  }
});

test('click focuses the existing browser, opens the supplied CCNG context and closes the notification', () => {
  const f = fixture({ permission: 'granted' }); let opens = 0, prevented = false;
  assert.equal(showTaskDesktopNotification({ id: 'event', kind: 'request' }, () => { opens++; }, f.browser), null);
  f.calls.notifications[0].notification.onclick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(f.calls.focus, 1); assert.equal(opens, 1); assert.equal(f.calls.closed, 1);
});

test('native focus failure does not prevent opening the in-app context', () => {
  const f = fixture({ permission: 'granted' }); let opens = 0;
  f.browser.focus = () => { throw new Error('Synthetic focus refusal'); };
  showTaskDesktopNotification({ id: 'event', kind: 'completed' }, () => { opens++; }, f.browser);
  f.calls.notifications[0].notification.onclick({ preventDefault() {} });
  assert.equal(opens, 1); assert.equal(f.calls.closed, 1);
});

test('constructor restrictions explain the unavailable browser alert without promising an in-app fallback', () => {
  const f = fixture({ permission: 'granted', constructorError: true });
  const notice = showTaskDesktopNotification({ id: 'event', kind: 'completed' }, () => assert.fail('not clicked'), f.browser);
  assert.match(notice, /could not show/); assert.doesNotMatch(notice, /in-app|remain available/i);
  assert.equal(f.calls.requests, 0);
});

test('malformed alert identities and kinds never reach the desktop constructor', () => {
  const f = fixture({ permission: 'granted' });
  for (const event of [{ id: '', kind: 'completed' }, { id: 'x'.repeat(513), kind: 'completed' }, { id: 'event', kind: 'invented' }]) {
    assert.match(showTaskDesktopNotification(event, () => {}, f.browser), /could not be prepared/);
  }
  assert.equal(f.calls.notifications.length, 0);
});
