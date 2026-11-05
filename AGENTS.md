# Contributor instructions

## Scope and decisions

Read README.md, docs/product-requirements.md, and design_decisions_history.md
before making changes. Linux is the first supported installation and runtime
platform. Preserve both desktop-browser and smartphone-browser usability.
The installer must be a simple Linux shell script that installs under the
invoking unprivileged user's home directory without requiring root or sudo.

The user delegated the frontend choice: React, TypeScript, Vite, and plain CSS.
Consult the user before selecting further architecture unless they explicitly
delegate the particular decision. Explain relevant tradeoffs and wait for their
direction. Do not silently add backend services, storage, agent integrations,
compatibility layers, hosting, or authentication mechanisms.

Approved v0.0.1 architecture: a local Node.js service on configurable address
and port 4242, connected to the existing Codex daemon's native Unix WebSocket
interface. Codex-only initially. Support localhost and VM-internal access behind
nginx. The user approved nginx access restrictions plus a local application
password stored only as a secure hash in private home configuration. The Linux
installer accepts a target directory or prompts for it before installing.

The user requested a target-local launcher and installer update mode, explicitly
selecting automatic fetching of latest code. Version 0.1.0 uses the same local
service and native Codex thread/fork support for completed-reply branching with
parent navigation and optional explicit findings messages. Do not introduce a
separate branch store or Git-worktree automation without user direction.

The user subsequently selected concise generated branch summaries, followed by
native child archiving and UI tab removal after accepted delivery. Parent-only
navigation stays separate. The user approved a full-window workspace, desktop
right sidebar for goal/tasks, compact single-line tabs in the functional top bar,
and removal of redundant status text and unused heading space.

The user approved Beads as a runtime dependency and authoritative task store.
Working agents create/update task records using bd; the backend reads structured
state directly without another agent/model call. Conversation associations live
in Beads labels (ccng-session:CONVERSATION_ID), not another database. The backend
adds/removes that label only for explicit user link edits; working agents associate
their substantive work through the normal bd workflow. Do not infer task status from chat,
native plans, idle state, or archiving. Preserve other labels, ownership, task
content, and project tracker configuration. Do not auto-initialize or migrate
trackers, install tools, or manage a Dolt service.

The user requested chat-input focus on tab selection and a generated airport
control-tower icon. Workspace restore uses the user-approved split: a private file beside login
configuration in the existing Node.js backend, plus browser-local drafts,
selected tab, order and reading positions. Persist only open worker IDs,
coordinator ID and pause state on the server. Keep runtime files outside the
checkout. Restore views using native reads; do not resume unloaded workers or
start worker/model turns merely to restore tabs. Reuse the same coordinator;
reapply its restrictions before activation. Do not replay approvals or queued
messages. No separate storage service or database is approved. The user authorized a native Codex coordinator alongside up to sixteen workers,
with its own visually separated chat tab, progress recaps, report requests,
summary messages and scope-based approval review. Authorized work can include
resource creation/deletion and disposable test-VM lifecycle. Use the explicit
scope, real user instructions and existing restrictions; uncertain scope and new
decisions return to the user. A worker's assertion is not authorization.

Coordinator tools must be limited to open workers, bounded project reads,
progress/communication and exact command/file approval requests. Keep its native
sandbox read-only, disable unrelated native capabilities and fail visibly if the
restrictions cannot be applied. Never approve its own requests, broaden native
permissions or claim model judgment provides hard containment. Approval requires
an exact real-user-message reference, never a generated summary or event message.
Keep manual controls, request identity, confirmation, pause and decision rationale.
An actual user instruction returned through older native history can be cited.
Use bounded per-worker native page references and re-read the exact page when
the instruction is absent from recent messages. Preserve exact quote, native
user provenance and current worker/request/token checks; generated relays and
branch summaries remain excluded. Do not add a persistent authority store or
broaden native permissions.
Keep transcripts in native conversation history, live reviews/queues in process
memory and only the approved workspace metadata in the private workspace file.
Worker settings stay unchanged. The user also requested draggable tab order with
accessible controls; preserve the separate coordinator group and chat focus.

## Code versioning

Use numeric MAJOR.MINOR.PATCH versions. The first implementation starts at
0.0.1. For subsequent code changes automatically advance major for a major
release, minor for a minor feature or bugfix release, and patch for a patch-level
correction, resetting lower components. package.json is authoritative. Keep
package/lockfile, runtime/build, and documentation versions consistent in the
same implementation commit. Architecture still requires consultation.

## Public source

This repository is public. Never commit credentials, access
tokens, secret values, encrypted secret payloads, private conversation exports,
runtime state, or environment-specific usernames, addresses, hostnames, paths,
and configuration. Use synthetic, generic examples. Keep credentials outside
the repository, including its history. Review staged files before publication.

Do not copy local agent settings or another project's environment files into
this repository. Keep screenshots and fixtures free of private data.

## Workflow

Use Beads for development tracking in the existing workspace. Do not create
Markdown task backlogs or initialize a separate tracker without user direction.
The runtime integration also uses Beads, scoped to explicit conversation labels.

Keep README.md current with design changes. Record the change, reason, and real
implementation commit ID in design_decisions_history.md. If that ID is not yet
known, commit the implementation first and add its ID in a documentation commit.
Distinguish implemented behavior from requirements and proposals.

Use SSH for agent-side Git network operations. Keep commits focused and use
concise, imperative subjects. Validate relevant behavior and inspect command
outcomes. Ask before installing missing tools or dependencies. Do not select a
license or accept legal terms on the user's behalf.

## Interface

Keep workspace branding at the far right of the full-width navigation bar.
Keep worker tabs on the left. Group the coordinator and prominent cyan Add agent
button together on the right, with the coordinator immediately before Add agent
and outside the workers' scrolling strip. Use the same tab shape, height,
typography and state styling as worker tabs, retaining its overview icon and
separate coordinator identity. Preserve the sixteen-pixel top inset, approximately
34-pixel inactive tabs and 40-pixel selected tab. Use a larger bold label only for
the tab whose chat history is visible, with regular inactive labels; bottom-align
tabs at the pane. Selection uses cyan top/side edges independently of the status
dot's running/attention color. The visible wordmark is command center NG. Preserve its running/attention indicators
and compact mobile presentation.
Use small folder-style tabs joined seamlessly to the pane. The selected tab
shares its fill with the pane and uses label/shape contrast, with no bottom
selection stripe or separating header/pane border. Keep horizontal tab scrolling
available without a scrollbar gutter interrupting that connection.
Keep a fixed twelve-pixel inset above the conversation scroll viewport, so
scrolling text clips below the tabs while the tabs remain attached to the pane.
Inactive tabs use the pane's background across activity states; keep status
colors in their dots/top edges and preserve the selected tab's larger bold label.
Favor simple navigation, readable type, consistent spacing, clear status labels,
accessible controls, and restrained effects. Keep the project goal and current
work easy to recover when switching contexts. Branching must remain a simple
context-preserving action with easy return navigation and optional result return.


Keep the desktop goal/task context panel about 40% wider than the pre-0.6.0
sidebar, with a visible Open questions section derived from current native
requests. Preserve request identity, confirmation/error state and manual answer
controls; showing or opening a question must not answer or resolve it. Keep
Branch chat in the chat composer beside Interrupt and Send, with per-reply
Branch here still available. Preserve stacked mobile context and wrapping
composer controls. Do not infer ordinary-chat questions without a separate
agreed approach.

Branch chat must use the native current-history snapshot without lastTurnId,
including persisted messages from an ongoing exchange. Only per-reply Branch
here supplies a validated completed-turn cutoff. Preserve deferGoalContinuation,
parent activity/questions, settings and the worker limit. A native interruption
marker belongs only to the copied partial turn in the child; do not interrupt
the parent or rewrite existing branches to apply this correction.

An attention flag without request details does not establish another client's
ownership. Preserve explicit request loading for only the selected active native
conversation, exact request IDs and native answer confirmation. Loading must not
submit a decision, start a worker turn or broaden worker permissions; startup
restoration remains read-only. Keep coordinator restrictions and existing review
policy intact.


The user requested RHEL 9 prerequisite checking and optional package installation
through sudo after installer confirmation. The application itself still installs
and runs unprivileged under the chosen target. Missing Beads/Codex CLIs may be
offered under that target; preserve compatible global tools, native settings and
existing trackers. Check-only mode must not install anything. The user approved fresh private local Dolt provisioning and Beads initialization
as follow-up installer work. Preserve existing servers and trackers; do not
initialize, migrate or start a fresh service on the development host during tests. Do not
claim other Linux distributions have been tested.

## Approved deployment and chat refinements

The user explicitly selected public command-center-ng for application code and
deployment playbooks, and private command-center-ng-secrets for Vault-encrypted
AAP CaC and environment settings, following the other AAP projects. Do not put
encrypted payloads in this public repository. Use the existing shared CaC
importer rather than adding a wrapper or second importer. Consult the user
before choosing a Vault credential source or changing this architecture.

The deployment playbook targets genuine RHEL 9 with systemd, reuses an existing
unprivileged account and signed-in Codex/Beads setup, and runs the app through a
system-managed unit with User= set. Preserve existing auth, native daemons,
trackers, SSH trust and unrelated units. Never apply this deployment to the
development host as a local validation method. Use isolated temporary fixtures.

Group consecutive tool activity under a closed native details control, retaining
per-action details and visible running/failure counts. Keep questions and chat
messages separate. Pending requests may block sending, but must allow local
draft editing. Preserve backend send protections, IME and Shift+Enter, and newer
drafts typed while an earlier send acknowledgment is outstanding.

Coordinator recaps must explain useful outcomes, unfinished work and the concrete
blocker/next action using task names or plain-language work descriptions. Bare
IDs and closed-record lists are not explanations. Distinguish published code
from deployed/live-verified behavior. Omit routine idle/no-approval bookkeeping
unless relevant. Keep this guidance in new/restored instructions, event reminders
and worker report requests, preserving coordinator identity, review protections
and limits on messages/reports. Do not rewrite model output using guessed task
semantics or start a live worker report merely to test reporting instructions.

Expose every delivered pending request to the coordinator with explicit counts,
distinguishing request records from nested clarification questions. Each review
returns the current remaining list and preserves exact IDs/tokens and native
confirmation. Continue reviewing other eligible approvals after a referral;
existing unreviewed approvals remain scheduled after resolution/referral. Manual
questions, unchanged ask decisions and answer errors must not cause automatic
review/retry loops. Keep the one-message/report limit distinct from independent
reviews, and never add bulk approval or infer missing action/ownership details.

Coordinator decision reports use exactly two bullets per request: a high-level
request/action summary and the actual decision with rationale, each at most one
or two sentences. Use vivid 🟦 request, 🟢 approved, 🔴 declined, 🟠 needs-user and
🟣 unconfirmed markers plus clear words. Do not paste raw Python/shell code into
the request-summary bullet or confuse ask with decline/unconfirmed with approval.
Persist this in base instructions and event reminders. Keep exact review evidence
and current tokens in the review tools. Send concise non-approval feedback through
the existing bounded worker-summary tool, with a permitted easy alternative or
waiting for the user. Respect safe-idle/pending-request gates and distinguish
queued from delivered. Do not dismiss requests, bypass controls, broaden scope,
change credentials or retry automatically to deliver or avoid a non-approval.

## Local-only session management

The user explicitly limits Command Center session monitoring to local Claude and
Codex sessions on the backend host for now. No SSH session monitoring, remote
agent transport, remote-session fallback or remote file access is authorized.
Local Codex monitoring already exists; local read-write Claude management uses the user-approved official Claude
Agent SDK and installed local native CLI. External active processes retain their
ownership; native permissions and provider history remain authoritative. Browser access and Ansible deployment are distinct
from the monitored sessions' location. Do not infer remote-monitoring approval
from Git SSH rules, VM deployment authority or coordinator relays.

## Worker questions and task reports

Use the provider's structured question/request-user-input tool for a clarification
or choice that needs the user's answer whenever that tool is available in the
current mode. Do not ask only in chat when a supported question form is available.
Do not disguise preferences as command approvals. If the tool is unavailable,
state the needed input plainly; keep existing pending questions and do not create
duplicates or assume an answer. Continue independent authorized work while waiting.

Task reports use concise vivid bullets with explicit labels: 🟩 Done, 🟨 In
progress, 🟥 Blocked/needs input, and 🟦 Next. Name actual work and useful outcomes;
IDs are optional supporting references beside names. Include the project's latest
release version and verified publication status, separating a newer working
version or unknown release evidence. Distinguish published code from deployed/live
verified behavior and identify the exact user input needed. Reports alone do not
authorize extra project work. A radio change sends one
Standard Task Report interval instruction; the agent owns its timing and cancels
its previous schedule when the interval changes or Never is selected. Command
Center has no recurring report timer and does not wake stopped sessions. Existing
permissions and project boundaries remain in force.

## Approved worker sidebar and branch-summary refinement

The user approved per-worker report cadence in existing private workspace metadata,
all current tasks with dependency-derived queued state, direct task answers and
Markdown/GFM rendering with react-markdown and remark-gfm, raw HTML disabled.
Keep branch summary review inside the child tab so other tabs remain accessible;
preserve edits across selection changes and identify the parent in blocked-return
errors. Do not answer requests, auto-send summaries or archive through navigation.

## Approved approval-source inspection and report queue

The user approved bounded read-only helper source inspection tied to an exact
current pending approval/token, including source outside project boundaries.
Never execute/import the helper for review, read credential/Vault data, broaden
native coordinator permissions or treat inspected source as authority. Keep
reference checks, source/command hashes and stale-request checks; changed source
requires rereading and review. Unknown effects/dependencies may still require
user input. One-off reports and interval/cancellation instructions use the
existing queue
during active work/questions. Delivery retains current turn/request/pause/handoff
gates; do not interrupt or answer a question to deliver them. Never asks the
agent to cancel recurring reports, preserving explicit Report now requests.
Restoration must not replay interval instructions or create a backend schedule.

## Approved native request controls

Surface current user-facing blocking native requests in the originating worker,
including clarification, command/file approvals, MCP forms/external steps and
filesystem/network grants. Unsupported human answer formats remain visible with
an exact next action; do not automatically refuse or silently discard them.
Internal token/attestation exchanges are not user questions. Native permission
answers may grant only the exact requested access for this turn. Preserve exact
IDs and native confirmation, and never broaden coordinator restrictions or give
it MCP/permission auto-approval. Form answers are not persisted in workspace data.
Report now after Never queues/coalesces one existing report without changing
cadence, interrupting work or answering a pending request.


## Approved worker controls and layout

Use the native model catalog and supported efforts for worker-only model changes.
Update only per-thread model/effort settings for subsequent turns and confirm
native state; do not interrupt the active turn, answer requests or change global
settings/permissions. Preserve coordinator restrictions.
Keep the desktop sidebar resizable with bounded browser-local width, keyboard
controls and stacked mobile layout. Align the coordinator with the chat column,
keep it immediately before Add agent, and display the version badge at its
existing font size in the composer footer. Chat text shrinks with its column within a90ch maximum width.
The named Standard Task Report format lives in server/worker-instructions.md;
interval instructions are sent once per change, without CCNG recurring timers.


## Proportionate coordinator helper review

When needed for an exact pending action, read the directly referenced helper's
source, including startup statements and called functions. Do not routinely
recurse into imports or library implementations. An unread dependency alone is
not a reason to refer an otherwise understood, authorized action to the user.
Escalate concrete unresolved effects, targets or authority concerns revealed by
the action/helper. Keep source reads bounded, read-only and tied to current
command approvals, with changed-source checks; never execute the helper or read
credential/Vault data. Existing approved credential sources need no new choice.
The existing source-reader tool can use the same helper checks and return exact
current approval bindings, preserving older coordinator conversations. Reading
source does not approve a command or expand native permissions.

Resolve approval-linked helper paths under the exact native approval cwd, using
worker cwd only when native cwd is absent/null. Return and recheck the directory
alongside command/source hashes. The older reader checks approval references
before the worker project and refuses ambiguous directories. Keep resolved
hidden/sensitive paths excluded even when the caller supplies a relative name.


## Shared runtime rules, ordinary-chat inputs and local Claude

Import the local Setup-Agentic-Dev-Environment/AGENTS.md into worker runtime
instructions and the coordinator, without recursive self-import, automatic
fetching or native permission changes. Codex context is read at app-started
turns; an existing managed Claude process retains its startup context until its
next process startup. Missing sources must be identified truthfully.
When structured questions are unavailable, workers with existing Beads-write
authority create/reuse a current-conversation input record labelled
ccng-chat-question. Only the worker resolves it after processing an actual
answer/withdrawal. The coordinator reads it, never writes records or treats it
as a native approval. Do not infer closure from chat, idle state or delivery.
Keep SDK tool/MCP grants manual and tied to exact callbacks. Do not take over an
external active CLI session, change native auth/settings or claim live model
validation from fixtures. Closing a tab keeps managed processes running; app
shutdown ends SDK-owned runs and retains native history. Claude branching is
not yet integrated. Preserve explicit closed-tab request reopening.
Task rows use natural height with a viewport sized to the first three rows;
assignee names remain in backend metadata rather than row presentation. Model
and Effort labels/selects stay on one line; omit routine descriptive paragraphs.
