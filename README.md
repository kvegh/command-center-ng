# Command Center NG

A calm, responsive workspace for AI agents, projects, tasks, and branching
conversations. Switch between work without having to reconstruct the context.

## Project status

**Version 0.0.1** implements the Codex workspace and Linux installer. It supports
four agent tabs, live running/idle/attention state, existing conversations, new
agents, reported tasks/subagents, chat, steering, interruption, and questions.
The interface uses a local Node.js service and the existing Codex daemon.

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
- Track work durably, with the task-system integration still to be selected.
- Branch a conversation with its whole context, ask a follow-up or start a
  subtask, and return to the main conversation whenever needed.
- Use an optional **Bring back to main** action to return a branch's findings
  or subtask results to its parent.

See [product requirements](docs/product-requirements.md) for the agreed behavior.

## Installation and startup

Prerequisites: Linux, Node.js 22.12+, npm, tar/realpath, and a signed-in Codex CLI.
The native integration is tested with Codex 0.166.0. System tools are not
installed automatically.

Clone this repository and run the installer with a target directory:

```sh
sh install.sh "$HOME/apps/command-center-ng"
```

Without the directory parameter, `sh install.sh` prompts for the target before
doing any installation work. The target must be inside your home. The script
builds the app, removes build-only dependencies, and creates the launcher
`~/.local/bin/command-center-ng`. The first interactive install also prompts for
an application password; its hash stays outside the repository.

Start the native Codex daemon, then the application:

```sh
codex app-server daemon start
~/.local/bin/command-center-ng
```

Open **http://localhost:4242** and sign in. Installation does not add a service
or boot autostart. If installed noninteractively, first run the installed
`server/password.mjs` with Node to set a password. Add `~/.local/bin` to your PATH
if needed.

For a VM behind nginx, set the internal interface and browser-facing origin:

```sh
command-center-ng --host VM_INTERNAL_IP --port 4242 --public-origin https://command-center.example
```

Replace the placeholders with your deployment values. Configure nginx's own
access control as well; the application independently requires its password.
See [installation and proxy details](docs/installation.md).

## Development and current limits

Run `npm ci --ignore-scripts`, `npm run password`, and `npm run dev` for local
development. For production from source, run `npm run build` and `npm start`.
`package.json` is the authoritative MAJOR.MINOR.PATCH version source.

Existing Codex model, sign-in, and permission settings are preserved. Enter
sends; Shift+Enter inserts a newline. Drafts and reading positions survive tab
switches. Closing a tab does not delete or interrupt its native conversation.

Task/subagent progress comes from native events, without invented status.
Recent history can be paged backward, with a bounded 600-item in-memory view per
tab; Codex retains model context. Tabs are shared within the single-user app
process and reset when it restarts. Conversation branching, persistent decision
summaries, and runtime task-tracker integration are future work.

Command/file approvals and structured questions can be answered here. Requests
owned by another client, broader filesystem/network grants, and connector forms
can require the native Codex client. App passwords use salted scrypt hashes in
private home configuration; sessions use HttpOnly/SameSite cookies. Set an HTTPS
public origin for Secure cookies behind nginx. No hypervisor, nginx, firewall,
TLS, or VM changes are performed by this application.

Validation: production build, four protocol/auth/API integration tests, four
real parallel validation agents with steering/interruption, and a temporary
unprivileged home installation with production assets and dependency pruning.
No browser executable was available for automated desktop/mobile visual checks.

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
tracker. That does not select the task tracker the application will expose.

No license has been selected; public visibility alone does not grant a license.
