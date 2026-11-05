import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CodexRpc } from './rpc.mjs';
import { Workspace } from './workspace.mjs';
import { defaultAuthFile, loadPassword, Sessions } from './auth.mjs';
import { VERSION } from './version.mjs';
import { WorkspaceStore, WorkspacePersistence } from './workspace-store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
async function body(request) {
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 65_536) throw failure('Request is too large.', 413); }
  try { return JSON.parse(text || '{}'); } catch { throw failure('Invalid JSON.'); }
}

export async function createApp({ rpc, workspace, authFile = defaultAuthFile(), workspaceFile, config = {} } = {}) {
  const settings = { host: '127.0.0.1', port: 4242, cwd: process.cwd(), dev: false, ...config };
  if (settings.publicOrigin) {
    const parsed = new URL(settings.publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== settings.publicOrigin) throw new Error('--public-origin must be an HTTP(S) origin without a path.');
  }
  const verify = await loadPassword(authFile);
  const sessions = new Sessions(); const clients = new Set();
  rpc ||= new CodexRpc({ socketPath: settings.socketPath });
  workspace ||= new Workspace(rpc, { coordinator: true, claude: true });
  await workspace.claude?.initialize();
  await workspace.beads?.checkAvailable(settings.cwd);
  const persistence = new WorkspacePersistence(workspace, new WorkspaceStore(workspaceFile || join(dirname(authFile), 'workspace.json')));
  await persistence.initialize();
  const taskTimer = setInterval(() => {
    for (const id of workspace.agents.keys()) { void workspace.refreshTasks(id); void workspace.refreshObserved(id); }
  }, 5000);
  taskTimer.unref();
  let vite; let broadcastTimer;
  const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
  const publish = () => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      const message = `data: ${JSON.stringify(workspace.snapshot())}\n\n`;
      for (const client of clients) {
        if (client.response.writableLength > 4 * 1024 * 1024 || !sessions.valid(client.request)) { client.response.destroy(); clients.delete(client); }
        else client.response.write(message);
      }
    }, 80);
  };
  workspace.on('change', publish);
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    if (!settings.dev) response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = new URL('http://' + request.headers.host).hostname;
      const localAddress = request.socket.localAddress?.replace(/^::ffff:/, '');
      const allowedHosts = new Set([settings.host, localAddress, new URL(settings.publicOrigin || 'http://localhost').hostname]);
      if (['127.0.0.1', '::1'].includes(settings.host)) ['localhost', '127.0.0.1', '[::1]'].forEach(value => allowedHosts.add(value));
      if (!allowedHosts.has(host)) throw failure('Unrecognized host. Configure --public-origin for reverse-proxy access.', 403);
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.origin;
        let valid = false;
        try { valid = settings.publicOrigin ? origin === settings.publicOrigin : ['http:', 'https:'].includes(new URL(origin).protocol) && new URL(origin).host === request.headers.host; } catch {}
        if (!valid) throw failure('Request origin is not allowed.', 403);
        if (!request.headers['content-type']?.startsWith('application/json')) throw failure('Send application/json.', 415);
      }
      const url = new URL(request.url, 'http://' + request.headers.host);
      const path = url.pathname;
      if (path === '/healthz' && request.method === 'GET') return json(response, { ok: true, version: VERSION });
      if (path === '/api/session' && request.method === 'GET') return json(response, { authenticated: sessions.valid(request), version: VERSION });
      const secure = settings.publicOrigin?.startsWith('https://') || false;
      if (path === '/api/login' && request.method === 'POST') {
        if (!sessions.allowAttempt(request.socket.remoteAddress)) throw failure('Too many login attempts. Try again in five minutes.', 429);
        const data = await body(request);
        if (typeof data.password !== 'string' || data.password.length > 1024 || !verify(data.password)) throw failure('Incorrect password.', 401);
        response.setHeader('Set-Cookie', sessions.cookie(sessions.create(), secure)); return json(response, { authenticated: true });
      }
      if (path.startsWith('/api/')) {
        if (!sessions.valid(request)) throw failure('Sign in to continue.', 401);
        if (path === '/api/logout' && request.method === 'POST') { sessions.revoke(request); response.setHeader('Set-Cookie', sessions.cookie('', secure)); publish(); return json(response, { authenticated: false }); }
        if (path === '/api/state' && request.method === 'GET') return json(response, { ...workspace.snapshot(), defaultCwd: settings.cwd });
        if (path === '/api/events' && request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          response.write(`data: ${JSON.stringify(workspace.snapshot())}\n\n`);
          const client = { request, response }; clients.add(client);
          const heartbeat = setInterval(() => { if (!sessions.valid(request)) response.end(); else response.write(': heartbeat\n\n'); }, 15_000);
          request.on('close', () => { clearInterval(heartbeat); clients.delete(client); }); return;
        }
        if (path === '/api/connect' && request.method === 'POST') {
          await rpc.connect();
          await persistence.retry();
          for (const agent of [...workspace.agents.values()]) {
            if (agent.provider === 'claude') { await workspace.refreshObserved(agent.id); continue; }
            if (agent.observingOnly) { await workspace.refreshObserved(agent.id); continue; }
            if (agent.role === 'coordinator') { agent.observingOnly = true; await workspace.activate(agent.id); }
            else { const { thread } = await rpc.call('thread/resume', { threadId: agent.id, excludeTurns: true }); agent.thread = thread; }
            agent.questions = []; await workspace.history(agent.id);
          }
          workspace.changed(); return json(response, { connected: true });
        }
        if (path === '/api/agents' && request.method === 'GET') return json(response, await workspace.list(url.searchParams.get('cursor'), url.searchParams.get('provider') || 'codex'));
        if (request.method === 'POST') await persistence.restore();
        if (path === '/api/agents' && request.method === 'POST') return json(response, { id: await workspace.create(await body(request)) }, 201);
        if (path === '/api/coordinator' && request.method === 'POST') {
          if (!workspace.coordinator) throw failure('The coordinator is unavailable.', 503);
          const data = await body(request);
          if (data.action === 'clear-messages') { workspace.coordinator.clearMessages(); return json(response, workspace.coordinator.snapshot()); }
          if (Object.hasOwn(data, 'paused')) await workspace.coordinator.setPaused(data.paused);
          else { await workspace.coordinator.ensure(); if (data.action === 'refresh') { for (const worker of workspace.coordinator.workers()) workspace.coordinator.mark(worker.id, 'User requested a fresh summary', true); await workspace.coordinator.pump(); } }
          return json(response, workspace.coordinator.snapshot());
        }
        const detailRoute = path.match(/^\/api\/agents\/([^/]+)\/tasks\/([^/]+)$/);
        if (detailRoute && request.method === 'GET') return json(response, await workspace.taskDetail(decodeURIComponent(detailRoute[1]), decodeURIComponent(detailRoute[2])));
        const modelRoute = path.match(/^\/api\/agents\/([^/]+)\/model-settings$/);
        if (modelRoute && request.method === 'GET') return json(response, await workspace.modelSettings(decodeURIComponent(modelRoute[1])));
        if (modelRoute && request.method === 'POST') return json(response, await workspace.updateModel(decodeURIComponent(modelRoute[1]), await body(request)));
        const taskRoute = path.match(/^\/api\/agents\/([^/]+)\/tasks$/);
        if (taskRoute) {
          const id = decodeURIComponent(taskRoute[1]);
          if (request.method === 'GET') return json(response, await workspace.taskCatalog(id));
          if (request.method === 'POST') return json(response, await workspace.linkTasks(id, (await body(request)).ids));
        }
        const match = path.match(/^\/api\/agents\/([^/]+)\/(open|close|message|interrupt|history|answer|review|requests|report-settings|report|fork|parent|summary|return)$/);
        if (match && request.method === 'POST') {
          const [, encoded, action] = match; const id = decodeURIComponent(encoded); const data = await body(request);
          if (action === 'open') await workspace.open(id);
          if (action === 'close') workspace.close(id);
          if (action === 'message') await workspace.send(id, data.text);
          if (action === 'interrupt') await workspace.interrupt(id);
          if (action === 'history') await workspace.history(id, data.cursor);
          if (action === 'requests') return json(response, await workspace.recoverRequests(id));
          if (action === 'report-settings') { if (!workspace.coordinator) throw failure('Reporting is unavailable.', 503); return json(response, workspace.coordinator.setReportInterval(id, data.minutes, { notifyWorker: true })); }
          if (action === 'report') { if (!workspace.coordinator) throw failure('Reporting is unavailable.', 503); return json(response, workspace.coordinator.requestUserReport(id)); }
          if (action === 'answer') await workspace.answer(id, data.requestId, data);
          if (action === 'review') {
            if (!workspace.coordinator || workspace.coordinator.paused) throw failure('Resume the coordinator before requesting a review.', 409);
            const agent = workspace.agent(id); const question = agent.questions.find(q => q.id === data.requestId);
            if (!question || !['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method)) throw failure('Choose a pending command or file approval.', 400);
            question.review = { decision: 'queued', rationale: 'Review requested by the user.' };
            await workspace.coordinator.ensure(); workspace.coordinator.mark(id, 'User requested approval review', true); workspace.changed();
          }
          if (action === 'fork') return json(response, { id: await workspace.fork(id, data.lastTurnId) }, 201);
          if (action === 'parent') return json(response, { id: await workspace.parent(id) });
          if (action === 'summary') return json(response, await workspace.summarize(id));
          if (action === 'return') return json(response, { id: await workspace.returnToParent(id, data.text) });
          return json(response, { ok: true });
        }
        throw failure('Unknown API route.', 404);
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw failure('Method not allowed.', 405);
      if (vite) { vite.middlewares(request, response, error => { if (error) json(response, { error: 'Development asset error.' }, 500); }); return; }
      const base = resolve(root, 'dist');
      let file = resolve(base, '.' + decodeURIComponent(path));
      if (!file.startsWith(base + sep) && file !== base) throw failure('Not found.', 404);
      try { if (!(await stat(file)).isFile()) file = resolve(base, 'index.html'); } catch { if (extname(path)) throw failure('Not found.', 404); file = resolve(base, 'index.html'); }
      const content = await readFile(file);
      response.writeHead(200, { 'Content-Type': (mime[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.headersSent) response.end();
      else json(response, { error: error.message || 'Request failed.' }, error.status || 500);
    }
  });
  if (settings.dev) {
    const { createServer } = await import('vite');
    vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  }
  const close = async () => { await workspace.coordinator?.shutdown(); await workspace.claude?.shutdown(); clearInterval(taskTimer); clearTimeout(broadcastTimer); for (const client of clients) client.response.end(); clients.clear(); workspace.off('change', publish); rpc.close(); await vite?.close(); await new Promise(resolve => server.close(resolve)); await persistence.close(); };
  return { server, workspace, rpc, close, settings, persistence };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { host: { type: 'string', default: process.env.CCNG_HOST || '127.0.0.1' }, port: { type: 'string', default: process.env.CCNG_PORT || '4242' }, cwd: { type: 'string', default: process.cwd() }, socket: { type: 'string' }, 'public-origin': { type: 'string', default: process.env.CCNG_PUBLIC_ORIGIN }, dev: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) { console.log(`Command Center NG ${VERSION}\nUsage: npm start -- [--host ADDRESS] [--port 4242] [--cwd DIRECTORY] [--public-origin HTTPS_ORIGIN] [--socket PATH]\nDefault: http://127.0.0.1:4242. Set the application password with npm run password.`); }
  else {
    try {
      const port = Number(values.port); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port from 1 to 65535.');
      const app = await createApp({ config: { host: values.host, port, cwd: resolve(values.cwd), socketPath: values.socket, publicOrigin: values['public-origin'], dev: values.dev } });
      app.server.once('error', error => { console.error(`Cannot listen: ${error.message}`); process.exitCode = 1; app.rpc.close(); });
      app.server.listen(port, values.host, () => console.log(`Command Center NG ${VERSION} listening on http://${values.host}:${port}`));
      app.rpc.connect().catch(error => { app.workspace.error = error.message; app.workspace.changed(); });
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
    } catch (error) { console.error(`Cannot start: ${error.code === 'ENOENT' ? 'Set the application password first: npm run password' : error.message}`); process.exitCode = 1; }
  }
}
