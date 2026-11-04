# Workspace coordinator

Version 0.4.0 adds one native Codex coordinator alongside up to four worker tabs.
It starts automatically when the first worker is opened. A labeled, visually
separated Coordinator tab gives it its own chat, state and controls. All four
worker slots remain available. It uses the existing Codex account and configured
model; no assistant-team service, extra provider, npm dependency or new task store
is required.

## Progress and communication

The coordinator can list watched workers, read their recent conversation history
and older pages, inspect project instructions and bounded source files, and read
their linked Beads state. It publishes a concise recap, blocker and next step in
each worker sidebar. These recaps are interpretation, distinct from the stored
Beads task states shown below. The coordinator does not update task records.

Worker openings, changed Beads records, completed turns and pending questions
trigger coalesced coordinator work. Normal updates have a 30-second minimum
interval; pending approval reviews can wake it sooner. It does not make a model
call for every unchanged five-second task poll. Summarize now requests a refresh.

The coordinator can ask a worker for a short report and send a relevant summary
into its actual conversation. Messages are explicitly attributed to Command
Center coordinator. Delivery waits until the worker is idle, has no unanswered
question and is outside a branch handoff. It starts a normal native turn; the
message says to stay within the user's existing scope. A report requests a status
reply only. Busy workers are not steered or interrupted by these messages.

One message/report per worker per coordinator turn and at most four queued
messages per worker bound automatic traffic. A completed report wakes the
coordinator to read it. Repeat reports require a new user instruction or a change
in stored tasks; summary acknowledgements do not produce summary-of-summary loops.
Unconfirmed delivery is retained with an error and is not retried automatically.
Clear queued messages discards waiting messages; it does not undo accepted ones.

Use the coordinator's chat to ask questions, request summaries or give direction.
Pause coordinator stops automatic coordination and interrupts its own active turn,
leaving workers running. Resume coordinator restarts event processing. App shutdown
also stops the coordinator's active turn. Closed worker tabs leave its watched
set and discard waiting messages for that worker.

## Scope-based approval review

The predefined role prompt is in server/coordinator-prompt.mjs. Pending native
command/file approvals are reviewed automatically while the coordinator is
running. Ask coordinator to review also requests a review of a particular pending
approval. Manual approval buttons remain available.

The reviewer considers the exact action and actual user instructions. Authorized
work can include creating, replacing or deleting resources, Python calls to AAP,
recreating disposable test VMs or reclaiming explicitly delegated test resources.
Destructiveness alone is not the reason to ask. Ownership, permitted targets,
disposability, indirect effects, other active tests and explicit restrictions
matter. Unclear scope or a materially new decision returns to the user.

Approve requires a current per-request token, an active coordinator turn and an
exact quote/reference from a real user message in the worker or coordinator chat.
Coordinator event messages, its pushed summaries and generated branch handoffs
cannot supply that authorization. The host sends only an approve-once response
for the exact pending command/file request and waits for native resolution.
Stale, already-resolving and unsupported requests fail. Broad filesystem/network
permission grants, connector forms and user preference questions remain manual.

The coordinator tab shows recent decisions/deliveries and their reasons. Native
Codex history also retains coordinator tool calls and results. The bounded live
decision list is process memory, not a new audit database. Supplied worker context
is private native conversation data; it is not exported into the source repository.

This is model-based review, not proof that an arbitrary script with administrator
credentials is contained. The host verifies identity and authorization references;
the model judges meaning and project scope. It does not inspect every subsequent
remote API call or enforce AAP resource boundaries. Restricted execution accounts
or checked API operations remain possible future controls, requiring direction.
No new AAP credential, wrapper, permission policy or service is deployed here.

## Coordinator restrictions and limits

The coordinator starts with a native read-only sandbox and disabled shell, apps,
plugins, memories, permission-request and multi-agent features. Configured MCP
servers are disabled only for its thread. Worker settings are unchanged.
Startup checks Codex confirmed the read-only sandbox. Unsupported restrictive
configuration fails visibly and leaves worker use available; it is not weakened.

Its host tools accept only open worker IDs. Source reads stay inside a worker's
real project directory, reject escaping symlinks and hidden/sensitive paths, and
return bounded text. Sources outside that directory need manual review. Project
AGENTS.md inputs are read as instructions with a total size limit. Ordinary MCP
server names containing letters, digits, underscores and hyphens are supported;
other names currently fail coordinator startup rather than guessing an override.

Native tool calls are experimental and were verified with Codex 0.166.0. A real
two-conversation check verified the reduced sandbox, worker-context read,
published progress, actual pushed summary and worker acknowledgement. Approval
decisions and their safeguards are covered by protocol fixtures; no live AAP/VM
changes or existing user approvals were used for testing. Browser visual testing
remains unperformed.

Open tabs, the live decision list and coordinator state are currently process
memory. Native conversation histories remain with Codex. A new app process creates
a new coordinator; durable workspace restoration is still pending its storage
decision.

## Reordering tabs

Drag worker tabs into the desired order on desktop. The active worker also has
left/right buttons for keyboard and phone use; Alt+Left/Alt+Right works when its
tab button has focus. Selection, drafts and agent state stay attached to the
conversation. The Coordinator group remains visually separate. Order is local
to the current browser view and resets on refresh; persistence belongs to the
separate workspace-restore work.
