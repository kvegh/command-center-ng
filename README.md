# Command Center NG

A calm, responsive workspace for AI agents, projects, tasks, and branching
conversations. Switch between work without having to reconstruct the context.

## Project status

**Version 0.9.1 (in development)** includes the Codex workspace and Linux installer. It supports
four worker tabs plus a separate coordinator, live running/idle/attention state, existing conversations, new
agents, conversation branches, up to three linked Beads tasks, chat, steering,
interruption, and questions. The dark graphite interface uses cyan controls,
green running states, and amber attention states.
The interface uses a local Node.js service and the existing Codex daemon.
A compact top bar puts the agent tabs and controls first, with branding at the
far right. It spans the full browser width. The workspace fills the window, with goal/tasks in a right sidebar on desktop and
above the conversation on smaller screens. The desktop sidebar is about 40%
wider and includes Goal, current task summaries and **Open questions**. Live
clarification questions and approvals have an amber count, full question text
and links to their answer controls, so requests remain easy to find while
reading older messages. Selecting a tab focuses its chat
input and places the cursor at the end of its saved draft. The generated airport
control-tower icon now uses a clearer complete-building silhouette. The visible
wordmark is **command center NG**. Tabs have an eight-pixel top inset and are
about 30% thinner, retaining their vivid status colors.
The chat workspace begins directly below the tab bar, with the extra desktop
and mobile top gap removed in 0.7.1.
In 0.9.1, small folder-style tabs join the pane without a separating line.
The selected tab shares the pane's fill and uses a stronger label and outline;
the bottom selection stripe is removed. Status colors and keyboard focus remain.

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
Messages wait until workers are idle. See [coordinator behavior and limits](docs/coordinator.md)
and the [original discussion summary](docs/supervisor-design-discussion.md).

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
The native integration is tested with Codex 0.166.0. Fresh automatic Beads
tracker/Dolt configuration remains pending the user's architecture choice;
existing trackers are preserved. System packages are changed only after
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

Choose **Branch here** beside a completed Codex reply, or **Branch chat** beside
Interrupt and Send in the chat input area to fork from the latest completed reply. Codex copies its stored context
through that turn into a separate conversation; later parent messages are excluded.
The branch waits for your follow-up question or subtask. Its first message becomes
its goal. A branch uses one of the four tabs; close a tab first if all are occupied.

Use **Back to parent** to navigate without sending anything or closing the branch.
When the branch is idle, **Return summary** asks Codex to summarize its existing
context: findings, decisions and reasons, verification, open questions, and next
steps. This uses one normal Codex turn with the existing model/settings. It does
not prefill the last reply or send the conversation transcript to the parent.

Review or edit the concise summary (maximum 2,000 characters), then choose
**Send summary & close**. The parent receives that summary as a message, starting
a turn or steering an active one. Only after acceptance does the app archive the
child session and remove its tab. Archived history is retained by Codex and is
excluded from the normal active-conversation picker. Summary or delivery errors
keep the branch open. If delivery succeeds but archiving fails, retry closes the
child without resending within the current app process.

Parent links survive reopening through native Codex metadata. Branches share the
working directory; conversation branching does not create a Git branch or worktree.

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
remains a separate scope choice. No new question store or model call is added.

## Development and current limits

Run `npm ci --ignore-scripts`, `npm run password`, and `npm run dev` for local
development. For production from source, run `npm run build` and `npm start`.
`package.json` is the authoritative MAJOR.MINOR.PATCH version source.

Existing Codex model, sign-in, and permission settings are preserved. Enter
sends; Shift+Enter inserts a newline. Drafts and reading positions survive tab
switches and browser refreshes in the same browser. Closing a tab does not delete or interrupt its native conversation.

The task panel reads Beads directly through the backend, refreshing every five
seconds and after an agent turn. It shows up to three linked tasks, prioritizing
in-progress and blocked work. Titles, assignees, parent IDs, and states come from
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
unavailable, the panel reports the error and clears stale rows. It distinguishes
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
The [brand note](docs/brand.md) records the generated tower asset and exact prompt.

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
