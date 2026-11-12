# Product requirements

## Purpose

Reduce the mental load of switching between AI agents working on different
projects and tasks. Returning to a project should quickly restore an
understanding of its goal, current work, progress, open questions, and next steps.

These requirements record the user's requested product behavior. They are not
a task backlog or a claim that the application exists.

## Platform and presentation

| Requirement | Intended behavior |
| --- | --- |
| Linux first | Linux is the primary platform for installation and operation. |
| Simple installer | A Linux shell script installs into the invoking unprivileged user's home directory, without requiring root or sudo. |
| Desktop browser | The complete interface works in a Linux desktop browser. |
| Smartphone browser | A responsive, potentially simpler interface supports the core workflows. |
| Visual quality | The interface is beautiful, elegant, technical, easy on the eyes, and efficient. |
| Simplicity | Navigation and controls are intuitive; decoration and animation remain restrained. |

The frontend direction is React, TypeScript, Vite, and plain CSS. Browser access
does not imply any selected public hosting or remote-access arrangement.

### Application password setup

Fresh setups use a user-chosen application password; preserve existing passwords.
No shared/default password, forced first-login change or temporary setup code.
The user selected htpasswd-protected first-browser creation: operators explicitly
set `first_password_setup: htpasswd-proxy` with an HTTPS `public_origin`, enforce
htpasswd on every proxy route and restrict direct backend access. The app only
permits setup at that exact origin/Host, requires matching 12–4096-character
inputs, and atomically creates one private hash plus a normal secure session.
Ordinary APIs remain authenticated. Existing, corrupt or unsafe auth cannot be
replaced through browser setup. The generic installer leaves this mode disabled;
local setup uses the existing password CLI. Missing authentication without the
protected-proxy opt-in still refuses startup. Proxy enforcement and Ansible
integration remain separately owned; tests do not prove infrastructure protection.

Application logins must survive ordinary updates/restarts with their existing
absolute 12-hour expiry. Persist only hashed opaque session IDs and invalidation
references in owner-private files outside the installation. Preserve per-browser
logout and password-change invalidation; refresh the actual password revision
before issuing a session. Exact `--clear-logins` explicitly invalidates all app
sessions in the running process and on later startup without changing passwords,
htpasswd or native agents. Authentication-storage errors fail visibly and closed.
Application authentication errors must not evict cached HTTP Basic credentials.
Existing RAM-only sessions cannot be migrated and require one final sign-in.

### Approved mobile layout

Use a single naturally scrolling, full-width page with one horizontally scrollable worker-tab row.
Place the overview above the chat history in the ordinary page flow, then a
composer textarea with six visible lines. This supersedes the earlier approximately
30-line inner history viewport: scrolling the phone page moves through the chat.
Longer input and pasted text
scroll within the textarea. Hide worker Coordinator recaps on mobile; retain
the actual coordinator dashboard.

Disable mobile resizing and ignore saved desktop sidebar widths, section heights
and composer heights without erasing them. Preserve the existing desktop layout
and restore its preferences when returning to desktop. Mobile notifications
remain postponed. The history-scroll change is part of working 1.3.0; rendered
phone acceptance has not been established.

Keep accessible chat-navigation buttons at the top of the mobile viewport
while scrolling. Show Jump to top when the app section above the history has
scrolled out of view. Independently show Jump to bottom when the end of the chat
is outside the viewport. Both appear in the middle of a long conversation; when
both ends are visible, neither is needed. Top returns to the page beginning;
bottom reveals the latest chat and its composer. Use the existing document
scroller, preserve desktop reading positions and do not focus the input or open
the phone keyboard merely to navigate. Earlier history remains available through
the existing explicit Load earlier messages action.

Compact the overview on mobile only: reduce padding and gaps and put task labels,
totals and Link tasks in a wrapping row. Omit empty native Open questions only
when neither requests nor attention are present, for workers and coordinator.
Use one collapsed Worker settings row showing the current cadence, followed by
a visible Report now and Detailed report row. Expanding it reveals cadence radios and model/effort
controls. Keep queued/pending state and errors outside the body, and keep its
controls mounted across layout changes. Desktop retains the open original
controls, with Report now after Never and no disclosure summary. Hide mobile
coordinator guidance prose and tighten project
cards without removing dashboard controls or input-needed titles. Preserve
fonts, desktop widths/saved sizes and six-line input. Current verification and
unperformed phone checks are recorded in the release notes.

## Dashboard and project context

Starting a new agent requires an existing absolute directory on the backend
host. Ignore accidental surrounding whitespace while preserving spaces inside
directory names. Validate the path before native agent creation and display
clear errors for missing paths, files, embedded control characters and access
failures. Do not create directories, expand shell expressions or change access
permissions on the user's behalf.

The dashboard provides easy switching between projects and agents. Each project
keeps a short version of its goal readily visible together with:

- Current tasks and their current states.
- Which agents or subagents are working on which tasks, and their progress.
- Current agent activity and clear indications that human attention is needed.
- Blockers and next steps.
- Short decision summaries and the reasons behind them.

Task state and agent activity must remain distinguishable: an agent being idle
does not establish that its assigned work is complete.

## Conversation branching

Messages retain **Copy this** with its icon, copying their full text to the
browser clipboard. Eligible assistant replies also show **Branch here** immediately
to its right. Fenced and indented
code blocks have their own copy icon that copies only that block's exact text.
Copying provides visible success/failure feedback and never executes commands.
Inline code remains unchanged.

Branching is a simple action available at a point in the conversation. It opens
a new conversation with the whole context carried over from that point. The
user can ask a follow-up subquestion or start a subtask there, switch back to
the main conversation, and create another branch whenever needed.

Each branch keeps its own subsequent discussion and a clear relationship to its
parent. Both parent and branch remain available for navigation, historical
review, and later continuation. Opening or leaving a branch does not require
completing it or performing a merge ceremony.

The optional **Hand back & close** action starts an asynchronous transfer with
one click, including during active work. It requests a safe checkpoint and
settled local background work, then prepares a concise native summary of
findings, decisions, verification, unresolved questions and next steps. It links
every branch Beads task to the parent, preserving task states, ownership,
dependencies and original branch labels. The parent receives a summary plus
references to complete branch history and task records.

Archive and close only after exact native parent-message receipt, verified task
links and fresh native lifecycle checks. Pending requests remain manual. Failed
or uncertain delivery retains a recoverable branch without blind resending.
Users may leave the tab while the existing backend finishes the operation;
background completion must not change another tab's selection, draft or focus.
Process restart preserves native history and task data but does not replay the
in-process workflow. Existing manual review remains a compatibility path;
the new explicitly requested action does not require a second review click.

Navigation remains separate: Back to parent does not send, archive, or complete
the child. Native context preservation and the summary/close lifecycle were
verified with real Codex conversations.

## Task outcomes and continuation boundaries

The user withdrew the native Goals feature, automatic Goal creation and the
requirement that future harnesses provide native Goals. CCNG must not expose
Goal controls or implement a replacement continuation engine. Existing native
Goal data remains owned by its runtime; this removal neither clears nor resumes it.

Workers record task outcomes and acceptance criteria in Beads, update states
after actual lifecycle changes, and reassess ready work within real user scope.
Use subagents for independent authorized work, retain native questions and
permissions, and state precise blockers when nothing can proceed. These are
agent instructions, not a guarantee that CCNG wakes idle workers. Report timing
remains separate and does not authorize additional project work.

## Silent ten-minute task checks

The coordinator backend sends each open Codex worker one silent task-attention check
per ten-minute cycle. The check asks the worker to review neglected tasks,
truthfully update Beads and parallelize independent authorized work without
conflicting with other tasks. It does not grant new scope or resume deferred,
blocked or explicitly stopped work. No replacement task-execution engine is added.

An in-progress task label or launched call is not sufficient evidence of attention.
Require checks of outstanding subagents, tool calls and external jobs using exact
available IDs, start/last-progress times, returned results and current status.
Investigate stale/unknown waits with bounded authorized checks or follow-up;
distinguish evidenced running, awaiting approval/input, completed, failed and
unknown without guessing from elapsed time. Collect outcomes and update tasks,
or surface the exact blocker and next action. Preserve approvals and forbid blind
cancellation, duplication or retries. The prompt cannot guarantee recovery when
the worker cannot reach a safe checkpoint.

For warranted recovery, the main agent checks all children and actual external-job
state before safely interrupting a stalled child wait. Preserve conversation,
findings, pending decisions and real external work. Use existing native controls
for a pwd-only responsiveness probe under unchanged permissions; verify actual
replies and resume specific authorized work. Retain exact nonreply blockers.
Never infer job success from a probe or job absence from a missing ID. No routine
probe, new timer/dispatcher, approval bypass or user-stop override is introduced.

Expose “Next chat task-ping to send” and the next scheduled time in the
coordinator overview. Backend startup begins a fresh cycle with no missed-check
burst. Coalesce outstanding worker checks and retain existing pause, ownership,
native-request, safe-checkpoint and handoff guards; a due check can wait for
eligibility. Known active Codex turns use supported steering without interruption.
Hide internal triggers in both histories, preserve useful agent output and keep
existing task-report settings independent.

## History and tasks

Keep decisions available as short, readable summaries with their rationale and
a route back to the original discussion. Historical review should help the user
understand why the project reached its present state.

Work needs durable task tracking. The user is open to Beads, a Git-backed
TODO.md, or another suitable mechanism. The user selected Beads as the runtime source. Agents update task records and
the backend reads structured state directly; conversations have explicit task links. Existing development tracking remains in Beads, outside this public
repository; these requirements do not create a second task tracker.

Use native `on_hold` for a task waiting for a recorded specific circumstance;
Deferred is optional future or someday work. A held task is not a user-input
request merely because it cannot proceed. Verify its condition and original
authority before resuming. The existing deployment setup adds this supported
Beads custom state while preserving existing states and tracker data.

## Historical version 0.34.2 requirements

Automatic startup binds exactly the one default-route IPv4 address and
127.0.0.1 on the configured port, sharing one runtime. Explicit --host binds only
that address. Roll back all listeners if startup fails; shut down both cleanly.
Direct native HTTPS on the local listener accepts the exact matching loopback
browser Origin/Host (including port) alongside the configured public origin.
Require actual TLS and local socket endpoints; retain CSRF, Host, cookie and
certificate protections and reject HTTP downgrade or forwarded-header claims.

Preserve user-message Markdown soft line breaks and spacing in paragraphs and
list items. Pasted multi-line output stays readable without requiring manual
code fences. Retain normal Markdown parsing, fenced code/table behavior, exact
copy source and assistant formatting; do not rewrite clipboard text or infer
terminal commands from content.

Apply the saved chat colour as a persistent theme-compatible background tint
only on the compact title folder tab directly above and attached to the input.
The adjacent colour selector and status indicators stay outside the tint on
neutral backgrounds. Keep the title colour visible while the dropdown or input
has focus; the composer input frame and top agent tabs retain existing styling.
Provide cyan, violet, green, blue, teal and rose. Migrate older saved amber choices
to blue without losing other browser preferences; reserve amber for attention.

Keep a compact header inside the composer, directly above the input box and
below the scrolling history. This strip belongs to the chat input area. Put the
title tab and six-colour selector on the left; put Codex input receipt, native activity,
connection state and last real update age on the right. Use smaller text than
the input, readable contrast across all three themes and existing browser-local
per-conversation preferences. On narrow layouts, stacked status indicators go
above the title row so the folder tab still joins the input. Distinguish native input acceptance
from model activity, and transport heartbeats from real worker updates. Mark
unconfirmed connections and last-known activity truthfully; no guessed stuck
diagnosis, automatic resend, interruption, worker ping or restart.

On desktop, place a draggable horizontal divider between the chat history and
the whole composer, including its header, input and footer. Dragging up enlarges the
composer/input area and dragging down shrinks it. Support Up/Down keys, Shift
for larger steps, Home for the minimum height and End for the maximum.
Double-click resets automatic sizing. Escape during resizing or pointer
cancellation restores the prior size. Preserve draft contents and the header's
position directly above the input.

Save one composer-height preference in the existing browser-local workspace and
restore it on desktop after refresh. Clamp it to the available vertical space
while leaving chat history usable. This layout preference must not alter agent settings,
server configuration or network behavior.

The worker overview starts with **Project: {chat/project name}**, without a GOAL
label; the Coordinator heading is unchanged. Increase
all overview fonts by exactly one pixel, retaining their families and relative
size differences. Keep sidebar recaps near 20 words and at most25 words across
summary, blocker and next action; tasks and native questions retain full details.

Input requests start with Needed (a direct question/action, maximum 30 words)
and Why (one short sentence, maximum 20 words). Exact steps, commands, background
and original notes are available under expandable Details. This format is the
agent default as well as the task-dialog layout; preserve full native requests
and use existing protected input mechanisms for secrets.

Do not infer a human question from an ordinary blocked task. Reserve Needs input
for explicit input states or worker-recorded Question tasks; dependency waits
remain Queued and other blockers retain their actual state. Needed/Why must
exist in the recorded task information. Missing question/reason content must be
identified as missing, not replaced with an invented decision or request.

The Linux shell installer defaults to ~/commandcenter-ng. Document --prefix
DIRECTORY for custom home-contained destinations; retain old positional-path
compatibility and preserve nondefault existing installations without migration.
Updates to those installations need their exact prefix. Successful installation
creates INSTALLDIR/etc/config.conf with HTTP active and preceding commented
HTTPS/certificate examples under INSTALLDIR/etc/certs. Existing settings and
certificates survive updates. Use simple literal key:value text, not YAML.

Approved: omitted --host selects the Linux default-route IPv4 interface; explicit
host/environment settings remain overrides. Show interface/address at startup
and in systemd stdout logs. Explain defaults and overrides in --help and usage.
HTTP is the default. Foreground and systemd startup read the installed config;
explicit CLI/environment values remain overrides. When HTTPS is selected, missing or unsuitable TLS inputs
must not silently downgrade. Check files, X509 validity, key matching and browser
hostname and explain failure with safe public metadata. Keep login, secure-cookie
and origin protections. Certificate issuance/renewal stays external for ordinary
installations. The CaC deployment can create/reuse a self-signed backend pair,
verify its identities and write the selected HTTPS settings. All actual target
and environment settings remain in the encrypted private companion. Nginx and
deployment acceptance are owned by the other conversation; no duplicate setup.

The deployment attempts to provide Codex when missing. Installer/deployment
attempt native structured-question configuration; startup checks read-only.
Missing Codex, unsupported features or unsuccessful setup produce warnings and
allow installation/deployment/startup to proceed. Keep beta warnings and normal
logs; do not edit native TOML, suppress caveats or restart active native work.

Confirmed manual Codex approval returns keyboard focus to its current editable
chat draft. Preserve draft contents, native confirmation and errors. Do not
return focus after decline/cancel/review, failed answers, a tab/dialog change,
or while the input is disabled, detached or the page hidden. Claude work remains
postponed; this is not a provider permission or runtime change.

Codex approval cards expose native Allow always choices beside Allow once when
the current request offers a command-prefix, network-host or native MCP tool
saved permission. Show the exact offered scope and use the native approval
management system for persistence, with no CCNG allow-list or direct config-file
writer. Validate current request/identity and reject changed or forged rules.
Session choices are not permanent; file and request-permission limitations stay
explicit. Preserve ordinary forms, native confirmation, and coordinator limits.
Surface native save warnings without claiming resolved means saved. Claude
permission controls remain postponed with all other Claude work.

Receive native humanCommand checkpoints through the requiredHumanApproval
client capability. Preserve their original identity and fresh-human-only scope:
manual accept/decline/cancel choices only, with no session/persistent grant or
Coordinator queue/review path. Unknown supplied command kinds fail closed;
internal attestation/verification exchanges are not user questions or generic
replayable approvals. Replayed foreign worker dynamic-tool callbacks must be
ignored without reply/refusal so recovery cannot fail their existing operation;
CCNG-owned Coordinator tools keep their separate handler. This client declaration
grants no native permission.

Native approval labels stay on one line at the existing shorter button height.
Keep Allow once and offered Allow always choices together in a compact wrapping
button row. Put long exact scope descriptions outside that row so they cannot
separate the buttons on mobile. Associate each reusable choice with its exact
scope visibly and accessibly, including when several saved rules are offered.

Agent-tab amber indicates a need for the human user, rather than every native
approval wait. A delivered command/file approval still eligible for an available
Coordinator stays neutral and says it awaits Coordinator review. Explicit
referrals, manual-only questions/permissions and actual answer errors retain
human attention. Native attention without a delivered request is a neutral
missing-details diagnostic, not evidence the user can submit an answer. Use the
same request evidence in tabs and the input header, including child requests,
Coordinator review and native confirmation. Preserve actual backend status,
request contents and all send/approval gates; presentation cannot resolve a wait.

Coordinator project cards place the saved report cadence beside the project
name. When the worker's current tracker has Needs input tasks, their titles
replace the implementation recap in the same amber used in the task overview.
Exclude dependency-derived Queued work, preserve native activity status and
whole-card navigation, and do not use another worker's tasks or stale tracker
rows as current input evidence. Other cards retain their progress/goal summary.

Remaining Claude implementation/integration and live validation are postponed
at the user's request. Preserve the existing published code and completed
research while keeping unfinished provider-specific work visible in Todo.

Three browser-persisted themes are classic (original), contrastful (improved
dark contrast), and light. A compact palette menu occupies the old Logout
position; Logout follows the branding at the far right. Group Add agent with
the worker counter. Preserve mobile navigation and native Escape handling.

Tasks requiring real input sort first, after dependency-derived Queued status
is established. Ordinary recorded questions appear in Tasks with a Question
label, while native Open questions remain separate. The reply dialog explains
Needed and Why first, with detailed steps and the original record expandable.
New input descriptions use those concise fields plus Details. Legacy Context,
Input type and Input needed remain readable without inventing an answer.

Move task state closer to its description and put a Notify me checkbox after
it. Save subscriptions in existing browser workspace preferences. Notify on
observed needs-input, error and completion transitions; worker requests/errors
without a task association remain explicitly worker-scoped. Baseline new and
restored observations without historical bursts. In-app alerts work independently
of optional native desktop permission. No new backend notification service or
closed-browser delivery is selected.

Standard Task Reports must account for every active workstream in the current
scope, including delegated audits and research. Concise grouping must not hide
active work. Keep blocked, queued, deferred and completed work distinguishable;
disclose uncertain coverage without extra commands merely for an ordinary report.
An explicit one-off Detailed report adds every actual linked `in_progress` task,
with title/ID and up to ten recent attributable timestamp/action/outcome entries.
Allow bounded read-only existing Beads records/notes and supported native history
lookups only for this option. State missing/fewer/unknown evidence; never infer
action time from task updates or success from launch/tool completion. Keep the
normal summary first and the combined output within 32,000 characters, identifying
omissions. No project execution, external checks, secret reads, new research,
model calls or expanded permissions are authorized. Upgrade unsent requests only;
never downgrade or automatically resend a dispatched normal report. Expose that
upgrade limitation truthfully. Scheduled report choices/timing remain unchanged.

Report tracking matches the actual native delivery turn, including when the
previous turn finishes during request preparation. Recognize completed summaries
with ordered green outcomes, yellow work and blue Next bullets even when their
labels name topics and no red blocker bullet is present. Preserve the recommended
four-label instructions, pending-delivery confirmation, freshness and quoted/code
exclusions. Recognition does not imply completion or absence of blockers.

Native file approvals must show the available proposed paths, change kinds and
diffs to both user and coordinator, joined by exact worker/thread/turn/item
identity. Do not substitute identifiers or an earlier edit's content. Use the
existing native-message records and pending-request views, not another store.
Automatically hydrate available matching content from bounded native history;
show loading, unavailable content and truncation explicitly. Received proposals
must not require a routine Load/Retry click. Reads neither approve nor execute
changes or fetch arbitrary files. Preserve native
answer scopes and reject review when the proposal changes while being checked.

Preserve native assistant-message question titles/options even when their text
is empty. Show bounded metadata literally and disclose truncation; do not merge
it into pending approvals or infer whether a historical question remains open.
Provide manual per-question option/free-text replies only for
eligible current Codex workers, only a completed assistant message within the
same known active turn, with exact original native message ID and zero-based
question index. Derive the bounded title fragment server-side; do not trust
client title text. Restored/history-only metadata may not restart a turn. Send
through supported ordinary native input/steering, not approval RPCs; native
acceptance establishes emission, not task/question resolution. Partial replies
keep other editors. Native terminal state ends eligibility; CCNG ordinary-human-
follow-up retirement is conservative policy, not exact native cross-client
parity or proof of an answer. Preserve unsent text and submission/error latches
across worker switches only in existing browser memory, not localStorage,
workspace or server storage; refresh may discard them. Automatic control input
and handoffs must wait on verified live human decisions or ambiguous submissions
through existing bounded queues and pre-send gates; gate verification is pending. Unknown, truncated, unsafe, inactive or unbound cases stay read-only with truthful next steps. Preserve connection, ownership, request and
handoff gates, explicit errors and no automatic resend/follow-up. No new
store, native permission or model call. Existing native server-request forms
remain separately answerable; combined verification/publication/deployment of
the new path remain pending.

Escape interrupts the eligible native turn in the visible chat through the
existing Interrupt action. It preserves unsent drafts and normal local Escape
behavior for dialogs, questions, selects, summary review, resizing and IME.
It does not interrupt another tab or undo completed work.

The user approved Codex-only support, a local Node.js backend, port 4242,
configurable localhost/VM-internal listening, and nginx access restrictions plus
a local application password stored as a secure hash outside the checkout.
The user approved the ws dependency for the native Codex Unix WebSocket transport.
The installer accepts a destination directory or asks for one before installing.

The installer is directly executable as `./install.sh`. The first implementation
includes four tabs, live state, existing/new agents,
reported tasks/subagents, chat, steering, interruption, and questions. Version
0.1.0 adds native branching from completed replies, parent navigation, optional
editable findings return, a maximum of three task summaries without shell-command
fallback, a dark graphite/cyan palette, automatic-fetch installer updates, and a
launcher inside the installation target. See README for checks and limitations.
Version 0.1.1 corrects updates when the installation directory is inside the
checkout, while preserving protection for source changes. Durable decision
summaries remain future implementation work.

Version 0.2.0 adds generated branch summaries and child closure after accepted
handoff, a full-window workspace with a desktop goal/task sidebar, compact
single-line tabs inside the functional top bar, and task collection from explicit
numbered chat requests plus native plans/subagent activity. On smaller screens,
goal/tasks remain above the conversation. Repeated tab-status text, the large
workspace heading, and unintended vertical tab scrolling are removed.
Version 0.2.1 places branding at the far right of the full-width top bar.
Version 0.2.2 excludes stale raw requests and completed work from current tasks,
and resets previous-turn plans/reports when a new turn starts. That patch retained native reports as the source at the time.

Version 0.3.0 implements the subsequently approved Beads integration. Stored
task state replaces chat inference, conversation labels persist the task links,
and the app checks the bd prerequisite. Agents update records through bd; the
backend polls them without another agent/model call. Explicit task linking does
not mutate status or ownership. The same release focuses the chat input on tab
selection and replaces the square brand mark with a generated control tower.

Version 0.3.1 waits for native resolution of answered questions and approvals.
Unconfirmed submissions remain visible with an error; another client's native
resolution clears the matching conversation/request. A real two-client check
verified clarification resolution and continuation of the original turn.

Version 0.4.0 implements the subsequently authorized native Codex coordinator.
It starts with the first worker, has its own visually separated chat tab in
addition to four worker slots, reads worker history/Beads and publishes recaps.
It requests reports and queues attributed summaries into idle worker chats.
It reviews pending command/file approvals against actual user scope, including
permitted resource changes, with exact request identity and real-user evidence.
Uncertain authority remains with the user. Its prompt and reduced native tool
configuration stay separate from workers; no AAP credential or enforcement
service is introduced. Worker tabs can be dragged or moved with accessible
controls. See [coordinator implementation](coordinator.md).

Version 0.4.1 corrects tab dragging with pointer capture on the tab button,
visible drop markers and cancellation/click handling for mouse, touch and pen.
The coordinator stays outside worker reordering. No task, permission or storage
behavior changes.

Version 0.4.2 makes the requested coordinator separation explicit: one to four
worker tabs and Add agent align left; a distinct violet, rounded coordinator
tab aligns right outside their scrolling strip. It retains a unique overview
icon, state/attention indicators, compact mobile form and its existing chat.

Version 0.5.0 implements the user-approved workspace-restore split. The existing
backend stores open worker/coordinator IDs and coordinator pause state in a
private file beside login configuration; drafts, selected tab, order and reading
positions stay browser-local. Startup reads views without resuming unloaded
workers or starting turns. The same coordinator is reused, with restrictions
reapplied when it acts. No queued approval answer or message is replayed.

The same release places the coordinator immediately after a more prominent
Add agent button in a right-hand group, keeps workers left and branding
rightmost, adds top spacing and reduces tab height roughly 30%. It replaces the
unclear tower with a recognizable complete-building icon and uses the exact
wordmark command center NG. Rendered design review awaits the user's screenshot.

Version 0.6.0 widens the desktop context sidebar by about 40% and adds explicit
Open questions with amber counts, request text, coordinator decision rationale
and links to the answer cards. Native resolution remains authoritative; a sent
answer stays listed until confirmed. Multi-question requests show each question.
Missing details do not establish another client's ownership or justify directing
the user to an assumed question there. Branch
chat moves beside Interrupt and Send in the chat composer. Ordinary-chat question
inference is not included; the requested scope choice remains open.

The next installer work adds a read-only environment inventory, confirmed RHEL 9
RPM installation, target-local missing CLI installation and explicit sign-in
readiness. Existing tools/trackers are preserved. Fresh shared Dolt configuration
is proposed for parallel writers but remains pending user direction. RHEL 9
prerequisites are documented; other distributions are not yet tested.

Version 0.7.1 removes the extra workspace top gap below the tab bar. Version
0.8.0 requires an explicit project directory when creating a worker, excludes
coordinator conversations from worker selection and verifies native roles before
opening or restoring them. New coordinators carry a native source marker that
survives renaming; older coordinators retain their reserved native name. No
separate role database or automatic rewrite of existing chats is introduced.

Version 0.8.1 applies the user's revised tab treatment: the coordinator uses the
same tab styling as workers and sits immediately before Add agent. Its identity
and controls remain separate from worker reordering.

Version 0.9.0 fixes request capture during native resume and adds explicit loading
of missing pending requests for a selected active conversation. It preserves the
original native IDs, permissions, coordinator restrictions and confirmation
semantics. A waiting flag without details no longer claims another client owns
the request. Startup restoration remains read-only, and ordinary chat cannot
replace or steer work while a pending request is missing.

Version 0.9.1 applies the verified folder-tab request: the active tab joins the
pane without an intervening border or bottom selection stripe. Matching fill,
clearer side edges and a stronger label indicate selection. The coordinator
remains immediately before Add agent, and status/focus controls are preserved.

Version 0.9.2 strengthens selection of the tab whose chat history is visible.
The top inset doubles from 8 to 16 pixels. The selected tab is about 40 pixels
tall versus 34 pixels for inactive tabs, with a larger bold white label and
regular-weight inactive labels. Cyan top/side edges and brighter upper fill
reinforce selection independently of agent activity. All tabs align at the pane;
the fill fades into it at the open bottom. Status dots and keyboard focus remain
distinct, with no bottom selection stripe.

Version 0.9.3 adds a fixed twelve-pixel inset above the chat-history scroll
viewport. Scrolling text clips below the tabs while the folder-tab/pane join
remains seamless. Inactive worker and coordinator tabs use the pane's background
across activity states; dots and top edges continue to indicate status. The
selected tab keeps its size and bold label. Desktop and mobile use the same inset.

Version 0.10.0 corrects the composer Branch chat cutoff. It snapshots the current
stored conversation, including messages from an ongoing turn, instead of stopping
at the latest completed reply. The child waits for explicit input; native handling
marks its copied partial turn interrupted while the parent continues unchanged.
Branch here still selects a completed historical reply. Existing branches keep
their original snapshot and histories; no automatic replacement or replay is added.

## Decisions still open

Coordinator tracking of unanswered ordinary-chat questions, stronger independently enforced remote-resource
boundaries, integration with a separately running assistant-team, other agent
runtimes and actual deployment proxy/TLS configuration remain open. The current
coordinator inherits the configured native Codex model. Architectural changes
require user direction unless specifically delegated.

## Version 0.11.0 additions

Collapse consecutive tool activity by default while exposing running/failure
counts and preserving individual detail controls. Keep drafts editable during
pending native questions, block actual sends until resolution, and preserve
newer typing across an earlier send acknowledgment.

Provide a genuine-RHEL-9-only Ansible playbook using an existing account and
Codex/Beads profile, with unprivileged systemd runtime and private password
handling. Public project owns reusable deployment logic; the private project
companion owns whole-file Vault-encrypted AAP CaC and environment settings.
Actual VM deployment and AAP integration require protected inputs and live
verification. Claude monitoring remains a separately pending integration.

Version 0.11.1 corrects coordinator reporting: describe actual work by name,
lead with useful outcomes, identify unfinished work and a concrete blocker or
next action, and distinguish published code from verified live deployment.
Task IDs are optional supporting references rather than user-facing explanations.
Routine idle/closed-record/no-approval bookkeeping is omitted unless relevant.
The same guidance reaches initial/restored coordinator instructions, event
reminders and worker report requests without replacing the coordinator.

Version 0.12.0 exposes all delivered simultaneous worker requests and explicit
counts to the coordinator. A single clarification request may contain several
questions; those counts stay distinct. Each review returns current remaining
requests, and unreviewed approvals remain scheduled after another request is
resolved or referred to the user. Requests keep independent IDs/tokens, native
confirmation and exact authority checks; one manual decision does not block
review of unrelated requests. Counts cannot establish an authoritative total
of native requests whose details have not reached this client.

Version 0.13.0 persists a two-bullet decision format: high-level request meaning,
then actual decision and rationale, each at most one or two sentences. Vivid
colored Unicode markers accompany explicit outcome words. Raw Python/shell code
belongs in review context, not the user-facing request summary. An ask is not a
decline and unconfirmed native answers are not resolved approvals. Coordinator
instructions also require concise non-approval feedback through the existing
bounded worker-summary channel, offering a permitted alternative or waiting for
the user. Pending requests and safe-idle delivery gates are preserved.

The user has approved tracking unanswered ordinary-chat questions too; that scope
choice is resolved and its implementation remains separate. The current chat
renderer still only handles bold/fenced code. Full Markdown rendering is newly
requested and awaits the user's library/scope choice; do not claim it is included
in this release.

Version 0.14.0 increases workspace capacity to sixteen workers plus the separate
coordinator. Apply the same limit to opening, creation, branching, parent
navigation and private workspace persistence. Preserve horizontal tab scrolling,
coordinator restrictions and native worker settings.

## Version 0.15.0 additions

Render full Markdown/GFM with raw HTML disabled. Worker-specific settings offer
Task report every once and radio choices 1h, 15min, 5min, Never, default Never,
using existing private metadata and safe-idle report delivery. Worker base
instructions require vivid named reports, the project's latest release/publication
status and structured clarification tools when available in the current mode.
Show all current Beads tasks in a scrollable panel with real state totals and
queued derived from unfinished dependencies. Task details allow direct answers
or requests for clarification without automatic task closure.
Any legacy branch summary review stays inside the child tab and retains edits
when switching tabs. The current one-click Hand back & close action supersedes
its mandatory review step. Parent-delivery errors identify the parent while
preserving native request identity and safe delivery/archive ordering.

The user approved future ordinary-chat question tracking, fresh local Dolt/Beads
provisioning and local read-write Claude management with the official Claude Agent
SDK. These remain unfinished. Remote/SSH session monitoring is excluded for now.
Per-worker model and supported reasoning-effort controls are requested follow-up
work, using the native catalog rather than hardcoded model lists.

Version 0.16.0 permits read-only helper-source inspection tied to an exact current
command approval outside project boundaries. No execution or credential-data
access; stale requests/changed evidence are refused. Reports queue at their due
time even during work or questions, show queued/generating state, retain delivery
gates and coalesce missed intervals.

The task-list viewport is capped at three visible rows on desktop and mobile;
all remaining tasks remain available by scrolling, and header totals include
the entire current list. This changes the viewport only, not task retrieval.

Version 0.17.0 mirrors current user-facing native requests and renders supported
MCP/permission controls manually, preserving exact native access and confirmation.
Unsupported/legacy/unknown human requests stay visible with a precise next step;
internal protocol exchanges stay internal. Coordinator restrictions are retained.
Report now beside Never queues one report without changing saved cadence.
The user also requests model/effort selection and a resizable overview/sidebar,
coordinator alignment with the chat column, uncapped useful chat text width and
moving the version label into the composer footer. These remain unfinished.


Version 0.18.0 exposes per-worker native model/effort settings for subsequent
turns, a browser-persisted desktop overview divider, chat-width text, coordinator
alignment and the version badge in the composer footer. Model choices and saved
state come from the native runtime; no permission/global default changes.
Historical0.18.0 decision (superseded by0.26.0): the user rejected CCNG's recurring report timer. Radio selection sends
one Standard Task Report timing instruction; changes replace it and Never asks
the agent to cancel its schedule. Timing belongs to the agent runtime. Report now
remains one explicit request. Restoring tabs does not replay timing instructions.


Version 0.18.1 saves the user's proportionate helper-review rule: inspect directly
referenced helper source when necessary, including startup behavior and called
functions, without a routine recursive dependency audit. Referrals require a
concrete unresolved concern; absent source-reader tooling is reported separately.
The existing reader applies the same exact-current-approval helper checks for
older coordinators, preserving their conversation and native tool registration.


Version 0.19.0 adds official-SDK local Claude discovery/management, shared local
AGENTS runtime context, Beads-backed ordinary-chat input questions and explicit
fresh Dolt/Beads installer setup. Native histories, exact requests, provider
ownership and permissions remain authoritative. External active Claude sessions
are followed until released; SDK-owned processes end at app shutdown, and Claude
branching is not yet integrated. Codex-only coordinator restrictions remain.
The user also restored90ch maximum message width, removed task assignee names,
requested natural-height task rows/first-three-row viewport, and put Model/Effort
labels/selects on one line without routine explanatory paragraphs.

Version 0.19.1 fixes approval-linked relative helper reads when a pending
command's native working directory differs from its worker directory. Both
reader entry points use native approval cwd, falling back only for absent/null
cwd. Exact literal relative/absolute paths share the same checks and evidence;
directory changes invalidate inspection. The older reader refuses ambiguous
cross-directory matches and preserves ordinary project reads. No helper
execution, dependency recursion or permission expansion is added.

Version 0.19.2 lets the existing reviewer validate an actual user instruction
returned by an older native worker-history page. Keep a bounded process-local
page reference and re-read that exact native worker page for the cited ID;
preserve exact quote, provenance, worker/request/token checks and generated-
message exclusions. Do not infer authorization from assistant statements or
coordinator relays, scan unrelated history or persist another transcript store.

Version 0.20.0 adds horizontal overview dividers that resize adjacent section
heights with pointer and keyboard controls, independent scrolling and a reset.
Use existing browser-local preferences; preserve mobile natural stacking and
the default natural-height three-task viewport until explicitly resized.

Version 0.21.0 prioritizes due and one-off Standard Task Reports at the next safe
checkpoint, using current evidence before further project work. Report now uses
existing native Codex steering during safe active turns and precedes unsent
summaries. Preserve blocking-request, pause, handoff, queue and native identity
protections; do not add automatic interrupts. The later0.26.0 decision authorizes the report timer.

Version 0.22.0 adds explicit user-level systemd install/start/stop/restart/status/
logs/enable/disable/uninstall through the maintained launcher. Preserve explicit
runtime options, native profile paths, auth/workspace data and unrelated units.
No root service, automatic live interruption, native daemon change or lingering
change is introduced. Real host activation remains distinct from code publication.

Version 0.23.0 adds author | hh:mm headers using browser-local24-hour time for
user, worker and coordinator chat messages. Preserve native message times and
first live receipt across updates; leave historical time unavailable when the
provider does not expose it. No timestamp inference from history loading.

## Clipboard image input

Users can copy an image/screenshot and paste it directly into the chat input.
Also provide an accessible Attach image native file picker, including mobile
Firefox, using the same validation, previews, limits and in-memory drafts.
Capture the target chat when opening the picker; later selection must not land
in another chat after switching tabs. Support cancellation and same-file
reselection. Draft attachments remain editable while native requests block
sending; branch handoff locks continue to apply. No new upload service or store.
Show removable previews before sending, support image-only or captioned sends
through native Codex and the official Claude Agent SDK, and retain exact
conversation/request ownership and send protections. Pending questions allow
draft editing but still block sending. Unsent image drafts survive chat-tab
switches in memory only; refreshing/closing the page discards them. Sent images
remain in native provider history. Do not add image draft persistence, remote
image fetching or a separate attachment database.

Preserve exact pending-request records delivered on the current connection and
show received requests automatically. A native wait without details is a status,
not proof of an answerable question or another client's ownership. Show pending,
loading and unavailable details without a normal Load/Retry step. Optional
parent-only advanced reconnect remains an explicit user action; children have
no recovery button. The approved automatic reconnect below is limited to eligible
active contexts; discovery alone does not authorize resume. Do not
reconstruct missing callbacks from history or revive resolved/disconnected
requests. Coalesce browser updates with a bounded delay
even during continuous worker activity. A delayed initial read or an old login's
callbacks must not overwrite newer streamed state. Loading never submits answers
or changes native permissions.

A saved report interval remains the selected cadence after browser refresh and
is supplied in runtime instructions when a worker starts/resumes its next turn.
The agent reconciles its timing without duplicate schedules or chat reminders.
Native timing and live recurrence must be verified separately from saving or
delivering an instruction. The later0.26.0 decision selects a CCNG backend timer.

## CCNG-managed reporting in0.26.0

The user explicitly switches report timing to CCNG. Internal report requests
and routine coordinator event inputs must be silent in both CCNG chat histories;
actual agent reports remain visible. On startup the coordinator backend reads
all saved worker intervals, queues one initial report for each enabled session
and schedules subsequent reports without radio toggling. Refresh keeps existing
deadlines. Never cancels scheduled work; one-off Report now remains available.
Reuse current native input queues, coalesce outstanding reports, avoid missed
report bursts and preserve pending native questions, pause, ownership and
permission protections. Stop older agent-owned report loops during migration.
This supersedes the earlier native-agent-owned timing requirement.

## Coordinator startup dashboard

After startup, the coordinator reaches out for current worker summaries and
stored task progress to populate the dashboard. It also reads the saved report
intervals and next due times. Request one silent startup report only for enabled
report intervals and coalesce enabled-timer startup work. For Never use stored
summaries/tasks without an automatic report; manual Report now remains available.
Publish available evidence first, update sidebar fields as fresh results arrive
and preserve pause/native request/ownership boundaries. Refresh/reconnect must
not duplicate requests, change intervals or cause routine chat spam.


## Bounded desktop overview with bottom settings

Use 100% of the overview's available desktop browser height and no more. Anchor
report/model controls at the bottom. Tasks and Open questions may scroll within
the remaining bounded area; oversized saved section heights must not grow the
document or push settings outside the pane. Preserve user resizing/reset and
keyboard access, natural task row reflow, native request controls and all themes.
Keep long settings feedback reachable on short windows with internal overflow.
The approved mobile continuous-page layout remains unchanged.

### Native approval choices

Manual Codex approval cards must expose the exact native choices: Allow once,
Allow for this session, and Allow always where supported/offered. A native file
request need not contain an explicit choice list: its fixed response schema
supports session approval. Exact filesystem/network requests support turn or
session scope, not a permanent grant. Preserve current identity, confirmation,
explicit restrictions and coordinator limits. CCNG does not create its own
permission store or change native configuration directly.

Known native Codex children must expose delivered pending requests under their
parent using the existing cards with source-child labels and native choices.
Put child activity/status in an optional Subagents section below Tasks, collapsed
by default. Pending cards and recovery warnings remain visible independently;
retain backend/Coordinator status. Require verified parent
lineage from native metadata. Keep pending requests bound to the child's original
thread ID and type-preserved native request ID; never fabricate IDs or replay approvals.
Parent/child context is transient, not a new store, timer, tab or worker slot.
Keep manual/Coordinator approval limits and native permissions unchanged. A
child-only wait must not block otherwise-available parent input. Do not resume a
child merely for discovery or claim other-provider support. Retain early received
native child requests in bounded process memory, private until native metadata
proves their parent lineage. Attach only that verified child's exact pending
requests, without inventing identities or replaying answers. Never-delivered
details and callbacks lost across a cold restart are not recoverable merely from
a native wait. Expose unknown/missing details rather than a fabricated complete
request set.

### Approved automatic native reconnection

Since 1.4.0, reconnect an already-open local Codex worker root or a verified
known native child when fresh native state is active with `waitingOnApproval` and
the waiting context has no delivered current request. Never reconnect merely
because an actionable card is already waiting for a manual answer.
Reuse the existing five-second backend poll; coalesce once per context,
connection and wait episode, without automatic retry on error or missing replay.
Use the native `thread/resume` call with the original `threadId`,
`excludeTurns: true` and a bounded one-turn full initial page. Use that same
response for exact pending file-change items omitted by durable history; match
current request/thread/turn/item, preserve newer live bodies and retain original
request identities and answer controls. The approved 1.4.2 exception permits
one guarded snapshot reconnect for an exact delivered file approval whose
proposal remains unavailable after bounded history. Verify unchanged cwd,
identity, lineage, connection and history before using it. Eligible failed or
empty attempts consume the original callback's allowance; do not repeat them
through polling or manual detail reloads.

Exclude intentional idle/unloaded, foreign, paused/stopped, Coordinator and
handoff contexts. Do not answer approvals, change permissions/configuration or
retry commands. An eligible active context becoming idle before the native call
arrives may continue through native resume; the user approved that race. Add no
new timer or persistent store, and do not extend this to deferred Claude work.
Keep missing-details cards and diagnostics; reattachment does not prove recovery
of lost cold callbacks or resolution of a request. Combined tests, publication, installed checks and real request delivery are
verified; one older MCP wait and physical browser acceptance remain unresolved.

### Never includes startup reports

Never disables all automatic Standard Task Report requests, including startup
dashboard refresh. Startup still reads stored summaries/tasks/report settings
without waking that worker for a report. Manual Report now remains a one-off;
enabled schedules retain coalescing and their cadence. Changing to Never cancels
only unsent automatic reports, preserving explicit manual, failed/unconfirmed
and in-flight requests. Separate ten-minute task checks remain independent of report intervals.

### Traceable conversation history

The user withdrew Edit/Rewind to keep communication and decisions traceable.
Do not offer previous-message editing or conversation rewind. This supersedes
the earlier whole-turn approval and withdraws individual-message and Claude
rewind variants as well. Preserve original messages and decisions; corrections
or changed instructions belong in follow-up text. Branching remains a separate
supported action that preserves the original conversation. Other deferred Claude
integration work is unchanged by this withdrawal.

### Durable coordinator decision summaries

User approved a private decisions.jsonl beside workspace metadata, owner-only and
outside Git, retained until explicit deletion. Reload recent records at startup
for the existing decisions panel; older entries remain on disk. Persist short
request/decision/rationale, timestamps/names and native references only, excluding
active approvals/credentials/raw code/answer forms. No replay or permission authority
from saved summaries. Native acknowledgement/outcome stays independent of save
failure; visible errors and graceful write flushing are required. Existing native
history remains full reference, without automatic retrospective import.

The user additionally selected restoration of the latest needs-user explanation
onto a verified current request. Persist only a non-secret request fingerprint
and native reference metadata in the existing history. Require a stable native
discriminator; legacy or ambiguous records remain history-only. Show the date
and retain manual waiting until an explicit human request for fresh Coordinator
review. Never restore positive approvals, send native answers or use saved text
as permission authority.

### Coordinator's own generated Beads hook output

The existing source reader may read bounded pages of generated text output under
the current Coordinator conversation's own hook-output directory. This is an
explicit narrow exception to project/helper-only reads. Reject other conversations,
arbitrary temporary files, links, wrong ownership and credential-like contents.
Add no shell access, execution, dependency inspection or general filesystem
permission. Hook text supplies context, never independent action authority.

## Version 0.48.0 requirements

For missing Codex, the approved installer uses a pinned npm global-prefix install
under `~/.local` by default, with `--codex-prefix` for another writable location.
Global mode selects npm's layout under that prefix, not a system-wide or multi-user
installation. Existing compatible Codex, including app-local copies, is reused
without migration/removal; Beads and Dolt remain app-local. Refuse a fresh Codex
prefix inside the app or an app inside the Codex prefix's `bin/` or `lib/` trees.

After app installation succeeds, maintain only the marked Bash PATH block,
preserving other `.bashrc` content. The user sources it for the current shell;
normal new Bash startup loads it. No native profile, `CODEX_HOME`, daemon bootstrap
or restart is introduced. Worker overview headings use **Project: {chat/project name}**;
the Coordinator heading stays unchanged. Put child activity in a default-collapsed
Subagents section below Tasks, preserving independently visible pending child
cards/recovery warnings and backend/Coordinator state without a new store.

Version 0.48.0 is published and deployed; installed checks verified exact source,
the managed Bash block, native CLI resolution and isolated report/check deadlines.
Installer/profile checks use the version-controlled deployed-source
test command documented in [installation](installation.md#verify-installer-and-bash-path-after-deployment);
temporary profiles/stub installation do not prove fresh real Codex installation,
native authentication, browser behavior or boot autostart.
