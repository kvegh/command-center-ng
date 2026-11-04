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
messages. No separate storage service or database is approved. The user authorized a native Codex coordinator alongside four workers,
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
existing trackers. Check-only mode must not install anything. Fresh Beads/shared
Dolt setup remains subject to the pending user choice; do not initialize or
migrate a tracker or start a new service until that approach is approved. Do not
claim other Linux distributions have been tested.
