import { createHash, randomUUID } from 'node:crypto';
import { reportMessageFlags } from './report-messages.mjs';
import { isBranchControlMessage } from './branch-summary.mjs';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const warning = 'This removes the entire selected native turn and every later turn, including other inputs in those turns. It changes conversation history only. Commands, files, deployments and Beads task states are not undone. Saved report and task-check schedules remain active. The selected text becomes an editable draft; it is not sent automatically. Do not change this conversation from another client while confirming: new messages added there could also be removed.';
const text = item => item.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') || '';
const imageCount = item => item.content?.filter(part => ['image', 'localImage'].includes(part.type)).length || 0;

export function editableNativeInput(item) {
  const value = text(item);
  return item.type === 'userMessage' && Array.isArray(item.content) && item.content.length > 0
    && item.content.every(part => part.type === 'text' && typeof part.text === 'string')
    && value.trim().length > 0 && value.length <= 32_000
    && !Object.values(reportMessageFlags(item)).some(Boolean)
    && !value.startsWith('[Command Center coordinator]') && !isBranchControlMessage(value);
}

function describe(turn) {
  const userInputs = turn.items.filter(item => item.type === 'userMessage').map(item => ({ messageId: item.id, text: text(item), imageCount: imageCount(item) }));
  const messages = turn.items.map(item => {
    let summary;
    if (item.type === 'userMessage') summary = text(item) || 'Attached input';
    else if (item.type === 'agentMessage') summary = item.text || '';
    else if (item.type === 'commandExecution') summary = item.command || 'Command';
    else if (item.type === 'fileChange') summary = `${item.changes?.length || 0} file changes`;
    else summary = item.type; // Never expose private reasoning or tool output.
    return { id: item.id, type: item.type, summary: String(summary).slice(0, 200) };
  });
  return { id: turn.id, status: turn.status, userInputs, messages, assistantMessages: turn.items.filter(item => item.type === 'agentMessage').length, actions: turn.items.filter(item => !['userMessage', 'agentMessage', 'reasoning'].includes(item.type)).length };
}

export class NativeRewind {
  constructor(workspace) { this.workspace = workspace; this.previews = new Map(); this.applying = new Set(); }
  guard(agent, { unloaded = false } = {}) {
    const w = this.workspace;
    if (w.agents.get(agent.id) !== agent) throw fail('The worker view changed. Open a fresh rewind preview.');
    if (agent.provider === 'claude' || agent.role === 'coordinator') throw fail('Edit & rewind supports local Codex workers only.', 400);
    if (!w.rpc.ready || w.restoring) throw fail('Reconnect and finish restoration before rewinding.');
    if (!agent.canSend || agent.thread.canAcceptDirectInput === false) throw fail('This native worker does not accept direct user changes.');
    if (agent.turnId || agent.thread.status?.type === 'active') throw fail('Wait for the worker to finish before rewinding.');
    if (agent.questions.length || agent.thread.status?.activeFlags?.length) throw fail('Answer or load the current native request before rewinding.');
    if (agent.handoff || w.summaryJobs.has(agent.id) || w.returnJobs.has(agent.id) || w.handoffs.incoming(agent.id) || agent.returnSummary || agent.coordinatorSending) throw fail('Finish or discard the prepared branch handoff/current delivery before rewinding.');
    if (w.coordinator?.deliveries.get(agent.id)?.length || w.coordinator?.reportPending.has(agent.id) || w.coordinator?.reportResponses.has(agent.id) || agent.coordinatorDeliveryKind) throw fail('Finish the queued, pending or uncertain coordinator messages/reports before rewinding. Existing queues and schedules are preserved.');
    if (agent.thread.ephemeral === true) throw fail('Native rewind requires a persistent paginated conversation.');
    if (agent.thread.status?.type !== 'idle' && !(unloaded && agent.thread.status?.type === 'notLoaded')) throw fail('The native worker is unavailable for rewind.');
  }
  blockedReason(agent) {
    if (this.workspace.rewindJobs.has(agent.id)) return 'A rewind operation is in progress.';
    try { this.guard(agent, { unloaded: true }); return null; } catch (error) { return error.message; }
  }
  async read(agent, options) {
    const previous = { thread: agent.thread, status: agent.thread.status, turnId: agent.turnId };
    const { thread } = await this.workspace.rpc.call('thread/read', { threadId: agent.id });
    if (!thread || thread.id !== agent.id) throw fail('Codex returned a different conversation.');
    if (agent.thread !== previous.thread || agent.thread.status !== previous.status || agent.turnId !== previous.turnId) throw fail('Native activity changed while its status was read. Open a fresh preview.');
    agent.thread = thread; this.guard(agent, options);
  }
  async suffix(agent, turnId, messageId) {
    const rows = [], seen = new Set(), revision = agent.rewindRevision || 0; let cursor;
    for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
      const page = await this.workspace.rpc.call('thread/turns/list', { threadId: agent.id, itemsView: 'full', sortDirection: 'desc', limit: 50, ...(cursor ? { cursor } : {}) });
      this.guard(agent, { unloaded: true });
      if ((agent.rewindRevision || 0) !== revision) throw fail('Native history changed while it was read. Open a fresh preview.');
      if (!Array.isArray(page.data) || !Object.hasOwn(page, 'nextCursor') || (page.nextCursor !== null && typeof page.nextCursor !== 'string') || page.data.some(turn => !validId(turn.id) || turn.itemsView !== 'full' || !Array.isArray(turn.items) || turn.items.some(item => !validId(item.id) || typeof item.type !== 'string'))) throw fail('Native history is incomplete or not fully loaded. No rewind was performed.');
      for (const turn of page.data) {
        if (seen.has(turn.id)) throw fail('Native history repeated a turn. Open a fresh preview.');
        seen.add(turn.id); rows.push(turn);
      }
      const index = rows.findIndex(turn => turn.id === turnId);
      if (index >= 0) {
        const affected = rows.slice(0, index + 1), selectedTurn = rows[index];
        const selected = selectedTurn.items.find(item => item.id === messageId);
        if (!selected || !editableNativeInput(selected)) throw fail('Choose an original text-only user input. Generated messages and image/attached inputs cannot be edited here.', 400);
        if (affected.some(turn => !['completed', 'interrupted', 'failed'].includes(turn.status))) throw fail('Native history contains unfinished work. Wait before rewinding.');
        let anchor = rows[index + 1]?.id || null;
        if (!anchor && page.nextCursor) {
          const older = await this.workspace.rpc.call('thread/turns/list', { threadId: agent.id, cursor: page.nextCursor, sortDirection: 'desc', limit: 1, itemsView: 'full' });
          if (!Array.isArray(older.data) || (older.data.length && !validId(older.data[0].id))) throw fail('Retained native history could not be checked.');
          anchor = older.data[0]?.id || null;
        }
        if ((agent.rewindRevision || 0) !== revision) throw fail('Native history changed while its retained prefix was read. Open a fresh preview.');
        return { affected, selected, anchor, revision, signature: createHash('sha256').update(JSON.stringify({ affected, anchor })).digest('hex') };
      }
      if (!page.nextCursor) throw fail('The selected input is no longer in this native conversation. Open a fresh preview.');
      if (cursor === page.nextCursor) throw fail('Native history pagination did not advance.');
      cursor = page.nextCursor;
    }
    throw fail('More than 1,000 turns would be affected. Choose a more recent input or review it in the native client.', 413);
  }
  lock(agent, operation) {
    const w = this.workspace;
    if (w.rewindJobs.has(agent.id)) throw fail('A rewind operation is already pending for this worker.');
    const job = Promise.resolve().then(operation).finally(() => { w.rewindJobs.delete(agent.id); w.changed(); });
    w.rewindJobs.set(agent.id, job); w.changed(); return job;
  }
  preview(id, selection) {
    const w = this.workspace, agent = w.agent(id); this.guard(agent, { unloaded: true });
    for (const [workerId, preview] of this.previews) if (preview.expiresAt < Date.now() || w.agents.get(workerId) !== preview.agent) this.previews.delete(workerId);
    if (!selection || Object.keys(selection).some(key => !['messageId', 'turnId'].includes(key)) || !validId(selection.messageId) || !validId(selection.turnId)) throw fail('Choose an exact native user input and turn.', 400);
    return this.lock(agent, async () => {
      await this.read(agent, { unloaded: true });
      const snapshot = await this.suffix(agent, selection.turnId, selection.messageId);
      this.guard(agent, { unloaded: true });
      const affectedTurns = [...snapshot.affected].reverse().map(describe);
      const previewToken = randomUUID();
      const result = { previewToken, threadId: id, selected: { messageId: selection.messageId, turnId: selection.turnId, text: text(snapshot.selected), imageCount: 0 }, affectedTurns, turnCount: affectedTurns.length, messageCount: affectedTurns.reduce((total, turn) => total + turn.messages.length, 0), warning };
      if (JSON.stringify(result).length > 2_000_000) throw fail('The rewind preview is too large. Choose a more recent input or use the native client.', 413);
      this.previews.set(id, { agent, ...selection, signature: snapshot.signature, anchor: snapshot.anchor, affectedIds: snapshot.affected.map(turn => turn.id), text: result.selected.text, previewToken, expiresAt: Date.now() + 10 * 60_000, attempted: false });
      agent.rewindError = null; return result;
    });
  }
  commit(id, confirmation) {
    const w = this.workspace, agent = w.agent(id); this.guard(agent, { unloaded: true });
    const preview = this.previews.get(id);
    if (!confirmation || Object.keys(confirmation).some(key => !['previewToken', 'confirm'].includes(key)) || confirmation.confirm !== true
      || !preview || preview.agent !== agent || preview.attempted || preview.expiresAt < Date.now() || confirmation.previewToken !== preview.previewToken) throw fail('Open a fresh preview and explicitly confirm the whole-turn rewind.');
    return this.lock(agent, async () => {
      try {
        // Explicit confirmation may load an unloaded worker. Preview never does.
        await this.read(agent, { unloaded: true }); await w.activate(id);
        await this.read(agent);
        const current = await this.suffix(agent, preview.turnId, preview.messageId);
        if (current.signature !== preview.signature) { this.previews.delete(id); throw fail('Conversation history changed after preview. Review a fresh preview before rewinding.'); }
        await this.read(agent); this.guard(agent);
        if ((agent.rewindRevision || 0) !== current.revision) throw fail('Native history changed before rewind confirmation. Open a fresh preview.');
        preview.attempted = true;
        this.applying.add(id);
        const result = await w.rpc.call('thread/revert', { threadId: id, beforeTurnId: preview.turnId });
        if (!result?.thread || result.thread.id !== id || !Array.isArray(result.thread.turns) || result.thread.turns.length
          || !['turnsBackwardsCursor', 'itemsBackwardsCursor'].every(key => result[key] === null || typeof result[key] === 'string')) throw fail('Native rewind confirmation is incomplete. It will not be retried automatically.');
        if (w.agents.get(id) !== agent) throw fail('The worker changed before native rewind confirmation.');
        agent.thread = result.thread; w.clearRewoundHistory(agent);
        const page = await w.history(id, result.turnsBackwardsCursor || undefined, { replace: true });
        const newest = page?.data?.[0]?.id || null;
        if (!page || newest !== preview.anchor || page.data.some(turn => preview.affectedIds.includes(turn.id))) throw fail('Native retained history differs from the confirmed rewind. Inspect the conversation before continuing.');
        this.previews.delete(id); agent.rewindError = null;
        return { id, draftText: preview.text, rewound: true };
      } catch (error) {
        agent.rewindError = preview.attempted && error.code === -32601 ? 'This native runtime does not support whole-turn rewind through CCNG. No alternative method was used.'
          : (preview.attempted ? 'Rewind may already have been applied; no automatic retry. Refresh and inspect native history. ' : '') + error.message;
        w.changed(); throw Object.assign(new Error(agent.rewindError), { status: error.status || 502 });
      } finally { this.applying.delete(id); }
    });
  }
}
