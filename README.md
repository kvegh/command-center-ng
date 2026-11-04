# Command Center NG

A calm, responsive workspace for AI agents, projects, tasks, and branching
conversations. Switch between work without having to reconstruct the context.

## Project status

**Version 0.3.1** implements the Codex workspace and Linux installer. It supports
four agent tabs, live running/idle/attention state, existing conversations, new
agents, conversation branches, up to three linked Beads tasks, chat, steering,
interruption, and questions. The dark graphite interface uses cyan controls,
green running states, and amber attention states.
The interface uses a local Node.js service and the existing Codex daemon.
A compact top bar puts the agent tabs and controls first, with branding at the
far right. It spans the full browser width. The workspace fills the window, with goal/tasks in a right sidebar on desktop and
above the conversation on smaller screens. Selecting a tab focuses its chat
input and places the cursor at the end of its saved draft. The generated airport
control-tower icon replaces the previous square brand mark.

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

## Installation and startup

Prerequisites: Linux, Node.js 22.12+, npm, tar/realpath, Beads (`bd`), and a
signed-in Codex CLI. Beads must be on PATH for both the app and working agents.
The installer and app check for JSON/read-only/brief-list support; Beads 1.3.2
was verified. See the [official Beads installation guide](https://github.com/gastownhall/beads/blob/main/docs/getting-started/installation.md).
The native integration is tested with Codex 0.166.0. System tools are not
installed automatically.

Clone this repository and run the installer with a target directory:

```sh
./install.sh "$HOME/apps/command-center-ng"
```

Without the directory parameter, `./install.sh` prompts for the target before
doing any installation work. The target must be inside your home. The script
builds the app, removes build-only dependencies, and creates the launcher
`command-center-ng` inside that target directory. The first interactive install also prompts for
an application password; its hash stays outside the repository.

Start the native Codex daemon, then the application:

```sh
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
after installation. Your password file is preserved; the Codex daemon stays running.
An installation inside the checkout, such as `./targetdir`, is supported: its
untracked output is excluded from the source-change check. Tracked source edits
and unrelated untracked files still block automatic updates.

## Branching a conversation

Choose **Branch here** beside a completed Codex reply, or **Branch chat** beside
the goal to fork from the latest completed reply. Codex copies its stored context
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

## Development and current limits

Run `npm ci --ignore-scripts`, `npm run password`, and `npm run dev` for local
development. For production from source, run `npm run build` and `npm start`.
`package.json` is the authoritative MAJOR.MINOR.PATCH version source.

Existing Codex model, sign-in, and permission settings are preserved. Enter
sends; Shift+Enter inserts a newline. Drafts and reading positions survive tab
switches. Closing a tab does not delete or interrupt its native conversation.

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
state in Beads. No additional summarizer agent or model call is used for task
reads. Branches use their own conversation labels; returning a branch includes
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
stealing focus on streaming updates. Drafts remain browser-memory state for now.
Recent history can be paged backward, with a bounded 600-item in-memory view per
tab; Codex retains model context. Tabs are shared within the single-user app
process and reset when it restarts. Workspace restoration is approved but its
persistence choice is still pending. Persistent decision summaries, automatic
progress summarization, and approval-reviewer integration remain future work.

Command/file approvals and structured questions can be answered here. An answer
waits for Codex's request-resolved notification before the question disappears
and the API reports success. Duplicate submissions are blocked while waiting;
an unconfirmed answer times out with an explicit error and keeps the question
visible. A later native resolution still clears it. Resolutions are scoped to
the conversation and exact request ID, including its numeric/string type.
Answers made in another client clear the corresponding question here too.
Disconnects fail unconfirmed submissions and discard requests tied to the lost
connection. No answer or approval is sent automatically.

Requests
owned by another client, broader filesystem/network grants, and connector forms
can require the native Codex client. App passwords use salted scrypt hashes in
private home configuration; sessions use HttpOnly/SameSite cookies. Set an HTTPS
public origin for Secure cookies behind nginx. No hypervisor, nginx, firewall,
TLS, or VM changes are performed by this application.

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
- [Design decisions and rationale](design_decisions_history.md)
- [Contributor instructions](AGENTS.md)

Development work is currently tracked in the surrounding workspace's Beads
tracker. The runtime integration now also uses Beads, scoped by conversation labels.

No license has been selected; public visibility alone does not grant a license.
