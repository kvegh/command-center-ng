# Command Center NG

A calm, responsive workspace for AI agents, projects, tasks, and branching
conversations. Switch between work without having to reconstruct the context.

## Project status

**Version 0.30.0 (in development)** includes local Codex and Claude workspaces and the Linux installer. It supports
up to sixteen worker tabs plus a separate coordinator, live running/idle/attention state, existing conversations, new
agents, conversation branches, a scrollable list of linked Beads tasks, chat, steering,
interruption, and questions. The classic dark graphite theme uses cyan controls,
green running states, and amber attention states; contrastful and light themes
are available from the compact palette menu.
The interface uses one local Node.js service, the existing Codex daemon and the
official Claude Agent SDK. Each provider keeps its native session history and execution.
A compact top bar puts the agent tabs and controls first, with branding at the
right and Logout after the branding. Add agent and the worker counter form one
group. It spans the full browser width. The workspace fills the window, with goal/tasks in a right sidebar on desktop and
above the conversation on smaller screens. The desktop sidebar is about 40%
wider and includes Goal, current task summaries and **Open questions**. Live
clarification questions and approvals have an amber count, full question text
and links to their answer controls, so requests remain easy to find while
reading older messages. Selecting a tab focuses its chat
input and places the cursor at the end of its saved draft. The generated logo
shows a schematic white curved control console and three monitors on a transparent background; the header and browser favicon
share the same asset. See [brand asset and generation prompt](docs/brand-assets.md). The visible
wordmark is **command center NG**. Tabs have a sixteen-pixel top inset.
Inactive tabs stay compact at about 34 pixels; the selected tab is about 40 pixels
tall. Status dots retain their vivid colors.
The chat workspace begins directly below the tab bar, with the extra desktop
and mobile top gap removed in 0.7.1.
In 0.9.1, small folder-style tabs join the pane without a separating line.
The selected tab shares the pane's fill and uses a stronger label and outline;
the bottom selection stripe is removed. Version 0.9.2 doubles the top inset
from eight to sixteen pixels and makes the tab for the visible conversation
taller, with a larger bold white label, cyan top/side outline and brighter fill
fading into the pane. Inactive labels use regular text. The same treatment applies
whether its agent is running, idle or waiting; the status dot keeps its own color.
Keyboard focus remains separate from selection.

Version 0.9.3 keeps the scrolling chat history twelve pixels below the pane's top
edge, so text disappears before it reaches the tabs. This inset stays in place
while scrolling; the tabs remain attached to the pane. Inactive tabs use the same
background as the chat pane, including tabs waiting for attention. Status colors
remain in their dots and top edges; the selected tab keeps its larger bold treatment.

Linux is the first and primary platform for installation and operation. The
interface must work well in a Linux desktop browser and a smartphone browser;
mobile may present a simpler layout without losing the core workflows.

## Frontend

The selected frontend is **React with TypeScript and Vite**, styled with plain
CSS and shared design tokens. React provides reusable interactive components;
TypeScript makes conversation, task, and agent state easier to maintain; Vite
provides the development and production-build tooling.

The visual direction is elegant, technical, readable, and restrained. Beautiful
typography, spacing, responsive layouts, and clear states take precedence over
decorative effects. See [frontend direction](docs/frontend.md) for the rationale
and tradeoffs.

## Future agent and harness integrations

For future runtime additions, see [requirements for agents and harnesses](docs/agent-harness-requirements.md).
It summarizes the source and decision history: native session control and history,
project isolation, human requests/permissions, instruction/task/report cooperation,
required native Goals support, optional capabilities and current gaps. Native
Goals execution with CCNG controls is approved; the isolated Codex protocol
adapter is preparatory code, with no routed controls or automatic goal activation
in this version. It is a reference for assessing candidates,
not a claim that other products are already supported.

## Themes and task attention

The palette button offers **classic**, **contrastful** and **light**. Classic
preserves the original palette. Contrastful strengthens weak small text and
control boundaries; light uses brighter surfaces with dark, contrasting text.
The selection uses the existing browser workspace preferences and survives a
refresh. Logout is the last header control, to the right of the branding.

Tasks needing actual input appear first. Dependency-waiting tasks remain Queued.
Ordinary recorded chat questions appear once in Tasks with a **Question** label;
native requests and approvals remain in **Open questions**. A task's reply dialog
shows **Context**, **Input type** and **Exact input needed** when explicitly
recorded. Older vague records offer clarification rather than an invented answer.

Each task has **Notify me** after its state, with the tooltip “Notify me when
this task needs my input, encounters an error, or is completed.” Subscriptions
are saved for this browser in the existing workspace preferences. In-app alerts
show observed changes; desktop alerts are optional, require browser consent and
a supported secure context, and are attempted when the page is hidden or unfocused.
If desktop access is denied or unavailable, in-app alerts continue. See the
[browser notification requirements](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static).

Notifications require the CCNG page and its live connection to remain open.
Reloading, reconnecting, reopening a worker and adding a subscription establish
a baseline; they do not replay historical events or claim missing tasks completed.
Beads closure means **marked completed**, not independent proof of successful
delivery. A worker's new native request or runtime error is labelled as a worker
event when it cannot be tied to one watched task. Desktop text is generic and
does not include task titles, commands or request contents. The latest twenty
in-app alerts remain in memory until dismissed or the page reloads. Separate
browser windows maintain their own alerts; there is no email, push service,
closed-browser delivery or cross-window deduplication.

Standard Task Reports cover **every active workstream**, including delegated
audits, research, implementation, documentation, verification and publication.
Grouping keeps reports short without omitting unchanged active work. Reports
distinguish active, blocked, queued and deferred work, using known evidence and
disclosing uncertain coverage. This is saved instruction guidance; it does not
guarantee perfect model compliance or authorize extra work merely for reporting.

In the coordinator overview, each clickable project card places **Reports: 15min**
(or its saved cadence) beside the project name. Current **Needs input** task
titles take priority over the implementation summary and use the same amber
theme token as the worker's task overview. Dependency-waiting Queued tasks are
excluded. With no recorded input needs, the existing progress summary or goal
remains visible. The native activity badge and tab-switch action are unchanged.
The card uses that worker's current ready tracker, not another conversation's
tasks or guessed questions.

At the user's request, all remaining Claude implementation, Goals/rewind
integration and live validation are queued for later. Existing published SDK
code and completed research/fixture evidence remain; no Claude live acceptance
is claimed. Codex Goals and Edit & rewind are separate unfinished work.

## Copy messages and commands

**Copy this**, beside **Branch here**, copies a message's complete text to your
browser clipboard, including its Markdown source. Copy works independently of
branching and the provider connection. Each fenced or indented code block has
its own copy icon for just that block's text, preserving spaces and line breaks.
Inline code remains inline. Success and failure feedback is visible; copying
never runs a command or sends a message.

The browser clipboard API is preferred. Browsers without it can use their
supported legacy copy action; a denied native clipboard request is not retried
through that fallback. Clipboard availability still depends on the browser and
page context. If copying fails, the message remains selectable for manual copy.

## Keyboard interruption

Press **Escape** to interrupt the running agent in the visible chat, using the
same native action as **Interrupt**. This works for eligible Codex and managed
Claude turns while connected, including from the composer, and preserves the
unsent draft. The button shows **Esc** and exposes the keyboard shortcut to
assistive technology. Interruption does not undo completed commands or files.

Escape keeps its local meaning in dialogs, question controls, dropdowns, branch
summary editing, resizing and text composition. Modified/repeated keys and an
already pending interrupt do not send extra requests. Other tabs are unaffected.

## Core experience

- Switch quickly between projects and their agents.
- Keep the short project goal, current tasks, task states, and next steps visible.
- See agent and subagent progress, blockers, and requests for attention.
- Review short decision summaries, their rationale, and the original discussion.
- Track work durably in Beads, with explicit conversation/task links.
- Branch a conversation with its whole context, ask a follow-up or start a
  subtask, and return to the main conversation whenever needed.
- Use an optional **Bring back to main** action to return a branch's findings
  or subtask results to its parent.

See [product requirements](docs/product-requirements.md) for the agreed behavior.

When choosing **Start new**, enter the project's working directory explicitly.
The field starts empty, so launching the app from its installation directory
does not silently select that directory and its project instructions for a new
worker. Opening an existing conversation preserves its own native directory.
Coordinator conversations are excluded from the worker picker, and opening or
restoring a conversation checks its role before any native resume call.

The coordinator starts automatically when a worker is opened and has its own
chat tab outside the workers' scrolling strip. Worker tabs stay left; the
coordinator sits immediately before the prominent cyan Add agent button in their
shared right-hand group. Version 0.8.1 gives it the same tab shape, height,
typography and state styling as worker tabs, retaining its overview icon and
running/attention indicators. It reads worker history and Beads, publishes progress
recaps, requests reports, sends attributed summaries into worker conversations
and reviews pending command/file approvals against actual user-authorized scope.
It can approve permitted resource changes, including cleanup; uncertain authority
returns to you. You can pause it, ask it questions and review its decisions.
Version 0.11.1 makes recaps explain the work by name: useful outcomes, what
remains unfinished, and the exact blocker or next action. They distinguish
published code from a verified live deployment. Bare task IDs, closed-record
lists and routine idle/no-approval notices are omitted unless relevant to your
question. Sidebar fields and worker report requests use the same guidance.
Existing coordinators receive a style reminder during their next automatic or
Summarize now event after updating; no new coordinator conversation is needed.
Version 0.12.0 makes multiple simultaneous requests explicit: coordinator reads
include the complete delivered request list and separate counts for command/file
approvals and clarification questions. Each review returns the current remaining
list. A request needing your decision stays visible while other eligible requests
can be reviewed independently; remaining unreviewed approvals keep an event
scheduled. Every approval still needs its own current token and user authority.
Coordinator instructions keep approved reports to two short bullets: the action
and the approval with its reason. In 0.24.0, non-approval notes become two or
three short plain-language lines, usually about sixty words or fewer: what the
action does, the concrete concern, and the decision or next step needed.
The actual rationale displayed on the worker's approval card follows this same
guidance and preserves line breaks. Existing long notes are not rewritten or
truncated. New, restored and existing coordinators receive the saved guidance
through startup instructions and event reminders after updating. Vivid blue request,
green approval, red decline, amber user-decision and purple unconfirmed markers
make pairs easy to find. Exact actions and authority remain in the review tools.
Non-approval feedback is requested through the existing summary tool, explaining
an easy permitted alternative or waiting for the user. A queued notice cannot
reach a worker until pending requests are resolved and the worker is safely idle;
sending feedback never dismisses a request. Existing message limits still apply.
Messages wait until workers are idle. See [coordinator behavior and limits](docs/coordinator.md)
and the [original discussion summary](docs/supervisor-design-discussion.md).

Version 0.14.0 raises the workspace capacity to **16 workers plus the coordinator**.
Existing conversations, new agents and branches share the same worker capacity.
All sixteen tabs can be saved and restored; the worker strip scrolls horizontally
on smaller screens. Closing a tab keeps its native agent running. The limit does
not change native Codex subagent concurrency or worker permissions.

## Installation and startup

Prerequisites: Linux, Node.js 22.12+, npm, core shell utilities, Git, tar/gzip,
Beads (`bd`) and a signed-in Codex CLI. RHEL 9 is the documented setup target;
other distributions are not yet tested. Run `./install.sh --check` to inspect the
environment without installing anything. Interactive installation can offer
missing RHEL 9 RPMs through sudo and missing Beads/Codex CLI packages under the
chosen target, always after terminal confirmation. See the
[RHEL 9 prerequisite guide](docs/rhel9-prerequisites.md). Beads must be on PATH for both the app and working agents.
The installer and app check for JSON/read-only/brief-list support; Beads 1.3.2
was verified. See the [official Beads installation guide](https://github.com/gastownhall/beads/blob/main/docs/getting-started/installation.md).
The native integration is tested with Codex 0.166.0. Fresh local Dolt provisioning and Beads initialization are offered for an
explicitly selected task workspace after terminal confirmation; existing
trackers and connection settings are preserved. System packages are changed only after
explicit installer confirmation.

Clone this repository and run the installer with a target directory:

```sh
./install.sh "$HOME/apps/command-center-ng"
```

Without the directory parameter, `./install.sh` prompts for the target before
doing any installation work. The target must be inside your home. The script
builds the app, removes build-only dependencies, and creates the launcher
`command-center-ng` inside that target directory. The first interactive install also prompts for
an application password; its hash stays outside the repository.

If the installer added CLIs locally, first add them to the terminal PATH. Start
the native Codex daemon from that terminal, then the application:

```sh
export PATH="$HOME/apps/command-center-ng/tools/node_modules/.bin:$PATH"
codex app-server daemon start
"$HOME/apps/command-center-ng/command-center-ng"
```

Open **http://localhost:4242** and sign in. Installation does not add a service
or boot autostart. If installed noninteractively, first run the installed
`server/password.mjs` with Node to set a password.

For a VM behind nginx, set the internal interface and browser-facing origin:

```sh
"$HOME/apps/command-center-ng/command-center-ng" --host VM_INTERNAL_IP --port 4242 --public-origin https://command-center.example
```

Replace the placeholders with your deployment values. Configure nginx's own
access control as well; the application independently requires its password.
See [installation and proxy details](docs/installation.md).

To update, run this from your clean source checkout, using the same target:

```sh
./install.sh --update "$HOME/apps/command-center-ng"
```

It fetches latest `main` automatically, advances the source without overwriting
local changes, and rebuilds the installation. For the first update from 0.0.x,
run `git pull --ff-only` first to obtain the new installer. Restart the application
after installation. Your password and saved workspace files are preserved; the Codex daemon stays running.
An installation inside the checkout, such as `./targetdir`, is supported: its
untracked output is excluded from the source-change check. Tracked source edits
and unrelated untracked files still block automatic updates.

## Branching a conversation

Choose **Branch here** beside a completed Codex reply to copy the conversation
through that reply. **Branch chat**, beside Interrupt and Send, takes a native
snapshot of the current stored conversation, including messages from an ongoing
turn. Version 0.10.0 removes its earlier completed-reply cutoff, which could
silently leave out a newer exchange. A completed reply is no longer required.
If work is ongoing, Codex marks the copied partial turn interrupted in the child;
the parent keeps running. Later parent messages are outside that snapshot.
The branch waits for your follow-up question or subtask. Its first message becomes
its goal. A branch uses one of the sixteen worker tabs; close a tab first if all are occupied.

Use **Back to parent** to navigate without sending anything or closing the branch.
When the branch is idle, **Return summary** asks Codex to summarize its existing
context: findings, decisions and reasons, verification, open questions, and next
steps. This uses one normal Codex turn with the existing model/settings. It does
not prefill the last reply or send the conversation transcript to the parent.

The summary review stays inside its child tab, above the conversation. You can
switch to other tabs and return without losing edits or generating another
summary. Review or edit the concise summary (maximum 2,000 characters), then choose
**Send summary & close**. The parent receives that summary as a message, starting
a turn or steering an active one. Only after acceptance does the app archive the
child session and remove its tab. Archived history is retained by Codex and is
excluded from the normal active-conversation picker. Summary or delivery errors
keep the branch open. If a parent question blocks delivery, the error names
that parent and **Open parent** lets you resolve its request before returning to
the child and retrying. The summary and requests are preserved. If delivery
succeeds but archiving fails, retry closes the
child without resending within the current app process.

Existing branches retain their original snapshot. After updating from an earlier
version, make a new branch from the parent to include a previously omitted exchange;
the update does not rewrite or replace your old branch.

Parent links survive reopening through native Codex metadata. Branches share the
working directory; conversation branching does not create a Git branch or worktree.

## Compact activity and editable drafts

Consecutive command/tool activity now appears as one collapsed **N actions**
row between conversation messages. Expand it to see the individual commands,
then expand a command for its existing full details. Running, failed and stopped
counts remain visible while the group is closed. Conversation messages and
approval/answer cards remain separate.

You can keep typing a draft while a native question or approval is displayed.
Sending remains unavailable until that request resolves. Enter adds a newline
while sending is unavailable; normal Enter-to-send resumes when ready.
Typing during a pending send acknowledgment preserves the newer draft.

## Ansible deployment on RHEL 9

[`ansible/deploy_command_center.yml`](ansible/deploy_command_center.yml) deploys
through the maintained installer and enables `command-center-ng.service`, whose
process runs as an existing unprivileged account. A first preflight rejects
anything other than genuine RHEL 9 with systemd before making target changes.
This mode reuses an existing signed-in Codex profile, running native daemon and
ready Beads tracker. It does not provision a fresh agent environment.

Reusable playbooks, templates and synthetic examples live in this public repo.
AAP CaC and all actual deployment settings belong as whole-file Vault ciphertext
in private `command-center-ng-secrets`; no encrypted payload belongs here.
See the [deployment guide](docs/ansible-deployment.md) for inputs, AAP integration,
password preservation, upgrade behavior and validation limits. Local checks do
not constitute a real RHEL 9 deployment or a configured AAP Job Template.

## Open questions

The sidebar lists live structured clarification requests, command/file approvals
and other native actions for the selected conversation, including the
coordinator. A request containing several questions lists each one. Click an item
to scroll to its existing answer card and focus the first available control.
Coordinator requests for your decision and failed/unconfirmed answers remain
visible until native resolution confirms they are answered. No question is
answered or dismissed by opening it. With no pending request, the panel says so.

If Codex reports a pending request but its details are missing, choose **Load
pending request** in the conversation. This explicitly rejoins that selected,
already-active conversation and retrieves native requests with their original
IDs. Loading submits no decision, starts no worker turn and does not change
worker permissions. Ordinary chat sends wait until the request is available or
resolved. A failed load keeps the waiting state and shows a retryable error in
that conversation. Existing coordinator review behavior still applies; pause the
coordinator when you want all reviews to remain manual.

An attention flag without a local answer card does not identify another client
as the owner. The sidebar reports missing details instead of making that claim.

This list follows native pending requests; unanswered questions written only in
ordinary chat prose are not inferred. Coordinator tracking of those questions
uses worker-recorded Beads input tasks as described below. There is no new
question store or automatic transcript classifier.

## Worker settings, task answers and Markdown

Each worker sidebar has **Worker specific settings**, with **Task report every**
and radio choices **1h**, **15min**, **5min**, **Never**. Never is the default;
choices persist per worker in the existing private workspace file. In0.26.0,
Command Center's coordinator backend owns the timer. Changing a radio sets the
next report deadline; it sends no interval-setting chat message. A browser
refresh does not reset deadlines or require toggling a radio.

At backend startup, each restored enabled interval queues **one initial report**
after state restoration, then continues at its interval. No missed-report burst
is replayed. The scheduler reads all open/restored workers directly; it does
not ask the coordinator model to wake on every tick. Closing a tab removes its
CCNG schedule; the native agent's current work continues under existing rules.

Internal report triggers and coordinator workspace-event inputs are hidden from
CCNG worker/coordinator chat histories. The actual assistant reports remain
visible. Native Codex client IDs/typed text metadata and Claude SDK synthetic
inputs identify internal messages; normal summaries and user-written matching
text remain visible. Native history is not deleted or rewritten.

Reports reuse the bounded delivery queue and safe active-turn input paths.
Pending native questions, permissions, pause, ownership, unavailable runtimes
and branch handoffs still gate delivery. At most one report is outstanding per
worker; Report now coalesces with a due report. Never cancels unsent scheduled
requests while preserving explicit Report now and uncertain in-flight/failed
actions. Failed native sends are not retried automatically. Workers stop their
older self-scheduled report loops; CCNG's timer supplies one-off requests.

The Git-saved `server/worker-instructions.md` defines **Standard Task Report**:
vivid labelled report bullets, meaningful
work names and the project's latest release version with verified publication
status. Newer working versions and live deployment evidence are distinguished.
They also prefer structured clarification tools whenever available in the current
provider/mode; this does not enable a disabled native feature or change permissions.
Existing running turns receive these instructions on their next app-started turn.

Click a task title to read its description, unfinished prerequisites and recorded
notes. **Send to worker** includes your answer and task context; **Ask what is
needed** requests an explanation. You can draft while native requests block
sending. The worker processes the input and updates Beads; opening a task or
sending an answer does not automatically close it or grant new execution scope.

Chat renders Markdown and GitHub-flavored tables, lists, task lists, headings,
quotes, links, strikethrough and code through react-markdown and remark-gfm.
Tables scroll horizontally. Raw HTML is disabled, unsafe link schemes are filtered,
and remote images appear as links rather than loading automatically. Code examples
remain literal code. The existing authentication and content security policy apply.

Session management is local to the backend host. Local read-write Claude support
uses the published official Claude Agent SDK integration; its remaining work and
live validation are postponed at the user's request. Codex per-worker model and
effort controls are implemented. No SSH/remote session monitoring is implemented
or authorized. Release-specific paragraphs below retain their historical context;
later implementation records supersede their earlier unfinished-feature claims.

## Development and current limits

Beads is the authoritative backlog, including records owned by other project
branches. A project-wide audit reconciled the implementation records with these
documents: old release notes saying model controls, fresh Dolt/Beads setup,
ordinary-chat questions or parent-handoff errors are unfinished are superseded
by their later releases. Live browser/runtime acceptance and a real clean RHEL 9
bootstrap remain validation gaps even though those features have fixture coverage.
Durable decision summaries beyond native conversation history still require a
future agreed design. Track that work in Beads rather than copying task states
into another Markdown backlog.

Run `npm ci --ignore-scripts`, `npm run password`, and `npm run dev` for local
development. For production from source, run `npm run build` and `npm start`.
`package.json` is the authoritative MAJOR.MINOR.PATCH version source.

Existing Codex model, sign-in, and permission settings are preserved. Enter
sends; Shift+Enter inserts a newline. Drafts and reading positions survive tab
switches and browser refreshes in the same browser. Closing a tab does not delete or interrupt its native conversation.

The task panel reads Beads directly through the backend, refreshing every five
seconds and after an agent turn. It shows all current linked tasks in an
independently scrollable region, prioritizing actual Needs input tasks before
other current work.
The header shows total, in progress, need input, queued and other nonempty states.
Queued means unfinished Beads prerequisites; it is distinct from a decision
waiting for you and does not change the stored Beads status. Titles, assignees, parent IDs, and states come from
stored records; closed tasks disappear from current work. Chat text, native
plans, and idle state do not update Beads or substitute guessed task status.

Use **Link tasks** to select existing issues for a conversation, or add their IDs.
The link is stored as a `ccng-session:CONVERSATION_ID` label in the existing
tracker, so it survives app restarts without another task database. A task can
be linked to multiple conversations. Explicit link edits change only that label;
they do not change task state, ownership, content, or other labels.

On new app-started turns, Codex receives task-tracking application context and
uses `bd` to create/claim/update substantive work with its conversation label.
Existing running turns retain their instructions; link their tasks explicitly
or provide direction on the next turn. Agents still need to report accurate
state in Beads. Direct task reads do not use a model call; the separate coordinator
uses Codex turns for interpretation and approval review. Branches use their own
conversation labels; returning a branch includes
relevant task IDs in its summary and does not automatically close/reassign tasks.

Each working directory needs an existing Beads tracker (including a configured
parent/shared tracker). Initialize it deliberately with `bd init` if required;
the app does not create or migrate trackers automatically. If the database is
unavailable, the panel reports the error and clears stale rows. It shows task
counts only after a successful read; the task picker reports a loading failure
instead of claiming there are no matches. It distinguishes
no linked tasks from all linked tasks being closed. Existing Beads storage mode
and access configuration are preserved; the app does not manage a Dolt service.

Tabs use compact single-line titles, colored status dots, and status tooltips;
the full status label stays beside the goal. Horizontal tab scrolling remains
available on narrow screens, with no vertical scrollbar in the tab strip.
Selecting or reselecting an enabled chat focuses its input immediately without
stealing focus on streaming updates. Worker tabs can be dragged into order;
left/right controls and Alt+Left/Right support phones and keyboards.

Workspace restore uses the approved split: the existing Node.js backend saves
open worker IDs, the coordinator ID and its paused state in a private mode-600
`workspace.json` beside the login configuration. The browser stores drafts,
selected tab, tab order and reading positions locally. No extra service or
database is introduced. Server restarts reopen the same conversations through
native read calls; restoring a view does not resume an unloaded worker or start
a model turn. Sending a message activates that conversation with its existing
settings. Already-running native work continues independently. You sign in again
after an app restart, using the same password.

Recent history can be paged backward, with a bounded 600-item in-memory view per
tab; Codex retains model context. Reading positions apply to loaded history and
may be clamped when older pages are not loaded. Browser state is specific to the
browser and origin; it does not synchronize drafts between devices. Pending
approval answers, queued coordinator messages and live decision lists are not
replayed after restart. Persistent decision summaries beyond native conversation
history remain future work. See [workspace restore](docs/workspace-restore.md)
for storage, privacy and recovery details.

In 0.4.1, press a worker tab's title and drag it horizontally toward another
worker. A cyan marker shows the drop position; release to apply the order.
Pointer capture handles mouse, touch and pen input directly. Small movements
remain clicks, and canceled/outside drops preserve the order. The coordinator
group remains separate. This corrects the reported native-drag failure in 0.4.0.

Command/file approvals and structured questions can be answered here. An answer
waits for Codex's request-resolved notification before the question disappears
and the API reports success. Duplicate submissions are blocked while waiting;
an unconfirmed answer times out with an explicit error and keeps the question
visible. A later native resolution still clears it. Resolutions are scoped to
the conversation and exact request ID, including its numeric/string type.
Answers made in another client clear the corresponding question here too.
Disconnects fail unconfirmed submissions and discard requests tied to the lost
connection. The coordinator can send an approve-once/decline decision for a worker
command/file request after scope review. It requires an exact reference to a real
user instruction; coordinator-generated messages cannot authorize actions. This
is model-based judgment, not containment of arbitrary scripts. Native permissions
stay in force. Pause the coordinator to keep all reviews manual.

Some authentication forms, broader filesystem/network grants, and connector forms
can require native Codex controls. Native request replay preserves those limits.
App passwords use salted scrypt hashes in
private home configuration; sessions use HttpOnly/SameSite cookies. Set an HTTPS
public origin for Secure cookies behind nginx. No hypervisor, nginx, firewall,
TLS, or VM changes are performed by this application.

Version 0.4.0 passed 36 reported checks and the production build. A native
coordinator check verified its read-only sandbox, dynamic tools, published recap,
real summary delivery and worker acknowledgement. The complete Linux installer
and automatic-update lifecycle passed. Browser visual testing is unperformed.

Version 0.4.1 passed the production build and all 46 reported checks, including
ten pointer-drag regressions for mouse/touch/pen, normal clicks, cancellation,
coordinator exclusion and changing worker lists. These are event-controller
tests; interactive browser verification remains unperformed.

Version 0.29.0 passes all 322 application checks and the production build.
New coverage exercises theme contrast/preferences/keyboard controls, task ordering,
explicit input context, notification transitions and permission/privacy handling.
Actual browser layout, permission prompts and OS notification display remain
unverified; no browser automation tool or browser binary was available.

Version 0.30.0 passes all 330 application checks and the production build.
Eight new card checks cover input priority, queued/unavailable exclusions,
worker isolation, navigation, cadence placement and escaped task titles.
Interactive browser layout remains unverified.

Validation includes production builds, protocol/auth/control integration tests,
Beads task/link isolation and error-handling fixtures, installer update guards,
and real Beads/Codex checks. A two-client native clarification check verified
that the observer's answer resolved the request in both clients and the original
turn continued to completion. This does not verify a particular tmux frontend's
rendering; historical prompt text may remain visible there.
Real task labels survived a fresh adapter, stored
in-progress changes appeared, closed work disappeared, and the authenticated
catalog returned the linked task. Codex received the task-tracking application
context. Validation tasks/conversations were cleaned up. Production installation,
automatic updates, dependency pruning, private-config preservation, and failed
build preservation have also been exercised in temporary home installations.
Browser desktop/mobile focus and visual automation remain unavailable here.
The [brand notes](docs/brand-assets.md) record the current operations-console icon,
earlier tower assets and exact generation prompts.

The 0.5.0 regression suite covers private atomic workspace writes, four-worker
and coordinator restoration, failed-ID retries, read-only startup, explicit
activation and browser-state round trips. A disposable native restart check
verified history, coordinator identity/pause, unchanged password and login,
without worker resumes or model turns during restoration. Production build and
Linux installer/update checks passed. Interactive desktop/mobile visual testing
still awaits a rendered screenshot; source review alone cannot establish it.

The 0.6.0 production build and all 59 existing regression checks pass.
Additional rendering/navigation checks cover multi-question requests, confirmation
and error visibility, distinct typed request targets, answer-control focus,
composer placement and the 40% width increase. No interactive browser was
available; rendered desktop/mobile review still awaits the user's screenshot.

The 0.7.0 prerequisite checkpoint passed all 63 regressions and the production
build. Consent tests use simulated commands; no actual RPM or new CLI was
installed. A fresh staged home installation passed with existing tools. Fresh
Beads/Dolt configuration and minimal-RHEL bootstrap validation remain pending.

Version 0.8.0 passed all 67 regression checks and the production build. New
regressions reproduce and prevent coordinator-as-worker selection, direct-open
and restore errors, including renamed coordinators carrying the new native
source marker. Project-directory checks verify rejection of missing directories
and use of an explicitly selected directory. These checks address two identified
entry points for session confusion; they do not establish every cause of the
earlier mixed agent behavior. Existing chats keep their histories and directories.
Interactive browser validation remains pending.

Version 0.9.0 passed all 75 checks and the production build. Six new regressions
failed before the fix. Coverage includes requests arriving during resume, late
native replay, exact IDs, per-conversation loading/errors, coordinator restrictions,
read-only restoration and blocking sends while request details are missing.
Matching Codex 0.166.0 source confirms pending-request replay on native rejoin.
After updating the installation to 0.9.1, the user confirmed that **Load pending
request** worked. The latest native read also showed the worker active without
an approval-wait flag. Browser rendering still requires verification.

Version 0.9.2 passed all 75 existing checks and the production build. Selection
styles apply after activity styles and bottom-align both worker and coordinator
tabs. Rendered desktop/mobile review remains pending.

Version 0.9.3 passed all 75 existing checks and the production build. The inset
belongs to the scrolling viewport, so it remains clear while messages scroll.
Rendered desktop/mobile review remains pending.

Version 0.10.0 passed all 77 tests and the production build. Two regressions
failed before the fix, reproducing omission of the ongoing exchange and inability
to branch during the first turn. Coverage verifies retained messages, unchanged
parent activity/approval, no automatic child turn and explicit historical cutoffs.
The native snapshot behavior is documented in the
[official App Server reference](https://learn.chatgpt.com/docs/app-server).
No existing user branch was rewritten or replaced for validation.

Version 0.11.0 passes 85 application regressions and the production build.
Deployment validation uses real Ansible against disposable localhost fixtures,
syntax checking, production lint and offline systemd unit parsing. It never
applies the deployment playbook to the development machine. Actual RHEL 9/AAP
deployment and interactive desktop/mobile rendering remain unverified.

Version 0.11.1 passes all 86 application tests and the production build.
A protocol fixture verifies recap guidance reaches fresh/restored coordinator
instructions and event turns while preserving identity and request controls.
No live model response or existing worker report was generated for validation.

Version 0.12.0 passes all 90 application tests and the production build. Two
new coordinator regressions failed before the fix. Native-protocol fixtures also
verify four replayed requests, duplicate handling, independent tokens, mixed
numeric/string IDs and arrivals during confirmation. These are synthetic tests;
no real user approval, worker interruption or model call was used for validation.

Version 0.13.0 passes all 91 application tests and the production build. Guidance
propagation and safe-idle feedback use synthetic protocol fixtures; no live user
approval or worker interruption was used for validation. Decision wording is
model guidance and still needs normal use to assess.

## Public source policy

This repository is public. Keep all secrets, access tokens,
credentials, encrypted secret payloads, private transcripts, runtime state,
and environment-specific configuration out of its contents and history.
Examples and future demo data must be synthetic and generic. Git ignore rules
are a convenience; review the complete staged changes before publishing.

## Project records

- [Product requirements](docs/product-requirements.md)
- [Frontend direction](docs/frontend.md)
- [Installation requirements](docs/installation.md)
- [Workspace restore](docs/workspace-restore.md)
- [Design decisions and rationale](design_decisions_history.md)
- [Current development handover](current_status_for_handover.md)
- [Contributor instructions](AGENTS.md)

Development work is currently tracked in the surrounding workspace's Beads
tracker. The runtime integration now also uses Beads, scoped by conversation labels.

No license has been selected; public visibility alone does not grant a license.

Validation for 0.14.0: the production build and all 61 tests that do not require
local sockets or installer writes under the home directory pass. Fixtures cover
concurrent opens/creates at the sixteen-worker boundary, branching, parent
navigation and read-only restoration of sixteen workers plus the coordinator.
The full suite was attempted; sandbox policy blocks its local Unix sockets and
installer home-directory fixtures. Interactive browser verification remains
unperformed. No live conversation was created or interrupted for these tests.

Validation for 0.15.0: all 109 application tests and the production build pass,
including real protocol/HTTP/installer fixtures, sixteen-worker boundaries,
report scheduling/restoration and request gates, dependency-derived task totals,
readonly task details, Markdown safety and named parent-handoff failures.
One older integration assertion still assumed four workers; it now uses the
shared capacity. Normal npm test ran these fixtures successfully in the parent
session; an alternate invocation encountered sandbox setup restrictions, so the
cause of earlier cross-invocation differences is not inferred. Interactive
browser review remains unperformed. No live approval, worker interruption,
service restart or VM deployment was performed for validation.

Version 0.16.0 lets the coordinator inspect helper source tied to an exact
current command approval, even outside the project. The read tool requires the
current request token and a visible file reference or explicit Python import and
search directory. It reads bounded source pages without executing/importing code,
refuses symlinks, configuration/data and sensitive paths, and rejects obvious
embedded credentials. Inspected file/command hashes are checked again before
coordinator approval; changed source must be read and reviewed again. Relevant
unavailable dependencies or unclear effects still need your review. This does
not authorize execution or broaden the native coordinator sandbox.

Due reports now queue during active turns or pending questions, with one
outstanding report per worker. Queued reports retain normal send gates, Never
cancels unsent scheduled requests, and completion starts a fresh interval rather
than catching up missed reports. No interruption or automatic request answer.

The task-list viewport is capped at three visible rows on desktop and mobile;
all remaining tasks remain available by scrolling, and header totals include
the entire current list. This changes the viewport only, not task retrieval.

Validation for 0.16.0: all 113 application tests and the production build pass.
Synthetic helper fixtures verify request/token/worker binding, import references,
no execution, stale/changed-source rejection, symlink/sensitive/data/oversize
refusal and unchanged approval protections. Scheduler fixtures cover active work,
pending/missing requests, one queued report, generating state, Never cancellation,
fresh post-report delay and no interruption/answer. The three-row viewport was
checked through CSS/build review; interactive desktop/mobile review is pending.

## Native requests and Report now: 0.17.0

Current Codex user-request types appear in their originating worker tab and Open
questions: clarifications, command/file approvals, MCP forms/external steps and
filesystem/network permission requests. MCP primitive forms (including titled
choices, numbers, booleans and multiselects) can be answered here; unsupported
schemas/modes stay visible with precise native-client guidance. External sign-in
steps offer an explicit browser link and manual completion button. Internal token
refresh/attestation exchanges are not presented as user questions. Unknown
approval-style and legacy callbacks stay visible without an automatic refusal;
unknown answer formats require the native client.

Manual permission approval returns only the exact native-requested access for the
current turn, ignoring client-supplied attempts to broaden access or duration.
It does not change global settings. The coordinator cannot approve MCP forms or
permission grants, and even manual controls cannot broaden its own restrictions.
Command/file controls honor the offered native decisions; policy-changing choices
remain in the native client. Full native request details stay available in an
expandable section. Every answer keeps exact IDs, typed request identity and
pending state until native confirmation. Form input stays local to its worker/
request component and is not saved in browser workspace metadata.

**Report now**, immediately after **Never**, queues a vivid status report for the
selected worker without changing its cadence. It also works with automatic
reports set to Never. Existing queued/generating reports are coalesced, and busy
workers/pending questions/pause retain their normal delivery gates. It does not
interrupt, answer requests or generate a new report merely to test the feature.

All 122 application tests and the production build pass. Synthetic protocol,
UI and schema fixtures cover native response shape, exact request identity,
confirmation, privilege-injection refusal, supported/unsupported forms, external
URLs, legacy/unknown visibility, coordinator restrictions and manual reporting.
No live approval, model call or service restart was used. Interactive browser
review remains pending. Local Claude management and model/effort controls are
still unfinished, as are the requested resizable sidebar/tab/version layout.


## Model controls, flexible layout and agent-owned reports: 0.18.0

Worker specific settings now include model and reasoning-effort selectors from
the connected native Codex runtime's catalog. Save updates only that worker's
native settings for subsequent turns. Current work and pending questions remain
intact; native confirmation determines the displayed saved state. Unsupported
choices are refused, and Refresh choices checks the current native state.
This does not change global defaults, permissions or the coordinator's model.

On desktop, drag the separator between the conversation and overview to resize
both columns. Keyboard arrows adjust it when focused; Home/End choose the bounds.
The browser remembers the width, within limits that preserve useful chat space.
The coordinator tab follows the chat column's edge, immediately before Add agent.
Chat text uses the available width, and the existing version badge now appears
in the composer footer. Smaller screens keep the stacked layout.

The user explicitly replaced the earlier CCNG report clock with one agent
instruction per interval change. **Report now** requests the named Standard Task
Report once, including with Never selected. Its owned control prompt stays out of
the rendered conversation; actual reports and interval-change instructions stay
visible. Native history is preserved, and ordinary user messages are never hidden
because their text resembles a control prompt. No CCNG timer, progress-hash loop
or recurring reminder delivery remains. This supersedes the scheduling behavior
described in the historical 0.15.0–0.17.0 release notes above.

Validation: all 129 application tests and the production build pass. Fixtures
cover native model settings, preserved questions/current turns, late confirmation,
width limits/storage, one instruction per change, cancellation/replacement,
read-only restoration and no periodic backend prompts. Interactive browser review
and a live provider-timing run remain unperformed. No live model call, approval,
global permission/default change, runtime restart or deployment was used.
Official Claude SDK management, shared environment instruction loading, fresh
Dolt/Beads installation, ordinary-chat question tracking and live AAP rollout
remain unfinished.


Version 0.18.1 makes coordinator helper reviews proportionate: inspect the directly
referenced helper's startup statements and called functions when needed, without
routinely walking its imports or library internals. Escalation needs a concrete
unresolved concern in the visible action/source, not merely an unread dependency.
The existing source reader also applies the approved exact-current-command
helper checks to directly referenced outside-project source and returns every
matching approval binding. Older coordinators can use their existing reader;
there is no need to replace their conversation or rewrite native state. General
outside-project reads and secret/data reads remain refused. Source publication
does not update the running installation or approve the quoted action.

Regression checks and production build pass; helper reads are tested with
synthetic files, including changed-source refusal and multiple current requests.
No real request was approved or executed for validation.


## Local Claude, shared instructions and compact context: 0.19.0

Choose Codex or Claude when opening or starting a worker. Claude uses the official
Agent SDK **0.3.212** and the backend host's installed, signed-in native Claude
CLI (verified interface: **2.1.316**). It lists local headless sessions such as
`claude -p`, follows their saved conversation/tool activity, and supports managed
new/resumed conversations, streamed replies, follow-up input and interruption.
User/project/local native settings and permissions are retained. Tool approvals,
structured questions and supported MCP forms use SDK-owned callbacks with exact
worker/request identity. Submission is distinct from native progress confirming
that the request has ended. Claude permission decisions remain manual here.

An already running external CLI process keeps its session: Command Center follows
its transcript and permits management after that process releases it. There is
no SSH/remote-session monitoring. Claude can remain usable while Codex is offline;
automatic coordinator work still needs Codex. Closing a tab leaves its managed
process running, and a pending request in a closed tab offers an explicit Open
control. Shutting down Command Center stops its SDK-owned Claude processes;
native conversation history survives. Claude branching is not integrated yet.
Model/effort choices become available after a managed process starts; SDK controls
apply to that process, with restart persistence unverified. Reading settings does
not create a model run. Private reasoning text is not displayed; visible progress,
assistant messages and tool activity are shown.

Worker startup Markdown and coordinator instructions require importing the local
`Setup-Agentic-Dev-Environment/AGENTS.md`. The existing backend discovers that
named repository in the worker/backend workspace and supplies its full bounded
text through native instruction context. Missing/unreadable sources are reported;
there is no automatic fetch or extra instruction store. Codex receives current
context on app-started turns; Claude receives it at managed-process startup.
Edits are not injected into an already running Claude process. Project rules and
higher-priority/native role permissions remain authoritative. Coordinator-only
canonical and V2 overrides preserve its no-subagents restriction.

When a structured question tool is unavailable, workers record/reuse an input
question in their existing Beads tracker with the current conversation label and
`ccng-chat-question`. From 0.29.0, these appear once in **Tasks** with a
**Question** label, using the existing context/reply flow; the duplicate Chat
questions section is removed. **Needs input** entries appear first, after
dependency-derived queued state is determined. Native **Open questions** and
approvals remain separate. All current recorded questions reach coordinator reads,
including those beyond its task preview. Beads polling can expose them during an
active turn. A reply, idle state or turn completion never auto-closes a question;
the worker processes the real answer and updates its record. Older unrecorded
prose needs worker reconciliation. The coordinator reads these records and gains
no Beads-write authority, text classifier or new question database. Tasks awaiting
input should record explicit **Context**, **Input type**, and **Input needed**
sections in their Beads description. The input dialog displays those fields;
older records without an exact request remain explicitly incomplete and retain
**Ask what is needed**, rather than inventing an answer or blocker.

The installer can initialize a deliberately selected fresh task workspace through
native Beads shared-server setup after confirmation. Missing Dolt is offered as
a checksum-verified, user-local binary; existing trackers/routing/settings remain
intact. `--check` stays read-only. See [installation](docs/installation.md).

Chat messages again have a **90ch maximum width**, while narrower panes shrink
naturally. Task rows hide assignee names and use their natural text height; the
scroll viewport follows the first three rows, so widening the overview moves
later sections up. Model and Effort labels/dropdowns share one line, without
routine effort/subsequent-turn explanations. Actual loading and errors remain.
This supersedes the uncapped text and unfinished-feature notes in older releases.

Validation uses isolated provider/permission/history/installer fixtures and the
production build. No live model run, real approval, running-service restart,
remote session transport or deployment is used for these checks. Interactive
browser and live provider testing remain pending. Actual encrypted AAP CaC and
host rollout remain unfinished; source publication does not deploy the app.


Validation for0.19.0: all **163 application tests** and the production build pass.
Coverage includes real official-SDK reads of isolated native JSONL, local/external
ownership, streamed controls and exact callbacks, provider disconnect/restore
races, closed-tab pending requests, shared-source rereads/missing sources,
complete recorded chat questions, variable task-row sizing and isolated confirmed
Dolt/Beads installer fixtures. No live model/approval, development-host database
setup, runtime restart or deployment was used. Interactive browser/live provider
verification remains pending.

Version 0.19.1 resolves approval-linked helper paths against the pending command's
native working directory, using the worker directory only when native cwd is
absent or null. Both coordinator readers recognize equivalent absolute/relative
literal source paths, including quoted Python subprocess arguments. The existing
reader checks approval references before looking in the worker project, avoiding
missing files or same-named files from the wrong repository. Returned evidence
includes the working directory, and a directory change requires fresh inspection
before approval. Ambiguous matches across directories require an exact request
token. Source-only checks and native permissions remain in force. Tests use
synthetic repositories; publication does not update a running installation or
resolve a live approval.

Validation for 0.19.1: all **172 application tests** and the production build pass.
Nine new synthetic cases cover native cwd, subprocess paths, exact bindings,
same-named files in another repository, changed/invalid directories, ambiguous
requests and resolved hidden/sensitive path refusal.

Version 0.19.2 fixes approval citations from older native worker history. The
coordinator could read the original user instruction on an older page, yet its
reviewer only searched recent messages and rejected that valid citation. The
reader now retains bounded native page references for genuine user messages it
exposes. Review re-reads the exact page in the same worker and checks the actual
user message, exact quote and still-current request before approving. No full
history scan, extra tool, copied transcript store or permission change is added.
Recent reads do not discard earlier page references; closing/reopening the worker
requires a fresh read. Generated relays and branch summaries remain excluded.
Updating source alone does not update a running installation or decide a live
request.

Validation for 0.19.2: all **180 application tests** and the production build
pass, including eight new older-history authority regressions. Tests use
synthetic native pages and approvals; the reported live request remains
independently reviewable after normal installation update/restart and a fresh
read of its original user-history page.


Version 0.20.0 makes the horizontal overview dividers draggable on desktop.
Drag a boundary to resize the two adjacent sections; each resized section scrolls
independently. Use Up/Down arrows when focused (Shift for larger steps), Home/End
for the limits, Escape to cancel a drag, or double-click to restore natural
heights. Sizes stay in the existing browser-local preferences across tabs and
reloads. Worker and coordinator overviews share these controls; mobile keeps
natural stacked sections. Tasks retain their three-row default until resized.

Validation: all183 application tests and production build pass, including
adjacent-section sizing, short-pair growth, separator semantics and browser
preference restoration/refusal checks. Interactive browser visual review remains
unperformed; no running installation was updated or restarted.


Version 0.21.0 prioritizes Standard Task Reports. Scheduled and explicit reports
use available evidence at the next safe response checkpoint before ordinary
project work, then resume. No extra commands or waiting for task completion
merely to prepare a report. The Git-saved definition is
`server/worker-instructions.md`, loaded at backend startup and supplied through
worker/coordinator runtime context. Update the installed copy before restarting.
Report now moves ahead of unsent summaries and reaches active Codex turns through
existing native steering with native message identity. Owned active Claude runs
receive SDK streaming input with next-checkpoint priority; external sessions
retain ownership and wait. Pending requests, pause,
handoff, failed/in-flight messages, queue bounds and coalescing remain protected.
That0.21.0 change added no recurring timer, automatic interruption or permission grant;0.26.0 subsequently adds the user-authorized backend report timer.
Native delivery and safe checkpoints still limit response time.


Version 0.22.0 adds an optional user-level systemd service through the installed
launcher. Run `TARGET_DIR/command-center-ng service install -- YOUR_RUNTIME_OPTIONS`
with your existing bind/origin/directory options. Installation writes the owned
user unit and reloads systemd; start and enable remain explicit. Stop a foreground
copy before starting the service. Repeating installation without options preserves
the saved unit. Use `service start`, `stop`, `restart`, `status`, `logs`, `enable`,
`disable` or `uninstall`, or normal `systemctl --user` controls. Enable starts it
at user login; lingering is a separate administrator/user choice. Native daemons,
auth files and workspace state remain in their existing locations. See
[service setup](docs/installation.md#user-level-systemd-service).

Combined validation for0.22.0: all192 application tests and production build pass,
including six priority-report regressions and three user-service fixtures.
Systemd user-unit parser verification exits0 for a synthetic unit, with sandbox
bus/socket warnings; live manager activation is unverified. No installed copy,
live service, native daemon or lingering setting was changed by these tests.


Version 0.23.0 shows author/time headers such as **Codex | 14:35**, also for
Claude, Coordinator and You. Times use the browser local timezone and24-hour
format; hover for the full date/time and source. Native message times take
priority. Live messages without a recorded native time keep their first-received
time across streaming updates. Historical messages without available time show
an unavailable marker, never the current reload time. Provider history remains
authoritative; no separate timestamp store is added. Older Claude SDK history
may omit timestamps even when its native transcript contains them.

Validation for0.23.0: all200 application tests and production build pass. Eight
new timestamp checks cover provider/history mapping, stable streaming/refresh,
invalid/unknown times and local24-hour header rendering. No live model run or
running installation restart was used; interactive browser review is pending.

## Returning a restored branch in 0.24.0

A completed branch restored as an unloaded native conversation can prepare and
return its summary. Only the explicit Return summary action activates it through
the existing native resume path; restoring tabs alone remains read-only. The
loaded state is checked again before summary generation or delivery. Pending
requests and active turns still block handoff, with an error naming the child
and explaining whether to answer/load its request, wait, or reopen it. Parent
request errors continue to identify the parent separately.

## Beads routing in user services

Version0.24.1 preserves explicitly supplied `BEADS_DIR` and
`BEADS_DOLT_SHARED_SERVER` when generating a user unit, alongside the existing
PATH/profile allowlist. A terminal or agent can resolve a shared tracker while a
service without these settings fails with “no beads database found.” This means
tracking is unavailable, not that tasks were deleted or completed. CCNG does not
choose another tracker, initialize one or copy database credentials.

For an existing service, updating the application alone does not rewrite its
unit. From a terminal configured for the existing tracker, register again with
your saved explicit runtime options, then restart when ready. A no-option
registration deliberately preserves the old unit. See
[service configuration](docs/installation.md#user-level-systemd-service).

## Paste images into chat in 0.25.0

Copy an image or screenshot, focus the chat input and press **Ctrl+V** (or the
browser/platform paste shortcut). A removable preview appears before sending.
Send images alone or with a text caption to local Codex or managed Claude.
Ordinary text paste, IME and Shift+Enter remain unchanged. Native pending
questions still block sending while allowing draft editing.

Image drafts live only in the current browser page's memory, independently per
chat. They survive tab switches; browser refresh or closing the page discards
them. Text drafts keep their existing persistence. New typing/images added
during a send acknowledgement are preserved, and failed sends retain the draft.
There is no attachment database, upload directory or image-draft localStorage.
Sent image content remains in the providers' native history; CCNG reads supported
inline history images and serves them through authenticated conversation/message
URLs. Workspace events carry those URLs, not repeated full image payloads.
Remote image URLs and local paths in older native history are not fetched/read.

PNG, JPEG, GIF and WebP are supported: up to **four images**, **4 MiB per image**
and **8 MiB total per message**. Unsupported, malformed or oversized inputs show
an error. The authenticated message endpoint has a12MiB request bound; other
JSON controls keep their existing64KiB bound. Native Codex receive frames are
bounded at64MiB to allow image-bearing history pages. Provider/model limits can
still reject an image. Native permissions, authentication and request guards
remain unchanged.

## Report interval delivery in 0.25.0 (superseded by0.26.0 timing)

Interval changes now use the same safe active-turn delivery as Report now, so
they do not wait behind ordinary summaries or a busy turn. An explicitly retried
failed interval delivery can replace its failed queued instruction. Confirmed
settings remain deduplicated; pending requests, pause and handoff guards remain.

This fixes instruction delivery, not a reliable recurring scheduler. A browser
refresh preserves the existing backend setting/queue; a backend restart restores
the selected interval but not a verified native schedule. The current saved
interval is included in worker runtime instructions on a new native turn/process,
so workers can reconcile their existing cadence without toggling the radio or
posting another setting message. Restoring tabs alone still starts no agent turn.
Command Center still has no recurring report timer. Codex can follow periodic instructions while it stays active and has timing tools;
its [app-server interface](https://learn.chatgpt.com/docs/app-server) does not expose a documented idle scheduler.
Claude has [native session scheduling](https://code.claude.com/docs/en/scheduled-tasks), which this integration has not yet
verified or managed. Do not infer a working schedule from a selected radio,
an accepted instruction or an undocumented native capability. Real timed
recurrence and recovery after runtime shutdown remain unverified.

## Report timer in0.26.0

The user subsequently selected CCNG-managed timing and silent control traffic.
The worker settings section above describes the current behavior. Earlier
agent-managed timing instructions are superseded; no native clock loop is
required to keep reports arriving. The scheduler lives in the existing backend,
uses saved per-worker intervals and adds no service or persistent queue.
Stopping CCNG stops its timer; restarting loads enabled intervals and queues one
fresh report. Provider work and native permissions retain their existing lifecycle.

## Claude work during backend restarts

CCNG currently owns the official Claude SDK processes. Stopping or restarting
the backend stops those managed runs; saved native history permits later resume.
Closing the browser or removing a tab leaves work running while the backend
stays up. The user rejected adding a separate Claude daemon/service, so0.26.0
does not change this lifecycle. Native CLI background mode exists, but supported
SDK reattachment to a local background process has not been established.

## Startup dashboard refresh in0.27.0

After loading the saved workspace, the coordinator refreshes current worker
summaries, stored task progress/blockers and the selected report intervals/next
deadlines. It reads available evidence immediately and publishes the sidebar
progress fields, then refreshes those fields as fresh startup reports arrive.
One unavailable or blocked worker does not prevent updates for the others.

Each restored worker receives one silent one-off startup summary/report request,
including workers set to Never. Never still disables periodic reporting. Enabled
timers share their existing initial report with this refresh; outstanding Report
now also coalesces, avoiding duplicate startup requests. The coordinator overview
cards show the saved1h/15min/5min/Never interval. No interval is inferred from
worker prose or changed by the coordinator model.

Initial/result notifications are hidden internal events. The coordinator uses
its existing progress-publication tools rather than echoing startup prompts or
posting repeated acknowledgement recaps. Result updates use existing event
throttling and occur once per startup request; ordinary later timer reports
retain their silent-completion behavior. Paused coordination preserves startup
intent for resume. Native questions, permission boundaries, worker ownership and
failed-delivery safeguards remain intact. State restoration itself finishes
before the authorized startup requests/coordination turns begin.
