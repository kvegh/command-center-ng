import http from 'node:http';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CodexRpc } from './rpc.mjs';
import { Workspace } from './workspace.mjs';
import { defaultAuthFile, loadAuthState, setPassword, Sessions, clearAllLogins } from './auth.mjs';
import { authenticationUnavailable } from './session-store.mjs';
import { VERSION } from './version.mjs';
import { resolveListenAddress, listenAddresses } from './listen-address.mjs';
import { loadTlsSettings, certificateInfo } from './tls-settings.mjs';
import { readRuntimeConfig, runtimeConfigFile } from './runtime-config.mjs';
import { ensureCodexQuestions } from './codex-setup.mjs';
import { WorkspaceStore, WorkspacePersistence } from './workspace-store.mjs';
import { DecisionStore } from './decision-store.mjs';
import imageLimits from './image-limits.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const failure = (message, status = 400, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const normalizeHost = host => host?.replace(/^\[|\]$/g, '').toLowerCase();
const loopbackAddress = address => ['127.0.0.1', '::1'].includes(address?.replace(/^::ffff:/, ''));

export function requestOriginAllowed(request, settings, listenerHost = settings.host) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') return false;
  // The configured proxy origin remains authoritative for its normal route.
  if (settings.publicOrigin && origin === settings.publicOrigin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    if (!settings.publicOrigin) return (settings.https ? parsed.protocol === 'https:' : ['http:', 'https:'].includes(parsed.protocol)) && parsed.host === request.headers.host;

    // A direct HTTPS connection on an explicitly local listener also supports
    // SSH forwarding. Require real TLS and loopback socket endpoints; neither
    // Origin alone nor forwarded headers establish that this is a local route.
    if (!settings.https || !request.socket.encrypted
      || !['localhost', '127.0.0.1', '::1'].includes(normalizeHost(listenerHost))
      || !loopbackAddress(request.socket.localAddress) || !loopbackAddress(request.socket.remoteAddress)) return false;
    const target = new URL('https://' + request.headers.host);
    return !target.username && !target.password && ['localhost', '127.0.0.1', '::1'].includes(normalizeHost(target.hostname))
      && parsed.protocol === 'https:' && parsed.origin === target.origin;
  } catch { return false; }
}
async function body(request, limit = 65_536) {
  const chunks = []; let length = 0;
  for await (const chunk of request) { length += chunk.length; if (length > limit) throw failure('Request is too large.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw failure('Invalid JSON.'); }
}

export async function createApp({ rpc, workspace, authFile = defaultAuthFile(), workspaceFile, config = {} } = {}) {
  const settings = { host: '127.0.0.1', port: 4242, protocol: 'http', cwd: process.cwd(), dev: false, ...config };
  if (settings.protocol !== undefined && !['http', 'https'].includes(settings.protocol)) throw new Error('Choose --protocol http or https.');
  if (settings.publicOrigin) {
    const parsed = new URL(settings.publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== settings.publicOrigin) throw new Error('--public-origin must be an HTTP(S) origin without a path.');
  }
  if (![undefined, 'disabled', 'htpasswd-proxy'].includes(settings.firstPasswordSetup)) throw new Error('Choose first_password_setup: disabled or htpasswd-proxy.');
  const browserSetup = settings.firstPasswordSetup === 'htpasswd-proxy';
  if (browserSetup && !settings.publicOrigin?.startsWith('https://')) throw new Error('First-password setup through htpasswd-proxy requires an explicit HTTPS public origin and an access-restricted backend.');
  const tls = settings.protocol === 'http' ? undefined : await loadTlsSettings(settings.tlsCert, settings.tlsKey);
  if (settings.protocol === 'https' && !tls) throw new Error('HTTPS requires both a certificate and private key. Set tls_certificate and tls_private_key in etc/config.conf, or supply --tls-cert and --tls-key.');
  settings.https = !!tls;
  if (tls) {
    if (settings.publicOrigin && !settings.publicOrigin.startsWith('https://')) throw new Error('Direct HTTPS requires an https:// public origin.');
    const name = (settings.publicOrigin ? new URL(settings.publicOrigin).hostname : settings.host).replace(/^\[|\]$/g, '');
    if (['0.0.0.0', '::'].includes(name)) throw new Error('Set --public-origin https://YOUR_HOSTNAME when using HTTPS on a wildcard address.');
    const certificate = new X509Certificate(tls.cert);
    settings.certificate = certificateInfo(tls.cert);
    if (!(isIP(name) ? certificate.checkIP(name) : certificate.checkHost(name, { subject: 'never', partialWildcards: false }))) throw new Error('The TLS certificate does not cover ' + name + ' in its subject alternative names. Set --public-origin to a covered HTTPS hostname or provide a suitable certificate. Certificate: ' + JSON.stringify(settings.certificate));
  }
  await loadAuthState(authFile, { allowMissing: browserSetup });
  const refreshAuthState = async () => {
    try {
      return await loadAuthState(authFile, { allowMissing: browserSetup });
    } catch { throw authenticationUnavailable(); }
  };
  const setupHostAllowed = request => browserSetup && request.headers.host === new URL(settings.publicOrigin).host;
  const sessions = new Sessions(authFile); const clients = new Set();
  await sessions.initialize();
  rpc ||= new CodexRpc({ socketPath: settings.socketPath });
  workspace ||= new Workspace(rpc, { coordinator: true, claude: true });
  await workspace.claude?.initialize();
  await workspace.beads?.checkAvailable(settings.cwd);
  // Load past decisions before restoration can publish a new startup dashboard.
  // These explanatory records never restore approvals or queued actions.
  if (workspace.coordinator?.initializeDecisionHistory) await workspace.coordinator.initializeDecisionHistory(new DecisionStore(join(dirname(workspaceFile || join(dirname(authFile), 'workspace.json')), 'decisions.jsonl')));
  const persistence = new WorkspacePersistence(workspace, new WorkspaceStore(workspaceFile || join(dirname(authFile), 'workspace.json')));
  await persistence.initialize();
  const taskTimer = setInterval(() => {
    for (const id of workspace.agents.keys()) { void workspace.refreshTasks(id); void workspace.refreshObserved(id); }
  }, 5000);
  taskTimer.unref();
  let vite; let broadcastTimer; let broadcasting = false; let broadcastAgain = false; let appClosing = false;
  const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
  const publish = () => {
    if (appClosing) return;
    if (broadcasting) { broadcastAgain = true; return; }
    // Coalesce bursts without letting continuous worker updates postpone delivery indefinitely.
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(async () => {
      broadcastTimer = null; broadcasting = true;
      try {
        const authenticated = await Promise.all([...clients].map(async client => {
          try {
            if (client.response.writableLength <= 4 * 1024 * 1024 && await sessions.valid(client.request)) return client;
          } catch { console.warn('Authentication state unavailable; closing an event stream.'); }
          client.response.destroy(); clients.delete(client); return null;
        }));
        if (appClosing) return;
        const message = `data: ${JSON.stringify(workspace.snapshot())}\n\n`;
        for (const client of authenticated) if (client && clients.has(client) && !client.response.destroyed) client.response.write(message);
      } finally {
        broadcasting = false;
        if (broadcastAgain) { broadcastAgain = false; publish(); }
      }
    }, 80);
  };
  workspace.on('change', publish);
  const serve = async (request, response, listenerHost = settings.host) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    if (!settings.dev) response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = normalizeHost(new URL('http://' + request.headers.host).hostname);
      const localAddress = request.socket.localAddress?.replace(/^::ffff:/, '');
      const allowedHosts = new Set([listenerHost, localAddress, new URL(settings.publicOrigin || 'http://localhost').hostname]);
      if (['localhost', '127.0.0.1', '::1'].includes(normalizeHost(listenerHost))) ['localhost', '127.0.0.1', '[::1]'].forEach(value => allowedHosts.add(value));
      if (![...allowedHosts].some(allowed => normalizeHost(allowed) === host)) throw failure('Unrecognized host. Configure --public-origin for reverse-proxy access.', 403);
      if (!['GET', 'HEAD'].includes(request.method)) {
        if (!requestOriginAllowed(request, settings, listenerHost)) throw failure('Request origin is not allowed.', 403);
        if (!request.headers['content-type']?.startsWith('application/json')) throw failure('Send application/json.', 415);
      }
      const url = new URL(request.url, 'http://' + request.headers.host);
      const path = url.pathname;
      if (path === '/healthz' && request.method === 'GET') return json(response, { ok: true, version: VERSION });
      if (path === '/api/session' && request.method === 'GET') {
        const current = await refreshAuthState();
        return json(response, { authenticated: await sessions.valid(request), version: VERSION, ...(!current ? { setupRequired: true, setupAllowed: setupHostAllowed(request) } : {}) });
      }
      const secure = !!tls || settings.publicOrigin?.startsWith('https://') || false;
      if (path === '/api/setup' && request.method === 'POST') {
        // The operator explicitly asserts htpasswd protection; forwarded headers are not proof.
        if (!setupHostAllowed(request) || request.headers.origin !== settings.publicOrigin) throw failure('First-password setup requires the configured htpasswd-protected HTTPS address.', 403);
        if (!sessions.allowAttempt(request.socket.remoteAddress)) throw failure('Too many setup attempts. Try again in five minutes.', 429);
        if (await refreshAuthState()) throw failure('An application password already exists. Sign in instead.', 409);
        const data = await body(request);
        if (!data || typeof data.password !== 'string' || typeof data.confirmation !== 'string') throw failure('Enter and confirm the new application password.');
        if (data.password.length < 12 || data.password.length > 4096) throw failure('Use a password with 12–4096 characters.');
        if (data.password !== data.confirmation) throw failure('Passwords do not match.');
        try { await setPassword(data.password, authFile, { createOnly: true }); }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          await refreshAuthState();
          throw failure('An application password was created by another setup. Sign in instead.', 409);
        }
        const created = await refreshAuthState();
        if (!created?.verify(data.password)) throw failure('Authentication changed while signing in. Sign in again.', 403, 'authentication_required');
        response.setHeader('Set-Cookie', sessions.cookie(await sessions.create(created.fingerprint), true)); return json(response, { authenticated: true });
      }
      if (path === '/api/login' && request.method === 'POST') {
        if (!sessions.allowAttempt(request.socket.remoteAddress)) throw failure('Too many login attempts. Try again in five minutes.', 429);
        const data = await body(request);
        const current = await refreshAuthState();
        if (!current) throw failure('Create the application password through the configured setup address first.', 409);
        if (!data || typeof data.password !== 'string' || data.password.length > 4096 || !current.verify(data.password)) throw failure('Incorrect password.', 403, 'invalid_password');
        response.setHeader('Set-Cookie', sessions.cookie(await sessions.create(current.fingerprint), secure)); return json(response, { authenticated: true });
      }
      if (path.startsWith('/api/')) {
        if (!await sessions.valid(request)) throw failure('Sign in to continue.', 403, 'authentication_required');
        const image = path.match(/^\/api\/agents\/([^/]+)\/messages\/([^/]+)\/images\/(\d+)$/);
        if (image && request.method === 'GET') {
          const result = workspace.messageImage(decodeURIComponent(image[1]), decodeURIComponent(image[2]), Number(image[3]));
          response.writeHead(200, { 'Content-Type': result.mimeType, 'Content-Length': result.bytes.length, 'Cache-Control': 'no-store' });
          response.end(result.bytes); return;
        }
        if (path === '/api/logout' && request.method === 'POST') { await sessions.revoke(request); response.setHeader('Set-Cookie', sessions.cookie('', secure)); publish(); return json(response, { authenticated: false }); }
        if (path === '/api/state' && request.method === 'GET') return json(response, { ...workspace.snapshot(), defaultCwd: settings.cwd });
        if (path === '/api/events' && request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          response.write(`data: ${JSON.stringify(workspace.snapshot())}\n\n`);
          const client = { request, response }; clients.add(client);
          const heartbeat = setInterval(async () => {
            try {
              if (!await sessions.valid(request)) response.end();
              else if (!response.destroyed && !response.writableEnded) response.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
            } catch { console.warn('Authentication state unavailable; closing an event stream.'); response.end(); }
          }, 15_000);
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
            // Resume can replay pending requests before it returns. Keep those exact records visible.
            await workspace.history(agent.id);
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
        const match = path.match(/^\/api\/agents\/([^/]+)\/(open|close|message|interrupt|history|answer|review|requests|report-settings|report|fork|parent|summary|return|handoff)$/);
        if (match && request.method === 'POST') {
          const [, encoded, action] = match; const id = decodeURIComponent(encoded); const data = await body(request, action === 'message' ? imageLimits.maxRequestBytes : 65_536);
          if (action === 'open') await workspace.open(id);
          if (action === 'close') workspace.close(id);
          if (action === 'message') await workspace.send(id, data.text, { images: data.images });
          if (action === 'interrupt') await workspace.interrupt(id);
          if (action === 'history') await workspace.history(id, data.cursor);
          if (action === 'requests') {
            if (data.requestThreadId !== undefined && data.requestThreadId !== id) {
              if (data.requestId !== undefined || data.reviewToken !== undefined) {
                const context = workspace.resolveRequestContext(workspace.agent(id), data.requestThreadId);
                const question = context.questions.find(candidate => candidate.id === data.requestId && candidate.reviewToken === data.reviewToken);
                if (!question || (question.params.turnId != null && data.turnId !== question.params.turnId) || (question.params.itemId != null && data.itemId !== question.params.itemId)) throw failure('Choose the exact current subagent request before loading its details.', 409);
              }
            }
            return json(response, await workspace.recoverRequests(id, data.requestThreadId));
          }
          if (action === 'report-settings') { if (!workspace.coordinator) throw failure('Reporting is unavailable.', 503); return json(response, workspace.coordinator.setReportInterval(id, data.minutes, { notifyWorker: true })); }
          if (action === 'report') { if (!workspace.coordinator) throw failure('Reporting is unavailable.', 503); return json(response, workspace.coordinator.requestUserReport(id, { detailed: data.detailed })); }
          if (action === 'answer') await workspace.answer(id, data.requestId, data, data.requestThreadId);
          if (action === 'review') {
            if (!workspace.coordinator || workspace.coordinator.paused) throw failure('Resume the coordinator before requesting a review.', 409);
            const agent = workspace.agent(id); const context = workspace.resolveRequestContext(agent, data.requestThreadId ?? id);
            const question = context.questions.find(q => q.id === data.requestId && (context === agent || q.reviewToken === data.reviewToken));
            if (!question || !['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(question.method)) throw failure('Choose a pending command or file approval.', 400);
            if (context !== agent && ((question.params.turnId != null && data.turnId !== question.params.turnId) || (question.params.itemId != null && data.itemId !== question.params.itemId))) throw failure('This subagent request changed. Reload its current details.', 409);
            question.review = { decision: 'queued', rationale: 'Review requested by the user.' };
            await workspace.coordinator.ensure(); workspace.coordinator.mark(id, 'User requested approval review', true); workspace.changed();
          }
          if (action === 'fork') return json(response, { id: await workspace.fork(id, data.lastTurnId) }, 201);
          if (action === 'parent') return json(response, { id: await workspace.parent(id) });
          if (action === 'handoff') return json(response, workspace.startHandoff(id), 202);
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
      else json(response, { error: error.message || 'Request failed.', ...(['authentication_required', 'invalid_password', 'authentication_unavailable'].includes(error.code) ? { code: error.code } : {}) }, error.status || 500);
    }
  };
  const createListener = host => {
    const handler = (request, response) => serve(request, response, host);
    return { host, server: tls ? https.createServer(tls, handler) : http.createServer(handler) };
  };
  const listeners = [createListener(settings.host)];
  const server = listeners[0].server;
  if (settings.dev) {
    const { createServer } = await import('vite');
    vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  }
  let closing;
  const close = () => closing ||= (async () => {
    appClosing = true;
    await workspace.coordinator?.shutdown(); await workspace.claude?.shutdown();
    clearInterval(taskTimer); clearTimeout(broadcastTimer);
    for (const client of clients) client.response.end();
    clients.clear(); workspace.off('change', publish); rpc.close(); await vite?.close();
    await Promise.all(listeners.map(listener => new Promise(resolve => listener.server.close(resolve))));
    await persistence.close();
    // Late review completions may have queued writes during listener cleanup.
    const decisionLogError = await workspace.coordinator?.flushDecisionHistory?.();
    if (decisionLogError) console.warn('Decision history warning at shutdown: ' + decisionLogError);
  })();
  const listen = async (selection, port = settings.port) => {
    if (closing || listeners.some(listener => listener.server.listening)) throw new Error('The application listener has already started or closed.');
    if (selection.host !== settings.host) throw new Error('The listening selection must match the configured host.');
    try {
      let sharedPort = port;
      for (const [index, host] of listenAddresses(selection).entries()) {
        const listener = index === 0 ? listeners[0] : createListener(host);
        if (index > 0) listeners.push(listener);
        await new Promise((resolve, reject) => {
          const failed = error => { listener.server.off('error', failed); reject(error); };
          listener.server.once('error', failed);
          listener.server.listen(sharedPort, host, () => { listener.server.off('error', failed); resolve(); });
        });
        // Tests can request an ephemeral port; the second listener must use the
        // primary listener's actual port, never allocate a different one.
        sharedPort = listener.server.address().port;
      }
      return listeners.map(listener => ({ ...listener, port: listener.server.address().port }));
    } catch (error) {
      await close();
      throw error;
    }
  };
  return { server, listen, workspace, rpc, close, settings, persistence };
}

export function runtimeOptions(args = process.argv.slice(2), env = process.env, fileValues = {}) {
  return parseArgs({ args, options: {
    host: { type: 'string', default: env.CCNG_HOST || fileValues.host || undefined },
    port: { type: 'string', default: env.CCNG_PORT || fileValues.port || '4242' },
    protocol: { type: 'string', default: env.CCNG_PROTOCOL || fileValues.protocol || 'http' },
    cwd: { type: 'string', default: process.cwd() },
    socket: { type: 'string' },
    'public-origin': { type: 'string', default: env.CCNG_PUBLIC_ORIGIN ?? fileValues['public-origin'] },
    'first-password-setup': { type: 'string', default: env.CCNG_FIRST_PASSWORD_SETUP || fileValues['first-password-setup'] || 'disabled' },
    'tls-cert': { type: 'string', default: env.CCNG_TLS_CERT || fileValues['tls-cert'] || undefined },
    'tls-key': { type: 'string', default: env.CCNG_TLS_KEY || fileValues['tls-key'] || undefined },
    dev: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, 'clear-logins': { type: 'boolean' }
  } }).values;
}

export async function loadRuntimeOptions(args = process.argv.slice(2), env = process.env, { appDir = root } = {}) {
  const requested = runtimeOptions(args, env);
  if (requested.help || requested['clear-logins']) return requested;
  return runtimeOptions(args, env, await readRuntimeConfig(runtimeConfigFile(appDir)));
}

export function runtimeHelp() {
  return `Command Center NG ${VERSION}
Usage: command-center-ng [--host ADDRESS] [--port PORT] [--protocol https|http] [--cwd DIRECTORY]
                         [--public-origin HTTPS_ORIGIN] [--socket PATH] [--dev]
                         [--tls-cert CERTIFICATE_CHAIN_FILE --tls-key PRIVATE_KEY_FILE]

  --host ADDRESS        Optional listening-address override. Without --host or
                        CCNG_HOST, select the Linux default-route IPv4 interface
                        plus 127.0.0.1 on the same port. An explicit host selects
                        one listening address.
                        127.0.0.1: local only; 0.0.0.0: all IPv4 interfaces.
                        Explicit IPv6 addresses are also supported.
  --port PORT           Listening port (default: 4242).
  --protocol https|http HTTP by default; select HTTPS in the config or explicitly.
  --cwd DIRECTORY       Existing project/task working directory.
  --public-origin URL   Browser-facing origin when using an existing HTTPS proxy.
  --first-password-setup MODE
                        disabled (default) or htpasswd-proxy. Enable browser
                        password creation only behind enforced Basic Auth on
                        every route, with restricted direct backend access and
                        an explicit HTTPS --public-origin. No setup code is used.
  --socket PATH         Existing local Codex daemon socket.
  --tls-cert FILE       PEM certificate/full-chain file for direct HTTPS.
  --tls-key FILE        Matching PEM private key; both TLS files are required.
  --dev                 Enable the development frontend.
  --clear-logins        Invalidate all saved application logins and exit, including
                        logins in running servers. Uses CCNG_CONFIG_DIR (or the
                        default private config directory); does not stop agents.
  --help, -h            Show this help without starting the application.

Configuration: INSTALLDIR/etc/config.conf is read at foreground/systemd startup.
Use simple key: value lines and full-line # comments; this is not YAML.
Settings: connection_type, tls_certificate, tls_private_key, host, port, public_origin,
          first_password_setup.
Certificate paths can be absolute or relative to the config file directory.
Environment: CCNG_HOST, CCNG_PORT, CCNG_PROTOCOL, CCNG_PUBLIC_ORIGIN,
             CCNG_TLS_CERT, CCNG_TLS_KEY, CCNG_FIRST_PASSWORD_SETUP. CLI options take precedence over
             environment, which takes precedence over the configuration file.
HTTPS requires both TLS files; missing or unsuitable files never enable HTTP.
Explicit --protocol http ignores TLS file settings and keeps plain HTTP available.
Certificates must be readable, in date, and match the key and browser hostname.
Use --public-origin https://YOUR_HOSTNAME for DNS certificates or wildcard binds.
CCNG does not obtain or renew certificates; load renewed files by restarting it.
Automatic selection requires Linux and the existing ip command (iproute).
Startup prints both automatic listener addresses; systemd records stdout
in its journal. If selection is unavailable or ambiguous, use --host ADDRESS.
The default-route address can be network/public-facing; use --host 127.0.0.1
for local-only access. This does not configure firewall or proxy access.
Existing saved --host/CCNG_HOST settings remain effective.
Existing passwords are preserved. For local setup without a protected proxy,
create the application password with npm run password before signing in.
User service controls: command-center-ng service help`;
}

export function listeningMessage(selection, port, boundAddress = selection.host, protocol = 'http') {
  const host = boundAddress.includes(':') ? '[' + boundAddress + ']' : boundAddress;
  const companion = selection.automatic && boundAddress === '127.0.0.1' && selection.host !== boundAddress;
  const target = companion ? 'loopback' : selection.interfaceName || (selection.host === '0.0.0.0' ? 'all IPv4 interfaces' : selection.host === '::' ? 'IPv6 wildcard' : 'explicit address');
  const reason = companion ? 'automatic loopback companion' : selection.automatic ? 'automatic default IPv4 route' : 'explicit --host/CCNG_HOST/configuration';
  return `Command Center NG ${VERSION} listening on ${protocol}://${host}:${port} (interface: ${target}; ${reason}).`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const values = await loadRuntimeOptions();
    if (values.help) console.log(runtimeHelp());
    else if (values['clear-logins']) { await clearAllLogins(); console.log('All saved application logins were cleared. Running clients must sign in again; agent work was not stopped.'); }
    else {
      const port = Number(values.port); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port from 1 to 65535.');
      if (!['http', 'https'].includes(values.protocol)) throw new Error('Choose --protocol http or https.');
      const selection = await resolveListenAddress(values.host);
      const app = await createApp({ config: { host: selection.host, port, protocol: values.protocol, cwd: resolve(values.cwd), socketPath: values.socket, publicOrigin: values['public-origin'], firstPasswordSetup: values['first-password-setup'], tlsCert: values['tls-cert'], tlsKey: values['tls-key'], dev: values.dev } });
      // Startup observes the native setup without changing a shared Codex profile.
      const codexSetup = await ensureCodexQuestions({ enable: false });
      for (const warning of codexSetup.warnings) console.warn('Codex setup warning: ' + warning);
      const bound = await app.listen(selection, port);
      for (const listener of bound) {
        console.log(listeningMessage(selection, listener.port, listener.server.address().address, app.settings.https ? 'https' : 'http'));
        listener.server.once('error', error => { console.error(`Cannot listen: ${error.message}`); process.exitCode = 1; void app.close(); });
      }
      if (app.settings.certificate) console.log('TLS certificate: ' + JSON.stringify(app.settings.certificate));
      app.rpc.connect().catch(error => { app.workspace.error = error.message; app.workspace.changed(); });
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
    }
  } catch (error) { console.error(`Cannot start: ${error.code === 'ENOENT' ? 'Set the application password first: npm run password' : error.message}`); process.exitCode = 1; }
}
