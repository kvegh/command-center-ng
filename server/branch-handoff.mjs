import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { readCodexGoal, changeCodexGoal } from './native-goals.mjs';
import { HANDOFF_CHECKPOINT_REQUEST } from './branch-summary.mjs';

const sourceKinds = ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown'];
const fail = message => Object.assign(new Error(message), { status: 409 });
const attention = agent => agent.questions.length || agent.thread.status?.activeFlags?.some(flag => ['waitingOnApproval', 'waitingOnUserInput'].includes(flag));
const checkpoint = `${HANDOFF_CHECKPOINT_REQUEST} The user requested Hand back & close for this branch. Stop starting ordinary project work. At the next safe checkpoint, save useful progress and unfinished tasks, record exact external job IDs and who must monitor them, and settle branch-owned local background terminals and all spawned agents. Do not interrupt unsafe work, answer pending permissions, change task states to complete, or archive anything. Finish this turn when local work is safely settled. The application will transfer task links and request the handoff summary separately.`;

// Process-local coordination only. Native history and Beads remain the durable
// records; a backend restart never fabricates completion or replays delivery.
export class BranchHandoffs {
  constructor(workspace, { timeout = 30 * 60_000, poll = 2000 } = {}) {
    this.workspace = workspace; this.records = new Map(); this.completions = []; this.deliveringParents = new Map();
    this.timeout = timeout; this.poll = poll;
  }
  active(id) { return this.workspace.returnJobs.has(id); }
  incoming(id) { return this.deliveringParents.has(id); }
  state(branch, record, phase, detail) {
    branch.handoff = { phase, detail, parentId: branch.parentId, ...(record.taskCount !== undefined ? { taskCount: record.taskCount } : {}) };
    this.workspace.changed();
  }
  start(id) {
    const w = this.workspace, branch = w.agent(id);
    if (!branch.parentId || branch.provider === 'claude' || branch.role === 'coordinator') throw fail('Choose a local Codex branch to hand back.');
    if (this.incoming(id)) throw fail('A child branch is delivering its handoff here. Wait for that delivery before handing this parent back.');
    if (this.active(id)) return { id, parentId: branch.parentId };
    if (w.summaryJobs.has(id)) throw fail('Wait for the current summary preparation before handing back.');
    if (!branch.canSend || !w.rpc.ready) throw fail('Reconnect a branch that accepts input before handing back.');
    const record = this.records.get(id) || { clientId: `ccng-handoff-${randomUUID()}` };
    if (record.archiveUncertain) throw fail('Native archive confirmation was lost. Inspect the native branch before closing its retained view; the summary was already delivered.');
    this.records.set(id, record);
    this.state(branch, record, 'waiting', 'Handback queued. You can switch tabs; pending requests remain yours to answer.');
    // Reserve the existing handoff gate before any asynchronous work can race it.
    const job = Promise.resolve().then(() => this.run(branch, record)).catch(error => {
      this.state(branch, record, 'failed', error.message); branch.handoff.error = error.message;
    }).finally(() => {
      if (this.deliveringParents.get(branch.parentId) === id) this.deliveringParents.delete(branch.parentId);
      w.returnJobs.delete(id); w.changed();
    });
    w.returnJobs.set(id, job); w.changed();
    return { id, parentId: branch.parentId };
  }
  async until(branch, check, detail, timeout = this.timeout) {
    const w = this.workspace, deadline = Date.now() + timeout;
    while (true) {
      if (!w.rpc.ready || w.agents.get(branch.id) !== branch) throw fail('Native connection or branch changed. The branch is kept; reconnect and retry.');
      if (await check()) return;
      if (Date.now() >= deadline) throw fail(`${detail} The branch is kept. Resolve its pending work and retry Hand back & close.`);
      await new Promise(resolve => {
        const wake = () => { clearTimeout(timer); w.off('change', wake); resolve(); };
        const timer = setTimeout(wake, this.poll); w.once('change', wake);
      });
    }
  }
  async read(branch) {
    const { thread } = await this.workspace.rpc.call('thread/read', { threadId: branch.id });
    if (!thread || thread.id !== branch.id) throw fail('Codex did not return the exact branch. It remains open.');
    branch.thread = thread; return thread;
  }
  async checkpoint(branch, record) {
    const w = this.workspace;
    this.state(branch, record, 'waiting', 'Waiting for branch requests to be answered before its safe checkpoint.');
    await this.until(branch, async () => { await this.read(branch); return !attention(branch); }, 'The branch still needs an answer.');
    await w.activate(branch.id);
    await this.read(branch);
    if (record.checkpointUncertain) throw fail('Checkpoint acceptance is uncertain. Inspect the branch; no checkpoint request was repeated.');
    if (!record.checkpointTurn) {
      this.state(branch, record, 'stopping', 'Asking the branch to finish at a safe checkpoint and settle local work.');
      if (branch.thread.status?.type === 'active') {
        if (!branch.turnId) await w.history(branch.id);
        if (!branch.turnId) throw fail('The active native turn could not be identified. The branch is kept.');
        record.checkpointTurn = branch.turnId;
        try { await w.rpc.call('turn/steer', { threadId: branch.id, expectedTurnId: record.checkpointTurn, input: [{ type: 'text', text: checkpoint, text_elements: [] }] }); }
        catch (error) { record.checkpointUncertain = true; throw fail(`Checkpoint acceptance is uncertain. Check the branch before retrying. ${error.message}`); }
      } else {
        record.checkpointUncertain = true;
        const { turn } = await w.rpc.call('turn/start', { threadId: branch.id, input: [{ type: 'text', text: checkpoint, text_elements: [] }], additionalContext: await w.instructionContext(branch) });
        record.checkpointTurn = turn.id; record.checkpointUncertain = false;
        if (branch.finishedTurn?.id !== turn.id) { branch.turnId = turn.id; branch.thread.status = { type: 'active', activeFlags: [] }; }
      }
    }
    if (record.checkpointUncertain) throw fail('Checkpoint acceptance is uncertain. Inspect the branch; no checkpoint request was repeated.');
    await this.until(branch, async () => {
      await this.read(branch);
      if (attention(branch) || branch.thread.status?.type === 'active') return false;
      if (branch.finishedTurn?.id === record.checkpointTurn) {
        if (branch.finishedTurn.status !== 'completed') { delete record.checkpointTurn; throw fail('The checkpoint turn did not complete successfully. The branch remains open; retry requests a new safe checkpoint.'); }
        return branch.thread.status?.type === 'idle';
      }
      const page = await w.rpc.call('thread/turns/list', { threadId: branch.id, limit: 100, itemsView: 'full' });
      const turn = page.data?.find(turn => turn.id === record.checkpointTurn);
      if (turn && turn.status !== 'inProgress' && turn.status !== 'completed') { delete record.checkpointTurn; throw fail('The checkpoint turn was interrupted or failed. The branch remains open; retry requests a new safe checkpoint.'); }
      return turn?.status === 'completed' && branch.thread.status?.type === 'idle';
    }, 'Waiting for the branch to complete its safe checkpoint.');
    // Pause only AFTER an actual idle checkpoint. Pause is not assumed to be a
    // safe way to interrupt a running native tool, and accounting is preserved.
    const goal = await readCodexGoal(w.rpc, branch.id);
    await this.read(branch);
    if (branch.thread.status?.type !== 'idle' || attention(branch)) throw fail('Native work resumed before its goal could be paused. The branch is kept.');
    if (goal?.status === 'active') await changeCodexGoal(w.rpc, branch.id, { action: 'pause' });
    await this.settled(branch);
  }
  async pages(method, params) {
    const rows = [], cursors = new Set(); let cursor;
    do {
      const page = await this.workspace.rpc.call(method, { ...params, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(page.data) || !Object.hasOwn(page, 'nextCursor')) throw fail(`Native ${method} returned incomplete safety information. The branch is kept.`);
      rows.push(...page.data); cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw fail('Native pagination repeated a cursor. The branch is kept.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return rows;
  }
  async settled(branch) {
    const w = this.workspace;
    const descendants = await this.pages('thread/list', { ancestorThreadId: branch.id, sourceKinds, modelProviders: [], limit: 100 });
    for (const candidate of [branch, ...descendants]) {
      const { thread } = await w.rpc.call('thread/read', { threadId: candidate.id });
      if (!thread || thread.id !== candidate.id || !['idle', 'notLoaded'].includes(thread.status?.type) || thread.status?.activeFlags?.length) throw fail('The branch or a spawned agent still has native work or a request. It remains open.');
      if (candidate.id === branch.id && (thread.status.type !== 'idle' || attention(branch))) throw fail('The branch is no longer idle. It remains open.');
      const terminals = await this.pages('thread/backgroundTerminals/list', { threadId: candidate.id, limit: 100 });
      if (terminals.length) throw fail('Branch-owned local background terminals remain. Let the branch settle them before retrying.');
      if ((await readCodexGoal(w.rpc, candidate.id))?.status === 'active') throw fail('The branch or a spawned agent still has an active native goal. It remains open.');
    }
  }
  async received(parentId, record) {
    // Exact native identity, never matching summary text or treating RPC ACK as
    // durable delivery. Bound history reads while permitting safe explicit retry.
    let cursor;
    for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
      const page = await this.workspace.rpc.call('thread/turns/list', { threadId: parentId, limit: 50, itemsView: 'full', ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(page.data)) throw fail('Native parent receipt history is unavailable. The branch is kept.');
      if (page.data.some(turn => turn.items?.some(item => item.type === 'userMessage' && (item.clientId === record.clientId
        || (record.messageText && item.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') === record.messageText))))) return true;
      if (!page.nextCursor || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }
    return false;
  }
  async run(branch, record) {
    const w = this.workspace;
    if (record.summary && !record.delivered && !record.sendAttempted && record.summaryTurnId !== branch.lastCompletedTurnId) {
      delete record.summary; delete record.checkpointTurn;
    }
    if (!record.summary) {
      await this.checkpoint(branch, record);
      this.state(branch, record, 'summarizing', 'Preparing the branch conclusions and unfinished work.');
      const summary = await w.generateSummary(branch); record.summary = summary.text; record.summaryTurnId = summary.turnId;
    }
    this.state(branch, record, 'waiting', 'Waiting for the parent tab and any parent requests. You can switch tabs.');
    await this.until(branch, async () => {
      if (!w.agents.has(branch.parentId)) {
        try { await w.open(branch.parentId, { observeOnly: true }); }
        catch (error) {
          if (error.status !== 409) throw error;
          if (!branch.handoff.detail.includes('Close another')) this.state(branch, record, 'waiting', 'All worker tabs are open. Close another tab to open the parent; this branch and its summary are kept.');
          return false;
        }
      }
      const parent = w.agent(branch.parentId); await this.read(parent);
      return parent.canSend && !attention(parent) && !w.returnJobs.has(parent.id) && !w.summaryJobs.has(parent.id) && !w.goals?.mutations.has(parent.id) && !this.incoming(parent.id);
    }, 'The parent has a pending request, handoff, or no free tab slot.');
    const parent = w.agent(branch.parentId);
    if (await realpath(branch.cwd) !== await realpath(parent.cwd)) throw fail('Parent and branch use different project directories. Their task transfer needs review.');
    await this.settled(branch);
    this.state(branch, record, 'transferring', 'Linking every branch task to the parent while retaining the branch history.');
    const linked = await w.beads.handoff(branch.cwd, branch.id, parent.id); record.taskCount = linked.taskIds.length;
    await Promise.all([w.refreshTasks(branch.id), w.refreshTasks(parent.id)]);
    this.state(branch, record, 'sending', 'Delivering the summary and task-history reference to the parent.');
    if (!record.delivered) {
      if (record.sendAttempted && await this.received(parent.id, record)) record.delivered = true;
      if (!record.delivered && record.sendAttempted) throw fail('Parent delivery is uncertain. The branch is kept; no duplicate summary was sent. Check the parent native history before retrying.');
      if (!record.delivered) {
        // Preflight happens before recording the potentially accepted write.
        await w.activate(parent.id);
        await this.read(parent);
        if (attention(parent)) throw fail('The parent needs an answer before summary delivery. The summary and tasks are kept.');
        const text = `Branch summary from "${branch.name}" (${branch.id}):\n\n${record.summary}\n\nAll ${record.taskCount} linked branch tasks are linked to this parent without changing their states. Full branch history remains in native conversation ${branch.id}. Query the original complete task records using Beads label ccng-session:${branch.id}; those branch links are retained. Continue monitoring any external job IDs recorded above.\n\nHandoff reference: ${record.clientId}`;
        const context = await w.instructionContext(parent);
        await this.read(parent);
        if (attention(parent) || w.agents.get(parent.id) !== parent || !parent.canSend || w.returnJobs.has(parent.id) || w.summaryJobs.has(parent.id) || w.goals?.mutations.has(parent.id) || this.incoming(parent.id)) throw fail('The parent changed before delivery. Its existing request and the branch are kept.');
        if (parent.thread.status?.type === 'active' && !parent.turnId) await w.history(parent.id);
        if (parent.thread.status?.type === 'active' && !parent.turnId) throw fail('The active parent turn is not identified. The branch is kept.');
        if (attention(parent) || w.agents.get(parent.id) !== parent || w.returnJobs.has(parent.id) || w.summaryJobs.has(parent.id) || this.incoming(parent.id)) throw fail('The parent changed while identifying its active turn. The branch is kept.');
        // Hold parent summary/return controls across native receipt and archive,
        // so an outgoing parent handoff cannot omit this incoming child result.
        this.deliveringParents.set(parent.id, branch.id);
        record.messageText = text; record.sendAttempted = true;
        try {
          const params = { threadId: parent.id, input: [{ type: 'text', text, text_elements: [] }], clientUserMessageId: record.clientId };
          if (parent.thread.status?.type === 'active') {
            await w.rpc.call('turn/steer', { ...params, expectedTurnId: parent.turnId });
          } else {
            const { turn } = await w.rpc.call('turn/start', { ...params, additionalContext: context });
            if (parent.finishedTurn?.id !== turn.id) { parent.turnId = turn.id; parent.thread.status = { type: 'active', activeFlags: [] }; }
          }
        } catch (error) {
          if (!await this.received(parent.id, record)) throw fail(`Parent delivery is uncertain; no automatic resend. ${error.message}`);
        }
        await this.until(branch, () => this.received(parent.id, record), 'Exact parent receipt is still unconfirmed.', Math.min(this.timeout, 10_000));
        record.delivered = true;
      }
    }
    branch.returnSummary = { ...(branch.returnSummary || {}), text: record.summary, delivered: true };
    this.state(branch, record, 'closing', 'Parent receipt confirmed. Rechecking local work before archiving the branch.');
    await this.settled(branch);
    // Reverify all links immediately before archive, including work added since
    // the first transfer. Failed/partial transfers retain both views and data.
    await w.beads.handoff(branch.cwd, branch.id, parent.id);
    record.archiveUncertain = true;
    const archived = await w.rpc.call('thread/archive', { threadId: branch.id });
    if (!archived || typeof archived !== 'object' || Array.isArray(archived)) throw fail('Codex did not confirm branch archiving. Its delivered summary and retained branch view remain available.');
    record.archiveUncertain = false;
    w.agents.delete(branch.id); w.watched.delete(branch.id); w.coordinator?.closed(branch.id);
    this.completions.push({ branchId: branch.id, parentId: parent.id }); this.completions = this.completions.slice(-64);
    this.records.delete(branch.id); w.changed();
  }
}
