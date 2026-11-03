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

Branching is a simple action available at a point in the conversation. It opens
a new conversation with the whole context carried over from that point. The
user can ask a follow-up subquestion or start a subtask there, switch back to
the main conversation, and create another branch whenever needed.

Each branch keeps its own subsequent discussion and a clear relationship to its
parent. Both parent and branch remain available for navigation, historical
review, and later continuation. Opening or leaving a branch does not require
completing it or performing a merge ceremony.

An optional **Bring back to main** action returns a branch's findings or subtask
results into its parent conversation. Switching between conversation views is
separate from returning results. Version 0.1.0 provides an editable findings
message and an explicit Send to parent action. Sending starts a parent turn or
steers an active turn; navigation alone never sends. Findings are messages, not
automatic transcript or file merges. Native Codex context preservation was
verified with a real fork and an inherited-context recall check.

## History and tasks

Keep decisions available as short, readable summaries with their rationale and
a route back to the original discussion. Historical review should help the user
understand why the project reached its present state.

Work needs durable task tracking. The user is open to Beads, a Git-backed
TODO.md, or another suitable mechanism. The product integration has not been
chosen. Existing development tracking remains in Beads, outside this public
repository; these requirements do not create a second task tracker.

## Current version: 0.1.1

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

## Decisions still open

Persistence beyond private authentication configuration, runtime task-tracker
integration, other agent runtimes, and actual
deployment proxy/TLS configuration remain open. Architectural changes require
user direction unless specifically delegated.
