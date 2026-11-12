# Using Command Center NG

This guide describes current controls, rather than the order they were added.
Start with [installation](installation.md#first-time-walkthrough) if the backend
or native Codex runtime is not ready. Claude completion and live validation
remain postponed; published SDK code is not a claim of production acceptance.

## Open the right conversation

Choose **Add agent**, then **Open existing** or **Start new**. New agents require
an explicit existing absolute project directory on the backend host. Surrounding
whitespace is ignored; spaces within directory names are kept. Opening an
existing conversation retains its native working directory and instructions.
CCNG does not silently substitute its own installation directory for a project.

Up to sixteen workers and one separate coordinator can be open. This limit does
not change native subagent concurrency or permissions. Closing a tab removes
its view and report schedule, not its native history or running conversation.

The selected tab has a larger bold title and highlighted edges. Status dots
indicate running or attention states independently of selection. Selecting a
tab focuses its input; the title directly above the input helps identify where
the next message will go. The active conversation tab matches the saved
background tint of the compact title folder tab attached to the input below.
Status/frame colours remain independent; inactive top tabs, the adjacent selector and status indicators
stay on neutral backgrounds. Choose **cyan**, **violet**, **green**, **blue**,
**teal** or **rose**. Older saved amber choices become blue, leaving amber for
attention states and preserving other preferences. Narrow layouts place stacked
status indicators above the title so the tab stays attached to the input.
Tab order, chat colours, text drafts and reading positions use existing browser
preferences. They do not synchronize across browsers or devices.

The worker overview is headed **Project: {chat/project name}**. The Coordinator
keeps its existing heading.

## Chat, activity and interruption

**Enter** sends when sending is available; **Shift+Enter** inserts a newline.
You can keep editing a draft while a question or approval is pending. A parent's
own blocking request holds sending; a child-only wait does not. Enter inserts a
newline while sending is unavailable.
New text entered during an earlier send acknowledgement is preserved.

The input header distinguishes **Sending**, native-acknowledged **Input received**,
**Working**, actual **Needs your answer**, Coordinator-review/confirmation waits,
and completed/interrupted outcomes. A native wait without a delivered request
says **Request details unavailable**; it does not demand an answer or prove the
agent has resumed. Input
received confirms runtime acceptance, not model understanding. Connection health
and time since the last real agent update are separate: browser heartbeats do
not prove agent progress, and quiet work is not automatically declared stuck.

Consecutive command/tool activity appears in a closed **N actions** group.
Expand the group for individual actions, then expand an action for details.
Running, failed and stopped counts remain visible while the group is closed.

Use **Interrupt** or **Escape** for the eligible running turn in the visible
chat. The action preserves the unsent draft and does not undo completed commands
or files. Escape keeps its local meaning in dialogs, selects, question controls,
summary editing, resizing and text composition. Other tabs are unaffected.

## Task outcomes

Beads stores each task's expected outcome, acceptance criteria, state and
dependencies. Workers update those records after real changes and reassess
other authorized ready work, using subagents for independent work when useful.
Native questions and permissions still apply; idle does not mean complete.

Native Goals controls and automatic Goal creation were withdrawn. CCNG does not
start Goals or a replacement task dispatcher. Existing runtime Goal data is
preserved. Task-report requests ask for status; they do not wake workers to
execute their backlog.

## Silent task checks

Every 10 minutes, the coordinator backend asks each open Codex worker to review tasks
that may have lost attention and identify independent authorized work it can
perform in parallel without conflicts. The request is silent in both chats;
useful agent findings and work remain visible. This is separate from task reports,
so **Never** stops recurring reports but does not disable task checks.

The check also asks the worker to inspect outstanding subagents, tool calls and
external jobs, including work already marked in progress. It must check available
IDs, timing, returned results and actual progress, investigate unexplained waits,
and collect results or identify the exact blocker and next action. Age alone does
not prove execution started, an approval is pending, or a call is stuck. The
reminder never authorizes blind retries/cancellation or answering approvals.

The main chat agent owns recovery of its children. For a diagnosed stalled wait,
it first checks what each child awaits and whether an external job started. If
safe within existing authority, it interrupts only that child wait, preserving
native history/findings/request context, then requests only `pwd` under unchanged
permissions. Verify each child's actual reply before resuming its specific
approved next step. A nonreply remains an explicit blocker; a `pwd` reply proves
responsiveness, not job success. Keep real external work, pending decisions and
user stops intact. This is conditional recovery, not a probe on every ping.

The coordinator overview shows **Next chat task-ping to send** with the next
scheduled local time. It is a schedule, not a guarantee of immediate delivery:
a pending question, paused coordinator, disconnected session, unknown active
turn or branch handoff can defer it. Known active Codex turns receive the check
through supported steering for their next safe checkpoint; no tool is interrupted. Checks coalesce and do not replay missed intervals
when CCNG restarts. Explicit user stops and project permissions remain in force;
the reminder does not authorize an arbitrary backlog task or native Goal.
This is an instruction at a safe checkpoint, not a watchdog that can recover a
worker unable to reach that checkpoint or guarantee model compliance.

### Coordinator control messages

| Message | Recipient | Trigger |
| --- | --- | --- |
| Silent task check | Main worker chat | Existing ten-minute cycle |
| Scheduled Standard Task Report | Worker chat | Saved enabled report interval |
| Startup dashboard report | Worker chat | Startup/restoration, enabled report intervals only |
| Report now | Worker chat | User presses Report now |
| Coordinator-requested report | Worker chat | Coordinator requests missing status evidence |
| Workspace events | Coordinator chat | Worker/task/request changes, with bounded review/recap/source/startup reminders |

Report now is the user's command to the selected worker. The backend queues and
delivers it directly through supported native input; the Coordinator model does
not decide whether to issue it. The queue coalesces duplicate requests, retains
unconfirmed delivery and respects native approval/handoff/pause gates. A known
active Codex turn can receive supported steering at its safe checkpoint.

These control inputs are hidden in CCNG history; actual reports and useful replies
stay visible. Informational summaries/handoffs use a separate, visible message
path. Changing the report interval sends no standalone message: the backend
updates its schedule and subsequent turn context. The older report-setting marker
remains supported for compatibility, but is not currently queued. Base/shared
instructions are injected as runtime context, not standalone chat messages.

## Branch and return a summary

**Branch here**, beside a completed Codex reply, copies history through that
reply. Intermediate progress messages do not offer that completed-turn control.
**Branch chat**, beside the composer controls, takes a native snapshot of current
stored history, including the ongoing exchange. Later parent messages are not
part of the snapshot. The parent continues running; a copied partial turn can
be marked interrupted in the child without interrupting the parent.

The branch waits for your follow-up. Its first message becomes its goal.
Branches share the project's directory; they do not create Git branches or
worktrees. Existing branches retain their original snapshots after an update.

**Back to parent** only navigates. **Hand back & close** starts a background
handoff with one click, including while the branch is working. You can switch
tabs immediately. CCNG asks the branch to finish at a safe checkpoint, settle
its local background work and prepare a concise summary of findings, decisions,
verification, open questions and next steps. It does not forcibly interrupt work
or answer a pending request. Resolve any request in its originating chat.

Every branch task is linked to the parent without changing its state, owner,
dependencies or existing branch association. The parent receives the summary
and a reference to the full native branch history and original task records.
Only after native receipt and fresh safety/task checks does CCNG archive the
branch and remove its tab. If it is selected, the parent opens; if another tab
is selected, that tab and its draft keep focus.

The branch status shows waiting, preparation, transfer, delivery or an actionable
failure. A full workspace may need a free tab slot for the parent. Errors and
uncertain delivery keep the branch available; retry does not blindly resend a
summary. The workflow runs in the existing backend process, so keep CCNG running
until it finishes. A restart preserves native history and Beads records, but
does not automatically resume an interrupted handoff. Navigation alone never
sends a summary, archives a branch or answers a question.

## Questions and approvals

**Open questions** lists delivered current native requests for the selected conversation.
Open one to reach its existing answer card. A request with several questions
shows each question. Opening a card does not answer or dismiss it.

### Coordinator approval review

The 1.11.0 source supports up to two internal read-only approval analysts working
on independent current requests. They use the same review policy as the main
Coordinator and can read only the context and source bound to their assigned
request. They return recommendations; the main Coordinator remains the sole
automated approver, with your existing manual controls unchanged.

Before applying a recommendation, the Coordinator still checks the exact live
request, real user authorization, command and working directory, and any inspected
source hashes. A worker's assertion or analyst recommendation is not authority.
Stale or changed evidence cannot authorize an answer. Ready analyses and pending
approvals take priority over optional recaps; running analysis is not duplicated.

The rationale starts with `Request:` to describe the action. When approval is
not possible, `Concern:` and `Next:` explain the concrete obstacle and next user
decision or permitted action on separate lines. An **ask** stays pending for your
decision; it is not a decline and is not automatically retried. You can answer
the current request manually or explicitly request a fresh Coordinator review.

If an analyst unexpectedly receives a native question or permission request,
CCNG preserves it and shows a Coordinator error identifying that exact native
conversation and request. Open that conversation in the native client to inspect
it. CCNG does not grant analyst permissions, answer the request or blindly retry
uncertain analysis to clear the wait.

Two analysts are the initial bounded concurrency choice for independent work,
not a response-time guarantee. Model reasoning, source/tool round trips, active
native turns and pending decisions can still delay completion. The event timer
retains the earliest scheduled wake and keeps urgent work urgent when ordinary
events arrive later. Its defaults are a **1.5-second debounce** for urgent work
and a **30-second routine interval**; these are scheduling intervals, not approval
deadlines. Native pause, question, ownership and safe-turn gates still apply.
Saved report intervals and the separate ten-minute task-check cadence are unchanged.

This describes implemented source. Deployment and real model/browser end-to-end
verification of this change are pending at this documentation checkpoint;
source and synthetic tests cannot establish response time or model compliance.

### Delivered worker and child requests

Known native Codex child runs expose delivered pending requests under their
parent, without separate child tabs. Expand **Subagents**, below Tasks, to view
their activity/status; this section starts collapsed. Pending approval/question
cards and necessary recovery warnings stay visible independently of that section.
Backend/Coordinator status remains available.
Native metadata must verify the parent lineage. Existing cards identify the
source child and retain its original thread/request IDs and native answer choices;
manual and Coordinator approval limits remain unchanged. Child-only waiting does
not prevent input to a parent that can otherwise accept it.

This child context is temporary. Early native requests can be retained in bounded
process memory before discovery; their contents stay private until native
metadata proves the parent lineage. Verified requests then appear automatically
with their original identities. Discovery itself does not resume a child or
answer approvals; eligible active waits have the separate reconnection path below.
Request details never delivered to this connection, or callbacks lost after a
cold restart, cannot be reconstructed from a waiting status. Unknown or
missing details stay explicit; a displayed count is not proof of every request.

Some Codex questions arrive as assistant-message metadata rather than a
blocking approval request. Their titles/options remain visible even when the
message has no text. **Send answer** controls are available only
for eligible current Codex worker questions in a completed assistant message
within the same known active turn, with complete original message/index
bindings. The server rederives that binding rather than trusting a
client-supplied question title. Restored/history-only questions cannot restart a
turn. Choose an option to fill editable answer text, or enter a free-text
answer; send each question separately. Partial replies preserve the other
question editors.

These replies use Codex's ordinary native input/steering path, not approval
RPCs. An accepted input confirms submission/emission; it does not establish
that the agent used it, completed a task or resolved an approval. Existing
connection, ownership, pending-request and handoff gates still apply. Unknown,
truncated, historical, terminal or unsafe bindings remain read-only with the
native next action; Coordinator and postponed Claude questions do not gain
this reply path. Input states distinguish available, submitting, submitted,
unconfirmed and read-only. An uncertain send disables blind retry; failures
stay explicit without automatic resending. Native terminal state ends reply
eligibility. CCNG also conservatively retires its editor after an observed human
ordinary follow-up; that is not proof of an answer or a claim that every native
client handles other-client ordinary messages identically.

Unsent answer text and submitting/submitted/uncertain/error states survive
switching CCNG workers in existing browser memory only. Refresh discards those
browser drafts and latches; none are saved in localStorage, workspace state or
a new server store. Native history remains authoritative.

CCNG holds automatic Coordinator messages, reports, task checks,
summaries and handoffs while a verified live question awaits human input,
including ambiguous submission, using existing bounded queues and pre-send gates.
Those ordinary control inputs must not retire an editor without user intent.
No interval, timer, native RPC, permissions or separate model call is added.
See the release notes for completed source/installed checks and remaining
actual native/browser acceptance gaps.

Manual answers retain the exact native request identity and wait for native
resolution. Duplicate submissions are blocked while confirmation is pending.
A failed or unconfirmed answer stays visible with an error. Answers made in
another client clear here after the corresponding native resolution arrives.
Some external steps or unsupported answer formats still require the exact
native action shown by the card.

Received requests appear automatically. A native wait without its details is
shown as **Waiting for request details**, loading or unavailable status; it does
not establish a question you can answer or another client's ownership. There is
no normal Load/Retry step and no child recovery button. An optional parent-only
**Advanced recovery** action reconnects that session explicitly; it does not
answer a request or guarantee recovery of a lost callback.

### Automatic native reconnection

Since 1.4.0, CCNG permits a bounded reconnection attempt for an already-open local
Codex worker or a known child whose native parent lineage is verified. A fresh
native status must show active work with `waitingOnApproval`, and the wait must
have no delivered current request. Since 1.4.2, an exact delivered file approval
whose paths/diff remain unavailable after bounded history lookup may also receive
one guarded snapshot reconnect. An actionable card with available details keeps
its native controls without another reconnect. The existing
five-second backend poll coalesces the attempt once per context, connection and
wait episode. Missing details or an error do not start a repeated retry loop;
the diagnostic and existing manual controls remain available.

The delivered-file attempt remains tied to the original request, working
directory, connection and history revision. Failed history or snapshot reads
consume its automatic allowance; they do not cause a repeated poll/reload loop.

This reattaches the existing native conversation and can replay original request
IDs. Since 1.4.1, that same response requests one full recent turn so pending
file changes can be matched by exact thread, turn and item IDs even when durable
history omits them. Later live changes take precedence. It sends no approval
answer, permission/configuration override or command retry. Intentionally idle/unloaded, foreign, paused, stopped, Coordinator and
handoff contexts are excluded. If an eligible active context becomes idle before
reattachment arrives, native resume may continue that conversation; this race is
included in the approved behavior. There is no new timer, persistent store or
Claude support. Earlier unavailable waits are not claimed recovered; actual
replay and phone/browser acceptance require live verification.

File approvals automatically load available native proposed paths, change types
and diffs. CCNG joins them only to the exact conversation, turn, item and current
request; the coordinator receives the same content. Loading reads bounded native
history, without approving, executing or opening arbitrary files. Loading,
unavailable content and truncation remain explicit. Large proposals show their
limits rather than claiming the excerpt is complete. Request identifiers alone
do not describe the proposed changes.

Alongside **Allow once**, an offered Codex rule can expose **Allow always**.
The buttons stay together in a compact wrapping row. Exact saved-rule scopes
appear below it, with matching labels when more than one reusable rule is offered.
Review the displayed command-prefix, network-host or MCP-tool scope. Codex owns
rule saving; CCNG has no separate permission allowlist or native-config writer.
**Allow for this session** grants only the native session scope. File-change
requests expose that supported session choice even when the protocol does not
include an explicit decision list; they have no permanent option. Filesystem/network
permission requests offer once (turn) or session for exactly the requested profile,
never an invented permanent permission. Coordinator permission grants remain
unavailable. Unoffered or changed rules are rejected.

Native save warnings remain visible. Request resolution alone does not prove
that a rule was saved to disk; shared native settings can affect other sessions.
After a confirmed manual Codex approval, focus returns to the same editable
input unless tab/dialog changes or visibility make that unsafe. Decline,
coordinator review and failed answers do not move focus. Claude approval work
remains postponed.

Agent tabs stay neutral while a delivered command/file approval awaits an
available Coordinator. Amber means your attention is needed: a referral, a
manual-only question or permission, or an actual answer error. A native wait
without a delivered request stays neutral with **Request details unavailable**.
The input header uses the same request evidence, including child requests,
Coordinator review and native confirmation. These indicators do not change
the actual pending request, its answer controls or execution gates.

Some native command checkpoints require a fresh human decision. CCNG declares
support for receiving these prompts and shows their original command and manual
Allow once, Decline and Cancel turn controls, subject to the actual native
choices. They cannot be sent to the Coordinator for approval, saved as rules or
granted for a session. Internal attestation and client-owned verification
exchanges remain outside ordinary approval recovery.

Codex structured questions use an under-development native feature. Installation
attempts its native setup and startup checks it; missing or unsuccessful setup
warns and continues. Existing native workers are not restarted automatically.
See [native question setup](installation.md#native-codex-question-setup).

## Tasks, answers and notifications

The task section reads the project's existing Beads tracker directly. Agents
maintain task states; chat prose, plans and idle status do not close tasks.
Totals describe all linked current work. Actual **Needs input** items come first,
followed by **Blocked** work, then the remaining tasks in their usual order.
**Queued** means unfinished prerequisites and does not mean a user decision.
A parent-task relationship alone does not make its child Queued.
Three natural-height rows are visible by default; scroll for the rest.
An ordinary **Blocked** task can await tools, resources or other work; it is not
automatically relabelled Needs input or shown as a question. Explicit input
states or worker-recorded Question tasks identify human input needs.

**Link tasks** associates existing records with this conversation through Beads
labels. It changes no task state, ownership, content or other labels. Link only
work that belongs in this chat. A record can deliberately have multiple links.
An unavailable tracker shows an error, rather than treating missing rows as
resolved work. CCNG does not initialize or migrate a tracker merely by opening it.

Click a task to read details. **Send to worker** sends your answer with task
context; **Ask what is needed** requests clarification. Input dialogs lead with
**Needed** and **Why**, with steps and background under expandable **Details**.
The worker must process the answer and update Beads. Sending it neither closes
the record automatically nor grants execution outside the existing scope.
Needed/Why must come from the task's recorded information. If the worker has not
recorded the question or reason, the dialog says so; it does not invent them.

Each structured question item or ordinary input task asks for one independently
answerable decision or action. Options are alternatives for that decision;
independent decisions use separate items/tasks, even when a provider displays
several items together. The worker processes each answer separately and leaves
unanswered choices open. Native approval commands and controls keep their exact
scope; this rule does not split or rewrite them.

Ordinary prose questions are not guessed from transcripts. When native question
tools are unavailable, agents record input needs in Beads; those appear once in
Tasks with a **Question** label. Native approvals remain in Open questions.

**Notify me** watches observed input needs, errors and completion for that task.
Alerts use native browser notifications while CCNG is open, including when its
page has focus. Browser consent and a supported secure context are required.
CCNG does not insert completion banners or substitute an in-app alert panel;
permission problems use existing settings feedback. Clicking a notification
opens the originating worker/task. Mobile notification work is postponed.
Refresh/reconnect establishes a baseline instead of replaying historical events.
Missing records do not imply completion, and Beads closure is not independent
proof of successful delivery. There is no closed-browser or email delivery.

## Reports, model and effort

Worker settings offer **Task report every**: **1h**, **15min**, **5min** or **Never**,
plus one-off **Report now**. Never is the default. Saved intervals belong to
CCNG's existing backend timer; browser refresh does not reset the deadline or
require selecting the radio again. Workers do not need their own report loops.

Reports begin with this fixed table, with one actual task per row (an optional
`## Standard Task Report` heading may precede it):

| Task | Status | Outcome / next step |
| --- | --- | --- |
| Example implementation | 🟨 In progress | Finish the affected checks. |

Statuses are **🟩 Done**, **🟨 In progress**, **🟥 Blocked**, **🟥 Needs input**,
**🟥 Failed**, **🟪 On hold**, **🟦 Queued**, **🟧 Deferred** or **⬜ Unknown**.
Each task and outcome must be nonempty. The overview covers every active
workstream in this conversation's authorized scope, using known evidence.
End the table with a blank line, then write the release evidence line:
`Release: <version or unknown>; publication: <evidence or unknown>; deployment: <verified scope or unverified>.`
An empty table must state `Tasks: none in scope.` or
`Tasks: unavailable — <reason>.` before that line; do not invent placeholder tasks.
The same schema is sent in manual, scheduled and detailed requests, including
steering an already-active worker. It is defined in
[worker base instructions](../server/worker-instructions.md).
CCNG validates the shape and exact status labels; it cannot establish factual
truth or force the model to comply. A nonconforming final reply remains visible
and produces a format error, without an automatic resend.

Select **Detailed report** beside **Report now** for a one-off expanded report.
It starts with the normal overview, then each linked Beads task actually marked
in progress, with its title/ID and up to ten recent attributable actions indented
beneath it. Actions use available timestamps and evidenced outcomes; fewer or
missing entries and unknown times must be stated. This option does not change
scheduled reports or save a new reporting interval.

Only explicit detailed requests permit bounded read-only lookups of existing
linked Beads records/notes and supported native history. They authorize no new
project execution, tests, external checks, research, secret reads, model calls or
permission changes. Task-update time is not action time, and launching or returning from a
tool alone does not prove success. Details share the existing 32,000-character
report limit; omitted detail must be identified.

An unsent queued report can be upgraded to detailed, never downgraded. If a normal
request is already dispatched or cannot safely be upgraded, visible feedback
says it remains unchanged; CCNG does not send a second report automatically.
Check its status before making a later explicit request.

Internal report triggers are hidden in CCNG history; actual reports remain
visible. Native provider history is not deleted. At most one report is
outstanding per worker; Report now coalesces with a queued due report. Native
questions, pause, ownership, branch handoff and failed sends still gate delivery.
Reports request the next safe checkpoint; they do not interrupt unsafe tools.

Stopping CCNG stops its report timer. Startup loads saved intervals, publishes
available dashboard evidence and requests one fresh report only for workers
with enabled intervals. Never skips startup reports as well as recurring reports;
the dashboard uses stored summaries/tasks. Report now remains a manual one-off.
Enabled schedules continue without replaying a
burst of missed intervals. Closing a tab removes that worker's CCNG schedule.

The Codex **Model** and **Effort** controls use the native runtime's catalog and
supported choices. Changes apply to subsequent turns without interrupting the
current turn or changing global permissions. Use follow-up messages to correct
earlier instructions, or the existing branch action for a separate conversation.

A helper named with the ordinary word authenticated is source, not automatically
authentication data. Bounded source inspection still rejects auth-specific names,
hidden/credential/Vault paths and sensitive content. Fixing a reader refusal does
not resolve an existing manual ask or approve the command.

### Readable AAP references

AAP procedures, results, reports and input requests pair object IDs with verified
readable names: jobs, job/workflow templates, workflow runs, projects, inventories,
hosts, credentials and other referenced objects. A job names its actual job
template and includes its own name when different; workflow runs follow the same
rule. Generic examples are `Job <id> — <actual job-template name>` and
`Inventory <id> — <actual inventory name>`.

An ad hoc job without a template uses a verified readable purpose rather than an
invented template. If the name is unavailable, say
`<object type> <id> — name unavailable`; do not guess or request secret credential
values to identify it. This is reporting guidance, not additional AAP access,
configuration, native permissions or model authority. Public examples stay generic.

## Images, Markdown and copying

Paste an image into the input with the platform's paste shortcut, or choose
**Attach image** to use the native file picker. The picker works independently
of clipboard-image availability and stays tied to the chat where it opened.
Cancellation adds nothing; the same file can be selected again after removal
or a read error. Previews can be removed before sending.

Supported types are PNG, JPEG, GIF and WebP: at most **four images**, **4 MiB
each** and **8 MiB total** per message. An image can be sent alone or with text.
Provider/model limits still apply. Pending native requests permit drafting
attachments but block sending. Actual Android Firefox interaction remains
unverified; local tests do not prove the phone picker experience.

Unsent images live only in this page's per-chat memory. They survive tab changes
but disappear on refresh or page close; text drafts keep their existing browser
persistence. Sent images remain in native history and use authenticated message
URLs in CCNG. Remote image URLs and native local-file references are not fetched.
There is no image-draft upload directory, database or localStorage persistence.

Chat supports Markdown headings, lists, quotes, links, task lists, fenced code
and GitHub-flavoured tables. Tables scroll horizontally. Raw HTML remains
disabled; remote Markdown images appear as links instead of loading themselves.
Pasted user text retains line breaks and spacing. Code examples remain literal.

**Copy this** copies a message's complete source text. Each fenced or indented
code block has a separate copy control. Copy never runs code or sends messages.
Native clipboard denial is not bypassed; selectable text remains for manual copy.

## Layout and lifecycle

The palette menu offers **classic**, **contrastful** and **light** themes. Desktop
overview width, section boundaries and the history/composer divider are resizable
with keyboard controls. Preferences stay in the current browser.


### Desktop overview height

The desktop overview fills its available pane height without extending the page.
Report and model controls stay at the bottom; the upper content, tasks and open
questions scroll when necessary. Saved section heights remain bounded by the
pane, so enlarging a section cannot push settings beyond the browser. Short
windows and long feedback can scroll within the settings area. Existing divider
keyboard controls and reset remain available. Mobile keeps its continuous page
and compact expandable settings rather than a pinned desktop footer.

Desktop tabs share the available strip width up to Coordinator. On hover they
expand horizontally to reveal the full title, temporarily show their own saved
chat-colour tint and push neighbours aside; only the selected tab is taller. More than six conversation
tabs, counting Coordinator, use two stable rows. Selecting a worker places its
row nearest the chat without changing the saved tab order. The worker strip
scrolls horizontally beside Coordinator, so overflow remains reachable.

Mobile keeps one horizontally scrollable tab row, without hover expansion or
row switching. It uses one naturally scrolling full-width page with compact
overview and the chat history in the page flow, followed by a six-line input.
There is no separate 30-line history scroll area. Long input scrolls internally.
Mobile hides resize handles and worker coordinator recaps,
ignores desktop sizes without erasing them, and keeps the actual coordinator
dashboard. Worker settings collapse to a cadence/Report now row; expand for the
other controls. Phone keyboard and rotation acceptance remain separate checks.

Codex owns its native conversations and execution. Closing a browser or tab does
not end native work. The unfinished Claude integration currently owns its SDK
processes inside CCNG: stopping the backend interrupts those runs, while native
history permits later resume. No separate Claude daemon has been introduced.

See [workspace restore](workspace-restore.md) for persistence and recovery,
[coordinator guidance](coordinator.md) for review boundaries, and
[release notes](release-notes.md) for historical implementation evidence.

Report feedback distinguishes queuing from a confirmed request waiting for a
response; it does not claim the worker has started writing. If the turn ends
without a recognized Standard Task Report, a visible error replaces a false ready
announcement. Pending permissions and unsafe work are not interrupted, and
unconfirmed delivery is not automatically retried.

Recognition requires the table and release line above in a fresh completed
assistant reply associated with the confirmed request's exact turn. Quoted/code
examples, older messages and other turns cannot satisfy it. Invalid table
format is distinguished from a turn that produced no report. Existing native
permissions, pause, ownership and delivery guards remain unchanged.


## Correcting earlier messages

Send a follow-up message to correct an earlier input or change a decision. State
what has changed and which earlier instruction it supersedes, keeping the original
communication traceable. Edit/Rewind was withdrawn, including whole-turn,
individual-message and Claude variants.

Use **Branch here** or **Branch chat** when you want a separate conversation.
Branching preserves the original history and remains distinct from correcting
instructions in the current chat. It does not undo files, commands, deployments,
tasks or permissions.


## Saved coordinator decisions

Recent decisions show two readable bullets: the request and the decision/rationale.
A separate Saved/Saving/Not saved status describes local persistence; it does not
change whether a native approval was acknowledged. Coordinator summaries are
saved privately and reload after restart, including recorded names for closed
tabs. Delivery events remain temporary. A visible warning explains unavailable
or unsaved history even when the list is collapsed. Records do not grant authority
or replay native answers. Since 1.4.2, the latest matching needs-user explanation
can reappear, dated, on a verified current request after reconnect. It waits for
your decision until you explicitly ask the Coordinator to review again. Matching
requires a request fingerprint and a stable native identifier; old or ambiguous
records remain history-only. Answer current requests in Open questions.
See [storage details](coordinator.md#decision-summaries-after-restart).
