# Command Center NG

A calm, responsive workspace for AI agents, projects, tasks, and branching
conversations. Switch between work without having to reconstruct the context.

## Project status

This repository establishes the product requirements and frontend direction.
The application, agent integrations, and installer have not been implemented.
There is no runnable dashboard yet.

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

## Installation

The installer will be a simple Linux shell script that installs into the
invoking unprivileged user's home directory, without requiring root or sudo.
See [installation requirements](docs/installation.md).

The installer has not been implemented; there are no installation commands to
run yet. The chosen frontend tooling supports Node.js on Linux. Exact supported
distribution and package versions will be documented and validated when the
application is implemented.

No backend, database, agent transport, hosting service, or runtime task tracker
has been selected. tmux remains an option for agent execution.

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
