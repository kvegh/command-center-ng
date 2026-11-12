# Workspace coordinator

One native Codex coordinator runs alongside up to sixteen worker tabs in 0.14.0.
The coordinator was introduced in 0.4.0.
It starts automatically when the first worker is opened. In 0.8.1, its
Coordinator tab sits in the right-hand controls outside the worker scrolling
strip, immediately before the prominent Add agent button; workers stay left.
It uses the same tab shape, height, typography and state styling as worker tabs.
Its overview icon and separate coordinator identity remain. Mobile uses a compact presentation.
The tab gives it its own chat, state and controls. All sixteen
worker slots remain available. It uses the existing Codex account and configured
model; no assistant-team service, extra provider, npm dependency or new task store
is required.

## Progress and communication

The coordinator can list watched workers, read their recent conversation history
and older pages, inspect project instructions and bounded source files, and read
their linked Beads state. Since 1.16.0, one dedicated internal native progress
helper handles routine worker monitoring, linked tasks/blockers and publication
of each sidebar recap, blocker and next step. The main Coordinator retains
approval reviews, genuine user decisions, direct questions and relevant relays.
These recaps are interpretation, distinct from the stored Beads task states
shown below. The coordinator does not update task records.

From 0.11.1, a recap names the work and explains the useful result, unfinished
work and concrete blocker or next action. It distinguishes implementation and
publication from deployment and live verification. If a decision is needed, it
says exactly which input is missing and who can provide it. Sidebar `summary`,
`blocker` and `nextStep` have these distinct purposes instead of repeating one
status sentence. Task IDs may support an explicit lookup or internal handoff
beside a task name; they do not replace the explanation. Routine idle state,
closed-record lists and no-pending-approval notices are omitted unless relevant
to the user's question or an actual problem. Unchanged work does not need a
fresh bookkeeping recap.

This is reporting guidance, not a semantic rewrite or filter of model output.
It is included in new/restored coordinator instructions and each event reminder,
so an existing coordinator need not acquire updated native tool descriptions to
receive it. Worker report requests also ask for named outcomes and exact blockers.
After updating the app, use Summarize now or allow the next automatic event for
a refreshed recap; previously written recaps are not retroactively rewritten.
No worker report is requested solely to apply this wording change.

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

## Independent progress helper

One helper processes changed worker evidence independently of the main
Coordinator and the two optional approval analysts. Its only tools are bounded
worker reads (at most three per update) and one sidebar publication. It receives
the main Coordinator's selected model/effort and shared instructions. It cannot
answer requests, approve work, send messages, modify tasks or execute commands.
The main Coordinator still reads the exact context needed for each approval.

The helper uses existing native RPC/events and scheduling; it has no extra
service, timer, task store or worker tab. Duplicate evidence is coalesced per
worker. Changed identity, evidence, connection, stop, handoff and pause guards
reject stale publications. Unknown native starts retain their slot and expose
an error; bounded native status checks never treat idle metadata as success or
retry unknown work. Unexpected native decisions remain pending. Ephemeral
helper conversations are archived only after confirmed completion and no pending
native request. Existing main publish tools remain for saved-client compatibility;
each event tells the main Coordinator to leave routine monitoring to the helper.

Synthetic lifecycle and Workspace integration checks cover concurrent main
approval, two analysts and this helper. These checks do not establish actual
provider latency, browser picker behavior or a genuine model publication.

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

Since 0.19.2, a citation returned by an older ccng_read_worker page can also be
validated. For each open worker instance, the backend remembers at most 128
native message-ID/cursor pairs for actual user messages exposed in bounded older
reads. No transcript text is copied into this index. When a citation is absent
from recent messages, review re-reads its exact native worker page and checks the
native user item, exact quote and current request again. Another worker cannot
reuse the reference. Missing/stale pages, generated relays, branch summaries,
assistant messages and resolved requests are refused. Recent reads preserve the
references; old entries are evicted when the bound is reached. Close/reopen or
backend restart requires reading the original page again. References remain
private process memory, outside browser/workspace persistence.

The coordinator tab shows recent decisions/deliveries and their reasons. Native
Codex history also retains coordinator tool calls and results. Coordinator decision
summaries now persist in a private local file and reload at startup; report/delivery
events remain temporary. No new audit database is required. Supplied worker context
is private native conversation data; it is not exported into the source repository.

This is model-based review, not proof that an arbitrary script with administrator
credentials is contained. The host verifies identity and authorization references;
the model judges meaning and project scope. It does not inspect every subsequent
remote API call or enforce AAP resource boundaries. Restricted execution accounts
or checked API operations remain possible future controls, requiring direction.
No new AAP credential, wrapper, permission policy or service is deployed here.

In 0.9.0, **Load pending request** can retrieve missing requests for a selected
active worker or the coordinator. Loading itself sends no decision; recovered
worker approvals remain subject to the existing coordinator review policy and
manual controls. Pause the coordinator to keep all reviews manual. A coordinator
rejoin reapplies its existing restrictions, and native read-only confirmation is
still required. Missing request details are not treated as proof of another
client's ownership.

## Short, visible decisions and feedback

Version 0.13.0 saves this format in `server/coordinator-prompt.mjs` and event
reminders, so it persists across sessions and reaches existing coordinators after
an app update. Approved requests in coordinator chat use two bullets, each no
longer than one or two sentences, with a blank line between pairs:

- 🟦 **Request:** Explain the action's purpose and meaningful target/effect in plain language.
- 🟢 **Approved:** State the result and brief rationale.

Non-approval notes use 🔴 **Declined**, 🟠 **Needs your decision**, or
🟣 **Unconfirmed**, with no fixed bullet count. Usually two or three short
sentences on separate lines totaling about 60 words or fewer explain the action's real effect,
the concrete concern and the exact user decision or easy permitted next step.
Optional **Request / Concern / Next** labels can help. For example:

> 🟠 **Needs your decision:** This updates the encrypted deployment settings.
> I could not check whether the helper preserves the existing settings.
> Please review this action, or ask the worker for a version I can inspect.

The same guidance applies to the actual `ccng_review_approval` **rationale**
argument displayed on worker approval cards, as well as coordinator chat and
worker feedback. Describe effects instead of saying only "run Python"; omit
raw code, internal evidence dumps, complex clauses and routine permission/legal
boilerplate. Mention restrictions when they explain the actual blocker.
The approval-card rationale is plain text: use `Request:`, `Concern:` and
`Next:` labels on separate lines when helpful, without Markdown stars or bullets.
This is common generation guidance in the startup/restored prompt, event
reminders and rationale tool-field description, not a runtime word limit,
truncation or rewriting of existing decision text. Model adherence still needs
observation in normal use.

Status words accompany color for clarity.
An ask must never be described as a decline, nor an unconfirmed answer as a
resolved approval. The concise request summary does not paste Python, shell
commands or raw code. Exact actions, tokens and authorization quotes/references
remain in the review tools, whose safeguards are unchanged. These markers use
existing Unicode/text rendering; no HTML styling or new dependency is required.

After reviewing a worker's requests, instructions require one concise summary of
non-approval results and reasons through `ccng_send_summary`. Multiple results
are combined to respect the existing one-message/report limit. The worker may
propose an easy, permitted alternative within its existing scope, or wait when
only the user can decide. Feedback never authorizes a security workaround,
credential change, scope expansion or automatic retry of the same action.

This is an instructed use of the existing communication tool, not a new automatic
transport or guaranteed model action. Check the queue acknowledgement and report
failures honestly. Delivery remains queued while any native request is pending
and until the worker is safely idle. An ask stays open for the user; it is never
converted to decline just to deliver the notice. The worker cannot read a queued
notice before those delivery conditions are met. Existing pause, confirmation,
duplicate-message and failure/no-automatic-retry behavior remains.

## Multiple pending requests

Version 0.12.0 makes the complete delivered request list explicit in both
`ccng_list_workers` and `ccng_read_worker`. `requestSummary` reports the total
request records, command/file approvals, clarification request records and their
individual questions, other native requests, unreviewed approvals, answers
awaiting native confirmation and requests needing the user. The existing
`questions` array retains every request's original ID, full received parameters,
independent current review token, review/confirmation state and any answer error.
One request containing three clarification prompts is not three approval requests.

The coordinator is instructed to inspect the entire list, review each eligible
command/file approval separately, and refresh before finishing. Each successful
review or referral to the user returns the current remaining list and counts,
including requests that arrived while another answer was being confirmed.
Referring one request to the user leaves it open while other eligible approvals
can be reviewed. The one-message/report limit does not limit independent reviews.

After a resolution or referral, remaining unreviewed approvals keep the existing
event scheduler marked. Once only manual questions, existing referrals or answer
errors remain, they do not schedule repeated automatic reviews. An answer error
stays visible for user review; it is not automatically submitted again. No bulk
approval operation or extra service/store has been added.

Every action still requires its own current token and actual user authority.
Clarification questions, broad permissions, inaccessible source and uncertain
scope stay with the user. Missing paths/diff cannot be inferred from a file-count
activity label. Counts describe requests whose details reached this client; they
do not prove the total of unreplayed native requests or another client's ownership.
This change does not add automatic native rejoins or widen request recovery.
Guidance is included in new/restored instructions and event reminders, so it also
reaches existing coordinators after an app update without tool-schema replacement.

## Coordinator restrictions and limits

Version 0.8.0 keeps coordinator conversations out of the worker picker and
rejects an attempt to open one as a worker before resuming it. Saved roles are
also checked during read-only restoration; a mismatch produces a visible
warning and preserves the saved IDs for explicit recovery. A worker cannot use
the reserved native name `Command Center coordinator` as its creation goal.

New coordinators use the native `threadSource` value
`command-center-coordinator`, so their identity survives renaming. Earlier
coordinators are recognized by their existing native name
`Command Center coordinator`. A renamed coordinator from before 0.8.0 that lacks
the marker cannot be identified reliably by these metadata checks; do not open
that conversation as a worker. No extra role store or history migration is added.

The coordinator starts with a native read-only sandbox and disabled shell, apps,
plugins, memories, permission-request and multi-agent features. Configured MCP
servers are disabled only for its thread. Worker settings are unchanged.
Startup checks Codex confirmed the read-only sandbox. Unsupported restrictive
configuration fails visibly and leaves worker use available; it is not weakened.

Its host tools accept only open worker IDs. Source reads stay inside a worker's
real project directory, reject escaping symlinks and hidden/sensitive paths, and
return bounded text. Outside helpers require the approval-linked checks below;
unrelated outside source remains refused. Project
AGENTS.md inputs are read as instructions with a total size limit. Ordinary MCP
server names containing letters, digits, underscores and hyphens are supported;
other names currently fail coordinator startup rather than guessing an override.

Since 1.4.2, the existing `ccng_read_project_file` also reads the Coordinator's
own generated Beads hook-output text. The path must belong to that current
Coordinator conversation and use a generated UUID filename. Reads remain
bounded and read-only; other conversations, arbitrary temporary paths, links,
wrong ownership and credential-like contents are rejected. This adds no shell
or execution capability. Hook text supplies context, not action authority.
Since1.4.3, follow the returned `nextLine` for contiguous pages rather than
assuming each page contains160 complete lines. A single line exceeding the
character bound is explicitly marked incomplete.

Native tool calls are experimental and were verified with Codex 0.166.0. A real
two-conversation check verified the reduced sandbox, worker-context read,
published progress, actual pushed summary and worker acknowledgement. Approval
decisions and their safeguards are covered by protocol fixtures; no live AAP/VM
changes or existing user approvals were used for testing. Browser visual testing
remains unperformed.

Workspace restoration reopens the same saved coordinator ID and preserves its
paused state. Views are read without resuming unloaded conversations or starting
turns. Before the coordinator next acts, its read-only sandbox and reduced
capabilities are reapplied and checked. An unavailable saved coordinator reports
an error and retries its existing ID instead of silently creating a replacement.
Pending reviews/tokens and queued messages remain process memory and are not
replayed. Saved decision summaries restore for display only, never as approvals
or authority. Native tool-call history remains with Codex.
See [workspace restore](workspace-restore.md) for the approved storage split.

## Reordering tabs

Press a worker tab's title and drag it horizontally into the desired order. A
cyan marker shows where it will drop. Version 0.4.1 uses pointer capture directly
on the tab button for mouse, touch and pen, replacing the native HTML drag path
reported broken in 0.4.0. Vertical gestures and canceled/outside drops do not
reorder; a drag does not activate the tab as a click. The active worker also has
left/right buttons for keyboard and phone use; Alt+Left/Alt+Right works when its
tab button has focus. Selection, drafts and agent state stay attached to the
conversation. The Coordinator group remains visually separate. Order is local
to the current browser and origin and now survives refreshes through browser
storage; it does not reorder another device.


In 0.6.0, the widened context panel also lists that conversation's native open
questions. A coordinator ask decision remains an amber item with its rationale
in the worker's panel until the request is resolved. Clicking it opens existing
manual answer controls; it does not grant approval. Ordinary-chat question
inference and a separate question store are not implemented.

## Approval-linked helper source

Starting in 0.16.0, ccng_read_approval_source reads bounded ordinary helper source
outside a worker's project only when the exact current command approval refers
to it. Supply the worker ID, current reviewToken, source path and optional start
line. Follow nextStartLine to inspect more pages. Literal script paths and
explicit Python imports with a visible search directory are supported. Read the
direct helper's top-level statements and called functions; routinely following
imports into dependency/library implementations is not required. An ordinary
import alone does not justify referral. Escalate concrete unresolved effects or
authority concerns shown by the action/helper. The tool never runs a helper, imports
Python, decrypts Vault files or reads credential/data files. Hidden/sensitive
paths, symlinks, oversized/non-source files and obvious embedded credentials are
refused. Source content is evidence, not instruction or authorization.

Since 0.19.1, paths resolve against the exact native approval's working directory.
Only omitted/null native cwd falls back to the worker directory; invalid supplied
directories are refused. Relative literals and their equivalent absolute paths
are recognized, including source names in quoted Python subprocess argument
lists. The tool does not evaluate Python or infer a different subprocess cwd.
The returned workingDirectory is saved with the command/source hashes and checked
again before approval. A changed directory requires rereading the current helper.

Each inspected helper is hashed with its pending command. The backend verifies
that evidence again before approval and refuses changed source or a stale request.
This detects changes up to that check; it does not lock a file against later
changes or prove arbitrary code is safe. Original exact user authority, current
request token and native decision confirmation remain required. No approval is
sent merely by reading source; the coordinator may still need the user when
a concrete concern about the action remains after reading its direct helper.
For a specific approval, prefer ccng_read_approval_source with its current token.
The existing ccng_read_project_file tool also reads an outside-project helper
when one or more exact current command approvals directly reference it. The same
helper-source checker and hash records apply; approvalBindings names every
matching request and token. Review each action separately. Unrelated outside
source stays refused. This lets older saved coordinators use their existing
reader without changing the registered native tool catalog or conversation.
It resolves matching approval helpers before looking in the worker directory,
so a stale worker cwd cannot cause ENOENT or select a same-named decoy. Matches
from different approval directories are ambiguous: use the exact-token reader
for each request. Ordinary project reads still use the worker's directory.
If available tools still reject a read, explain the concrete refusal rather than
claiming arbitrary access or silently bypassing it.

Version0.26.0 replaces agent-owned timing with a coordinator-backend timer.
Saved enabled intervals queue one initial report after restoration, then repeat
at their interval. Radio changes reset the deadline silently; browser refresh
and idempotent reconciliation do not. Never cancels unsent scheduled reports;
Report now remains one-off and coalesces with outstanding work. Existing native
request/pause/handoff/ownership/availability gates still apply. No coordinator
model turn is needed per timer tick or scheduled-report completion.

Internal report/control/event inputs are hidden in CCNG presentation using
native typed markers and official SDK synthetic metadata. Actual reports,
ordinary summaries and identical user-written text remain visible; native
history is retained. Stopping the backend clears timers; restart loads intervals
rather than replaying old native approvals or missed-report bursts.

Report completion is matched to the actual native delivery turn. If existing
work finishes during instruction loading, its completion cannot mark a request
sent into the next turn as missing. Recognition accepts ordered green outcomes,
yellow work and a blue Next bullet with substantive topic labels; a red blocker
bullet is optional. The recommended four-label worker format is unchanged.
Only new completed assistant messages for the matching delivery turn count;
quoted examples, code blocks and historical text remain excluded. Recognition
does not establish task completion or infer that no blockers exist.

File-approval reads include the matching native file-change paths, change kinds
and diffs when supplied, with explicit unavailable/truncated status. The worker
card and coordinator use the same exact conversation/turn/item projection.
Proposed content remains temporary native evidence, not new authority or durable
decision-log data. Recheck its fingerprint across asynchronous review; changed
content invalidates that review. No filesystem reads or answer submission are
used to fill missing proposal details.

Worker reads also retain bounded native question titles/options from assistant
message metadata, including messages with no text. This exposes questions that
previously disappeared, without inventing pending-request IDs or answer status.
Message-only questions remain read-only in CCNG until a supported exact reply
interface is verified; use the native client for those answers. Real
`item/tool/requestUserInput` requests keep their existing JSON-RPC answer path.


## Local providers and recorded chat questions in0.19.0

The coordinator remains a native Codex conversation. It can read local Claude
worker history/status and all delivered requests, but SDK tool/MCP permission
grants remain manual. Request counts include nested Codex and Claude
clarifications; recorded ordinary-chat Beads questions have separate complete
chatQuestions/count fields rather than fabricated native request IDs. The worker
owns their lifecycle and the coordinator has no Beads-write authority.

Shared environment AGENTS text enters the existing native instruction context;
missing sources are stated explicitly. Read-only role restrictions remain higher
priority. Coordinator-only agents.enabled=false plus features.multi_agent_v2=false
and the retained V1 flag disable subagents for the checked native runtime.
Global concurrency/default settings are separate from these role restrictions.

Explicit report instructions and Report now can reach a ready local Claude worker
without a Codex model run. Native automatic coordinator work still requires its
Codex connection. Source publication does not restart either runtime.

## Current dashboard after startup

After workspace loading, refresh each restored worker's current native history,
stored tasks, pending questions and saved report interval/next deadline. The
backend requests a silent fresh startup report only for enabled report intervals,
coalescing existing timer or Report now work. Never workers receive no automatic
startup/recurring report request; their dashboard uses available stored evidence.
Manual Report now is still allowed. Selecting Never cancels only unsent automatic
requests, preserving explicit manual, failed/unconfirmed and in-flight delivery.

The dedicated progress helper publishes useful sidebar summary/blocker/nextStep
fields using available evidence immediately. It qualifies unavailable trackers or pending
reports instead of showing invented completion or zero tasks. Fresh results
request a throttled update for the relevant worker; one blocked/external session
does not gate the rest of the dashboard. Startup inputs remain hidden in both
CCNG chats, with no instruction echo/acknowledgement loop. Native permissions and
real user authority remain unchanged.


## Decision summaries after restart

`decisions.jsonl` is stored beside the private `workspace.json`, normally under
`~/.config/command-center-ng/`. `CCNG_CONFIG_DIR` selects the existing private
configuration directory. It is outside the checkout/installation, uses owner-only
permissions and is created on the first recorded coordinator decision. Updates
preserve it. No new database, service or Git export is used.

Each entry keeps the timestamp, recorded worker/project names, short request,
decision/rationale and native references. Coordinator rationale starts with a
plain `Request:` line describing the effects; raw commands/helper bodies and
approval parameters are not used as the summary. The store projects a fixed
allowlist, omits active tokens, answer forms and authority quotes, and rejects
obvious credential/code text. That check is not a guarantee of general secret
redaction: keep credentials out of rationales. Treat this file as private data.

All entries remain on disk until you explicitly delete them. Startup streams the
file with bounded memory, reloads the recent 200 records and shows the last 20
with readable request/decision bullets, recorded names and save status. Earlier
records remain in the file; report/delivery events are not retained. Persistence
begins when this feature is installed; older decisions remain in native history
and are not automatically imported.

**Saved** means the summary was written, not that the approved work executed.
Native resolved, needs-user and unconfirmed outcomes stay distinct. Saved rows
cannot authorize another request, restore a pending approval or change native
permissions. Current requests remain in Open questions.

Since 1.4.2, a saved needs-user explanation can appear on an independently
verified current request after reconnect. Matching requires a non-secret
fingerprint of the exact request and a stable native discriminator, in addition
to typed request and thread identity. The dated note keeps that request waiting
for the human; the existing **Ask coordinator to review** control explicitly
requests a fresh review. No approval/decline or native answer is restored.
Legacy records without sufficient identity remain history-only.

If loading/writing fails, the panel shows a warning and unsaved status without
changing the native decision's real outcome. Corrupt, partial, unsafe or externally
modified files are left untouched; no repair, deletion or retry is automatic.
Normal shutdown waits for queued writes. Abrupt kills or native acknowledgements
that have not yet been recorded cannot be guaranteed durable. Back up this private
file with the rest of your private runtime configuration; do not commit it to Git.
