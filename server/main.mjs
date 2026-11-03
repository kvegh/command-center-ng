import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CodexRpc } from './rpc.mjs';
import { Workspace } from './workspace.mjs';
import { defaultAuthFile, loadPassword, Sessions } from './auth.mjs';
import { VERSION } from './version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
async function body(request) {
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 65_536) throw failure('Request is too large.', 413); }
  try { return JSON.parse(text || '{}'); } catch { throw failure('Invalid JSON.'); }
}

export async function createApp({ rpc, workspace, authFile = defaultAuthFile(), config = {} } = {}) {
  const settings = { host: '127.0.0.1', port: 4242, cwd: process.cwd(), dev: false, ...config };
  if (settings.publicOrigin) {
    const parsed = new URL(settings.publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== settings.publicOrigin) throw new Error('--public-origin must be an HTTP(S) origin without a path.');
  }
  const verify = await loadPassword(authFile);
  const sessions = new Sessions(); const clients = new Set();
  rpc ||= new CodexRpc({ socketPath: settings.socketPath });
  workspace ||= new Workspace(rpc);
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
          for (const agent of [...workspace.agents.values()]) { const { thread } = await rpc.call('thread/resume', { threadId: agent.id, excludeTurns: true }); agent.thread = thread; agent.questions = []; await workspace.history(agent.id); }
          workspace.changed(); return json(response, { connected: true });
        }
        if (path === '/api/agents' && request.method === 'GET') return json(response, await workspace.list(url.searchParams.get('cursor')));
        if (path === '/api/agents' && request.method === 'POST') return json(response, { id: await workspace.create(await body(request)) }, 201);
        const match = path.match(/^\/api\/agents\/([^/]+)\/(open|close|message|interrupt|history|answer)$/);
        if (match && request.method === 'POST') {
          const [, encoded, action] = match; const id = decodeURIComponent(encoded); const data = await body(request);
          if (action === 'open') await workspace.open(id);
          if (action === 'close') workspace.close(id);
          if (action === 'message') await workspace.send(id, data.text);
          if (action === 'interrupt') await workspace.interrupt(id);
          if (action === 'history') await workspace.history(id, data.cursor);
          if (action === 'answer') workspace.answer(id, data.requestId, data);
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
  const close = async () => { clearTimeout(broadcastTimer); for (const client of clients) client.response.end(); clients.clear(); workspace.off('change', publish); rpc.close(); await vite?.close(); await new Promise(resolve => server.close(resolve)); };
  return { server, workspace, rpc, close, settings };
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
