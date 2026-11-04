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

## Current version: 0.3.1

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

## Decisions still open

The user requested an automatically started supervisor with a predefined prompt
to follow the one to four worker conversations. It may read their conversation
history and Beads records, request task reports, and summarize current progress.
The requested approval-review role may assess pending requests on demand.
Legitimate project work can include creating or removing resources, so a
read-only-only rule is insufficient. Exact authority, protected targets, model
and enforcement boundaries remain design questions; none is enabled yet.

Workspace-restore persistence, assistant-team summarizer/reviewer integration,
other agent runtimes, and actual
deployment proxy/TLS configuration remain open. Architectural changes require
user direction unless specifically delegated.
