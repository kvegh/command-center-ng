# Design decisions history

This project starts with the requirements recorded here and in README.md.
There is no earlier implementation history to reconstruct. These entries
distinguish selected direction from implemented behavior.

Initial source commit: `17d351d74ec172c2f451e59e48c534afbc25e2d2`. It introduces
the eight documentation, contributor-guidance, and Git-policy files described
below; it contains no application or installer implementation.

## 2026-11-03 — Start an independent public-source project

The user requested the repository name command-center-ng and explicitly allowed
public visibility, with no secrets or tokens in the repository. Its source is
kept separate from the existing session dashboard. The initial source contains
generic product requirements, contributor instructions, and ignore rules;
the application and its agent integrations are not implemented.

The GitHub repository was created on 2026-11-03 with public visibility, which
was independently verified through its repository metadata. Git publication
uses SSH. No license has been selected.

## 2026-11-03 — Select a small interactive frontend foundation

The user explicitly delegated choosing a frontend framework for an intuitive,
beautiful, simple, dynamic interface. The selected stack is React, TypeScript,
and Vite, with plain CSS and shared design tokens. This supports reusable
interactive components and explicit state types while keeping styling
dependencies small. It requires deliberate component/state design and careful
accessible styling. The choice does not select a backend, database, agent
transport, hosting provider, or component suite.

This is a recorded frontend direction, not a running application. Dependencies
have not been installed and package versions have not yet been fixed.

## 2026-11-03 — Make Linux the first supported platform

The user explicitly selected Linux as the primary platform for installation
and operation. The complete interface must work in a Linux desktop browser;
the smartphone browser interface may be simpler while retaining core workflows.
Linux distribution support has not yet been implemented or validated.

## 2026-11-03 — Use a simple installer in an unprivileged user's home

The user explicitly selected a simple Linux shell script that installs into
an unprivileged user's home directory. The installer must not require root or
sudo. This avoids making administrator access a prerequisite for installation.
Runtime delivery, updates, and background startup remain undecided. No installer
or system changes have been implemented.

## 2026-11-03 — Keep branching simple and result return optional

The user clarified that Branch here should open a new conversation with the
same whole context, allow a follow-up question or subtask, and support easy
return to the main conversation and repeated branching. The user also requested
an option for bringing subtask results back to main. A formal branch-completion
or merge-review workflow was an assistant suggestion, not an accepted requirement.

Parent-child connections and retained conversations support navigation and
historical review. Branch navigation and result return are separate actions.
The precise result payload and automatic parent continuation remain undecided.

## 2026-11-03 — Implement version 0.0.1

Implementation commit: `8b84f401bd6c726bf1111230ee23628a86b05c3e`.

The user approved a Codex-only first version with four colored agent tabs,
compact goals and reported tasks/subagents, a conversation and questions area,
bottom chat input, existing-agent access, and new-agent controls. A small Node.js
service connects to the existing native Codex daemon through its Unix WebSocket
interface. This provides native state, streaming, steering, and interruption
while preserving model and permission settings. No existing daemon is restarted.

The user selected port 4242 and both localhost and VM-internal listening modes.
The user approved nginx access restrictions plus an application password stored
only as a salted secure hash in private home configuration. Real deployment
addresses and authentication values remain outside the public repository.

The Linux shell installer accepts a destination inside the user's home. Without
a directory argument it prompts before installing, as explicitly requested. It
builds the interface, prunes build-only dependencies, and creates a user launcher.
It does not install system packages or configure boot services.

The first implementation is 0.0.1, with package.json as the authoritative version
source shared by frontend and backend. Later code changes follow the user's
automatic MAJOR.MINOR.PATCH rule, with documentation kept consistent.

Validation: production build; four protocol/auth/API integration tests; four
real parallel validation agents; real steering/interruption; and a complete
temporary unprivileged home installation with production assets and dependency
pruning. Test conversations were archived and temporary installation artifacts
removed. Browser visual checks were unavailable because no browser executable
was installed. Questions owned by another client, broader permission grants,
and connector forms may still need the native client. Branching and durable
decision/task summaries remain future work, rather than implemented claims.

## 2026-11-03 — Make the installer directly executable in 0.0.2

Implementation commit: `c1129f5a050b402452d2d850f1086b4c1322b4e6`.

The user reported the installer lacked the executable bit. Git now records
install.sh with executable mode 100755 so a Linux checkout supports ./install.sh
directly. Installer help and current installation examples use that form.
The version advances from 0.0.1 to 0.0.2 for this patch-level correction;
package.json and its lockfile remain consistent, and runtime/build version
references derive from package metadata. No dependency or architecture changed.

Validation passed: direct ./install.sh --help execution, shell syntax,
runtime version output, the tracked executable mode, diff checks, and the
production build. Broader agent/installation behavior is covered by the
preceding implementation's validation and was not rerun for a permission patch.

## 2026-11-03 — Add branching and installer updates in 0.1.0

Implementation commit: `4b91fdf293e03011e494d612782eb63c60dc576e`.

The user requested visible, simple conversation branching with retained context
and a clear return path. Branch here now uses native Codex thread/fork at a
completed reply; Branch chat uses the latest completed reply. Native stored
context is copied through that turn, with goal continuation deferred until the
user sends a follow-up. This avoids reconstructing context from the dashboard's
bounded transcript. Parent metadata supports reopening and navigation. Branches
share the working directory and do not create Git worktrees.

Back to parent navigates without sending. The optional Bring findings back
dialog lets the user review an editable message before explicitly sending it
to the parent, which starts or steers a native turn. No automatic transcript
merge or branch-completion ceremony is introduced. Each branch occupies one of
the four tabs; returning to a closed parent at capacity replaces the branch tab
while keeping its native conversation.

The user requested task summaries instead of executed commands, showing at most
three tasks. The strip now prioritizes reported active plan steps and subagent
assignments, with an agent-reported summary when available. Detailed command
activity stays in the conversation. A graphite palette with cyan controls,
green activity, amber attention, and violet parent navigation responds to the
requested stronger technical appearance without new visual dependencies.

The user selected automatic latest-code fetching for installer updates. The
--update mode advances a clean main checkout only by fast-forward and rebuilds
the existing destination. Dirty or diverged source is rejected without discarding
work. The executable launcher now lives inside the selected target. Only an
exact, owned legacy launcher for that same target is removed. Private password
configuration is preserved; applications and the Codex daemon are not restarted.
The feature version advances from 0.0.2 to 0.1.0.

Validation passed: production build, six protocol/auth/API tests, a real native
fork with inherited-context recall and explicit findings return, parent-link
reopening, and a temporary unprivileged installation/update lifecycle. Installer
checks covered automatic fetching, target-local executable launcher, production
assets, dependency pruning, configuration preservation, dirty/diverged source
refusal, and a failed build leaving the previous installation usable. Temporary
conversations were archived and installation fixtures removed. No browser was
available for automated desktop/mobile visual checks. No dependencies, native
permissions, proxy configuration, or live deployment were changed.

## 2026-11-03 — Fix nested installation updates in 0.1.1

Implementation commit: `54ce896da1cc4f684f258f97ab72304ffa5fe235`.

The user installed into ./targetdir under the source checkout. Git reported
that directory as untracked, and the 0.1.0 updater incorrectly treated the
generated installation as edited source. The source-change check now excludes
only the selected installation's untracked output, using a literal path. All
tracked changes and unrelated untracked files remain protected. A target that
contains tracked source files is rejected. No ignore rules are changed and no
local work is discarded. The correction advances the patch version to 0.1.1.

Validation passed: production build, the six existing protocol/auth/API tests,
six installer regression scenarios, and a complete temporary home installation
and automatic update into checkout/targetdir. Regression checks cover fetching
and fast-forwarding with an untracked installation, unrelated files, similarly
named sibling directories, staged/unstaged source edits, spaces and Git pattern
characters in target names, and tracked target overlap. The full lifecycle also
verified configuration preservation, production assets, dependency pruning,
local-commit refusal, and the previous installation surviving a failed build.
Temporary fixtures were removed. No dependency or architecture changed.

## 2026-11-03 — Summarize branch results and reclaim workspace space in 0.2.0

Implementation commit: `19e7bf484b690f0d9933740b59bcbce96e802870`.

The user requested a summary on return from a branch, followed by closing the
child session and its tab. Return summary now starts a normal native Codex turn
inside the idle child, using its existing context and a structured summary
response. The user reviews an editable summary of at most 2,000 characters.
After the parent accepts it, the app archives the child and removes its tab.
Back to parent remains navigation only. This replaces the previous last-reply
prefill and keeps transcripts out of the parent handoff. Archiving preserves
history rather than deleting it.

Failed generation or delivery leaves the child open. When the parent has
acknowledged a summary but archiving fails, a retry only closes the child within
the current app process. Further branch work invalidates an unsent cached
summary, including after an interrupted turn. Internal summary/handoff messages
are excluded from numbered task-request collection.

The user requested removing the large Your workspace heading, shorter tabs,
removal of the vertical scrollbar between tabs and Add agent, and a useful top
bar. The existing tabs and Add agent now occupy that bar with compact branding,
counts, connection state, and sign-out controls. Tabs are single-line, with
status dots, colors, tooltips, and accessible names; the full status label stays
beside the goal. Horizontal tab scrolling remains available on narrow screens.

The user approved letting the workspace fill the browser and placing the goal
and current tasks in a narrow right sidebar. Desktop uses that sidebar; smaller
screens keep the context above the chat. Removing the centered size limit,
large heading row, repeated tab-status text, and decorative footer gives the
conversation more room without introducing new interface dependencies.

The reported missing multiple-task display exposed two gaps: explicit Task N
chat requests were not collected, and newer native subAgentActivity records
were ignored. Numbered requests now appear immediately and are restored from
loaded native history. Matching plans or explicit agent reports supply their
states; requested work is not guessed complete from idle state. Newer native
subagent events also populate task rows using their native metadata. The
maximum remains three visible tasks, with active work prioritized. External
runtime task-tracker selection remains open.

Validation passed: production build; 20 reported test checks, including 13
protocol/auth/task tests and six installer scenarios plus their parent test;
and a real Codex branch-summary lifecycle. The real child produced a 351-character
summary retaining findings and pending work; the parent accepted it; the child
was archived and its tab removed. Temporary conversations were archived and
fixtures removed. Failure/retry, full-tab-capacity restoration, stale-summary
invalidation, task-history replay, and subagent goal/state updates are covered.
Browser visual automation remains unavailable. The feature version advances
from 0.1.1 to 0.2.0. No dependency, external service, native permission setting,
or live deployment configuration changed.
