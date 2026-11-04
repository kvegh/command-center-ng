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
control-tower icon. Workspace restore is approved but its persistence choice is
pending. Assistant-team summarizer/approval-reviewer roles are under discussion;
do not enable automatic approval or choose its authority policy without direction.

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
Favor simple navigation, readable type, consistent spacing, clear status labels,
accessible controls, and restrained effects. Keep the project goal and current
work easy to recover when switching contexts. Branching must remain a simple
context-preserving action with easy return navigation and optional result return.
