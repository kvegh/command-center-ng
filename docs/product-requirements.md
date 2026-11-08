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

Fresh setup uses a user-chosen application password and preserves existing
configured passwords. The shared bootstrap-password/forced-first-login-change
proposal is withdrawn. Interactive installation prompts when authentication is
absent. Headless installation may stage files without creating a password, but
the server must refuse startup without valid authentication. Ansible deployment
requires a protected initial password of 12–4096 characters only when the auth
file is absent; it does not rotate an existing password.

### Approved mobile layout

Use a single naturally scrolling, full-width page with wrapping worker tabs.
Place the overview above a bounded chat history of approximately 30 text lines,
then a composer textarea with six visible lines. Longer input and pasted text
scroll within the textarea. Hide worker Coordinator recaps on mobile; retain
the actual coordinator dashboard.

Disable mobile resizing and ignore saved desktop sidebar widths, section heights
and composer heights without erasing them. Preserve the existing desktop layout
and restore its preferences when returning to desktop. Mobile notifications
remain postponed. Version 0.35.0 implements this approved layout; rendered phone
acceptance has not been established.

## Dashboard and project context

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

Every chat message has a **Copy this** control with a copy icon, immediately
left of **Branch here** where branching is available, with space between them.
It copies that message's full text to the browser clipboard. Fenced and indented
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

The optional **Return summary** action prepares a concise summary in the child
using its existing native Codex context. It covers findings, decisions and their
reasons, completed verification, unresolved questions, and next steps. The user
can review or edit it, then send it to the parent. The parent receives a summary
rather than the transcript. After accepted delivery, the child is archived and
its tab closes. History remains available in Codex's archive. Delivery failures
keep the child open; an archive retry does not resend an acknowledged summary
within the current application process.

Navigation remains separate: Back to parent does not send, archive, or complete
the child. Native context preservation and the summary/close lifecycle were
verified with real Codex conversations.

## History and tasks

Keep decisions available as short, readable summaries with their rationale and
a route back to the original discussion. Historical review should help the user
understand why the project reached its present state.

Work needs durable task tracking. The user is open to Beads, a Git-backed
TODO.md, or another suitable mechanism. The user selected Beads as the runtime source. Agents update task records and
the backend reads structured state directly; conversations have explicit task links. Existing development tracking remains in Beads, outside this public
repository; these requirements do not create a second task tracker.

## Current development version: 0.34.2

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
on the title/colour/status tab directly above the input. It must remain visible
while the dropdown or input has focus. Keep colour scoped to this header strip;
the composer input frame and top agent tabs retain their existing styling.

Keep a compact header inside the composer, directly above the input box and
below the scrolling history. This strip belongs to the chat input area. Put the chat title
and a four-colour selector on the left; put Codex input receipt, native activity,
connection state and last real update age on the right. Use smaller text than
the input, theme-compatible cyan/violet/green/amber choices and existing
browser-local per-conversation preferences. Distinguish native input acceptance
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

The overview starts with the project/chat name, without a GOAL label. Increase
all overview fonts by exactly one pixel, retaining their families and relative
size differences. Keep sidebar recaps near 20 words and at most25 words across
summary, blocker and next action; tasks and native questions retain full details.

Input requests start with Needed (a direct question/action, maximum 30 words)
and Why (one short sentence, maximum 20 words). Exact steps, commands, background
and original notes are available under expandable Details. This format is the
agent default as well as the task-dialog layout; preserve full native requests
and use existing protected input mechanisms for secrets.

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

Native approval labels stay on one line at the existing shorter button height.
On narrow cards, wrap whole choices while keeping their exact scopes readable.

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
disclose uncertain coverage without extra commands merely for a report.

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
answer stays listed until confirmed. Multi-question requests show each question,
and externally owned requests direct the user to their native client. Branch
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
Branch summary review belongs inside the child tab; switching tabs retains the
review and edits. Parent-delivery errors identify the parent and offer navigation,
while preserving native request identity and explicit summary delivery/archive.

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
Show removable previews before sending, support image-only or captioned sends
through native Codex and the official Claude Agent SDK, and retain exact
conversation/request ownership and send protections. Pending questions allow
draft editing but still block sending. Unsent image drafts survive chat-tab
switches in memory only; refreshing/closing the page discards them. Sent images
remain in native provider history. Do not add image draft persistence, remote
image fetching or a separate attachment database.

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
intervals and next due times. Request one silent startup report per worker,
including a one-off summary for Never, and coalesce enabled-timer startup work.
Publish available evidence first, update sidebar fields as fresh results arrive
and preserve pause/native request/ownership boundaries. Refresh/reconnect must
not duplicate requests, change intervals or cause routine chat spam.
