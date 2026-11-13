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

## 2026-11-03 — Move branding fully right in 0.2.1

Implementation commit: `5bebfd88b9e57843f70f08a537cc50e5d79ce84f`.

The user clarified that branding must be completely at the right of the workspace
navigation bar. The whole Brand component now follows the agent tabs and controls
as the final header item. The remaining centered width inset is removed so the
bar spans the window and branding aligns to its right padding. Compact mobile
branding remains at that same rightmost position. This corrects the placement
left in 0.2.0 and advances the patch version to 0.2.1.

Validation passed: production build, header element-order and full-width style
checks, synchronized package metadata, and diff checks. No new test suite was
added for this small presentation correction. Browser visual automation remains
unavailable. Agent and installer behavior did not change.

## 2026-11-03 — Keep the task panel current in 0.2.2

Implementation commit: `83b1606cec1300c9e5f310b34232518cf25de3b3`.

The user ran real sessions and found the three historical numbered requests
still listed as requested. The 0.2.0 parser had made those requests visible,
but that did not establish current agent work. The panel now excludes raw
requests and completed tasks. Numbered requests supply labels only for explicit
progress reports or a matching current native plan.

Plans and explicit reports are associated with their turn. A new turn clears
the prior turn's plan/report rows, and native-history replay does not promote
older plans into the latest work. Active subagent records remain supported.
Without current tasks, active agent commentary can provide a progress summary;
otherwise the panel says No current tasks reported. This avoids treating old
requests as running work or guessing that idle means complete.

The existing native Codex integration remains the source. A project Beads
integration was offered as a separate architectural choice and has not been
selected or added. No extra model calls, service, or dependency is introduced.
The patch version advances from 0.2.1 to 0.2.2.

Validation passed: production build, 21 reported checks (14 protocol/auth/task
tests, six installer scenarios, and their parent), metadata/public-content
review, and diff checks. Regression coverage specifically reproduces old raw
requests and an older unfinished plan beside a new current turn, verifies that
only the new plan appears, excludes completed steps, and expires that plan on
the following turn. Browser visual checks remain unavailable.

## 2026-11-03 — Use Beads task state and refine navigation in 0.3.0

Implementation commit: `b0b9774a5435ee4744a3ff6f65a08d7378cf367d`.

The user selected Beads after native plans and chat reports proved insufficient
for durable current-work tracking. The backend now reads stored task titles,
states, ownership and parent links through bd, with no extra model call. Closed
tasks leave the current-work panel; tracker failures clear stale rows and show
an error. The panel refreshes every five seconds and after completed turns.

Conversation associations use namespaced labels in the existing tracker rather
than a second database. Explicit linking changes only the association label.
On app-started turns, application context directs working agents to maintain
their substantive tasks through bd and use their own conversation label.
Branches retain separate links; handoffs include relevant IDs and unfinished
work without automatically closing or reassigning tasks. The installer and app
check the approved bd prerequisite but do not install tools, initialize or
migrate trackers, or manage a Dolt service.

The user requested immediate typing after selecting an agent. Tab selection,
including reselecting the current tab, focuses the enabled chat input at the
end of its draft. Streaming updates do not repeatedly take focus. A generated
transparent airport control-tower icon replaces the square mark and supplies
the favicon; its asset and generation prompt are documented in docs/brand.md.
Branding remains at the far right. No new npm dependency was added.

Validation passed: production build, all 25 reported checks including six nested
installer scenarios, staged public-content review, and diff checks. A real
Beads/Codex check verified native application context, persisted labels across a
fresh adapter, conversation isolation, stored in-progress updates, disappearance
of closed work, and the authenticated task catalog. A complete Linux installer
lifecycle verified fresh and nested installation, fetched updates, executable
target-local launcher, production assets, dependency pruning, password-file and
existing shortcut preservation, dirty/diverged checkout rejection, and retention
of the previous installation after a failed build. Owned validation conversations
were archived, test tasks closed, and fixtures removed. Browser visual review
remains unperformed.

Workspace restoration is requested but its persistence choice remains pending.
Cross-client approval/question resolution is under investigation. The proposed
assistant-team summarizer and approval reviewer are not enabled; their integration
and approval authority require an agreed design and policy.

## 2026-11-03 — Confirm native request resolution in 0.3.1

Implementation commit: `64cf1a18e3810ce0ff2a755616e8ef071a424000`.

The user reported that answering in the dashboard left the original harness
question visible. The app previously dismissed its question immediately after
sending an unacknowledged response. It now waits for native request resolution
before removing the question or reporting API success. Duplicate submissions
are blocked while waiting. Timeout errors retain the question; a late resolution
still clears it. Disconnects reject unconfirmed answers and remove requests
belonging to the lost connection. Exact conversation and typed request identity
prevent unrelated resolution notifications from clearing the wrong question.

The production build and all 29 reported checks passed. Regression coverage
includes command/file decisions, unconfirmed HTTP responses, duplicate answers,
late and other-client resolution, request identity and disconnects. A real
two-client clarification check verified an observer answer, resolution in both
clients and continuation/completion of the original turn. The temporary native
conversation was archived. This does not verify a particular tmux frontend's
rendering or enable automatic approvals.

## 2026-11-03 — Document the requested coordinator

Discussion-summary commit: `44b8aa2e567e673b55b726ef6e386edf107ce2ff`.

The user requested a predefined, automatically started coordinator that follows
one to four workers, reads Beads and conversation history, requests reports and
summarizes current work. It has its own visually separated chat tab and can send
summaries into selected worker conversations. Scope-based approval review must
support authorized resource lifecycle operations, including VM recreation and
reclaiming disposable test capacity. The discussion distinguishes model judgment
from independently enforced limits and leaves uncertain authority with the user.
The user subsequently authorized implementation. The discussion document records
the requested behavior and remaining details; no supervisor exists in 0.3.1.

## 2026-11-04 — Add the native coordinator and tab ordering in 0.4.0

Implementation commit: `962041ced0ae6b4ff420dbeaad94f24367980324`.

The user authorized implementation of the discussion summary, then requested
dragging tabs into a different order. A native Codex coordinator now starts
with the first worker. It has its own visually separated chat tab alongside all
four worker slots. The existing account/model and local service are reused;
no assistant-team deployment, new provider, dependency or persistence service
was introduced. The user can chat with it, request summaries, pause/resume it,
and review recent decisions and deliveries.

Host tools expose watched worker history, bounded project instructions/source,
Beads records, high-level progress publishing, report requests, summary delivery
and exact pending command/file approvals. Recaps supplement stored task state
without changing Beads. Changed evidence and completed work trigger coalesced
turns; unchanged task polls do not make model calls. Messages wait for idle,
unblocked workers outside a branch handoff and are attributed to the coordinator.
Report replies wake the coordinator. Message/report limits and suppression of
summary acknowledgements prevent repeated reporting loops. Unconfirmed sends
retain an error and do not retry automatically; queued messages can be cleared.

The approval prompt follows user-authorized project scope rather than treating
all writes/deletions as forbidden. This covers permitted resource lifecycle,
including disposable VM recreation and resource reclamation. Native request
identity, a current token, active coordinator turn and exact real-user-message
reference are checked before an approve-once response. Generated coordinator
messages and branch handoffs cannot supply authority. Uncertainty remains with
the user. Preferences, broad permission grants and connector forms stay manual.
This is model judgment, not hard containment of arbitrary scripts or AAP effects.

The coordinator's native sandbox is read-only; unrelated shell/apps/plugins,
MCP, memories, permission-request and multi-agent capabilities are disabled for
its thread. Startup verifies the sandbox and fails visibly if the restrictions
cannot be applied. Worker configuration is preserved. The initial live check
exposed an incorrect MCP override quoting format; the corrected format passed.
Unusual MCP server names currently fail coordinator startup explicitly.

Desktop drag ordering and left/right buttons plus Alt+Left/Right reorder worker
tabs while preserving conversation identity, draft/focus behavior and the separate
coordinator group. Order is local browser memory. Native history remains with
Codex; workspace restoration and stronger remote-resource enforcement remain
separate future decisions.

Validation passed: production build, all 36 reported regression checks, staged
privacy/version/documentation-link review and diff checks. Coordinator fixtures
cover four workers plus the extra role, scoped tools/source reads, queued delivery,
actual-user authority, stale requests, uncertain/manual decisions, event coalescing
and report-loop prevention. Auth/origin checks cover the new controls. A real
native test verified the read-only sandbox, dynamic tools, context read, published
recap, actual summary message and worker acknowledgement. Full Linux installer
validation passed, including fetched updates and failed-build recovery. Owned
validation conversations were archived. No live AAP/VM changes or existing user
approval requests were used; browser visual testing remains unperformed.

## 2026-11-04 — Correct tab dragging in 0.4.1

Implementation commit: `9253e93f82aa604257860b3ce04e72dafa69cc19`.

The user updated to 0.4.0 and reported that dragging tabs did not work. Its native
HTML drag handlers were attached to the wrapper around interactive tab buttons.
The patch replaces that path with pointer capture on the tab button itself and
viewport hit testing for destination workers. The exact browser-specific cause
was not reproduced locally; no interactive browser is available.

A short horizontal movement threshold separates dragging from normal clicks.
Visible cyan markers show the drop position. Cancellation, vertical gestures,
outside drops, lost capture and a worker closing during the gesture retain a
valid order. The drag-generated click is suppressed so it cannot switch chats;
ordinary clicks retain immediate chat focus. Edge movement scrolls the tab strip.
Mouse, touch and pen share the same controller. Coordinator tabs remain outside
worker reordering, and left/right controls remain available. No dependency,
persistence, task, coordinator-authority or installer behavior changed.

Validation passed: production build, all 46 reported checks including ten new
event-controller regressions, metadata/privacy review and diff checks. The tests
exercise pointer sequences and state changes using the production TypeScript
controller and the existing compiler. They do not exercise browser rendering or
prove the reported gesture in the user's browser; that installed retry remains
pending. No browser/tool was installed or live user app restarted.

## 2026-11-04 — Separate the coordinator on the right in 0.4.2

Implementation commit: `fcf05551892eef23028e45e42704a70765968f0b`.

The user clarified that the existing divider was insufficient: the coordinator
must align right while workers align left, and its appearance must communicate
a different role. It now sits outside the workers' scrolling strip as a separate
header group. Workers and Add agent stay together on the left; flexible space
and a divider separate them from the right coordinator. Branding remains the
final item at the far right.

A violet surface, rounded full border and overview icon distinguish the
coordinator from the worker tabs. Status dots and the amber attention border
retain running/attention information. The compact phone treatment shortens its
label to Coord, leaving room for worker navigation. Worker drag destinations
remain confined to the left strip. Project contributor guidance records the
requested placement and visual distinction.

Validation passed: production build, inspection of the parsed header structure
(left worker/Add group, separate coordinator, controls, final branding), all ten
existing pointer-drag checks, version/privacy review and diff checks. No new
test suite was added for this presentation correction. Interactive browser
visual verification remains unperformed. Agent behavior, approval policy,
dependencies, installation and persistence did not change.

## 2026-11-04 — Restore workspaces and refine navigation in 0.5.0

Implementation: `38063bf322a849ff0ddce14e205bf91e73de6a74`.

The user explicitly approved split file storage after discussing which server
would hold it: the existing Command Center Node.js backend, with no additional
service or database. It saves worker/coordinator IDs and coordinator pause state
in a private file beside login configuration. Browser-local storage preserves
drafts, selection, worker order and reading positions. Native histories and
Beads tasks remain in their existing stores. Runtime files stay outside Git.

Restoring views uses native read calls so opening the dashboard does not resume
unloaded worker goals or start model turns. Explicit continuation activates the
existing conversation; the coordinator reapplies its restrictions first. Missing
conversations report errors without blocking other tabs, and the same saved
coordinator is retried instead of silently replaced. Approval answers, review
tokens, queued messages and live decision lists are not replayed. Browser state
is device/origin-specific and reading positions are limited to loaded history.

The user requested the coordinator immediately beside Add agent, a more prominent
Add button, space above the colored tab borders, roughly 30% thinner tabs, a
recognizable airport tower and the exact wordmark command center NG. Workers
remain left; Add and the violet coordinator form a compact right-hand pair;
branding remains rightmost. Source review found the palette coherent and header
controls crowded. The changes simplify that hierarchy while retaining status
colors and the full-window workspace. The tower uses a clearer complete-building
silhouette; its built-in generation prompt is recorded in docs/brand.md.

All 59 regression checks and the production build passed. A disposable native
restart check verified the same worker/coordinator/history, paused state,
private file, unchanged password and required login, with no thread start/resume
or model turn during restoration. Linux fresh-install/update validation verified
the target-local executable, production assets, automatic fetch, both private
configuration files, source protection and failed-build preservation. Header
structure, wordmark text, version consistency, staged privacy and diff checks
passed. Interactive browser/phone rendering and the final visual review remain
pending the user's screenshot after updating. No dependency was added and no
existing user app, daemon, proxy, approval or infrastructure was changed.

## 2026-11-04 — Surface open questions and widen context in 0.6.0

Implementation: `5b63d56a9e99b46631dbeb166f1ca24ff3d6c46e`.

The user requested a roughly 40% wider summary/goal panel because overlooked
questions can leave work blocked. The desktop sidebar now scales from
260–320px to 364–448px at the same relative width range. Goal, current task
summaries and native Open questions remain together. Amber counts/cards show
clarifications, approval requests, coordinator decision rationale and answer
errors. A multi-question request lists each question; numeric/string request
identities remain distinct. Clicking a row reveals the existing answer card and
focuses an enabled control. It does not answer or resolve the request. Native
confirmation remains the condition for clearing it. Requests owned elsewhere
show a notice directing the user to the native client.

The user also requested Branch chat beside Interrupt and Send. It moves into
the chat composer with an explicit non-submit button type; per-reply Branch here
and native fork behavior remain. Controls wrap on narrow screens and mobile
retains stacked context. Ordinary prose questions are not inferred; coordinator
tracking of those decisions remains a separate unanswered scope choice.

Production build and all 59 existing regressions passed. Additional rendering
and navigation checks covered multi-question requests, pending/error visibility,
typed targets, focus, button placement and 40% width scaling. Privacy/version
and diff checks passed. No tool/dependency, storage or approval authority was
added. Interactive desktop/mobile rendering awaits a screenshot. This change is
committed locally only: the active session received a generated no-remote Git
instruction, whose source was investigated and corrected for future hook loads.
No Git network operation was performed for this version.

## 2026-11-04 — Check prerequisites and offer confirmed RHEL 9 setup

Implementation: `818b3cd059325456efe206ee06f61f179d3b4a7f`.

The user requested prerequisite checks and optional installation with sudo after
approval, plus RHEL 9 documentation and Beads configuration. The local 0.7.0
checkpoint adds a read-only inventory, Node/npm and system-tool checks, RHEL 9
RPM offers, and separately confirmed target-local installation of missing
Beads/Codex CLIs. Existing compatible tools are reused. Deferred Codex sign-in
keeps installation possible while reporting incomplete agent readiness. Local
CLI paths are included in the launcher and documented for native daemon startup.

Fresh tracker/Dolt server configuration is deliberately not selected: the user
has not yet answered the proposed shared-server architecture choice. Existing
trackers and services remain unchanged. The RHEL 9 guide documents all package
requirements, embedded/server differences, vendor references, preserved settings
and the untested status of other distributions. Ordinary-chat question tracking
also remains an unanswered scope choice from the preceding UI change.

All 63 regressions, production build, shell syntax and privacy/version/diff
checks passed. Simulated terminal tests verified affirmative, negative and
noninteractive consent. A staged home installation with existing CLIs passed.
No actual system package, new CLI, tracker or server was installed. Minimal-RHEL
bootstrap and rendered browser tests remain unperformed. This checkpoint is
local and unpublished. The user subsequently requested a Git-tracked handover
file before continuing in another chat; current_status_for_handover.md records
the saved work, remaining decisions and validation limits without private data.

## 2026-11-04 — Remove the gap below agent tabs in 0.7.1

Implementation: `101f2f6`.

The user requested that chat history meet the tab bar without the extra blank
strip. The workspace now has zero top padding on desktop and mobile, preserving
its side/bottom spacing and the tab bar's existing eight-pixel internal top
inset. This is a layout correction within the existing responsive design.

Validation: production TypeScript/Vite build and diff checks passed. No browser
executable is installed, so the rendered desktop/mobile result remains unverified.

## 2026-11-04 — Preserve conversation roles and explicit project selection in 0.8.0

Implementation: `e1e9363`.

The user reported workers mixing project tasks or instructions and requested
continuation of the open work after checking tools. Read-only native history and
saved workspace inspection confirmed former coordinators had been opened as
workers, and RHEL workers had started with the application's project directory
and instructions. These were verified entry points for confusion; they do not
establish every cause of the earlier behavior.

Worker selection now excludes coordinator metadata, and direct opening and
restoration check native roles before any resume. New coordinators use the
existing native source field to retain their identity through renaming. Earlier
coordinators are recognized by their reserved name; renamed older coordinators
without the marker remain a documented limitation. Invalid saved roles produce
warnings and preserve IDs for explicit recovery, without rewriting histories or
creating a replacement coordinator.

New-worker directory input starts empty and must be supplied explicitly. This
prevents the application startup directory from silently determining a different
project's instructions. Existing conversations retain their native directories.
Task context also reiterates that coordinator summaries and shared records do
not create assignments or user authority. No separate role store, service, tool
installation, permission override or conversation migration was introduced.

Validation: three new role regressions failed before the fix. All 67 checks,
including the additional explicit-directory regression, and the production build
passed afterward. The installed Codex 0.166.0 generated protocol schema includes
the native source field used here. Staged and unpublished additions passed
privacy-pattern and diff checks. Interactive browser checks and proof of all
earlier semantic mixing remain unperformed. Source publication does not update
an already running installation.

## 2026-11-04 — Match coordinator and worker tabs in 0.8.1

Implementation: `1cfc9b8`.

The user requested the coordinator use the same kind of tab as workers and sit
to the left of Add agent, swapping their previous order. The coordinator now
inherits worker tab shape, height, typography and state styling. Its startup/retry
control uses shared tab markup too. The coordinator retains its overview icon,
compact mobile label, separate chat/role and position outside worker reordering.
The existing tab-bar top inset and zero workspace top gap are retained.

Contributor guidance and current design documentation reflect this explicit
revision of the older violet-pill/after-Add-agent direction. This is a patch-level
presentation correction; it changes no native conversation or permission behavior.

Validation: production build, all 67 existing checks, header-order source review,
version/privacy checks and diff checks passed. No tests were added for a small
reversible layout correction. No browser is installed, so rendered desktop/mobile
review remains pending. The running user installation was not updated/restarted.

## 2026-11-04 — Recover missing pending requests in 0.9.0

Implementation: `6e78051`.

The user reported duplicate chat/sidebar messages claiming an approval belonged
to another client while using Command Center. Read-only inspection confirmed a
worker was waiting on approval. The UI inferred ownership solely from attention
without local request details; it had no ownership evidence. A regression also
reproduced a request being dropped while a conversation was opening, because
request watching began after awaiting native resume.

The app now watches a validated conversation before resume and offers explicit
loading of missing request details. It reads fresh status and rejoins only the
selected already-active native conversation, preserving original request IDs.
Loading is bounded, deduplicated and scoped to that chat, with an explicit error
when replay is unavailable. Ordinary chat sends cannot replace or steer a turn
while request details are missing. Startup restoration remains read-only, and
loading submits no decision, creates no worker turn and adds no worker permission
or model override. Existing coordinator restrictions and review policy remain.
Native user-verification requests excluded from replay retain their native limits.

Matching Codex 0.166.0 source confirms pending-request replay after rejoin. Six
regressions failed before the fix; all 75 checks and the production build pass
with added late-replay and coordinator-restriction coverage. Live recovery in the
user installation and browser rendering remain unverified. The existing-UI
close-tab/reopen-same-conversation workaround was provided without interrupting,
answering or changing the worker. No live approval was submitted by this work.

## 2026-11-04 — Attach folder tabs to the pane in 0.9.1

Implementation: `162bb73`.

The original user request in coordinator history was read to verify the relayed
visual direction: small folder-like tabs should join their chat-history pane
without intervening lines, and selection should use something other than the
bottom marker. The implementation uses matching pane/tab fill, stronger selected
labels and clearer side edges. These are implementation choices for the requested
effect, rather than separately recorded user choices of exact colors or weights.

The joining header padding/border and pane top border/corners are removed. The
context panel shares the same surface, including the coordinator and stacked
mobile view. Horizontal scrolling remains available without a visible scrollbar
gutter separating tabs from the pane. The coordinator stays before Add agent;
status colors, keyboard focus and worker reordering are preserved.

Validation: all 75 existing checks and the production build pass. No new tests
were added for this reversible visual change. Rendered desktop/mobile review is
still pending, and no user installation or native daemon was restarted.

## 2026-11-04 — Confirm live pending-request recovery

Implementation: `6e78051` (0.9.0), included in 0.9.1 at `162bb73`.

After confirming their installation was on 0.9.1, the user reported that Load
pending request worked. The latest native read also showed the worker active
without an approval-wait flag. This closes the live recovery validation gap and
the recovery bug. It does not establish completion of the worker's underlying
task or every historical session-mixing cause. Rendered browser review remains
pending. This follow-up changes documentation only; the version remains 0.9.1.

## 2026-11-04 — Distinguish the visible conversation tab in 0.9.2

Implementation: `cf29429`.

The user found the selected tab difficult to identify and clarified that selection
means the chat history currently visible, independently of the agent's activity.
Their newer request doubles the top inset from 8 to 16 pixels, makes the selected
tab somewhat bigger and uses bold text only there. It supersedes the earlier
eight-pixel inset and uniform compact tab height.

The selected tab is about 40 pixels tall with a 13-pixel bold label; inactive
tabs stay about 34 pixels with regular 12-pixel labels. Bottom alignment preserves
the folder-tab connection. Cyan top/side edges and a brighter upper fill fading
into the pane reinforce selection for every activity state, while status dots
retain their independent colors. Worker/coordinator styling and mobile behavior
follow the same rule, with no bottom selection stripe or joining line.

Validation: all 75 existing tests and the production build pass. No additional
tests were added for this reversible CSS change. Rendered desktop/mobile review
is still pending. The implementation is committed locally; GitHub rejected SSH
authentication for both push and read-only ls-remote. Publication is blocked,
with SSH configuration/keys and the running installation preserved.

## 2026-11-04 — Publish the validated 0.9.2 correction

Implementation: `cf29429`; implementation and prior handover published at `ceed67e`.

After earlier authentication and server-side failures, the user explicitly asked
to retry publication. The push succeeded using the unchanged existing SSH
configuration. The tab correction is now published and the publication blocker
is cleared. No code changed during this follow-up; the existing 75 passing tests
and production build remain the implementation validation. Rendered review and
updating the user's running installation remain pending. Claude monitoring still
awaits the connection choice and target; no transport or AAP change was added.

## 2026-11-04 — Keep scrolling text below the attached tabs in 0.9.3

Implementation: `a9f29df`.

The user wanted chat-history text to disappear a little before it reaches the
tab bottoms, while retaining the folder-tab connection. A fixed twelve-pixel
inset moves the conversation's scroll viewport inside the pane. Unlike ordinary
content padding, that space remains clear when the conversation is scrolled.
The composer and sidebar retain their existing placement and behavior.

The user also requested the chat-history background for inactive tabs. Worker
and coordinator tabs now use the shared pane fill across activity states; the
amber attention fill is removed while status dots/top edges remain. Selected
height, bold label, top/side outline and brighter fill remain intact. Mobile uses
the same fixed inset, with no new joining border or outside gap.

Validation: all 75 existing tests and the production build pass. No new tests
were added for these reversible CSS changes. Rendered desktop/mobile review
remains pending. No dependencies, native settings or running installation changed.

## 2026-11-04 — Preserve the ongoing exchange when branching in 0.10.0

Implementation: `ec4cb6e`.

The user reported conversation messages missing from a branch. Native history
metadata and the specific message boundary confirmed that Branch chat had selected
an earlier completed reply and omitted the later exchange. This matched the
previous implementation, but made the composer action an unexpected historical
branch instead of a current-conversation snapshot.

The existing native fork transport supports the correction without adding a
service or context store. Branch chat now omits the historical cutoff and forks
current stored history. The native child receives an interruption marker for an
incomplete copied turn while the parent continues. Branch here retains its
explicit completed-turn cutoff. Deferred goal continuation, settings, parent
questions and worker limits remain intact. The composer can branch during the
first turn, before a completed reply exists.

Two regressions failed before implementation. All 77 tests and the production
build pass, covering retained recent messages, historical branching, first-turn
branching, unchanged parent activity/approval and no automatic child turn. The
matching installed native schema/source and fetched official App Server reference
confirm the protocol behavior. Synthetic fixtures contain no user transcript or
native identifiers. Existing user branches were preserved and require a fresh
branch after updating to obtain a newer snapshot; no live branch was created or
rewritten for validation. Rendered browser review remains pending.

## 2026-11-04 — Compact activity, editable drafts and RHEL 9 deployment in 0.11.0

Implementation: `70490b8ffd8a6225ba0d3b831b5f20088b0765ce`.

The user requested collapsing intermediate command rows while retaining access
to each command's existing details. Consecutive activity now uses an initially
closed native disclosure group. Its summary keeps running, failed and stopped
counts visible; chat messages and request controls stay in their original order.
The user also requested typing while a question is displayed. Draft editing is
separate from send readiness, with newline behavior while blocked and protection
against an older send acknowledgment erasing newer typing. Native/backend
request protections and answer confirmation remain unchanged.

The user approved an Ansible playbook for genuine RHEL 9, automatic systemd
startup with an unprivileged application process, and reuse of an existing
Codex/Beads profile. A first OS guard runs before target changes; the maintained
installer handles application files. The playbook protects existing auth,
profile paths, native services, unrelated units and local Git work. It verifies
application health and version without provisioning a fresh agent environment.

The user's later explicit layout places application/deployment code in this
public project and whole-file Vault-encrypted CaC/settings in a private
command-center-ng-secrets companion, matching their other AAP projects.
No private target data or encrypted payload was added to public source. Actual
CaC capture, Vault credential choice, shared-importer integration, live deployment
and browser-access checks remain pending; creating a repository is not proof of
a configured AAP Job Template or successful VM startup. Claude monitoring remains
an independent, unimplemented request.

Validation: 85 application tests and production build passed; seven real-Ansible
fixture tests, syntax checking and 14-file production lint passed. Fixtures use
only disposable localhost files, including real password hashing and offline
systemd parsing; the deployment playbook was never applied to this development
machine. Interactive desktop/mobile review remains unperformed.

## 2026-11-04 — Explain coordinator progress through named outcomes in 0.11.1

Implementation: `a75515d093660ab6ac2aafb047b3adc80c674e8d`.

The user found recaps dominated by unfamiliar task IDs, idle state and stored
closed-record bookkeeping unhelpful. Coordinator reporting guidance now leads
with the useful outcome, names the actual work, identifies unfinished work and
states a specific blocker or next action. It distinguishes implementation and
publication from deployment and live verification. IDs are supporting references
beside names only when requested or needed in an internal handoff. Routine idle,
closed-record and no-approval notices are omitted unless relevant to the question
or an actual problem; unchanged evidence needs no new bookkeeping recap.

The same guidance reaches initial/restored native instructions and each event
reminder, including existing coordinators that retain earlier tool descriptions.
Worker report requests now ask for named work and concrete results. Sidebar
summary, blocker and nextStep fields have separate purposes. Existing identity,
message/report limits, request controls and approval policy remain unchanged.
No new model provider, task store, service or output-rewriting mechanism was added.

Validation: all 86 application tests and the production build passed. A protocol
fixture checks new/restored instructions and event delivery with the same
coordinator, no interruption and no approval response. No live model reply or
worker report was generated for this check; the actual wording requires normal
use after updating and requesting Summarize now or receiving the next event.
Old recaps are not retroactively rewritten. Deployment and Claude prerequisites
remain separate open work.

## 2026-11-04 — Expose and continue review of every delivered request in 0.12.0

Implementation: `2f8a45ad9846ea9799112395cb9effc4bf945a36`.

The user reported the coordinator detecting one request when four were open.
Source inspection found the backend already stores a full request array; native
fixtures verify all four survive resume and duplicate delivery. The change makes
that list explicit to the coordinator with requestSummary counts, including the
distinction between a native request and its nested clarification questions.
Each independent review now returns the current remaining requests and counts,
including requests received while an earlier answer awaited confirmation.

A referral to the user leaves that exact request open while other eligible
approvals can be reviewed. Remaining unreviewed approvals stay marked in the
existing event scheduler after a referral or native resolution. Requests already
referred to the user or showing answer errors do not cause repeated automatic
review. New/restored instructions and event reminders require inspection of the
whole list and rechecking before finishing, independently of the existing
one-message/report limit. Each approval retains its own current token, exact
user authority and native resolution confirmation. No bulk approval, extra
service/store, changed permission policy or automatic native rejoin was added.
Counts cover delivered request details, not a guaranteed total of native requests
whose details have not reached this client. Incomplete actions remain manual.

At the user's separate status questions, existing Beads titles were narrowed to
the genuinely pending ordinary-chat question-tracking and fresh Beads/Dolt setup
choices. Published sidebar/structured-question/prerequisite features remain
delivered. No new architecture was selected from those status questions.

Validation: all 90 application tests and the production build passed. Two new
coordinator regressions failed before the fix. Synthetic fixtures exercise four
approvals with separate tokens, one referral plus three independent approvals,
nested clarification questions, mixed numeric/string IDs, duplicate replay,
new arrivals during confirmation and external native resolution. Existing
coordinator identity, scope and request protections continue to pass. No real
user approval, live model call, worker interruption or service restart was used
for validation. Actual model behavior still needs normal use after updating.

## 2026-11-05 — Save two-bullet decisions and non-approval feedback in 0.13.0

Implementation: `36f5eff4e66283314e4749fd82bcdcea3c07d819`.

The user explicitly requested Git-saved instructions and a direct message to the
existing coordinator. A shared decision policy now requires exactly two bullets
per request: a high-level action/target/effect summary, then the real outcome and
rationale, each at most one or two sentences. Vivid Unicode markers distinguish
request, approved, declined, needs-user and unconfirmed states alongside explicit
words. Raw code is excluded from the user-facing request summary; exact native
actions, current tokens and authorization evidence remain in the review tools.
The same policy is present in new/restored instructions and each event reminder.

The user also requested feedback to workers after non-approval. Instructions use
the existing bounded summary channel, combining results per worker and explaining
an easy permitted alternative or waiting for the user. This is model guidance
using an existing tool, not a new guaranteed notification transport. Pending
requests remain open; feedback waits for native resolution and safe idle. It
never authorizes bypassing controls, changing credentials, expanding scope or
automatically retrying a refused action. Delivery acknowledgement/errors must be
reported honestly. No tool schema, service/store or approval authority changed.

Validation: all 91 application tests and production build passed. Fixtures verify
policy delivery to new/restored coordinators/events and safe-idle feedback that
neither answers nor interrupts a pending request, including duplicate-message
limits. The direct native message tool accepted the instruction; no acknowledgement
of reading it is inferred. No live worker approval or service restart was used
for validation. Ordinary-chat tracking is newly approved in scope but not yet
implemented; Markdown rendering is separately requested and its library choice
is pending, so neither is claimed delivered by this release.


## 2026-11-05 — Raise worker capacity to sixteen in 0.14.0

Implementation: `d69bbb9ebead227e107869e33e72ab80b68efb27`.

The user requested a sensible increase from the four-worker limit. Sixteen
worker tabs give room for several projects and branches while retaining a
bounded workspace. The coordinator remains separate. One shared limit now
controls the browser, native open/create/fork guards, parent navigation,
coordinator instructions and private workspace save/restore. Existing saved
records need no migration. Native subagent concurrency, worker permissions,
coordinator restrictions and the scrolling tab layout are unchanged.

Validation: production build and 61 tests passed without local sockets or
installer home writes. Fixtures cover seventeen concurrent opens/creates
admitting only sixteen workers, branching into the final slot, parent navigation
at capacity and read-only restoration of sixteen workers plus the coordinator.
The full suite was attempted; sandbox policy denied its local Unix sockets and
installer home-directory writes, and broader test permissions were automatically
rejected. Interactive browser verification remains unperformed. No live worker
was created or interrupted and no running application was updated or restarted.
Earlier unfinished changes remain outside this focused implementation commit.

## 2026-11-05 — Make worker reports, tasks and branch reviews usable in 0.15.0

Implementation: `af85de795c2339b64bf72e1256cc656d763491a6`.

The user requested per-worker report timing, meaningful state totals, all tasks
instead of a three-row preview, and answering task questions without copying
text into chat. The existing private workspace metadata now holds only report
cadence; existing safe-idle delivery schedules bounded status requests. Never
is the default, restoration starts a fresh delay, pause/native questions/work
prevent delivery and failures require an explicit settings change. Instructions
require vivid named outcomes, project release/publication evidence and structured
clarification tools when available, without changing native feature flags.
All active linked tasks are visible with dependency-derived queued state, and
task-detail input uses the normal worker send protections. Beads remains the
single task store and the working agent owns status updates.

The user approved full Markdown/GFM through react-markdown and remark-gfm with
raw HTML disabled. Tables scroll, links retain safe scheme filtering, code stays
literal and remote images do not fetch automatically. The parser packages were
installed from verified existing public cache content. Existing auth and CSP
remain intact. The user also requested branch summary review inside the child
tab so it does not block navigation. Reviews stay mounted while switching tabs,
retain edits and remain explicit send/archive actions. Failed parent delivery
names the parent and explains how to resolve its request, without answering it.

All 109 application tests and the production build pass, including real local
protocol/HTTP/installer fixtures, scheduling/restoration/request gates, full task
lists/dependencies, Markdown safety and handoff errors. A stale four-worker
integration assertion was updated to the shared sixteen-worker capacity. Normal
npm test ran these fixtures in this session; earlier alternate invocations had
sandbox setup restrictions, and no permission change/bypass was used. Interactive
browser review remains unperformed. No live approval or service restart was used.

Local read-write Claude management with the official SDK, fresh Dolt/Beads
provisioning and ordinary-chat question tracking are approved but unfinished.
Comprehensive native user-request mirroring and model/effort controls are separate
follow-up work. Outside-project helper inspection awaits its separate access
approval. No remote/SSH session monitoring is authorized.

## 2026-11-05 — Inspect approval helpers and queue due reports in 0.16.0

Implementation: `4248900ba0629b4400dd281755f0352f63870c59`.

The user approved read-only inspection of helper source tied to a specific pending
approval, including temporary Python files outside a worker project. The existing
coordinator now has a bounded source-only tool requiring the exact current token
and a visible script reference or explicit Python import/search directory. It
never imports/runs the code or reads credential/Vault data. Sensitive paths,
symlinks, non-source/oversized files and obvious embedded credentials are refused.
Inspected command/source hashes are checked before approval; changed evidence
requires rereading. This detects changes until the check, not a lock against later
changes or proof of safety. Unresolved dependencies/effects still need user review.
The native read-only sandbox and exact authority/confirmation rules remain.

The user clarified that report input can queue while a worker is busy. Due reports
now enter the existing queue during active work or native questions, with visible
queued/generating state. One outstanding report coalesces missed intervals. Normal
delivery gates prevent interrupting/answering questions; Never cancels an unsent
schedule and completion starts a fresh delay. The user also capped the task list
at three visible rows while preserving scrolling, all records and full totals.

All 113 application tests and the production build pass. Fixtures cover token,
worker/reference/stale-source binding, no helper execution, source refusals and
unchanged coordinator authority; report queuing, pending/missing requests, one
outstanding report, cancellation and no interruption. Three-row sizing has source/
build review, with interactive browser review still pending. No live approval,
helper import, native restart or deployment was used for tests. Comprehensive
native request controls, model/effort controls and local Claude SDK management
remain separate unfinished work.

## 2026-11-05 — Answer current native user requests and request reports in 0.17.0

Implementation: `63c5cf173eef5c295c8041e3151e29b933fc167c`.

The user broadened request support from MCP/permissions to all user-facing native
blocking requests. A shared current-protocol catalog now drives worker-specific
cards and backend responses for supported MCP primitive forms, external actions
and exact native-requested turn-scoped filesystem/network access, alongside
existing clarification/command/file controls. Unsupported schemas, legacy and
unknown approval-style callbacks stay visible instead of being automatically
refused. Internal token/attestation exchanges remain internal. External steps
require an explicit browser action and completion; unsupported answer formats
still require the native client. Policy-changing command choices remain native.

Manual grants cannot inject extra permissions or a session duration. The
coordinator remains unable to approve MCP/permission requests or broaden its own
restrictions through manual controls. Typed IDs, exact worker identity, native
confirmation and local per-request answer state are preserved. Source publication
adds no new service, permission policy, dependency or runtime restart.

The user also requested Report now immediately after Never. It queues the
existing vivid report prompt without changing cadence, including when automatic
reports are disabled. Existing requests coalesce; active work/questions/pause/
handoff gates remain, with no interruption or automatic request answer.

All 122 application tests and production build pass. Fixtures cover real native
response shape/confirmation, invalid and injected answers, primitive forms and
external URLs, legacy/unknown visibility, coordinator restrictions and reporting
with Never. No live approval/model call was used; browser review is unperformed.
Model/effort selection, sidebar resizing/tab alignment/version relocation and
local official Claude SDK management remain unfinished requests.


## 2026-11-05 — Give workers model controls, room and report ownership in 0.18.0

Implementation: `9aed87fb843463d3ec9cb23a27a21e87bef8cbce`.

The user requested model/effort controls under Worker specific settings. Native
model/list provides actual supported choices, and thread/settings/update changes
only the selected worker's model/effort for subsequent turns. Native metadata
and notifications confirm the saved state, including late confirmation after a
missing acknowledgment. Current work and questions remain intact; no global
settings, permissions, new agent loop or provider abstraction was introduced.
Unsupported native settings operations fail visibly.

The user requested a movable boundary to reclaim chat space. A bounded desktop
divider adjusts both columns and saves the width in existing browser preferences,
with pointer and keyboard controls. The coordinator follows the chat edge before
Add agent; chat text no longer has its fixed character-width cap. The version
badge moves into the composer footer at its existing font size. Mobile remains
stacked. A consistent six-pixel task gap preserves the three-row viewport.

After discussing timers and native capabilities, the user explicitly rejected
CCNG's recurring report clock. That choice supersedes the earlier timer design:
radio changes send one Standard Task Report interval instruction, replace an
unsent older setting, and Never asks the worker to cancel its recurring reports.
The worker owns timing using its runtime capabilities. CCNG recurring polling,
due-time state and repeated report reminders were removed. Startup Markdown
holds the named report function and format. Report now remains one explicit
request; exact native client identity hides only its owned prompt from rendered
chat, preserving native history and actual user/report messages. Restoration
restores selection without replay or model turns; a stopped worker is not woken.
Existing private cadence metadata and delivery/request gates are reused.

All 129 application tests and production build pass. Fixtures cover native
settings/choices, active turns and questions, saved/restored metadata and late
confirmation, width bounds/browser persistence, once-per-change instructions,
replacement/cancellation, owned message identity and no periodic report prompts.
Interactive browser and live provider-timing verification remain unperformed.
No live approval/model call, new dependency, global auto-review policy change,
runtime restart or deployment was used. Local Claude SDK management and shared
environment instruction loading remain separate unfinished requirements.


## 2026-11-05 — Keep coordinator helper reviews proportionate in 0.18.1

Implementation: `ab05d4fb17544a9918dea7df2502b943f062a9b5`.

The user asks for direct helper source inspection without a routine recursive
review of dependencies. Coordinator startup/restored/event guidance now covers
startup statements and called functions, and asks for concrete unresolved concerns
rather than treating an unread import as sufficient reason for referral. Source
is evidence, not authority; the rule does not approve an action or expose data.

Inspection also found an older saved coordinator without the newer helper tool
in its native catalog. Its existing source-reader entry point now uses the same
approved helper-source validator for outside-project helpers directly referenced
by current command approvals. It returns every exact request/token binding and
records source/command hashes for independent later review. No pending command
means no outside-helper read. Existing stale-source, sensitive-data, symlink,
execution and permission restrictions remain. This preserves the conversation
and history without rewriting native state or introducing another tool service.

Regression checks and production build pass. Fixtures verify existing-reader
access, multiple current bindings, no automatic answer, unchanged ordinary
outside-read refusal and changed-source rejection before approval. No quoted
real action was approved/executed, and no running installation was updated or
restarted. Live use requires the normal application update.


## 2026-11-05 — Manage local Claude and keep worker context compact in0.19.0

Implementation: `d7d83b883a82dd73fae52e53d3d38b6ef82041af`.

The user selected the official Claude Agent SDK for local read-write sessions.
The existing backend now uses SDK0.3.212 and the installed native CLI to discover
headless conversations, follow history and manage streaming/follow-ups/interrupts.
The exact official dependency was installed from verified cached packages after
network resolution prevented fetching a newer tarball. No remote session
transport, auth replacement or permission-default change was introduced. Active
external processes retain ownership; managed SDK callbacks are manual and tied
to exact requests. Closed-tab requests offer explicit reopening. Closing a tab
keeps its process alive; backend shutdown ends SDK-owned processes and preserves
native history. Native idle events, serialized startup and read-only restore
retry prevent duplicate processes and incorrect turn/connection assumptions.
Claude branching and restart persistence of managed-process model settings
remain unverified/unintegrated limits, documented rather than simulated.

The user requires shared environment AGENTS at runtime. A small local reader
supplies the full bounded named source through existing native context, reporting
missing sources without fetching or inventing rules. Codex gets context on
app-started turns and Claude at process startup. Higher-priority roles remain
in force. Matching native source showed the coordinator's old V1-only no-subagents
flag was insufficient, so coordinator-only canonical/V2 restrictions were added.

Ordinary-chat fallback questions reuse existing worker-owned Beads input records
and context/reply controls. Explicit labels and exact worker/task IDs avoid
punctuation guesses, fabricated native requests, extra model classifiers and a
new question store. Polling exposes recorded questions before a turn ends; only
the worker resolves them after actual answers/withdrawal. Coordinator reads have
the complete subset and separate native/nested clarification counts.

The installer now offers confirmed fresh native Beads/shared-Dolt setup for an
explicit workspace, preserving existing trackers/settings. Official Dolt2.2.0
archives are checksum verified and installed under the selected unprivileged
target. No custom Dolt service wrapper or development-host setup was introduced.

The user restored a90ch maximum text width, removed task assignee presentation,
requested natural task heights/first-three-row viewport and one-line Model/Effort
controls without routine explanatory text. These preserve sidebar resizing,
narrow-pane wrapping, actual error feedback and backend ownership metadata.

All163 application tests and production build pass, including actual official-SDK
reads of isolated synthetic history, callbacks, startup/restore/ownership races,
closed-tab requests, shared-source loading, recorded questions and installer/UI
fixtures. Interactive browser and live model/provider verification remain pending.
No real approval, runtime restart, target rollout or native permission-default
change occurred. Actual encrypted CaC/rollout needs the user's Vault source;
its question is pending. The separately requested live eight-agent config edit
was blocked by filesystem/approval policy; only its default template was applied.

## 2026-11-05 — Resolve approval helpers from native command cwd in 0.19.1

Implementation: `16006bccd4d7c17498ba26efed32d7b01ef46e51`.

The existing reader looked under the worker directory before checking pending
approvals. A command running in another repository could therefore produce
ENOENT or inspect a same-named worker file instead of its own helper. Both
readers now use the exact native approval cwd, falling back only when omitted
or null. Literal relative source references, including quoted subprocess argv
entries, match equivalent absolute paths without executing or evaluating code.

Working directory is returned and saved with command/source hashes; changed
cwd requires fresh inspection before approval. The older reader checks approval
references first and refuses ambiguous cross-directory matches. Resolved
hidden/sensitive paths remain excluded even through relative input. Ordinary
project reads, native permissions and exact per-request review remain intact.

All172 tests and production build pass, including nine new synthetic cases for
directory precedence, decoys, subprocess paths, bindings, stale/invalid cwd,
ambiguity and resolved sensitive-path refusal. A redirected test run reported
two file-wrapper failures without details; the ordinary npm test run passed
all172. This does not resolve the separately tracked test-context discrepancy.
No real approval, helper execution, native-state rewrite, service restart or
deployment was used. Publication alone does not update a running backend.

## 2026-11-05 — Validate approval citations from older native history in 0.19.2

Implementation: `3b3c868bc722c6abf7cb31b2abc2394e05fd8a0c`.

The coordinator could read a genuine user instruction on an older native worker
page, but approval validation searched only recent worker/coordinator messages.
It therefore rejected an exact native ID/quote even while the reader exposed
the instruction and current request together. Older reads now retain at most
128 native ID/cursor references per open worker instance, without transcript
text, browser metadata or additional persistence. A recent read does not clear
them. Closing/reopening the worker or restarting requires a fresh older read.

For a cited message absent from recent context, review re-reads that exact page
in the same native worker and applies existing real-user/exact-quote checks.
It rechecks worker/request/token after the asynchronous read. Assistant text,
coordinator relays and branch summaries remain excluded; stale/missing native
evidence and closed/resolved requests are refused. Existing review authority,
source safeguards, manual controls and native restrictions remain in force.

All180 application tests and the production build pass, including eight new
synthetic regressions for history references, provenance, worker/reopen isolation,
native read failures, changed evidence, asynchronous resolution/closure and
bounded/omitted messages. No real approval, request replay, helper execution,
permission change or service restart occurred. Source publication does not
update the running installation or decide the reported native request.

## 2026-11-05 — Resize overview sections in 0.20.0

Implementation: `76350c8ca73166dc001a5ea79f93974e3302911c`.

The user requested draggable horizontal boundaries between right overview
sections. Worker and coordinator sections now have pointer and keyboard splitters
with independent scrolling, bounded heights, cancellation and double-click reset.
When the following section reaches its minimum, further downward dragging grows
the upper section and moves later sections down, so a short empty section does
not prevent Tasks from expanding. Existing browser preferences retain sizes
across tabs/reloads without server storage. Mobile keeps natural stacked sizes;
Tasks retain the three-row default until explicitly resized.

All183 application tests and production build pass, including adjacent sizing,
short-pair growth, separator accessibility and browser preference validation.
Interactive browser visual review remains unperformed. No native permission
change, live approval, provider run or running-service restart occurred.

## 2026-11-05 — Prioritize reports and add user systemd management

Report-priority implementation: `b7856e84dc958f4e753b5d9693fca72d0c981b62` (0.21.0).
User-service implementation: `391a1f2fa57f5e324c4f22db3ce6688a86a45111` (0.22.0).

The user requested prompt due/one-off Standard Task Reports and a user-level
service instead of foreground Ctrl-C. The shared report definition now requests
known-evidence reporting at the next safe checkpoint before more project work,
then resumes. It is loaded from the installed worker-instructions.md on backend
startup and supplied to workers and coordinator without adding worker-write
authority to the coordinator. Priority requests precede unsent summaries and use
native Codex steering or owned Claude streaming next-priority input. Native
blocking requests, pause/handoff, queue bounds/coalescing, failed/in-flight
messages and external session ownership remain protected. No automatic tool
interruption or recurring CCNG timer was introduced. Native checkpoint/admission
limits still apply; live provider responsiveness is not proven by fixtures.

The maintained launcher now installs and controls an owner-only systemd user
unit with explicit install/start/stop/restart/status/logs/enable/disable/uninstall.
It preserves supplied runtime options and non-secret profile/PATH variables;
reinstall without options preserves an owned unit. Unrelated/symlink units are
refused. Installation reloads the user manager; start/enable are separate,
allowing deliberate foreground migration. Lingering and native daemons are
unchanged. The live unit directory is outside this session writable roots, so
normal-terminal installation remains pending rather than claimed deployed.

All192 tests and production build pass, including six priority-report regressions
and three service fixtures. Real systemd user-unit verification exited0 for a
synthetic unit, with sandbox bus/socket warnings. It caught and corrected scalar
WorkingDirectory quoting and executable-token dollar handling. No real unit was
installed or started, and no live model, permission change or restart was used.

## 2026-11-05 — Show message times beside authors in 0.23.0

Implementation: `45c2ac9df9d73df5a1aa64ccf3ad44a3d33da4bf`.

The user requested author/time headers such as Codex | hh:mm. Conversation
headers now show a browser-local24-hour clock for user, Codex, Claude and
Coordinator messages, with full date/source tooltip. Native Codex item start
times and available Claude native message times are preserved. Completion-only
times are a fallback for untimed history, not a reason to move an existing live
receipt time. Live received/sent times remain stable through streaming, final
replacement and same-ID history refresh; native start time can supersede them.

Historical items without an available timestamp show an unavailable marker.
The official Claude SDK history interface can omit timestamps even when native
JSONL has them; no direct transcript parser, inference from reload time or new
timestamp store was added. Existing native history/permissions remain intact.

All200 application tests and production build pass, with eight new checks for
provider mapping, streaming/refresh stability, invalid/unknown timestamps and
24-hour/timezone rendering. Interactive browser/live provider review remains
unperformed. No model call, host service change or running restart was used.

## 2026-11-05 — Copy controls, concise coordinator concerns and branch return in 0.24.0

Implementation: `39b976a3f1c11db49ce36bef78a1e9a8163f91a7`.

The user requested copying complete messages beside Branch here, separate code
block copying, and a simpler icon-style logo. Browser clipboard controls now
copy exact message/code text with visible success/failure feedback and accessible
labels. Supported legacy copying is used only when the browser clipboard API is
absent; native permission rejection is not retried. The generated cyan tower
icon replaces the header/favicon asset; the reproducible prompt is documented.

The user found non-approval feedback too long and complicated. Saved coordinator
instructions, event reminders and the actual rationale tool-field description
now ask for the action, concrete concern and needed decision/next step in two or
three short lines, usually about sixty words or fewer. Worker approval cards
preserve those line breaks. Existing rationales are not truncated or rewritten;
review evidence, permissions and outcome distinctions remain authoritative.

A restored child displayed as idle could fail handoff because native notLoaded
was rejected by the summary guard. Explicit summary/return now activates through
the existing native resume path and rechecks the actual state before proceeding.
Restoration alone remains read-only. Named errors distinguish child questions,
active responses and unavailable sessions, while parent errors retain their
separate identity. Native requests are not answered or bypassed to return a
branch, and confirmed delivery/archive retries remain protected.

All209 application tests and production build pass, including exact clipboard
content/denial/cleanup, code blocks, rationale preservation and restored child
activation/replayed-request regressions. No browser executable was available
for interactive clipboard/layout checks. Live coordinator wording, live summary
return and the running installation remain unverified; no restart occurred.

## 2026-11-05 — Retain Beads tracker routing in user services in 0.24.1

Implementation: `a7670529bc996896ecead487fb0a00679b6cbdbc`.

Installed-app task reads failed with no Beads database while worker CLI commands
could resolve the existing shared tracker. Read-only inspection found that the
user unit retained PATH but omitted the terminal/agent tracker routing. Service
generation now explicitly preserves supplied BEADS_DIR and
BEADS_DOLT_SHARED_SERVER, without choosing another database, copying credentials
or initializing/migrating a tracker. Reinstallation without runtime options
continues to preserve the old unit; explicit registration refreshes it.

The Tasks header now withholds totals until the tracker is ready. A failed
Link tasks lookup says loading failed instead of suggesting there are no
matches or work should be created. Existing error detail, input/save guards and
conversation associations remain unchanged.

All210 application tests and production build pass. The new fixture verifies
explicit routing, excluded passwords, no automatic start, preserved old units,
explicit replacement and omission of unset routing. The live unit was read only;
refreshing its saved environment and verifying real task reads remain pending
because the installed home directories are outside this session writable roots.
No service restart, database initialization or data migration was performed.

## 2026-11-05 — Clipboard images and saved report instructions in 0.25.0

Implementation: `a4c30659cf7150d777e9f767738721bb6b2e7196`.

The user approved Ctrl+V image input and memory-only unsent drafts. The composer
now shows removable previews and supports image-only or captioned messages for
local Codex and managed Claude. Per-chat draft IDs bind asynchronous reads and
send acknowledgements to the original chat; newer typing/images are retained.
Tab switches preserve drafts, refresh discards images, and text keeps its
existing browser persistence. No attachment database or upload directory was
introduced. Native provider history owns sent image content.

A shared limit definition bounds images to four,4MiB each/8MiB total, with
supported image signatures and canonical base64 checked before dispatch. Only
the authenticated message endpoint accepts12MiB JSON; other controls retain
64KiB. Native image history is mapped to existing message records. Authenticated
message/index URLs serve bytes while snapshots carry references, avoiding
repeated full image payloads in live events. Remote URLs/local paths are not
fetched/read. Native Codex receive capacity is bounded at64MiB for image-bearing
history; a protocol fixture exceeds the old16MiB cap. The generic nginx example
permits12m request bodies; no live proxy or host configuration was changed.

The user also reported missing periodic reports. Interval instructions previously
waited for idle and could sit behind ordinary summaries. They now share safe
active-turn priority with Report now and support explicit retry of failed
settings without automatic retries or crossing failed/in-flight barriers. Saved
intervals are supplied in native startup/new-turn instructions, so a resumed
worker can reconcile its cadence without another radio change or chat replay.
Read-only restoration, native questions, pause, permissions and ownership remain
protected. Agent-managed timing stays selected; no CCNG report timer was added.
A one-time prompt/saved radio does not prove real recurrence. Codex can use
available timing while active; a documented app-server idle scheduler has not
been established. Native timed-report and runtime-shutdown recovery verification
remain unfinished, rather than claimed fixed by delivery changes.

All231 application tests and production build pass, including clipboard/draft
behavior, provider image forms/SDK history, authenticated HTTP image access,
large native image history, queue priority/retry and restored cadence context.
An expanded HTTP fixture lacked Beads.context and was corrected before the
final pass. Installed Codex schema generation confirmed image URL input shape
without a model call. Browser paste/live model and timed recurrence checks
remain unperformed. No running installation, systemd unit, native permission
or live service was changed.

## 2026-11-05 — Silent CCNG report timer and startup recovery in0.26.0

Implementation: `09b9f37bcbc11c47a92a543713c62e03dd55da69`.

The user explicitly replaced agent-owned reporting loops with a CCNG timer and
required silent internal communication in worker/coordinator chat plus automatic
startup use of saved intervals. The existing coordinator backend now owns one
shared timer and per-worker deadlines using the existing private workspace
settings. Enabled restored sessions queue one initial report after restoration,
then continue at their selected interval. Refresh/reconciliation is idempotent,
interval changes reset deadlines and missed slots do not cause report bursts.
No coordinator model call is made per timer tick or scheduled-report completion.

Reports reuse native queues and safe active-turn delivery. Pending requests,
pause, ownership, availability, permissions and handoffs remain protected. One
report is outstanding per worker; Report now coalesces with timer work and
survives Never. Failed/in-flight requests are not silently retried/discarded.
A new live completed four-section Standard Task Report can release report
bookkeeping within a long-running turn, allowing later intervals without ending
the job. This bounded recognition changes no task status or approval authority;
stale, partial, quoted/code and unrelated-turn content cannot satisfy it. Native
turn completion remains the fallback.

Internal inputs are hidden in CCNG presentation using native client IDs/typed
text metadata and official Claude SDK synthetic inputs. Those inputs still reach
the model; native history is retained. Actual reports, ordinary summaries and
identical real user text stay visible. Workers receive one-off report semantics
and cancel older agent-owned report loops to prevent duplicate timing.

The user separately rejected an additional Claude daemon/service after a
read-only SDK/native lifecycle assessment. Current SDK queries still stop with
CCNG; saved history is not uninterrupted execution. Native background commands
exist, but supported local SDK detach/reattach is not established. No lifecycle
service, detachment workaround or runtime change was implemented.

All246 application tests and production build pass. Tests cover fake-clock
cadence/coalescing/lifecycle, saved startup/restore, native/SDK hidden-history
metadata, active-turn report completion and unchanged native request guards.
Installed native source confirms synthetic prompts enter the normal query queue;
SDK native-history fixtures verify hidden meta inputs while preserving outputs.
Interactive browser/live model cadence and running-installation update remain
unverified. No live service restart or native permission change was performed.

## 2026-11-05 — Current startup dashboard and report intervals in0.27.0

Implementation: `cfb0484f8b27670fc89a232a6a0e1b4a759d3bfa`.

The user requested current worker summaries/task progress after startup and
visibility of required report intervals. After saved-state loading, the backend
queues one silent startup report per restored worker, including a one-off for
Never. Existing timer or Report now requests are reused without changing saved
intervals or deadlines. Reconciliation remains idempotent, and Never continues
to disable periodic reports rather than this explicitly requested startup summary.

The coordinator is notified to read current native history, stored tasks,
questions, report intervals and next due times. It publishes available evidence
to sidebar progress immediately and applies finite throttled updates as each
fresh startup result arrives. Blocked/external workers do not gate others.
Paused/unavailable coordination retains its intent; failed native requests stay
visible without automatic retries. Startup status is separate from actual work
completion and Beads task state.

Git-saved prompt guidance tells new/reused coordinators to use progress tools,
qualify missing evidence and avoid instruction echoes, duplicate requests and
chat recap loops. Worker overview cards display saved1h/15min/5min/Never or
Unknown. No new service/store, interval inference, worker implementation scope
or native permission expansion was added.

All251 application tests and production build pass, including57 coordinator
and15 restoration checks. Tests cover coalescing, paused startup with one
blocked worker, progressive refresh, preserved deadlines, restore-phase ordering
and sidebar publication. Running-provider/model recap quality and browser/live
startup acceptance remain unverified. No service restart was performed.

## 2026-11-05 — White airport control tower in 0.27.1

Implementation: `8b9e520996af082c27379d72ad803d144289c236`.

The user rejected the cyan icon and requested white artwork with a recognizable
airport tower. The shared header/favicon PNG now depicts a wide three-window
cabin, projecting roof, tapered shaft and base on the existing graphite
background. Transparent generation attempts had rough edges and window artifacts;
the clean opaque result was selected. The final prompt and built-in generator
provenance are documented in docs/brand-assets.md. Previous integrated icons
remain tracked or recoverable in Git history. No runtime logic, dependency or
service ownership changed.

Visual inspection, production build, version consistency and the built asset
checks passed: header and favicon reference the same unchanged PNG bytes. PNG
content-provenance metadata was retained; no private source paths or conversation
identifiers were found. An initial overly restrictive metadata check rejected
the provenance chunk; inspection established its purpose and the focused check
then passed. No new tests or full-suite rerun were needed for this asset-only
correction. Browser appearance and installed-app update remain unverified.

## 2026-11-06 — Schematic operations-console icon in 0.27.2

Implementation: `942fe35dcb905993b7f1ada55585243402ef5980`.

The user requested an operations-center symbol instead of a tower: a curved
control console with switches/buttons and a matching arc of monitors, very
schematic. The new shared header/favicon PNG uses three blank screens and three
button marks in white on the existing graphite background. The built-in image
generator produced the asset; its exact prompt is in docs/brand-assets.md.
Earlier integrated icons remain available in Git, and the white tower's prompt
was preserved. The image reference variable now describes the brand rather than
a tower; rendering, accessibility and layout behavior are unchanged.

Visual inspection of the generated asset, production build, whitespace checks
and focused version/asset checks passed. The built header and favicon reference
the same PNG bytes. Content provenance is retained, with no private source paths
or conversation identifiers found in the PNG. No dependencies or new tests were
added; the full application suite was not rerun for this visual asset change.
Actual browser appearance at small sizes and installed-copy update remain
unverified; no live installation or service was changed.

## 2026-11-06 — Preserve the accepted icon and remove its background in 0.27.3

Implementation: `1a39c45bf5e1146e8f9a28c16a78fbd38a95d11a`.

The user approved the console design but required a transparent background for
the very same icon. Two built-in generative background edits introduced speckles
and changed negative spaces; neither was integrated. The user then approved a
direct pixel conversion using existing Node.js standard-library tooling, with
no tool installation or application runtime helper. The original dimensions and
foreground contour were retained, opaque foreground RGB was preserved, and
dark negative spaces now have alpha zero. Edge alpha is described in the brand
notes. The original image and generation prompt remain recoverable in Git.

The 1254 by 1254 output has 1,343,881 fully transparent pixels, 219,512 opaque
pixels and 9,123 antialiased pixels. Checks against the prior committed image
confirmed the same foreground contour and opaque RGB, plus transparent screen
interiors and outer background. The separate checkerboard composite was
visually inspected; it is not part of the final asset. Production build, shared
header/favicon asset checks, version metadata and whitespace checks passed.
The full application suite was not rerun for this asset-only change. Installed
application appearance remains unverified; no live restart was performed.

## 2026-11-06 — Record requirements for future agent and harness integrations

Documentation implementation: `c53e67217d982a13fe64fc579ecd27db103520a2`.

The user requested a reusable reference before considering additional agents or
harnesses. The new agent-harness requirements document traces current source,
tests and decision history into native session/history/control requirements,
project and permission boundaries, questions/approvals, instructions, tasks and
reports. Capability-gated features and current gaps are explicit; a model name
alone is not a managed runtime. It records the superseding backend report timer
and rejected additional Claude daemon, without claiming other products are
supported or selecting a new architecture. README links the reference.

Independent read-only reviews checked Claude/runtime claims and decision
provenance; the final wording preserves mandatory structured questions and
closed-tab callback ownership. GFM tables, relative source links and public-data
checks passed. No integration, native session, dependency or permission changed.

## 2026-11-06 — Interrupt the visible agent with Escape in 0.28.0

Implementation: `1f7dc8f42a65615b9e3f7570cd8e747303b82bb0`.

The user requested Escape as a stop control. It now shares the existing Interrupt
action for the visible connected Codex/Claude turn, with a visible Esc hint and
accessible shortcut metadata. Native request and ownership protections are
unchanged. Local Escape behavior is preserved for dialogs, question controls,
selects, summary review, tab dragging, resizing and text composition; modified,
repeated and in-flight duplicate interruption requests are suppressed. Drafts
and other tabs remain untouched. Interrupting does not undo completed work.

All258 application tests and the production build pass, including seven new
keyboard checks and existing native protocol/installer fixtures. Earlier
redirected and direct-per-file invocations hit fixture socket/home restrictions;
the established ordinary npm test invocation passed without permission changes
or test bypass. GFM/source-link and whitespace validation also passed. No live
agent was interrupted for testing, and interactive browser acceptance or an
installed-copy update was not performed. User-level systemd operation was
separately confirmed by the user, not inferred from these tests.

## 2026-11-06 — Add three themes and task attention controls in 0.29.0

Implementation: `f11242fe1080b4212055ee24a4ce61e7d21d1854`.

The user chose classic, contrastful and light themes. Classic preserves the
original palette; the other themes address measured weak text and control
contrast. A compact palette menu uses existing browser preferences. Logout
follows the branding, while Add agent and its count form one group.

Tasks needing real input appear first, with dependency-waiting work remaining
Queued. Ordinary recorded questions now appear once in Tasks with a Question
label. Native requests stay in Open questions. Input dialogs show explicitly
recorded context, input type and exact input needed, with truthful clarification
for older vague records. Worker instructions require those description fields.

The user approved per-task Notify me controls, after the state near the title,
with in-app alerts and optional native desktop notifications. Existing live
snapshots supply observed transitions; subscription IDs use browser workspace
preferences rather than a new service or database. Initial/restored observations
are baselined, not replayed. Missing records are not completion evidence.
Worker-level requests/errors remain worker-scoped when task ownership is unknown.
Desktop permission is requested only through a user gesture, desktop text stays
generic, and in-app alerts remain usable when desktop access is unavailable.
Delivery requires the page to remain open; cross-window deduplication is absent.

A deployment-focused report had omitted a delegated audit. Saved instructions
now require every active workstream, including delegated audits, research,
documentation, verification and publication, without extra commands solely for
reporting. Concise grouping must not silently omit unchanged active work.

The user also approved native Goals execution with CCNG controls and made native
Goals a requirement for future full managed integrations. The reference and
project guidance record that choice. An isolated, tested Codex protocol adapter
is preparatory; no Goal route, UI, continuation engine or automatic activation
is included. Claude Goal confirmation and control integration remain unfinished.

All 322 application checks and the production build pass. A read-only independent
review found no concrete notification defect. Verification covers preference
compatibility, contrast and menu keys, task ordering/context, transition
baselines and native desktop permission/privacy handling. Actual rendered
desktop/mobile layouts, browser permission prompts and OS popup delivery remain
unverified. No installation, live Goal or AAP rollout was changed.

## 2026-11-06 — Prioritize coordinator input needs in 0.30.0

Implementation: `ed2b4738c5c4db3e0073e8f27bb5bd1c4b32afb6`.

The user values the coordinator's clickable project overview but wants pending
input ahead of implementation details. Each project card now places its report
cadence beside the name and shows every current Needs input task title instead
of the progress recap when such tasks exist. The label and titles use the same
amber theme token as worker task totals. The native activity badge and whole-card
tab navigation remain independent.

The card reads only its worker's ready tracker and derived display states.
Queued dependencies and unavailable/stale rows do not become input questions;
cards without recorded input needs retain the existing summary/goal. The small
component separates this presentation from the application shell without adding
backend state, requests, model calls or dependencies.

All 330 application checks and the production build pass, including eight new
card checks for priority, multiple requests, queued/unavailable exclusions,
worker isolation, navigation, cadence placement and escaped text. Actual rendered
desktop/mobile layout remains unverified; the installed application was not
updated or restarted.

Separately, the user moved all remaining Claude integration and live validation
to Todo. Existing SDK code and completed research/fixture evidence are retained,
while Claude Goals/rewind are consolidated into that unfinished provider work.
Codex Goals and Codex Edit & rewind remain separate. The existing deployment
input record was transferred to AAP AutoDeploy by user direction; native history
shows it originated here for the Command Center rollout, not as an imported AAP
question. Label-filtered reads verify the transfer without resolving credentials.

## 2026-11-06 — Reconcile project backlog evidence

Documentation correction: `3518b73eabdff853e8f0ae4b85b82aeca5950982`.

The user challenged a Todo recap limited to the current conversation. The audit
checked all 61 project-epic descendants, standalone/branch-associated Beads
records and current Git requirements, implementation history and source. It
recovered the older branch's open rendered visual review and recorded three
documented gaps: future durable decision summaries, real fresh RHEL 9 installer
acceptance, and live report/dashboard/notification checks. They are tracking
records, not authorization to implement storage, run providers or change hosts.

The README incorrectly called delivered model controls unfinished, and the
handover copied an outdated task-status table. Corrected the current wording and
removed that duplicate backlog, keeping version-specific historical notes
explicitly historical. Existing implementation records for model controls,
fresh Dolt/Beads, ordinary-chat questions, handoff errors and the testing route
remain closed. Claude remains postponed; rollout ownership remains with AAP
AutoDeploy. Native history/source evidence, rather than age or task state alone,
guided the distinction.

This is documentation and task reconciliation only. Whitespace checks pass;
application code/version remain 0.30.0 with the previously verified 330 checks
and production build. No live acceptance, installation, service or runtime
configuration changed.
## 2026-11-06 — Native saved approval choices for Codex

Implementation: `8d06dab79c31b714e9b622650282755eec039c65` (0.31.0).

The user requested Allow always alongside Allow once through the provider's own
permission management, then explicitly limited this work to Codex. The interface
now exposes exact offered command-prefix, network-host and native MCP-tool rules,
showing each scope before submission. Native session choices retain their own
label. Ordinary MCP forms, turn-only filesystem/network permission requests and
file approvals do not acquire invented permanent permissions.

One shared choice validator serves the interface and backend. Answers must match
the current worker/request and offered proposal; native confirmation still owns
request resolution. Codex owns saving and enforcing rules in its existing user
settings, which may affect other matching sessions. CCNG adds no permission
store or settings-file writer. The coordinator cannot choose reusable approvals
or expand its own tool/access permissions. All Claude work stays postponed.

Native save warnings are displayed for their worker, or globally when unscoped.
A resolved action is not independent disk-save proof: native persistence can
fail while the current action proceeds, and MCP may fall back to session access
without a separate client confirmation. The interface states these limits.

All 358 application checks and the production build pass, with exact payload,
scope, stale/forged rejection, HTTP/native acknowledgement, coordinator and
warning-isolation coverage. Two bounded independent reviews found no blocking
defect. Actual browser behavior and deployed native saving remain unverified;
no real approval, native permission/configuration change or update/restart was
performed to obtain this result. Live acceptance remains separately tracked.

## 2026-11-06 — Return to the chat draft after manual approval

Implementation: `71585f27fe5a8751653245fc3bf7499297fd4662` (0.31.1).

The user confirmed this request belongs to Command Center after withdrawing an
unpublished attempt in another conversation. A successful manual Codex approval
now returns focus to its editable chat input, with the caret at the end of the
current draft and without scrolling. The native answer must be confirmed first;
Decline, Cancel, review requests and failed answers do not move focus.

The interface captures the originating input and current tab/dialog revision
before sending. A later tab or dialog change cancels focus return, including
switching away and back. Hidden pages, locked/detached inputs and another
worker's composer are excluded. Focus is never queued for a later render.
Existing native permission and coordinator behavior stays unchanged; Claude
work remains postponed. No new dependency, backend API or storage was needed.

All 366 application checks and the production build pass. Eight new regressions
cover positive decisions, failure/refusal/review, delayed tab/dialog changes and
draft/caret/scroll preservation. Independent bounded review found no blocking
defect. Actual browser interaction remains unverified because browser tooling
was unavailable; no real approval, permission change, installation update or
restart was performed for validation.

## 2026-11-06 — Contain invisible copy announcements in long histories

Implementation: `dfc1fc68cbf58f8adbcde2e2dd549c2fed41fc6a` (0.31.2).

The user reported an outer page scrollbar and empty space below the bounded
workspace. Independent source reviews found the hidden copy-result live region
was absolutely positioned without a positioned ancestor inside the chat.
Every message/code copy control emits this element, even while empty. Such
descendants can escape intervening scroll-container clipping when their
containing block is outside it, as described by the
[CSS overflow specification](https://www.w3.org/TR/CSS22/visufx.html#overflow-clipping).
The installed older version and current source share this defect.

Each copy wrapper now establishes the containing block and pins its hidden
announcement inside it. This is a small correction to the offending element,
preserving live-region accessibility and normal chat/sidebar scrolling instead
of hiding overflow on the whole document. No runtime, dependency or storage
change was needed.

All 366 existing application checks and the production build pass, including
existing clipboard behavior checks. Independent review identified the same
source/spec cause. Browser tooling was unavailable: the reported layout was
not reproduced or verified after the fix, so this remains a strong source-level
diagnosis rather than confirmed rendered acceptance. No installed application
was updated or restarted during implementation.


## 2026-11-07 — Repair the existing selected AAP deployment path

Implementation: `d2b94227cde6ab43f35f5d094f45d3813d8681be` (0.31.3).

The shared CaC importer supplies one selected instance's whole-file runtime
ciphertext to the existing application job. Native Ansible loads only documented
inputs and removes its temporary file. Inventory-supplied approved SSH keys are
prepared through delegated `known_hosts` before minimal facts and the existing
RHEL guard; original host variables are selected explicitly during delegation.
The separate base bootstrap owns the existing Git/Vault credentials.

Two observed bootstrap failures are corrected: native home telemetry alone no
longer masquerades as an existing Beads tracker, and the application PATH includes
the maintained installer's Dolt directory. Actual tracker/configuration and path
protections remain. The VM checkout also accepts credential-free HTTPS with normal
Git TLS, correcting an SSH rule that applies to agent-side Git operations. Existing
SSH checkout remains supported. No new Git identity or authentication source is
created. The app owner reserved its next minor release for separate feature work,
so this existing-capability repair is published first as a patch.

Validation passed 367 Node checks, 11 native deployment fixtures, strict production
lint for all 18 Ansible files, syntax/diff checks and the optimized production
build. The delegated fixture uses distinct target and localhost addresses/ports,
writes the target pin and preserves unrelated trust. Actual AAP import/deployment,
initial app authentication and native Codex sign-in remain separate acceptance
steps; no installed app was started or changed by these checks.


## 2026-11-07 — Installed configuration, optional TLS and clear worker activity

Implementation: `283692d29b8a8bdc4580f5cac0673701929431c2` (0.32.0).

The user selected HTTP as the ordinary installation/runtime default and a small
plain-text config under INSTALLDIR/etc. This supersedes the earlier HTTPS-default
and separate private-home config proposal. The installer creates commented HTTPS
certificate examples before active HTTP, accepts --prefix with a home-directory
default, and preserves existing settings, certificates and tools on updates.
Foreground and systemd startup read the same file; explicit CLI/environment
settings retain priority. Full YAML was deferred, so no parser dependency was
added. Unsupported files fail safely, including nonblocking FIFO rejection.

Optional native HTTPS validates certificate format, dates, matching private key
and browser identity, with no silent HTTP fallback. An omitted listening host
selects the Linux default-route IPv4 interface, reports the interface/address and
allows explicit overrides. The CaC-style app playbook can create/reuse a
self-signed backend pair under INSTALLDIR/etc/certs, verify all configured
backend/browser/health identities and write HTTPS settings. All actual deployment
settings remain in the encrypted private companion. Nginx is owned/completed in
the other conversation; duplicate draft proxy work was excluded from this release.
Live deployment acceptance belongs there and was not performed here.

The user ultimately required native Codex setup in both installer and deployment,
with read-only startup checks. Native commands own feature persistence. Missing,
unsupported or unsuccessful setup warns and continues; the development-feature
caveat is retained. Deployment may provide the pinned CLI locally when absent.
No direct native TOML edits, warning suppression or automatic daemon/worker
restarts were added. Existing logs remain stdout/stderr and systemd journals.

A compact fixed chat header identifies the current chat and its browser-local
four-colour choice on the left, with Codex receipt/activity/connection information
on the right. Receipt is confirmed only after native acknowledgement. Real worker
updates and transport heartbeats remain separate; disconnected/delayed activity
is last-known and silence never invents a stuck diagnosis. This addresses input
uncertainty and mistaken chat selection without additional worker pings.

All449 application checks,24 isolated native Ansible checks, strict production
lint and the production build pass. Independent reviews prompted concrete fixes
to non-file handling, exact comment ordering, safe warning visibility and complete
SAN coverage. A targeted scan of159 intended files found no known private
environment or credential patterns; normal public project/Git identities remain.
These checks establish source behavior, not rendered phone/desktop acceptance
or a live deployment. No running installation, service, proxy, native permission
or model execution was changed for verification.


## 2026-11-07 — Resize input and shorten overview requests (0.33.0)

Implementation: `fad77316cde9e30c5bbf237694b7b8a8562d22c0`.

The user clarified that the title/colour/status strip belongs directly above the
input, below history. It now stays inside the composer, with a draggable divider
that resizes the whole input area. Keyboard controls, cancel/reset and available
history bounds follow existing divider conventions; height is saved in existing
browser preferences rather than another settings store. Upper-right branding is
preserved.

The overview now begins with the project name without GOAL, and all its fonts
are one pixel larger while retaining their families and size hierarchy. Sidebar
recaps aim for 20 words and permit at most 25 combined across summary, blocker
and next action. Overlong publications are rejected for correction without
mutating existing progress. Legacy long recaps keep a short, honest preview and
full originals under expandable details; questions and approval scopes remain
unchanged.

The user approved Needed/Why as the default input-request format. Worker and
shared instructions require a direct question/action first, then a short reason.
The task dialog bounds verbatim legacy previews and keeps commands, background
and original records under Details. Its clarification button explicitly requests
the same format from existing workers. This changes presentation and guidance,
not native permissions or AAP deployment state.

All 469 application tests and the production build pass. Independent source
reviews found no blocking issue; rendered browser acceptance remains unverified.
A stale installer expectation from the previous Codex pin update was corrected.
Redirected test invocations reproduced different sandbox restrictions, while the
established ordinary npm test invocation ran and passed the full suite without
permission changes or test exclusions. A targeted staged-source scan found no
known private environment or credential patterns in the 24 changed files.
No running installation, service, proxy, native permission or model was changed.

## 2026-11-07 — Keep native approval buttons at their shorter height (0.33.1)

Implementation: `35469d671416b4a11c4d58c65898cdb0bcd6e46e`.

The user reported Allow once wrapping onto two lines and becoming taller than
Allow always. Source inspection found a non-wrapping flex row squeezing the
scope-free choice beside a longer saved-rule scope. Approval choices now wrap
as whole groups, retain their minimum content width and keep button labels on
one line. Existing button padding, typography and the shorter single-line height
are retained. The scope text can still wrap. All changes are confined to native
approval layout; decisions, saved rules, click handlers and disabled/read-only
guards remain unchanged.

The 26 existing approval-control and approval-choice checks pass. The production
type check and build pass at 0.33.1 using Vite's existing native config loader,
which avoids writing bundled-config temporary files through the preserved
dependency symlink. Package, lockfile and runtime versions agree; diff checks
pass. Primary source review accepted the scoped CSS correction. No browser
binary was available, so rendered desktop/mobile verification remains pending.
No live installation, native approval or service was changed for verification.


## 2026-11-07 — Restore HTTPS tunnel login and two-address startup (0.34.0)

Implementation: `03a4fef944856dd4f75f3c788c73229f3403eb3a`.

A user accessing the app through a localhost HTTPS SSH tunnel could not log in
when installed configuration specified the public proxy origin. The request was
rejected before password verification. Keep that public origin exact, while
also accepting a canonical matching HTTPS Origin/Host and port on an explicitly
local listener with native TLS and both actual socket endpoints on loopback.
The same check covers login, logout and authenticated mutations. No HTTP
downgrade, forwarded-header trust, certificate exception or authentication
bypass was added.

The user explicitly approved default startup on exactly the one IPv4 address
chosen for the default route plus 127.0.0.1 at the same port. Explicit host settings
continue selecting one address. Both listeners share the same Node process,
authentication, sessions and workspace; failed partial startup rolls back the
listeners and shutdown closes both. Startup logs/help and installation guidance
explain the two addresses and preserved explicit host overrides.

The concurrently published approval-button height fix is preserved unchanged
from 35469d671416b4a11c4d58c65898cdb0bcd6e46e / head 0ac4b4e. All 480 application tests
and the build pass after integration. Actual TLS tests cover tunnel login,
public-origin login, shared sessions, logout and origin rejection; listener
checks cover exact address selection, an unused third address, explicit single
binding, shutdown and second-bind rollback. A fixture was corrected to make
fresh HTTP connections when checking post-shutdown refusal rather than reusing
a closing pooled connection. Independent source review found no origin-control
blocker. A targeted scan found no known private values in 14 changed files.

No live configuration, service, certificate, password or proxy was changed.
Installed-browser login awaits the user's update/restart and retest. Password
initialization remains a separate pending decision and is not part of this fix.


## 2026-11-07 — Persistent colour on the input header tab (0.34.1)

Implementation: `acb3293875432387f3d864a58b6908731005dd5b`.

The selected chat colour previously affected a small marker and the colour
selector's focus outline, making identification unclear after moving focus into
the input. The user clarified that only the background of the tab directly above
the input should be coloured. Its existing per-chat value now supplies a
persistent theme-compatible background tint and matching border. The composer
frame and top agent tabs retain their existing styling; text sizes, status,
wrapping, drafts, persistence and resizing are unchanged.

All 481 application tests and the production build pass. Static palette/cascade
checks cover four colours across three themes and preserve readable text; actual
rendered browser acceptance remains unverified. No live service or configuration
was changed.

A first-time walkthrough was added to the installation guide after checking the
current installer. It explains separate source/install directories, confirmed
prerequisites/native setup, the application password, optional Beads/local Dolt,
native Codex startup, browser access and user-systemd management. The current
installer still asks for a chosen password; mandatory first-login password change
remains separate unfinished work. The user's supplied installer update command
is supported with its positional destination. Earlier advice passing --update to
the installed application launcher was incorrect; no historical launcher
regression was established.

The earlier login task was closed after attributed actual user confirmation that
both external and localhost access work. That outcome does not establish broader
application/mobile acceptance or reverse the rejected production-setting removal.


## 2026-11-07 — Preserve line breaks in pasted user text (0.34.2)

Implementation: `37a88f337b58033504c37c3ddd20546083ecdf63`.

A user's pasted terminal output displayed as a single paragraph. The message
source and Markdown renderer retained newline text nodes, but normal paragraph
whitespace collapsed them in the browser. User-message paragraphs and list items
now use pre-wrap, preserving soft line breaks and spacing. This display-only
correction keeps normal Markdown interpretation, fenced code/tables, exact copied
source, assistant formatting and stored native history. It does not classify,
execute or rewrite clipboard content. Literal syntax and column alignment can
still use the existing fenced-code support.

All 32 focused UI checks and the production build pass, alongside synthetic
renderer checks confirming retained newlines. The preceding 0.34.1 release passed
the full 481-test suite. No backend or dependency changed for this two-line CSS
correction; a repeated full backend/network suite was unnecessary. Actual
rendered browser acceptance remains unperformed, and no running installation or
configuration was changed. The persistent header background fix and first-time
walkthrough from 0.34.1 remain included.


## 2026-11-07 — Make mobile a continuous page with bounded text areas

The user approved natural page scrolling instead of retaining the desktop's
viewport-height workspace on a phone. Worker tabs wrap, the full-width overview
comes before chat, and history/input retain their own scroll areas after about
30 and six text lines respectively. These limits keep long conversations and
pastes manageable without clipping controls to a phone's viewport.

Implementation `bcf49e16ed80582b674c3583cc336aee3e87b8ce` (0.35.0) hides mobile resize handles and the
worker Coordinator recap, retaining the actual coordinator dashboard and stored
desktop dimensions. The same layout applies to wide landscape coarse-pointer
devices. Finger gestures no longer enter tab reorder capture; mouse/pen dragging
and explicit arrow controls remain. A measured CSS variable lets the three-task
viewport return on mobile even when desktop overview sections have saved sizes.

The existing 483-test suite, four new mobile layout checks and production build
pass. These cover gestures, compact composer markup and responsive source/cascade
behavior, not real browser layout. Phone keyboard, rotation, long-paste rendering
and saved desktop-size acceptance remain unverified. No production service,
proxy, native settings or installation was changed; mobile notifications remain
postponed.


## 2026-11-08 — Retain user-chosen setup passwords and align supported lengths

The user withdrew the proposed shared initial password and forced first-login
change. Fresh setup uses a user-chosen password and updates preserve configured
authentication. The interactive installer already prompts for absent auth;
headless staging is possible, but startup refuses to listen without valid auth.
The existing Ansible password task requires protected input for first creation
and preserves an existing private owned profile. No first-access channel choice
or bootstrap-password implementation remains pending.

Verification found an existing mismatch: setup accepted up to 4,096 characters
but login rejected more than 1,024. Implementation `71fa8572193901028245475fca101d85f4fc0eb3` (0.35.1) aligns
creation/login at 4,096 actual characters and allows one final LF/CRLF in bounded
stdin input. Oversized replacements fail before modifying a stored profile.
Existing scrypt format, ownership checks, origin protection, sessions, throttling
and cookies are retained; no password is reset by this patch.

All 489 application tests and the production build pass, including real CLI and
HTTP regressions. Two existing real Ansible password fixtures also pass,
confirming first creation, preservation and symlink refusal. Independent source
review found no concrete issue. These checks do not establish installed-app
acceptance or change any production authentication/service. The withdrawn
proposal is recorded as withdrawn rather than completed implementation.


## 2026-11-08 — Give mobile chat more space with a compact overview

The user explicitly chose mobile only after requesting a substantially smaller
overview than the earlier layout. Desktop defaults and saved sizes are retained.
Implementation `02a8f79e4330474dc58ef81ff3f02cb21e84237c` (0.36.0) reduces mobile padding/section gaps,
puts task totals in a wrapping heading row and omits empty question sections only
when no requests or attention/recovery state exists. The same checks cover
worker and coordinator views; actual requests and input-needed titles remain
visible. Static coordinator guidance and excess project-card spacing are reduced.

Mobile worker settings start as one native disclosure row with the current
cadence and an always-visible Report now. One expansion exposes cadence radios
and model/effort controls. They stay mounted across layout changes; report
queue/pending/error feedback stays outside the collapsed body. Desktop retains
the original open controls, Report now after Never and feedback order. Both
responsive Report now buttons share delivery/disabled state, with only one
visible and keyboard reachable in each layout. No new store, scheduler or
framework is introduced. Font sizes, three-task viewport, history/input bounds,
drafts and native approval handling are retained.

All 498 tests and the production build pass; independent source review found no
concrete issue. Tests cover actual visibility conditions, responsive source
rules and component delivery/state behavior. They do not establish rendered
phone geometry, keyboard or rotation acceptance, which remain unverified. This
source release does not update or restart installed software.


## 2026-11-08 — Validate pasted working-directory paths before agent creation

A trailing space in the new-agent directory made creation fail because it was
passed literally to the filesystem. Implementation
`64c8b2376a3a552cff6129219f86ecebed877a1f` (0.36.1) trims surrounding whitespace in
the form and backend while retaining spaces within directory names. The backend
requires an existing absolute directory and gives useful validation errors for
missing paths, file components, embedded control characters, excessive length
and permission denial before calling either native provider. Symlink spelling
is preserved. This does not expand shell expressions, create directories,
change access controls or override native agent settings.

Seven new regression tests exercise normalized paths, rejection without native
side effects, existing symlinks and real permission denial. Their temporary
permission fixture restores access before cleanup. The full run also revealed
an existing startup-report assertion that assumed ordering between independent
worker deliveries; it now checks the exact worker list without assuming order,
still rejecting duplicates or omissions. Runtime report behavior is unchanged.

All 505 application tests and the production build pass. Independent source
review found no concrete issue. Actual installed-browser acceptance remains
unverified; source publication does not install or restart a running instance.


## 2026-11-08 — Deploy published minor CCNG releases through AAP ad hoc

The user explicitly requested production deployment after minor releases through
AAP ad hoc. Instruction/documentation commit
`ca877ad2ecf28bec7c56b648305f89a8a81332a1` saves that maintainer workflow: update the
existing installation, restart its service only after update success, and verify
actual installed/running results with relevant functional checks. Preserve
configuration, authentication, certificates and native profiles. This does not
introduce application self-updating, new services, infrastructure changes or
authority to bypass native permissions.

Applied to current 0.36.1, the AAP preflight completed with a sudo denial. A
second read-only operation confirmed the selected Machine login cannot access
the application directory. No installation or restart occurred, and no sudo or
credential change was attempted. A structured question requests an existing
credential with suitable access; deployment remains blocked on that input.
The code and dependency baseline are unchanged from the passing 505-test/build
release. Documentation whitespace checks pass; deployment success is not claimed.


## 2026-11-08 — Add image selection and repair pending-request visibility in 0.37.0

The user transferred mobile Firefox image attachment and missing-request work
to this project conversation. Implementation
`e3a01ba6fefa45ee6e6fcacbcf444b1a7126f96e` completes the partial Attach image control
using the existing in-memory drafts, validation, previews and native image
delivery. A native multiple-file picker avoids dependence on clipboard image
availability. Its target is captured when opened so a later tab switch cannot
redirect the selected images. Cancellation and same-file retries are supported;
a native cancel listener uses React 19 ref cleanup rather than an unsupported
input event prop. No dependency, upload service or image store was added.
Pending requests still block sending while permitting draft attachments.

Investigation and deterministic failing tests identified three independent
request-visibility defects. Reconnect erased replayed cards after native resume
while retaining their pending-map entries, so duplicate replay could not restore
them. Reconnect now keeps the cards, and explicit recovery publishes exact
records already held by the current connection without another resume. Native
resolution/disconnection still invalidate records; no history-derived questions,
new identities or automatic answers are introduced. Continuous worker updates
also restarted the browser broadcast delay indefinitely; coalescing now delivers
the latest snapshot at bounded intervals. Finally, a slow initial browser read
or old-login callbacks could overwrite newer streamed state; cleaned-up effects
and superseded initial reads are ignored.

All 520 application tests and the production build pass, including new image
picker, authenticated handler and actual frontend-effect regressions. Independent
review found no concrete issue in the recovery and state-order fixes. The exact
triggering sequence of the historical report remains unverified, as do actual
Android Firefox and affected-runtime acceptance. At this checkpoint the selected
AAP deployment login still failed the sudo preflight; no installation, restart
or access-control change occurred.


## 2026-11-08 — Keep the README focused on the product and first use

The user rejected the main README's accumulated version narratives and asked
for what CCNG is, why it exists, main features, requirements and installation.
Documentation commit `a0bb7b590c17f752ad6029935c15c089cb7fcebd` reduces the README
from 1,344 to 148 lines. Current detailed workflows live in `docs/usage.md` and
concise chronological changes in `docs/release-notes.md`. The decision history
and a pinned archive link retain the original detailed release evidence, without
presenting superseded behaviour as current onboarding guidance.

The contributor instructions now require this separation so later releases do
not append new narratives to the product README. Current limits remain explicit:
local-only management, unfinished Claude/Goals/rewind and first-browser password
work, and the distinction between test evidence and live browser acceptance.

All three documents parse as GitHub-flavoured Markdown; all 28 local links and
five destination anchors resolve, and whitespace checks pass. No executable
code or version changed, so application tests/build were not repeated. The
previous 0.37.0 executable baseline still has 520 passing tests and build. No
installation, service or access change accompanied this documentation cleanup.


## 2026-11-08 — Verify production is current after deployment access is restored

The user confirmed required host sudo access was configured and renewed the
standing instruction to update production through AAP ad hoc after every minor
release. Elevated checks with the existing selected Machine credential now
succeeded. The existing installation was already current at the tested 0.37.0
implementation `e3a01ba6fefa45ee6e6fcacbcf444b1a7126f96e`, with all 92 checked source
files matching published payload `ce587a3fd29e191d5960425ce5d38095a8b09845`.

The actual running process reported 0.37.0 over trusted HTTPS. Its existing user
service was active, runtime files preceded process start, the served index and
two hashed assets matched the installation, state/events required login, and
both expected listeners were present. A redundant reinstall or restart was not
performed. No configuration, authentication, certificate, native profile or
access-control change was made by this agent. The user-provided access change
resolves the previous blocker and the standing deployment rule remains active.

These are real installed-app version, artifact, transport and access-gate
checks. They do not establish fresh native request recovery or Android Firefox
interaction; those acceptance records remain open. No new code/version changed,
so the existing 520-test/build baseline was not rerun.


## 2026-11-08 — Hand branch work back safely without holding the tab open

Implementation: `e7bb5e0e12d5363626609893d3d53a712baeecde` (0.38.0).

The user selected one-click Hand back & close, usable while work is running,
with background completion after leaving the tab. This supersedes the mandatory
idle-before-click and manual-summary-review steps for the new action. Back to
parent remains navigation only. The backend requests a safe checkpoint rather
than forcing interruption, checks spawned work, background terminals and native
Goals, and leaves pending permissions manual. Goal pause follows actual idle;
it is not assumed to be a safe way to interrupt a tool.

The user prioritized avoiding task or information loss. Every branch task gains
the parent label without losing branch provenance, metadata or state. Summary
receipt is verified against exact native identity, with a unique complete-message
reference when native history omits clientId. Fresh lifecycle and task-link
checks precede archive. Uncertain checkpoint/send/archive outcomes retain the
branch and avoid blind retries. Parent/child handoff serialization prevents an
outgoing parent summary from racing an incoming child result. Background closure
only navigates when that exact removed branch is still selected.

Coordination stays in the existing backend process; no new service, task store
or continuation engine was added. Restart does not replay in-memory handoffs.
Unsupported safety APIs and unresolved local work keep the branch available.
A full workspace needs another tab closed before an absent parent can open.
Unsent images block handback until sent/removed; unsent text remains local and
is explicitly excluded from the native summary.

The user separately narrowed chat colouring to a compact title folder tab
attached to the composer. Activity/connection text and the selector retain the
normal theme background. Blue replaces amber, which is reserved for attention;
teal and rose expand the palette to six. Existing amber preferences migrate to
blue without changing unrelated settings. All three themes retain readable text.

All 560 application tests and the production build passed. Final provenance
changes also passed 20 handoff, 58 coordinator and four source-review regressions;
the final CSS build passed. Focused independent review confirmed the identified
retry, receipt, serialization, legacy-path and capacity fixes. Actual rendered
browser geometry and native end-to-end handoff remain unverified. Publication
and installation are recorded separately from this implementation evidence.


Production outcome for this release: payload
`e22f020bd1400fe65007ebe5d211e3e49533fb93` was SSH-published and independently
read back, then installed through the existing authorized AAP ad hoc workflow.
The existing service restarted successfully. All 94 checked installed source
files match, actual trusted HTTPS health reports 0.38.0, both listeners and login
gates work, and the two served assets match. Eight protected configuration,
authentication, service and native-profile files retained their hashes. No
credential, certificate trust, proxy, permission or native-daemon change was made.
This verifies running installation and transport/access gates; browser rendering
and an actual native branch handoff remain separate acceptance work.


## 2026-11-08 — Use native Codex Goals for clarified work

Implementation: `2ea1956c8ff83425e414ec8f5b92eeb6a80f97a0` (0.39.0).

After discussing provider differences and a concrete release example, the user
selected implementation with clarified Goals announced in chat. Codex owns
execution, persistence and continuation; Beads owns task outcomes, finish checks
and dependencies. CCNG adds native status and start/pause/resume/clear controls,
with explicit replacement confirmation and no new Goal store or dispatcher.
Newly authorized clarified worker tasks can use native Goal tools; ordinary
questions, reports and backlog creation alone do not activate a Goal. Preserve
an unfinished Goal, native accounting, user pause/clear and real scope. Reassess
ready authorized work after actual task-state changes and use native parallelism
where independent work permits it. Claude implementation stays postponed.

The user selected an exact three-line announcement: New Goal, Task title and
Beads ID. Only confirmed creation uses that message. Labels use active-task blue
and values remain normal escaped text. Rendering is opt-in for worker assistant
messages, preserving native source/copying and raw-HTML exclusion.

Review identified stale UI confirmation, old native reads and delayed HTTP
responses as concrete risks. Controls now compare the displayed objective,
creation time and budget against fresh native evidence, preserve newer native
state/errors, and invalidate old replacement confirmation. Branch handoff and
Goal mutations are guarded against conflicting operations. Native APIs provide
no atomic cross-client comparison; no such guarantee is claimed.

All 606 tests and the production build pass. Focused review confirmed those
three fixes. A real native Goal was set for this implementation through the
supported Goal tool. A direct local app RPC probe was denied by the native
sandbox; no escalation or alternative transport was used to bypass it. Actual
installed Goal controls, continuation and rendered announcements still require
legitimate runtime/browser acceptance. Deployment is recorded separately.

The user also selected CCNG-only task cleanup. Completed features were already
closed; two remaining verification records were renamed and three explicitly
postponed requests deferred. Genuine unfinished implementation and acceptance
remain. Documentation now separates the approved but unfinished browser-first
password requirement from the current installer/startup behaviour.


## 2026-11-09 — Withdraw native Goals and add silent task checks in 0.40.0

The user withdrew the Goals idea and implementation after learning that one
conversation can have only one active native Goal. Per-task Beads objectives
were not equivalent to independently active runtime Goals. Earlier approvals
for Goal controls, automatic creation/announcements and future harness
requirements are superseded. Existing native data remains untouched; the
implementation Goal was paused before withdrawal. Only the existing branch
handoff's narrowly scoped continuation read/pause safety remains.

The user separately selected a fixed fifteen-minute controller nudge asking
workers to review neglected tasks and independent parallel opportunities without
conflicting writes or resources. Reuse the existing coordinator backend clock,
queue and native input path rather than introduce another execution engine.
Known active Codex turns use native steering at safe checkpoints; requests,
pauses/stops, ownership, unknown turns and handoffs retain their guards.
Outstanding unsent checks coalesce. Confirmed native acceptance allows the next
scheduled check, without claiming that the worker has completed it. Failed or
uncertain sends are not automatically retried, startup starts a fresh interval
and missed cycles do not burst. Claude work remains deferred.

The coordinator displays “Next chat task-ping to send” with the next local time.
Typed native message identities keep triggers hidden across history reloads
without hiding real user lookalikes or useful worker responses. Routine checks
do not fill the coordinator's delivery history or wake its model for an echo.
Existing report intervals remain independent; Never applies to reports only.
Ordinary task outcomes, lifecycle updates and ready-work guidance stay in Beads.

Implementation: `43780d183436cf05d862ffe96927872ddc084c38`.
All578 application tests and the production build passed. Coverage includes
cadence, safe steering, exact provenance/replay, coalescing, stopped restoration,
native-question and handoff gates, uncertain sends and the next-time display.
Initial restricted test attempts encountered socket/home/subprocess-capture
limits; the final complete run passed without weakening those checks. These are
application/fixture results, not formal review acceptance or rendered browser/
real scheduled-native adoption proof. Publication and actual production update
are recorded separately after their results are known.


Focused review found that asynchronous activation/instruction loading could race
a user stop, handoff or coordinator pause after initial scheduling eligibility.
Correction `e6871479bb475b6353eadd225ff25e8bdafb792d` rechecks the exact worker,
control and native-turn conditions immediately before native input, with no
intervening await. Deferred-context regressions cover stopped/failed work,
handoffs, ownership, pause/restoration and valid active/completed transitions;
all14 transport/provenance tests pass. No native permissions or delivery path
was broadened. Final complete regression results are recorded with publication.

Final full regression run after the race fix: all581 tests pass, no skips or
failures. Production TypeScript/Vite build passed; focused review confirms the
identified race is corrected. Actual native/browser acceptance remains separate.


Production update and independent verification completed at SSH-published,
remote-readback-verified payload `5bbd5bea435448f573c2e8126178ffa81e3edbd6`.
All95 checked source files and two served assets match; actual trusted HTTPS
health is0.40.0, login gates and both listeners pass, and eight protected files
are unchanged. Goal feature files are absent and the served bundle carries the
counter. No proxy/trust/credential/native-daemon change was made. This installed
artifact evidence does not establish real scheduled worker adoption or rendered
browser/phone acceptance; those remain recorded separately. Later documentation
commits do not change the tested runtime artifact.


## 2026-11-09 — Bound the desktop overview and anchor settings in 0.41.0

The user requested that the overview use its available browser height without
extending it, keeping report/model controls at the bottom while tasks and
questions may scroll. The previous whole-sidebar scrolling let long content or
saved section sizes push those controls below the visible pane.

Worker overview sections now put upper content in a bounded scrolling group
and keep the final settings section outside it. The sidebar fills its pane;
settings are capped to55% of the available section height and scroll internally
when short windows or long feedback require it. Existing adjacent resize,
keyboard/cancel/reset controls and saved sizes are retained without rewriting
preferences. The coordinator retains all content in its scrolling group. Mobile
restores normal flow, including wide coarse-touch layouts, preserving its
continuous page and compact settings. No native behavior or storage changed.

Implementation: `fcbf2031155a32f609660f69f22250e700bce932`.
All 585 application tests and the production build pass. Focused regressions
cover markup/order, oversized saved heights, missing questions/settings,
coordinator handling, keyboard/reset boundaries and responsive CSS constraints.
Independent source review found no concrete blocker. These CSS/SSR results do
not establish actual short-window geometry; rendered browser/phone acceptance
remains separate. Production results will be recorded after actual verification.

The existing unanswered Edit & rewind choice was also reconciled using its
same blocked Beads Question record after no native form was exposed. No new
form/task, answer, rewind action or expanded architecture authority followed.


Production update/restart and independent verification succeeded at payload
`e9335e0a9859c93de373118cdd3c2a786bd60608` (SSH publication/readback verified).
All95 checked source files and two served assets match, trusted HTTPS health
reports0.41.0, login gates and both listeners pass; eight protected files are
unchanged. Bounded overview CSS and bottom-settings wiring are installed/served.
No native daemon, credential, proxy, trust or permission change occurred. Actual
browser/phone geometry is still separate acceptance. Later status-documentation
commits do not alter this tested runtime artifact.

## 2026-11-09 — Protected browser setup, native scopes and truthful report status

The user selected first-browser password creation behind enforced htpasswd and
rejected a temporary setup code. Release 0.42.0 implements that choice with an
explicit disabled-by-default htpasswd-proxy mode and exact HTTPS public origin.
Operators must protect all proxy routes and restrict backend access; the setting
cannot verify infrastructure or proxy credentials. Local operators retain the
existing password CLI. Existing valid passwords are preserved, corrupt or unsafe
files fail closed, and atomic no-replace creation prevents concurrent setup from
changing the first successful password. Installer output documents both paths;
no default password, new auth service or setup token was added. Ansible/proxy
integration remains with the separately owning deployment work.

The user also requested every native approval choice. Installed Codex protocol
supports session file approvals without an explicit availableDecisions field;
CCNG omitted that fixed-schema choice. The fallback now includes it while honoring
explicit restrictions. Exact filesystem/network grants offer native turn/session
scope for manual user selection, superseding the earlier turn-only presentation.
Allow always remains limited to actual native saved-rule choices. No permanent
file/permission grant, local allow-list, direct settings writer or coordinator
permission expansion was introduced; no real grants were submitted for tests.

A user report of a missing AAP task report revealed two misleading states:
delivery was labelled generation, and an ordinary completed turn could claim a
report was ready without recognizing one. Feedback now describes waiting for a
response, and absent recognized reports produce an explicit error. Existing
response records also handle report/turn completion before delivery acknowledgement.
No new retry, timeout, scheduling loop or interruption was added. This corrects
source defects but does not establish the original live delay's cause.

Implementation: `bd3212a95fbc5ed116f8630c860b9aae79b37c90`.
All 614 application tests and the production TypeScript/Vite build pass, including
real trusted HTTPS enrollment/session/preservation, independent concurrent setup,
native scope/confirmation guards and report acknowledgement ordering. Independent
reviews found no concrete blockers. A stale session-test fixture was corrected
without weakening its old/current response assertions. An output-redirected run
encountered known environment restrictions; the final normal full run passes.
These checks are application verification, not a formal full-platform audit or
actual browser/proxy first-enrollment acceptance. Publication and production
preservation outcomes are recorded separately after they occur.
## 2026-11-09 — Prepare a fresh agent workspace through Ansible

Implementation: `1b3c074029646c3224bbc98a6c4905741e8bcbb0` (0.41.1).

The user selected the maintained default application installation directory,
the newest application source at each deployment and a separate `~/ccng-wd`
agent workspace. A fresh default workspace receives its own native Beads tracker;
updates preserve the selected existing tracker and authentication. No AAP demo
repository checkout is required. Existing explicitly configured paths remain
supported, so an unrelated production installation is not migrated implicitly.

The deployment now creates only a missing private workspace and delegates its
first initialization to native `bd init`, preserving agent instructions and Git
hooks. Partial trackers, inherited routing for the new default workspace and
conflicting user configuration stop without resets. Beads retains ownership of
its shared Dolt server; no new CCNG server wrapper or persistent ownership file
is introduced. Compatible existing Beads and Dolt programs are retained. Missing
target tools use the maintained installer's pinned package/archive versions
through native package/download modules, with private temporary staging and
cleanup. Compiler RPM prerequisites are included in approved package setup.
Application password setup is unchanged and remains a separate dependency.

The maintained Beads 1.3.2 initialization source confirms that the prefix can
default to the directory name and native setup may create local Git metadata.
That is distinct from requiring an AAP demo source checkout: no remote, task
import or existing tracker is supplied. Native defaults are retained without
adding alternate tracker routing.

Local real-Ansible fixtures verified first initialization, rerun preservation,
native home telemetry, conflicting routing, default/overridden paths and rebuild
selection. Syntax validation passed. These controlled fixture checks do not
establish a deployed tracker or a successful target AAP job.

Independent source review found no significant concrete defect. All 585
application tests and the production build passed with the existing prepared
dependencies. Deployment fixtures and focused reruns passed, including the
Node CLI/unit check after correcting the initially empty test checkout's
dependency setup. Strict lint passed across sixteen Ansible files. No production
application or native daemon was restarted, and fresh target acceptance remains
open, including the separate browser-first authentication requirement.

## 2026-11-09 — Respect Never during startup dashboard refresh

The user observed a report in a Never worker. Native history confirmed the
trigger was the previously selected one-off startup dashboard report, not the
recurring timer. The user explicitly changed that choice: Never now excludes
all automatic reports, including startup. Report now stays a manual one-off;
stored summaries, tasks, input needs and schedule information still populate
the dashboard without requesting a worker report. Separate task-attention
checks remain unchanged.

Implementation marks startup reports with the existing automatic provenance so
selecting Never can cancel unsent automatic rows while retaining explicit manual
requests, uncertain/error rows and in-flight work. Enabled startup/cadence
coalescing remains. Review found interval changes could erase the visible reason
for a retained uncertain startup delivery; that reason now remains in both worker
and dashboard state. No native cancellation, new timer/store or automatic retry
was added. Already delivered report requests cannot be withdrawn by this setting.

Implementation: `ea9d91719f1faca8e308e266e648bfa19060f798` (0.43.0).
All 618 application tests and the production build pass, including Never stored
input needs, manual promotion, automatic cancellation, uncertainty preservation,
enabled startup and separate task-check regressions. Source review found no
remaining concrete blocker. Optional installed native/browser workflow exercises
were explicitly deferred by the user; no browser tooling or live permission
exercise was added. Publication/deployment are recorded after actual outcomes.

Prior 0.42.0 payload `1aea82fc4a65852bd175fa34495ecd300118045c` was
SSH-published/readback-verified, installed/restarted through the authorized
production workflow and independently checked: 96 exact source files, two served
assets, trusted HTTPS health0.42.0, mandatory login and both listeners, with eight
protected files unchanged. It preserves the independently published0.41.1
Ansible bootstrap changes; all17 disposable native-Ansible fixtures pass on the
combined source. Fresh browser/proxy first enrollment remains unverified and
belongs to the selected fresh deployment's acceptance, not this existing-login
preservation check.

0.43.0 publication/deployment outcome: payload
`cdc969fe02b15f8adedf154d0d476d628a3f8712` is SSH-published/readback-verified.
Authorized production update/restart and independent verification succeeded:
96 source files/two assets match, trusted HTTPS0.43.0 and mandatory login work,
both listeners remain available, eight protected files are unchanged, and the
Never startup-skip source/instructions are installed. This is runtime/artifact
and preservation evidence, not an additional live native model/browser exercise.

## 2026-11-09 — Require the protected frontend before Ansible deployment

Implementation: `ec10ae0d4207079c382803621010f100e5e81635` (0.43.1).

The owner requires htpasswd protection before every CCNG AAP deployment. The
existing playbook now checks its exact configured HTTPS public origin before
managed target writes. A single unauthenticated request must receive HTTP 401
with a Basic challenge, using normal certificate verification and no redirects
or automatic netrc login. Failed frontend verification stops deployment rather
than exposing a fresh application. Proxy provisioning and restrictions on all
routes/direct backend access remain the infrastructure owner's responsibility;
the probe does not claim to establish those complete network boundaries.

The application already supports explicit protected-proxy password creation.
Ansible now accepts that existing option through its protected per-instance
settings and renders it into the installed runtime configuration. The default
remains disabled. Explicit browser-first mode leaves a missing auth file for the
user's first protected browser opening; it creates no default password or setup
code. Existing valid auth remains validated and preserved, and unsafe files are
refused. Backend/UI auth code, the installer and native daemon ownership stay
unchanged. Default latest-source, installation and fresh agent workspace behavior
are retained.

All 20 native Ansible deployment fixtures pass, including real trusted/untrusted
TLS, incorrect/missing challenge refusal before writes, credential-free probes,
fresh browser-first configuration, retained passwords and existing tool/tracker
setup. Strict production lint passes across 17 encountered Ansible files;
syntax, compilation, package/lock metadata and diff checks pass. Existing cached
dependencies were reused without installation. The full application suite/build
was not rerun for this Ansible-only correction. No production or target
deployment/restart was performed, and fresh live enrollment remains unverified.

## 2026-11-09 — Preserve workspace context and show native request content

Implementation: `85517d8b3d461f1cdaea9d80fb0f85a90ec6b365`, integrated with
the protected-frontend deployment patch and message-question display in
`af453b2c1b6f11b15f0e0661312af63dc57445cc` (0.44.0).

The user approved whole-turn Codex Edit and rewind. A preview and explicit
confirmation use the supported native revert operation, refresh retained history
after acknowledgement, and restore original text to the normal composer without
sending it. Existing drafts, busy work, questions and handoffs remain protected.
Files, tasks and permissions are not rolled back. Finer boundaries remain deferred;
the native API cannot prevent another client racing the confirmation.

The user approved private durable coordinator decision summaries so restart no
longer loses that display history. The JSONL file retains explanations/references,
not raw requests, credentials, authority quotes or replayable approvals. Storage
failure remains separate from the real native outcome. Older history is not
automatically imported, and normal shutdown cannot promise hard-kill durability.

The user approved persistent application logins and `--clear-logins`. Private
hashed session records preserve their original twelve-hour expiry; logout,
password revision changes and an atomic generation marker invalidate sessions
across processes and restarts. Application errors use HTTP 403 rather than
HTTP 401; unavailable storage fails closed with HTTP 503. Drafts survive implicit
expiry and stale login responses cannot override a newer sign-in. The old
memory-only sessions still require one final login during migration.

Native file paths/diffs were discarded separately from approval parameters.
Retaining bounded context on existing native-message records restores an exact
worker/turn/item view for the user and coordinator. Read-only reload, full-content
fingerprints and stale-history guards prevent another edit from supplying the
reviewed body. Missing/truncated content remains explicit; no new proposal store
or approval authority was added. Actual pending-item inspection was unavailable
under native socket permissions, so the original live case remains unverified.

Message-only structured question titles/options were also dropped, sometimes
with the entire empty-text message. They now remain visible and reach coordinator
reads. A supported exact reply binding for this newer format was not established;
the interface directs answers to the native client without fabricated IDs or
reply encoding. Existing native server-request forms remain interactive.

Report recognition now accepts ordered coloured topic summaries and binds receipt
to the actual acknowledged delivery turn. This fixes formatting and turn-change
false negatives without treating ordinary progress, quoted text or old messages
as reports. The specific reported missing-event correlation remains unverified.
The user explicitly approved the three original README screenshots after review;
they retain authentic historical UI/status and accepted metadata.

All 738 application tests and the production build pass. Independent reviews
found no remaining blockers. Ansible syntax/strict production lint pass across 26
files; 32 of 33 native Ansible fixtures pass, with one local TLS socket fixture
blocked by execution permissions. Assertions and security controls were preserved.
Publication/deployment are pending at this checkpoint. No real native conversation
was rewound or native approval submitted for testing; optional native/browser
exercises remain deferred.

### Production update and bounded installed verification

SSH publication and independent remote readback matched payload
`d2f270d7d01aa5079f89e7236d2a84719fdf3bbf`. Authorized AAP3433 installed0.44.0
and restarted the existing user service after successful installation, with
eight protected files unchanged. AAP3434 verified 105 source-file matches,
actual process/version, trusted backend HTTPS, served assets, both listeners and
application authentication403 without a Basic challenge. The installed modules
passed session restart/clear-logins and decision reload checks in temporary
private profiles; actual user sessions/passwords were not modified for testing.

The final public-proxy check failed with TCP connection refused. Follow-up
read-only3435 confirmed resolution of the configured public HTTPS origin but the
same refused connection from the application host. This is a separate unverified
public network path, not evidence that application installation failed. No
proxy, DNS, firewall, trust or saved connection setting was changed. Actual
browser login continuity and native rewind/request recovery remain unverified.


## 2026-11-09 — Withdraw Edit/Rewind to preserve traceable communication

Implementation: `ffa76e145225f0e022ef1721c894219a313f4082` (0.45.0).

The user withdrew Edit/Rewind altogether because earlier communication and
reasons for decisions should remain traceable. Corrections and changed decisions
belong in follow-up text. This supersedes the previous whole-turn approval and
withdraws individual-message and Claude variants rather than postponing them.
Native branching remains a separate supported action preserving its source.

Remove the UI action/dialog and native mutation implementation, endpoints,
feature state and obsolete tests. Restore Copy this on user text/captions and
retain ordinary input, drafts, branching, approvals, reporting and login. CCNG
can still observe an external native history-change notification; it makes no
mutation request. Such observations invalidate stale transcript/file-approval
bodies and old reads, preserve authoritative task/request state, and show errors
without leaving a stale warning after a successful current refresh.

All718 application tests and the production build pass. Focused authenticated
route tests confirm404 and unchanged messages with no native calls; follow-up,
copy and passive-history/error/race regressions pass. Independent source review
found no remaining issue. No real native history, permissions or credentials were
changed for testing. Publication/deployment are pending at this checkpoint;
optional real browser/native exercises remain deferred. Shared instructions and
current requirements withdraw the feature without deleting historical evidence.

SSH publication/readback matched installed payload
`3442e14fcf81cf5c96cee654226586d2ff0a56fc`. Authorized AAP3436 update/restart
preserved nine protected files, including session invalidation state. Independent
3437 verified103 exact source files, actual0.45.0 backend HTTPS health, served
assets, both listeners and login gates. Four real authenticated HTTP requests
against the installed app in an isolated temporary fixture returned404 for the
withdrawn routes, retaining its original messages with zero native calls. Removed
feature files/controls are absent; copy and branch controls remain served. No
actual user history/login was modified for testing. Rendered browser review and
the earlier refused public-origin path were not repeated.


## 2026-11-09 — Keep input decisions independent and illustrate the mobile interface

Implementation: `6c79c8f367cd434d6cd0aa83dd1eaa0b69e1f4ef` (0.45.1).

The user rejected a Needs input prompt that combined a Vault-source choice with
approval of configuration scope. Shared and worker guidance now asks for one
independently answerable decision/action per structured question item or ordinary
Beads input record. Alternatives for one decision remain together; separate
questions can be answered and resolved independently. Preserve exact native
approval payloads, pending choices and originating-worker ownership. This is
instruction guidance, not an automatic semantic parser or a claim of guaranteed
agent compliance. No other conversation's input record was changed.

The user supplied two mobile screenshots for the README and approved removal of
hidden EXIF after visual/metadata review. The originals contained Android build,
capture time/timezone and per-image identifiers; no GPS tag was present. A
lossless metadata-only script removed EXIF while preserving all compressed image
data and other JPEG segments, including colour profiles. Visible internal
project/deployment text remains as authorized; captions identify historical UI
versions and task states. The existing three desktop screenshots are unchanged.

All718 application tests and the production build pass. Four existing worker-
instruction checks pass; no new dependency or parser was introduced. EXIF absence,
unchanged compressed data and README image references are verified. Publication/
deployment are pending at this checkpoint. Real future agent compliance and
actual phone keyboard/touch/rotation behavior are not established by this change.

SSH publication and independent remote readback matched installed payload
`1c533b191706e9d0ffb94aedb1b00dfa7b4a152d`. AAP3438 update/restart preserved
nine protected files, including session invalidation state. Independent3439
verified105 source files, actual0.45.1 trusted backend HTTPS/assets/listeners/
login gates, installed worker question guidance and both EXIF-free README images.
The isolated installed authenticated404/history-preservation checks passed again
with zero native calls. Real future agent compliance and browser/phone behavior
remain unverified; no live question or user history was answered/changed for tests.


## 2026-11-09 — Explain access protection before initial password creation

Documentation implementation: `fa2b96d18d53d188a083f526f83ba5fa1e9bff22`.

The user requested a prominent generic first-start warning without details of
our infrastructure. README and installation guidance now explain that explicitly
enabled browser-first enrollment has no pre-existing application password: the
first successful visitor creates it, so external access protection must work
before exposure. Normal startup instead refuses missing authentication. Existing
passwords remain preserved; no default password or new setup mode is introduced.

Default HTTP is unencrypted and HTTPS alone does not restrict access. Give generic
examples such as a Basic Auth/htpasswd reverse proxy or a restricted network,
while keeping the current browser-mode and deployment requirements explicit in
the installation guide. Do not imply that CCNG installs external protections or
that equivalent new authentication modes are implemented. No environment-specific
nginx settings, private identifiers or configuration were added.

Checked wording against current startup/authentication and deployment guards;
warning placement, local links and diff checks pass. This is documentation only:
no code, numeric version, dependency, service or security configuration changed,
and no extra restart or successful browser acceptance is claimed.


## 2026-11-09 — State the single-engineer deployment boundary

Documentation implementation: `d383bc78d9b86e13288d623d87779193ac43f2f4`.

The user clarified that CCNG is currently an application for one engineer per
deployment, without multi-tenant isolation. README and installation guidance now
state this prominently. Tabs organize projects/conversations, while people using
the same backend share its runtime/account/application workspace. Separate
reverse-proxy logins restrict entry but do not create isolated CCNG users.

This describes the existing product boundary, not a new multi-user design or
security mechanism. Existing protection guidance and all five screenshots remain
intact. Documentation links and diff checks pass; no runtime code, numeric version,
dependency, configuration or deployment changed for this clarification.

## 2026-11-09 — Check actual progress behind in-progress tasks

The user reported delegated calls left unchecked for hours while their tasks
still appeared active. Extend the existing silent fifteen-minute reminder and
worker instructions to inspect outstanding subagents, tool calls and external
jobs using available exact IDs, timing, returned results and evidenced progress.
Investigate stale/unknown waits promptly, collect outcomes or state the exact
blocker and safe next action; do not wait for the next ping after noticing a gap.
Age alone establishes neither execution nor an approval wait. Preserve native
approvals, explicit stops, scope and the existing silent delivery gates. The
coordinator asks the owning worker to investigate; its read-only role and exact
command/file approval-review authority remain unchanged.

Implementation `9eb6ce5c369a36fb1db162aa2e90058d76a5f1f0` advances the working
version to0.46.0. Six focused regression files and the production build pass;
the broader run passes71 of76 files, with five prevented by restricted sockets
or home-directory writes. The current Coordinator received the user-requested
instructions through the existing native message tool. That acknowledgement
establishes delivery, not future compliance or recovery of the cited jobs.
Publication and production deployment remain pending after SSH rejected system
configuration ownership. No permission/security workaround, new watchdog,
dispatcher or timer was introduced. Production remains at the previously verified
0.45.1. This instruction cannot guarantee inspection before a worker reaches its
safe response checkpoint.

## 2026-11-09 — Recover diagnosed child waits through the main agent

The user supplied a successful incident-recovery sequence and requested it in
existing fifteen-minute task pings. Implementation
`d1bc08be75eab274aad317b48953d0c53034cb55` advances working code to0.46.1.
The main agent checks all children and actual external-job state, safely
interrupts only a diagnosed stalled child wait while preserving native history,
findings and request context, verifies a pwd-only response under unchanged
permissions, then resumes a specific authorized next step. Real external work,
genuine pending user decisions and explicit stops remain protected. A missing
job ID does not prove no execution, and a probe does not prove job success.
This is conditional recovery, not blanket probing or a new timer/dispatcher.

Six focused regression files and the production build pass. Independent source
review found no blocking issue. The native message tool confirmed sending the
requested guidance to the current Coordinator; future adoption or live recovery
is not established by that result. The usage guide lists generated silent
message variants, visible summaries and compatibility-only report-setting state.
Publication/deployment remain unverified; a user-requested fresh Git SSH read
still refused system configuration ownership in restricted execution. No SSH,
credential, transport, approval-policy or production setting was changed.

## 2026-11-09 — Verify publication and the recovery-guidance update

The user's request to retry ordinary Git commit/push succeeded without changing
SSH configuration, identities, transport or native permissions. Source and
installed checkpoint `56b3499f35f16548a07a24e4733953bfc9e07259` were independently
read back over SSH. Earlier compound/restricted inspection failures did not
establish failure of that ordinary approved publication path; the previous
operator-push question is resolved by actual publication, not an inferred answer.

AAP3446 updated/restarted the existing installation to0.46.1 and preserved nine
protected configuration/authentication/certificate/native-profile files.
Independent3447 matched105 installed source files and verified actual running
version, trusted HTTPS health, authentication gates, served assets, both listeners
and installed recovery/coordinator instructions. Six focused regression files and
production build pass. No live native approval, pwd probe or model run was created
for acceptance. Instruction adoption and complete live recovery remain unverified;
the separate never-opened child approval/status routing task remains open.

The usage guide clarifies that Report now is the user's command to the selected
agent, delivered by the backend queue without a Coordinator-model decision.
Queueing preserves duplicates, exact delivery status and existing native gates;
it does not wait for all ordinary project work to finish.


## 2026-11-09 — Keep delegated native requests with their parent

Implementation `c76502dfb01070fbfda7672c3bf06043332278c2` (0.47.0) follows the user's selected behavior:
show known native Codex child requests and truthful waiting state under the main
chat using the same cards and Coordinator review path. Opening every child tab
must not be required. The source previously ignored requests from never-opened
children; native metadata now verifies lineage before actions become available.

Retain original child thread/typed request IDs, tokens, native turn/item bindings
and confirmation. Preserve exact native choices and existing manual permission
limits; a parent instruction is usable only after verified child ownership. Keep
parent input available during child-only waits. No new approval store, tab, worker
slot, schedule, automatic child resume or model call is introduced. Read-only
recovery cannot replace newer events or authorize a stale relationship.

Independent review found and verified fixes for generic activity rows without
request fields, missing child IDs on detail reload, explicit-null bindings, stale
separately opened ownership and delayed recovery snapshots. All761 tests and the
production build pass. Synthetic transport/HTTP/Coordinator/UI fixtures establish
these paths, not actual provider event arrival or rendered browser acceptance.
Requests never delivered, including those predating all child discovery, are not
fabricated or replayed; live delivery and actual phone workflows remain unverified.

## 2026-11-09 — Explain prerequisite and sign-in choices before setup

The same implementation `c76502dfb01070fbfda7672c3bf06043332278c2` corrects onboarding after user-reported
Git bootstrapping, disabled device login, mistaken workspace input and missing
terminal PATH. Keep the existing source installer and installation layout. Show
sudo-plus-RHEL-repository and administrator-prepared prerequisite paths before
cloning. Beads and Dolt remain consent-based upstream local tools.

Offer normal native browser Codex login by default after consent, device-code
login only as an explicit policy-permitted alternative, and deferral. Explain
separate OpenAI/app authentication and the native SSH callback. Never collect
credentials, silently fall back between login methods, alter existing sign-in or
write a shell profile in this release. Print the exact local tool PATH beside
login/start instructions because child installers cannot change their caller.

A workspace path is not a yes/no answer. Explain how to create an intended
directory and rerun with the existing workspace/prefix options and separate
initialization consent. Retain configuration, passwords and existing trackers.
Focused mocked tests cover consent, deferral, login failure, state preservation
and shell-quoted custom paths. No real account login or fresh system bootstrap
was performed for validation.

Native daemon boot startup remains separate and unconfigured by CCNG. The user
subsequently requested a separate per-user Codex installation and persistent
Bash PATH; its exact location is still being clarified. That later change is not
implemented or implied by this release. Publication and installed verification
are recorded separately after their actual outcomes.


0.47.0 publication and installed verification: payload
`8a26850d762b5c1e9d8ec0fdda7ff38a989e01de` was SSH-pushed and independently
read back. AAP3452 completed update/restart in21.13s with nine protected files
unchanged. Independent3453 passed in5.089s:105 source files matched, actual
0.47.0 process/start ordering, trusted backend HTTPS, served assets, both listeners
and authentication gates. An isolated fixture using installed modules verified
child-only ACK routing and parent request isolation without extra tabs or real
provider/model calls. This does not establish real native request delivery,
rendered browser behavior, organization login or reboot acceptance.

## 2026-11-09 — Keep user tools available and compact worker activity

Implementation `6877e20308a3f2e4aeb86ee9d00f1ffe249940a8` (0.48.0) follows the
user's existing home-default/custom Codex location and persistent Bash PATH
request. The later location question was unnecessary and withdrawn, not answered
for the user. Missing Codex uses the existing consent-based pinned npm method
under the chosen user prefix; compatible existing installations are retained.
No native sign-in, CODEX_HOME, daemon startup or multi-user design is introduced.

A marked Bash PATH block preserves surrounding bytes and original ownership/group
and mode, safely quotes paths and does not grow on repeated sourcing. Unsafe
profiles remain unchanged with manual guidance. The invoking terminal must source
its own profile. Keep stable launcher paths, custom-prefix retry hints and existing
Beads/Dolt data. No real package installation or user profile was changed during
source tests. Existing Node built-ins supply the small atomic profile helper; no
additional dependency or configuration store is required.

The user reconsidered hiding routine child activity and chose a default-collapsed
Subagents section below Tasks. Closing it releases saved expanded height. Actual
child approval/question cards remain outside it with original native controls.
The overview heading becomes Project: followed by the chat name. The user also
shortened only the existing silent task-check cadence to ten minutes; report
choices, queue gates, native permissions and conditional recovery remain intact.

The combined suite ran784 tests:783 passed, one alternate-group case skipped
because no supplementary group was available, and none failed. Actual temporary
Bash/helper/installer fixtures, the production build and focused independent
source review pass. Review identified and verified the group-preservation fix.
These checks do not establish real fresh Codex download, provider sign-in,
rendered phone/browser behavior, daemon reboot survival or complete native child
approval delivery. Publication and installed verification will be recorded from
actual outcomes. Detailed reports remain separate follow-up work.

## 2026-11-09 — Release the combined detailed-report workflow as 1.0.0

Implementation `e7432ed5d4442d7608618c0d207b05636ed1c04a` adds the user's
Detailed report checkbox beside Report now on desktop and mobile. Keep the
normal concise report first, followed by every actual linked in-progress task
and up to ten attributable recent actions with evidenced timestamps and outcomes.
Unavailable history, fewer actions, receipt times and unknown results remain
explicit. Task update time is not action time; starting a tool is not success.
Only this explicit request permits bounded existing task/history reads.

Reuse the existing HTTP route and bounded queue. Upgrade an unsent request
without duplicates or downgrades; preserve the mode captured by a dispatched or
uncertain send and display truthful feedback rather than resending. Keep native
questions, pause, ownership, authentication/origin checks, silent request markers,
report confirmation and independent schedules. No new action store, service,
timer, native permission or model call is introduced. Mobile uses a natural-flow
checkbox/button row below the collapsed settings header rather than squeezing
controls into fixed absolute space. The choice remains local to the chat view.

The user rejected fragmenting related changes into separate deployments and
selected1.0.0 for the completed usable single-engineer, Codex-focused application.
Backend, UI, instructions and tests therefore ship together. This number does
not establish previously unverified live approval recovery, asynchronous provider
question replies, complete phone workflows or reboot survival. The user explicitly
accepted releasing this feature set and continuing other fixes afterward.

The combined suite ran792 tests:791 passed, one unavailable alternate-group case
skipped, none failed. The production build and independent source/docs review
pass. An HTTP fixture initially paused before startup restoration, which correctly
restored its saved unpaused state; the fixture now waits for restoration before
using the real pause control. Production gates were not weakened for the test.
Authenticated HTTP/queue/native-gate/ACK and actual desktop/mobile component
regressions pass with synthetic transport; no real provider call was created.
Publication and installed verification will be recorded from actual outcomes.

The preceding0.48.0 source checkpoint82e7861 was SSH-published/readback verified.
AAP3455 completed update/restart with nine protected files and unrelated Bash
bytes/uid/gid/mode retained;3456 independently matched105 files, running HTTPS
assets/listeners/auth gates,17 deployed-source checks plus one alternate-group
skip, actual Codex0.167.0 PATH lookup and the ten-minute timer. The user confirmed
the collapsible Subagents section was visible. AAP3454's command syntax failure
occurred before installer execution and was corrected before3455.

1.0.0 publication and installed verification: implementation
`e7432ed5d4442d7608618c0d207b05636ed1c04a` and payload
`59036d99c96866bc80a2a4cc0eac0182340698ab` are SSH-published/readback verified.
AAP3457 completed update/restart in19.888s, retaining nine protected files and
unrelated Bash bytes/uid/gid/mode. Independent3459 passed in5.362s:105 files
matched, running1.0.0 trusted HTTPS/assets/listeners/auth gates, five installed
report regressions and served checkbox/instructions. Earlier3458's optional
TS-based UI fixture lacked the intentionally omitted production development
compiler; backend checks passed. No new compiler was installed. Actual component
checks passed before publication; final deployed checks cover backend behavior
and delivered UI artifacts, not a real browser-generated model report.

## 2026-11-09 — Reply through the native asynchronous-question interface

Implementation `115cf9a36449b8acac3ebec21da3569b6b99d296` (1.1.0) follows
the existing conditional requirement to enable replies once an exact supported
native binding is established. Ordinary authorized Git SSH retrieved exact Codex
0.167.0 source commit086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a. It proves the
canonical answered-question envelope uses ordinary App Server input and the
original message ID plus original zero-based question index. Earlier schema-only
unsupported assumptions and restricted source-fetch failures were insufficient.

The previous display projection discarded indices while filtering questions.
Retain original indices and privately bind the complete source content before
using bounded display text. Hash source changes and preserve the native UTF-8
question framing. Only a live completed question in its known active worker turn
can be answered; history, cold restoration, unsafe/truncated bindings and terminal
questions remain read-only. Native emission/accepted input is not model processing
or task resolution. Actual blocking approval/form responses remain separate.

Use existing input, ownership, request and handoff guards. Partial native replies
retire only addressed identities; exact source-supported input shapes, replay and
other-client observations cannot resurrect closed editors. Browser-memory drafts
and delivery/error latches survive worker switches without persistent form storage.
Uncertain sends cannot be blindly repeated; definite size rejection permits an
explicit shortened retry. Readable question/answer display preserves raw native
history and original Copy this text. Keep Node hashing out of browser-shared code.

Automatic reports, task checks and informational summaries wait for live human
decisions through existing queues. Exact manual answers remain possible while an
owned handback waits/stops; ordinary composer input stays locked. Per-attempt
observations in the existing handoff record defer unsafe terminal/changed/missing/
unconfirmed question closure, retaining the branch and unsent text. Explicit retry
rebaselines observations. Existing draft hints/start guard and explicit local
discard prevent hidden draft loss. No extra transport, store, daemon, timer,
permission grant or model call is introduced.

Canonical native user input contains model-written question framing as well as
human answers. Approval quotes therefore match only individual actual answer
strings; titles, IDs, JSON and oversized unsupported envelopes cannot supply user
authority. Existing native provenance/current-request checks remain required.

The final combined suite ran827 tests:826 passed, one unavailable alternate-group
case skipped and none failed. The production build is clean and independent
source/UI/provenance review found no remaining blocker. Relevant authenticated
HTTP, lifecycle, partial-answer, draft, queue, handoff and authority regressions
pass. Early review found and verified source-fingerprint, singleton/input-shape,
browser-module, draft-switch and handoff safety corrections. These source/transport
fixtures do not prove actual browser/native-provider answer delivery. Publication
and installed verification will be recorded from their outcomes. The separate
YAML approval-reader boundary is unchanged by this release.

1.1.0 publication and installed verification: implementation
`115cf9a36449b8acac3ebec21da3569b6b99d296` and payload
`bbd8a2b7d3c95563ed62287b33657c1cc5e2f551` were SSH-published/readback
verified. AAP3460 completed update/restart in20.634s with nine protected files
and unrelated Bash content/metadata retained. Independent3461 passed in5.439s:
106 exact files, actual running1.1.0 trusted HTTPS/assets/listeners/auth gates,
21 installed backend regressions and served answer/draft/report controls.
Functional cases use isolated synthetic native transport and temporary test
authentication; no real provider/model/approval call was created. Full actual
browser/provider answer delivery and phone acceptance remain unverified.

## 2026-11-10 — Keep approval choices together and reduce unnecessary tab attention

Implementation `0223c113c2fb5ffaa18ae9ae81970348467950b6` prepares the
unpublished 1.2.0 candidate. The user's phone screenshot showed a long saved-rule
description separating Allow once from Allow always. Group the buttons in one
wrapping row and show exact scopes below, with matching numbered labels and
accessible descriptions when several reusable rules are available.

The user also reserved amber agent tabs for requests needing human attention.
Delivered command/file approvals that an available Coordinator can evaluate
stay neutral while awaiting review. Referrals, manual questions, unavailable
request details and requests the Coordinator cannot handle retain attention.
Native confirmation remains a separate wait. Apply the same presentation to
child requests, tab labels and the attention count; preserve actual native
status, request contents, manual controls and execution gates.

Independent review found and verified corrections for queued reviews and
unrelated assistant questions hiding unknown native waits. The 42 focused
approval/child/tab tests and production build pass. The full command passed
77 of 84 test files; sandbox socket/subprocess restrictions and read-only home
paths prevent full verification. Authentication passed separately after its
combined-run failure. Phone rendering remains unverified. Publication and
deployment are pending; production remains the verified 1.1.0 release.
The existing mobile scrolling and child-reattachment choices remain unanswered,
with no scrolling or request-recovery implementation in this candidate.


## 2026-11-10 — Automatic native detail display and one-page mobile history

Implementation `eb319b6369c63050ea022f275ccb78818aae13c3` advances the working
application to 1.3.0 and includes the unpublished 1.2.0 approval-button and tab
attention changes recorded above. The user selected one-page mobile scrolling
because the inner chat viewport trapped swipes and made page controls difficult
to reach. Mobile history now participates in the document flow; the six-line
input remains internally scrollable. Desktop dimensions and reading positions
survive compact mode, same-chat rotation and tab changes; branch-return selection
continues to follow the current conversation.

The user also rejected extra Load/Retry clicks. Delivered native file approvals
now acquire only their exact matching change item through a coalesced bounded
read-only history query. Newer live bodies, request identity, ownership and
connection/history changes protect against stale proposals. Native events show
late content automatically. Missing content remains explicitly unavailable; no
answer, inferred diff or automatic execution is introduced.

Native source inspection established that newly created children can deliver
requests before their parent activity reaches CCNG. The application previously
discarded that delivery. Retain original human callbacks privately in the
existing pending map, with a limit of 128 undiscovered requests, until fresh
native metadata verifies the complete parent relationship. Foreign callbacks
remain absent from user/Coordinator views, background counts and answer paths;
there are no speculative foreign reads, additional timers or request stores.
Resolution, disconnection and changed ownership invalidate admission. The UI
uses truthful missing-detail status and removes ineffective routine child
retries. Parent reconnection remains an explicit advanced control. This cannot
reconstruct already-lost or never-delivered callbacks; automatic child resume
and its potential idle continuation remain unapproved.

The task-dialog screenshot had no recorded Needed/Why fields, so no short
question existed to render. A separate confirmed classification bug promoted
all blocked work to Needs input. Keep ordinary blocked work distinct from
explicit input states/Question records across the task panel, notifications,
dialog and Coordinator card, preserving dependency queues and original Details.
No other worker's question or task state was rewritten, and missing questions
are not invented.

Independent integration review is clear. The final combined suite ran 864 tests:
863 passed, one unavailable alternate-group case skipped, zero failed; the
production build passes. Publication and installed verification remain pending
at this checkpoint. Source/fixture checks do not establish physical phone
behavior, actual provider delivery or recovery of the existing native incident.


1.3.0 publication and installed checkpoint: implementation eb319b6 and payload
862169b are SSH-published/readback verified. AAP3476 completed in25.245s, preserving
nine protected files and unrelated Bash bytes/ownership/mode. Independent3477
completed in6.741s:107 installed files match, running1.3.0 trusted HTTPS/assets,
authentication gates/both listeners and75 installed synthetic backend regressions
pass. The user confirms1.3.0 is visible. Their subsequent screenshot exposes a
remaining footer defect: native attention, including unknown child waits, is
called Needs your answer without a delivered question. Those native waits are
not proven resolved or recoverable by the release; their classification and
presentation remain in scope. No real provider request was resumed or answered.


## 2026-11-10 — Stop treating missing native details as a user question

Implementation `62ad95f1d2d9e0bf1f52bed1fc3ed2d15db1410e` advances the application
to 1.3.1. The user's post-1.3.0 screenshot showed an amber Needs your answer footer
with empty native child waits. Native attention proves neither that CCNG has a
question nor that the user can act. The footer previously used the aggregate
native status directly, while neutral helper results could still fall back to
the tab's amber attention CSS class.

Use the existing request presentation evidence for both tabs and the input
header. Empty own, child and Coordinator waits now remain neutral and explicitly
say request details are unavailable. Real delivered manual questions, permission
choices, Coordinator referrals and answer errors retain attention; eligible
Coordinator review and native confirmation stay distinct. Composer guidance no
longer tells the user to answer an absent question. Native backend states,
request controls, send/interrupt/branch guards and Coordinator restrictions are
unchanged. Empty-card placement remains a discussed recommendation, not a
selected layout change, and no request is dismissed by the new wording.

The final combined suite ran867tests:866passed, one unavailable alternate-group
case skipped, zerofailed. The production build and independent integration review
pass, including tests of actual tab CSS classification/JSX wiring and rendered
footer labels. Publication and installed verification remain pending at this
checkpoint; physical browser acceptance is separate.

Read-only investigation of the existing AAP runner found its exact elevated
inline diagnostic request but no recorded return, execution handle or current
approval token. A saved prior SSH failure artifact predates that call and cannot
establish its outcome. Start and outcome remain unknown. The existing native
reconnection decision remains unanswered because reconnect can also trigger
idle continuation. The UI patch does not recover that call or authorize a
permission grant, retry, cancellation, job change or other worker teardown.


1.3.1 publication/installation checkpoint: implementation62ad95f and payload
e31c1f1 are SSH-published and remote-readback verified. AAP3478 completed in24.637s
and preserved nine protected files plus unrelated Bash content/ownership/mode.
Independent3481 completed in6.882s:107 installed source files match; actual
running1.3.1 trusted HTTPS/assets, authentication gates, both listeners and75
installed synthetic backend regressions pass. The served bundle includes the
corrected composer guidance. Physical browser behavior remains unverified. A
fresh native read still reports the existing AAP child waitingOnApproval with no
request body or returned execution result. The UI correction does not establish
recovery; the existing reconnection side-effect decision remains pending.

## 2026-11-10 — Reconnect eligible native waits after explicit user approval

Implementation `6947ad373f6d6f3e1d964da2844f41264ba823bf` advances the application
to 1.4.0. The user selected automatic reconnection after reviewing the native
resume operation's possible idle-continuation side effect. This supersedes the
unanswered reconnection choice recorded for 1.3.1. Native metadata reads alone
cannot replay an existing request stream, so the existing five-second poll now
reattaches open local worker roots and verified known children freshly active
with waitingOnApproval and no delivered request.

Keep the original native conversation and request identities, coalesce one
attempt per connection and continuous waiting episode, and stop automatic retries
after an empty or failed replay. Exclude intentional idle/unloaded, foreign,
paused/stopped, Coordinator and handoff contexts; preserve ownership, native
permissions and newer live outcomes. The accepted race can continue existing
work if a qualifying conversation becomes idle before native resume arrives.
The implementation sends no approval answer, command retry or configuration
and permission override. No new timer, persistent store or dependency is added.

The native client now declares support for human-only command checkpoints so
those callbacks can be delivered. Their decisions remain manual, with hard
Coordinator review denial and no reusable grants. Unsupported kinds fail closed.
Replayed foreign worker tool callbacks are left with their original executor;
replying or refusing them would consume another client's real pending work.
CCNG-owned Coordinator tools retain their existing handler. Missing-details
cards stay in place; their removal was not selected.

Verification: 890 tests, 889 passed, one unavailable alternate-group skip and zero
failures; production build, diff checks and independent integration review pass.
The bounded read-only evidence checker rejects ambiguous readbacks, stale
invocations and missing native bindings. Synthetic transport proves regressions,
not real provider recovery. Publication, deployment, genuine request delivery and
physical browser acceptance remain unverified at this implementation checkpoint.


1.4.0 publication/installation checkpoint: implementation6947ad3 and payload
98560b7 are SSH-published/readback verified. AAP3490 succeeded in23.483s preserving
nine protected files and unrelated Bash content/ownership/mode. Independent3491
succeeded in7.097s:108 installed source files match; running1.4.0 HTTPS/assets,
authentication gates/both listeners and110 installed synthetic backend cases pass.
Fresh live Coordinator readback contained four real original RHEL command/file
approvals including both known children. The original AAP connection-check tool
callback returned after reconnection; its worker followed its actual process
through exit0. Recovered requests still use normal review/manual decision gates.

One separate older MCP wait remains unresolved, without its original return or
current request body. Native source says ordinary thread-scoped MCP elicitations
can replay; the nested tool name does not establish the pending envelope's type.
Restoration reconstructs children from a bounded recent-history window, so old
child discovery needs diagnosis before selecting any broader recovery design.
A bounded exact-intent audit found no matching currently retained external job;
this is not proof of nonexecution. No uncertain operation was retried/cancelled
and no absent prompt was answered. The strict CLI evidence checker rejects the
current combined/truncated Coordinator projections; the live evidence above was
inspected directly. Physical browser acceptance remains unverified.

## 2026-11-10 — Read pending file details from the reconnect snapshot

Implementation `3e8cccd51942310ca5796b253ebf2f0f1512d405` advances the application
to1.4.1. A real recovered file approval still lacked proposed paths/diff. Native
0.167 source shows that patch approval and started events are transient, while
paginated durable history omits the live overlay. The approval callback retains
its identity but does not itself contain the proposed changes.

Request one descending full initial turn page on the same already-approved
native resume operation. Use only its exact current pending file item by thread,
turn and item identity, keeping original callback IDs/parameters and approval
controls. Preserve newer live records, including unavailable/non-file records.
Native resume responds before replaying callbacks, so consume its bounded page
both immediately and after the existing replay wait. A delivered card does not
trigger another resume, and an absent or mismatched proposal remains unavailable.
No new timer, store, native profile or configuration override is added; patches
are never inferred from a nearby shell/tool call.

Verification:894 tests,893 passed, one unavailable alternate-group skip and zero
failures; production build, diff checks and independent review pass. Four focused
regressions cover callback timing, exact joins, newer-live precedence and no extra
attachment. Publication, installation and actual outstanding-proposal recovery
remain pending at this implementation checkpoint. The separate older AAP child-
membership question is unanswered; this correction does not decide that issue.


1.4.1 publication/installation checkpoint: implementation3e8cccd and payload
5ff61a5 are SSH-published/readback verified. AAP3493 succeeded in23.891s preserving
nine protected files and unrelated Bash bytes/ownership/mode. Independent3494
succeeded in7.098s:108 matching source files, actual1.4.1 trusted HTTPS/assets,
authentication gates/both listeners and114 installed synthetic cases pass.

Actual delivery of the outstanding paths/diff remains unverified. The native
Coordinator began a new turn after restart but returned no fresh request readback;
an active label alone is not proof of progress. No pending native request was
answered, declined or retried by this repair. A structured observation question
asks whether the existing card now shows its proposal; the separate older-child
membership question is also unanswered. Preserve both and do not broaden native
permissions or choose a discovery redesign without evidence and consultation.


1.4.1 final live-recovery checkpoint supersedes the missing-readback conclusion
above. Fresh Coordinator readback exposed the exact outstanding native file item
with four paths, complete diffs, totalChanges4 and truncatedfalse. It was then
independently reviewed and approved once under existing user authority. The
older AAP call also returned normally, its original child turn completed and the
child is idle. Independent AAP3492 status is successful, elapsed4.337s; completion
without resubmission is confirmed by the originating workflow.

Both recovery observation questions are answered and processed; the recovery
task is closed. No broader child-discovery redesign is needed for these cases.
The separate service-stop user decision is unchanged, and physical-phone/browser
acceptance remains outside this completed recovery verification. The strict CLI
checker conservatively rejects unsupported combined/metadata-wrapped native log
shapes; the actual outcomes above were inspected directly, not inferred from its
fixtures or an installation result. No new code or native permission change is
part of this final evidence update.

## 2026-11-10 — Preserve request explanations and recover missing context in1.4.2

Implementation `124abacb154dcd185e09ace1064d54b658438b9f` applies three explicitly
selected corrections using the existing request jobs, source reader and private
decision history.

A delivered file approval missing its proposal may receive one guarded full
snapshot after bounded history lookup. The user approved this narrow extension
of the previous no-extra-attachment boundary. Keep exact callback/token, cwd,
lineage, connection/history and native waiting/ownership/stop/handoff/response
checks; eligible failures consume the original allowance without a poll loop.
No native answer, command resubmission or permission override is added.

The source reader previously refused generated Beads hook text because it lay
outside both project source and directly referenced approval helpers. The user
selected read-only paging of only the current Coordinator's generated hook
output. Enforce its own conversation directory and UUID filename, ownership,
nonlinked regular files/ancestry, bounded reads, concurrent-change checks and
credential/binary screening. Existing project/helper access stays unchanged;
hook context is not independent action authority. The exact previously refused
file now passes this reader with contents withheld from diagnostic output.

Native reconnect can recreate a request without its in-memory review, although
the dated concern remains saved. The user selected restoring the latest saved
needs-user explanation only for an independently current request with matching
typed identity, strong native discriminator and non-secret canonical fingerprint.
Show it as an earlier review and retain manual waiting until explicit re-review.
Unavailable or newly enriched file details do not erase that same callback's
historical wait; any later approval still needs current proposal and real-user
authority. Legacy ambiguous records remain history-only. Never restore positive
approval decisions, native callbacks or answers from the audit. A final guard
also prevents an in-flight review from answering after another review refers the
request to the human.

Validation:185 affected checks, production build, diff checks and independent
review pass. The full-suite attempt is not clean: socket/subprocess/home-directory
operations are restricted in the current execution environment, and some child
CLI output is unavailable. Those restrictions were preserved. Publication,
installed verification and genuine new callback acceptance remain pending at
this source checkpoint; physical-browser acceptance remains separate.

1.4.2 publication/installation checkpoint: payloadb67bed6 is SSH-published and
readback verified. AAP3495 succeeded in52.589s, preserving nine protected files
and unrelated Bash content/ownership/mode;3496 succeeded in9.740s. All108 checked
installed files match, running1.4.2 trusted HTTPS/assets/authentication gates/both
listeners pass, and148 installed synthetic cases pass. A genuine Coordinator call
through the existing tool returned16000 characters from its own hook text.
These checks do not establish a new delivered-file callback's recovery or physical
browser acceptance. The broader local full-suite limitations above remain.

## 2026-11-10 — Preserve complete generated-hook pages in1.4.3

Implementation `3fece96459bc4403691a623153f9e085d902a2f3` corrects an observed
paging gap in the same approved reader. The real hook file has338 mixed-length
lines. Its first nominal160-line page exceeds the16000-character limit, so a
final string slice cuts a line without supplying the next original line.

Pack complete lines under both existing bounds and return nextLine. Report a
single overlong line explicitly as an incomplete excerpt rather than claiming
full context. Restored Coordinator guidance tells the caller to follow the
cursor. No path, ownership, link, credential, execution or approval boundary
changes; no new tool, input format, store or timer.

Five focused cases, production build and diff checks pass. Independent root
review confirms unchanged access checks. All eight bounded pages of the real
hook reconstruct its complete contents with matching digest; no contents were
printed. Publication and installed checks remain pending at this checkpoint;
1.4.2's broader-suite execution limitations remain explicitly unverified.

1.4.3 publication/installation checkpoint: payloadb863d24 is SSH-published and
readback verified. AAP3497 succeeded in53.075s preserving nine protected files
and unrelated Bash bytes/ownership/mode;3498 succeeded in8.366s. All108 checked
installed source files match, running1.4.3 trusted HTTPS/assets/authentication
gates/both listeners pass, and149 installed synthetic cases pass. The actual
Coordinator's own-hook read already succeeded through the old tool in1.4.2;
1.4.3's complete-file paging is verified by lossless real-file reconstruction.
No new native file approval was manufactured, retried or answered. Fresh native
recovery and physical-browser acceptance remain separate, as do the documented
broader full-suite execution limitations. All release jobs are terminal.

## 2026-11-11 — Reproduce conditional On hold configuration

Implementation `6b28bc9cd7e214d9c06db6a1491436952e8be75d` adds the approved native
On hold custom status through the existing deployment workspace tasks. Preserve
other states and native data, skip an already-present value and reject unknown
configuration responses. Three tests exercised16 disposable Ansible plays.
This prepared1.5.0 change is included with1.6.0. Normal target-playbook acceptance
and the separate encrypted CaC configuration/source choices remain pending;
publication does not imply those choices were answered or deployment was run.

## 2026-11-11 — Keep agent tabs durable and recover a late native connection

Implementation `67c9bc3a192090a497d1103dd50c4cd7925475c2` follows a reboot report:
the website was running while its Coordinator, worker tabs and history picker
were unavailable. The existing private workspace file still held their IDs.
Starting the native runtime later could leave CCNG disconnected because startup
made one connection attempt; another available provider could also hide Codex's
reconnect control. These are verified source failure paths, not proof of the
complete historical incident sequence.

Reuse the existing five-second refresh for transport reconnection and the existing
workspace file for lifecycle persistence. Acknowledge create/open/fork/close only
after pending metadata writes settle; sync the file and containing directory,
preserve unavailable saved IDs and drain shutdown writes. Expose a save warning
without turning a successful native action into failure or repeating it. Keep
Codex reconnect available independently of another provider and distinguish a
failed history read from an empty list. Do not change profiles or copy histories.

Forty-one focused file, authenticated-handler, component and existing native
request-reconnection cases pass, as do the build and independent development
review. Native socket/subprocess restrictions prevent a clean broader local
protocol-suite result. An in-flight connection can finish bounded metadata reads
during shutdown; Coordinator stop guards prevent new reports/model actions.
Source publication, updated installation and actual browser restoration are
separate acceptance checkpoints, not inferred from these fixtures.

1.6.0 installation checkpoint: payload1be90991002cc4897f9a5fbd5fefdbab7b9dbc7c
is SSH-published and installed through authorized AAP ad hoc3543, successful
in22.884s. Eight protected files, ownership/modes, three saved worker IDs,
Coordinator identity/pause and report intervals were preserved. Independent
verification3548 succeeded in7.086s:108 installed source files match, actual
HTTPS reports1.6.0, authentication gates, both listeners and two served assets
match, and34 installed backend fixture cases pass. Seven UI component cases
passed in the build checkout; production intentionally omits their TypeScript
build dependency, so they are not claimed as production browser tests.
The initial verifier failed due to an incomplete PATH, then a build-only test
prerequisite; neither required another deployment or a production dependency.

Native history discovery lists all three saved workers. The operator observed
the restored tabs before the1.6.0 rollout; updated browser interaction and a full
host reboot remain unverified. Automatic native Codex/Dolt boot startup needs
the separately requested decisions. No reboot, daemon bootstrap, profile copy,
new database, native approval answer or uncertain-command replay occurred.

## 2026-11-11 — Reproduce Beads settings and its approved boot service

Implementation: `c58aad4f5327ddc39f3f796f28de2e34933d8f15` (1.7.0).

The user requested deployment/CaC coverage for the current Beads configuration
and explicitly approved an owner-level service using native database start/stop.
The existing runtime loader now accepts a nine-key string map and a strict
boolean startup option. Empty/default inputs preserve existing settings.
The native CLI applies changed values only, retaining unrelated settings,
tracker identity and tasks. This preserves disabled history-shortening settings
without running maintenance or introducing a configuration wrapper.

The optional unit uses the verified native tracker location, starts before
required database reads and preserves existing shared data. Owner checks and
exact prior-unit adoption prevent replacing a conflicting service. Privileged
manager operations use trusted system executables. Native Codex bootstrap stays
separate at its already approved safe idle checkpoint; no new daemon or startup
architecture is substituted.

Validation:14 affected native-Ansible fixtures pass, strict offline production
lint checks17 files without failures/warnings, syntax and production build pass,
and independent corrected-source review finds no blocking issue. A wider
29-case deployment run passed28; its local frontend case could not bind a socket
under native permissions. No access controls were changed. Boot fixtures use
isolated service substitutes, not a real reboot. Normal AAP import/deployment and
preservation reruns remain separate from publication and existing-install checks.

A fresh private-repository fetch found newer approved successor settings than
the old local audit: the selected successor already follows main, while an
earlier instance remains retained. Preserve those source selections and update
only the selected instance's encrypted Beads settings and embedded ciphertext.
Earlier unnecessary technical questions are withdrawn by their author, rather
than recorded as user answers. Both real boot-startup choices remain settled.

1.7.0 existing-install verification: published payload
`16e00ac479dac854717fd59cd041266eda00ea2c` installed through authorized AAP3555
(success20.164s). Nine protected configuration/authentication/certificate/native
profile/startup files retained their bytes, modes and owners; three saved worker
IDs, Coordinator, pause and report settings remained intact. AAP3556 succeeded
in7.601s:108 installed source matches, actual1.7.0 trusted HTTPS, two served
assets, authentication gates/both listeners and34 installed backend fixture
cases. The existing database unit remains enabled/active and native task reads
succeed. No provider/model call, native Codex bootstrap or reboot was performed.
Normal playbook/fresh-target deployment and actual browser/reboot acceptance are
not established by these existing-install checks.

## 2026-11-11 — Keep blocked child tasks visible

Implementation: `b8a4d4e6f5ccb0387c0609e666bdbabd65458ef3` (1.8.0).

The user reported a blocked task missing from TASKS. The native record had its
correct conversation link, and the installed projection included it, but native
blocked output listed its hierarchy parent as a prerequisite. CCNG displayed
Queued and placed it after eight running tasks, outside the three-row viewport.
No frontend task truncation was found.

Exclude only the explicitly identified hierarchy parent from prerequisite
blocking; preserve distinct unfinished prerequisites. After classification,
show genuine Needs input first, actual Blocked work second and retain the
existing stable order for remaining tasks. Do not infer questions from prose,
change another worker's records or answer its pending native confirmation.

Validation:14 focused Beads tests and29 adjacent attention/notification cases
pass, as do the production build and independent source review. The regression
covers a mixed fifteen-task list, parent-only blocked children/questions, real
prerequisites, totals and unchanged native records. Read-only installed diagnosis
established the original Queued/index-eight behavior under the actual service's
tracker routing. Publication and corrected installed/browser outcomes are
recorded separately; a standalone diagnostic without that routing failed rather
than initializing or selecting another tracker.

1.8.0 installed verification: payload
`b2ecc7467263cbdfd7397ac0ed5afdfeb4597028` updated through authorized AAP3559
(success19.504s). Nine protected files/metadata and three saved workers plus
Coordinator/pause/report settings were preserved. AAP3560 succeeded in7.353s:
108 file matches, actual1.8.0 trusted HTTPS/assets/authentication gates/both
listeners and48 installed backend fixture cases pass. The current reported
task had independently changed from Blocked to In progress after the user's
message to its worker and appeared second in the verified native task projection.
Its parent relationship remains intact, without a false prerequisite blocker.
No task record or native approval was changed by this visibility fix. Actual
browser rendering remains separate from installed projection evidence.

## 2026-11-12 — Reload unloaded native conversations before input

Implementation: `91ac24a56aafdcdc27e9c721fc43f3026f4ea6ad` (1.9.0).

The user reported that saved chats refused input with native thread-not-found
errors. Read-only native inspection confirmed that every saved conversation
still existed, while several were unloaded. A previously attached CCNG view
could observe this state but skip activation because it had been loaded before.
The next input then targeted a missing live session rather than its saved history.

Use the existing activation path when current native status is notLoaded, and
observe native close notifications. Keep background reads passive. Resume the
same worker with no model or permission overrides; the Coordinator reapplies
its existing restrictions and requires native read-only confirmation. Verify
exact identity, current connection/ownership and returned input permission before
submitting a message. Preserve pending requests, explicit stops, handoff gates
and active steering; never catch and resend an uncertain native submission.

Independent regressions first reproduced the defect (nine failures among eleven
initial cases). Sixteen final cases cover unload events/polling, exact activation,
single delivery, replayed approvals, failures, identity/connection races and
Coordinator restrictions. The focused source and draft checks passed137 cases;
adjacent branch/handoff checks passed37. The production build passes. Independent
source review has no remaining blocking finding. Live publication/installation
outcomes are recorded separately below;
synthetic delivery does not establish actual browser/model input acceptance.

Published payload `7266e358261103245cdad737de01c29bca0bfe84` installed through
authorized AAP3608 (success19.376s). Nine protected files/metadata, six saved
workers, Coordinator identity/pause/report settings and the native runtime
version were preserved. Independent AAP3609 succeeded7.183s:108 installed
source matches, actual1.9.0 trusted HTTPS/assets/authentication gates/listeners
and64 installed backend regressions. Native reads still find every saved
conversation; the Coordinator is active again, and an existing worker approval
remains pending. No test message or approval answer was submitted.

Earlier update preflights stopped before installation on a diagnostic key typo
and an overly strict spelling check for the existing Git origin. Read-only
inspection confirmed the same repository with an HTTPS URL lacking the optional
.git suffix. Fetching used its SSH equivalent without changing saved origin.
One intermediate read-only diagnostic had a Python indentation error; it made
no changes. None of these attempts installed code or restarted the service.
Physical browser submission remains unverified until a genuine user follow-up;
the source/installed tests do not replace that acceptance.

## 2026-11-12 — Keep internal task checks free of routine commentary

Implementation: `ce44c3849b660778af27f8cd662d0f01c0cf91ab` (1.9.1).

The user reported repeated acknowledgements before silent checks. Some workers
were following ordinary tool-introduction guidance despite the existing request
for silence. Make the specific internal-control exception explicit: no opening
commentary, tool introduction, acknowledgement, plan or no-change summary, even
before tools. Unchanged held, deferred or blocked tasks are not new findings.
Useful findings, failures, real questions and substantive work updates stay visible.

Put the rule in runtime base guidance for new/restored turns and in each check
payload for already-active steering. Keep existing native history, rendering,
provenance, cadence, queues and permission guards unchanged. Authoritative and
mirrored shared instructions receive the same scoped rule; preserve unrelated drafts.

The affected existing instruction, cadence, import, restoration, Coordinator and
message/provenance checks pass 147 cases. The production build and independent
source review pass. No model call was manufactured to test obedience. Backend
restart is needed to load the new module text; successful instruction delivery
does not prove future model compliance. Publication/installation and the next
genuine silent-check observation remain separate evidence.

Published payload `8b28acb51108e648c78168302e0f851f90caa1ee` installed through
authorized AAP3613 (success 19.373s). Nine protected files/metadata, six saved
workers, Coordinator identity/pause/report intervals and native runtime version
were preserved. Independent AAP3614 succeeded in 7.596s: 108 installed source
matches, actual 1.9.1 trusted HTTPS/assets/authentication gates/listeners and
95 installed backend cases pass. The installed base guidance and active-check
payload both contain the explicit silence exception. No native model test,
approval answer, permission change or timer change was performed. Actual future
agent compliance remains unverified; an acknowledgement recurrence is a reason
to reopen this correction, not evidence that output filtering was implemented.


## 2026-11-12 — Enforce task-table reports and improve conversation tabs

Implementation: `9c74a68e065f107812db291362c5997a185733ff` (1.10.0).

The user requires a consistent vivid Report now overview: one task, exact
coloured status and useful outcome/next action per table row. Put the canonical
format in base guidance and every manual/scheduled/Detailed trigger, including
already-active steering. A small dependency-free validator replaces the older
colour-bullet recognizer in the existing completed-report path. Require a blank
line after the table and release/publication/deployment evidence. Empty or
unavailable task lists are explicit, without invented placeholder tasks.

Reject tables inside prose, code, quotes or comments by requiring the overview
at the start, optionally after the exact Standard Task Report heading. Invalid
replies remain visible with a useful format error; no automatic resend, hidden
output or new reporting pipeline is added. Preserve exact turn/message/native
acknowledgement guards and Detailed history bounds. Shape validation cannot
establish task truth or guarantee model obedience.

Desktop hover reveals full titles horizontally while only selection increases
height. Above six conversation tabs, counting Coordinator, use two stable grid
rows and put the selected worker row nearest the chat. Preserve saved/global
order and keyed tab identities. Keep a separate Coordinator and a native
horizontal overflow strip without a scrollbar gutter. Mobile explicitly
supersedes older wrapped-tab guidance: one horizontally scrollable row with no
hover/row switching. The user's follow-up makes the active worker/Coordinator
background match its input-title tint using shared existing palette tokens;
inactive fills and status/frame rules are unchanged.

Independent review found direct vertical cross-row dragging still cancelled, a
scrollbar gutter regression and hidden-example false report acceptance. Focused
fixes and regressions address each. The full initial suite passed86/94 test
files; one in-scope old report fixture was corrected, retaining a conforming
question-title negative. The other seven files hit restricted sockets/home
fixture/process execution or empty child-CLI output. Direct app help succeeds,
but the exact cause of empty child output remains unknown. No permission
changes, weakened assertions or remote retries bypass those local limits.

After the fixture and tint corrections,287 affected individual cases pass,
production build and whitespace checks pass, and independent final source review
has no blocker. Actual browser hover/edge reachability, phone interaction and
live model report generation remain unverified. Publication and installed
verification outcomes are recorded separately after execution.


Published payload `84ff4fcb52192375b94f03859f14049f053a1bab` installed as1.10.0
through authorized AAP3640 (success20.374s,2026-11-12 11:52:03–11:52:23UTC).
All nine protected files/metadata, eight saved worker IDs, Coordinator identity,
pause/report settings and native runtime version were preserved. Independent
AAP3641 succeeded10.361s (11:52:43–11:52:53UTC):110 installed source matches,
actual trusted HTTPS/version/assets/authentication gates/listeners and209
installed backend cases passed using synthetic native transport. Existing
Beads unit/read and installed silence instructions passed. No real model input,
approval answer or native bootstrap was submitted. Browser-rendered acceptance
remains separate; the user subsequently confirmed tab resizing was visible and
requested fuller use of available space plus temporary hover tint refinements.


## 2026-11-12 — Fill available tab space and keep browser-only alerts

Implementation: `8283b993dbc7d8cf169c4f5030afb4efc0ec6698` (1.10.1).

After seeing1.10.0, the user confirmed tab resizing and requested normal tabs
fill available space before Coordinator while preserving the six-tab threshold.
Use the existing worker strip as an inline-size CSS container, dividing its
actual viewport by the stable column count after gaps, with a170px minimum.
The hovered title keeps this baseline minimum and may widen intrinsically; its
width cannot feed back into the viewport calculation. Mobile keeps fixed-width
horizontal scrolling. Hover also temporarily adopts the conversation's saved
input-title tint, preserving frame/status colours and restoring neutral inactive
fill on leave. No observer, new setting or dependency is added.

The user rejected the in-app Completed/Open task banners and clarified browser
notifications were wanted. Remove banner state/rendering/component/CSS and
banner-only text. Preserve Notify me subscriptions, exact origin click handling,
generic desktop payloads, deduplication and reconnect baselines. Send new opted-in
events through the native Notification API while focused as well as hidden;
otherwise removing the banner would silently consume foreground events.
Permission prompts remain explicit checkbox/button gestures; denied/unsupported
states use existing settings feedback without a fallback panel. No service
worker, external delivery service or closed-browser delivery is added.

All106 affected UI/notification/layout cases pass (3.177s), including execution
of the actual app notification effect with a real engine and native stub. The
production build, whitespace check and independent source review pass. No issue
occurred in these final patch checks. The broader1.10.0 full-suite restrictions
remain recorded above; those unrelated failures were not hidden or rerun around
permissions. Actual browser geometry and operating-system notification display
remain unverified. Publication/installation outcomes follow separately.


Published payload `e237972993c55078f527d2dc47804a10c0b78062` installed as1.10.1
through authorized AAP3642 (success20.644s,2026-11-12 12:02:05–12:02:26UTC),
preserving all nine protected files/metadata and eight saved workers plus
Coordinator identity/pause/report settings/native version. Independent AAP3643
succeeded9.363s (12:02:55–12:03:04UTC):110 exact source matches, actual1.10.1
trusted HTTPS/assets/authentication gates/listeners,209 installed backend cases
and existing Beads unit/read pass. Served CSS contains available-width sizing
and no task-banner rules; served JS retains opt-in native notifications.
Installed silence instructions pass. No native model input, approval answer,
permission change or bootstrap was submitted. Browser geometry and OS display
remain unverified; refresh the browser to load the new bundle.


## 2026-11-12 — Share approval analysis while keeping one final approver

Implementation: `a5e25c5f6aac4a3930334c0a29dd6738c086087e` (1.11.0).

The user selected two read-only reviewers after observed approval waits and
required the main Coordinator to keep its concern/next-step explanations and
identical review criteria. Use two bounded ephemeral native analysis threads on
the existing connection. Share the actual policy text and bounded read tools;
recommendations never approve anything. Preserve current request/user/source
checks, native confirmations, manual asks, pauses and unknown outcomes. Supply
findings through existing list/read tools so saved Coordinator conversations
need no replacement or new dynamic tool. Retain unknown work until evidence
resolves it, and prune terminal ownership without a new scheduler or store.

Fix the independent scheduling defect by retaining the earliest event wake and
urgent priority through a busy main turn. This removes avoidable timer delays;
neither it nor two parallel analyses establishes an end-to-end response deadline.

The user also requires readable verified AAP object names beside IDs. Put one
shared reporting rule in worker and Coordinator guidance, with explicit unknown
names and ad hoc purposes rather than invented templates or secret reads.
A reported source-reader refusal exposed an auth-substring filename false
positive. Share one path predicate between generic and exact-token readers,
recognizing auth-specific name components while allowing ordinary authenticated
and author words; retain all other source, credential and request protections.
The original command is never executed or approved by fixing its reader.

Validation: all17 affected backend/instruction test files pass (6.426s), including
20 reviewer lifecycle and12 real-Workspace/fake-native integration cases. Build
and independent bounded review pass. Broader verification initially exposed
older Coordinator callback stubs and two unrelated-fixture scheduling assumptions;
optional routing and explicit isolated-fixture settings corrected those without
weakening their assertions. Real native capability checks confirm read-only
ephemeral options; ephemeral history paging is unsupported, and unsubscribe does
not prove immediate unload. No model turn or approval was submitted for that probe.

Publication and existing-install deployment follow this implementation commit.
At this record's checkpoint installed behavior, actual model recommendations and
end-to-end latency are not yet verified; physical browser acceptance remains
separate. These checks are development validation, not formal project acceptance.


### 1.11.0 publication and installed verification

Implementation `a5e25c5f6aac4a3930334c0a29dd6738c086087e` and payload
`a8510501051ab3b574fb3e604069de45a675a888` were published over SSH and remote
HEAD independently matched. The authorized existing-install update completed
in22.499s, preserving nine protected files/metadata and all seven saved worker
IDs plus Coordinator identity, pause, report settings and native runtime version.
Independent installed verification completed in10.921s:111 source matches, live
1.11.0 service/TLS/authentication/assets/listeners,294 installed synthetic-native
backend cases (5.403s), existing tracker access and silence instructions passed.
Installed checks confirm identical shared approval policy, two-reviewer limit,
AAP-name guidance and the authenticated-filename correction without executing
the originally requested helper or submitting its approval. Actual model
recommendations and end-to-end timing remain unverified by these checks.


A subsequent bounded read-only observation of genuine work confirmed ephemeral
analyst threads using the main Coordinator's existing model/effort and an actual
ready ask recommendation delivered through the saved Coordinator's existing
list tool. This establishes real recommendation delivery without manufacturing
a request, submitting a model turn or answering an approval from the diagnostic.
It does not establish full approval execution, reduced end-to-end latency or a
response-time guarantee. Idle cached threads are distinct from active analyses.


## 2026-11-12 — Native approval times and optional analyst assistance

Implementation: `d6830c58523f7ccbfdf7444fb498b8ea280c3d50` (1.12.0).

The user wanted the time an approval was actually raised, after message age was
mistaken for waiting time. Use the native command/file request startedAtMs field
for Requested at with full local date, seconds, timezone and exact ISO datetime.
Missing/invalid native time stays unavailable; do not infer it from chat, tools,
arrival or restoration. Keep native actions and identity unchanged.

A reported slow visualization review exposed avoidable context and instruction
problems. Analysts now receive shared rules from current main native metadata
rather than stale tab cwd, plus bounded original user instructions and existing
page-reference hints. A single native first-page read may recover user context
missing from the retained tail. Main approval still refetches the original page;
references and assistant summaries never authorize actions. Context-read failure
remains explicit while preserving request metadata and pending manual asks.

Remove the unnecessary instruction to wait for an analyst when sufficient
current action, source and real-user evidence is already available. The main
Coordinator may decide immediately through its unchanged final guards. Analyst
queue/dispatch, native acknowledgement, evidenced activity and terminal receipt
are distinct lifecycle facts; provider queue versus reasoning time is unknown.
This does not reduce model effort or guarantee a response time.

A directly imported Python module can map only to exact approval cwd or cwd/src
source layouts. There is no package lookup, import execution or dependency walk.
A separate selected-tab CSS bug hid genuine human-attention amber beneath the
selection frame; preserve the amber top in all themes without changing chat tint
or the neutral indication for eligible Coordinator review.

Validation:18 affected test files pass in7.617s, production build and bounded
independent review pass. Focused suites cover22 lifecycle,14 actual-Workspace
integration,8 context,9 source,5 timestamp and16 attention cases. These checks
use synthetic transports, genuine schema definitions and rendered test markup;
physical browser behavior and subsequent live approval latency remain unverified.
Async file-context tests now wait for the actual instruction-read boundary, and
old history fixtures distinguish records omitted from all delivered channels
from newly delivered original-user context; native mutation guards remain.
Publication and installed verification follow this implementation checkpoint.


### 1.12.0 published and installed outcome

Implementation d6830c58523f7ccbfdf7444fb498b8ea280c3d50 and payload
6dcefd72b3c9f04b5f850e5ca481d5974f89afaa are published over SSH and
independently matched to the remote. The authorized24.007s existing-install
update preserved nine protected files/metadata, all seven saved worker IDs and
Coordinator identity/pause/report/native runtime. Independent11.134s verification
matched111 installed source files, live1.12.0 trusted HTTPS/authentication/assets/
listeners,308 installed backend cases (5.661s), existing tracker access and silent
check instructions. Served JS contains native Requested at/unavailable labels
and local offset formatting; served CSS retains active attention amber.
A temporary verifier initially expected double quotes in minified JS; inspecting
the artifact showed equivalent backtick literals. Correct the artifact matcher
to accept those quote styles without changing the application or time semantics.
Physical rendering and fresh live end-to-end latency remain unverified by these
checks; no model turn, original helper or approval was executed by verification.


A bounded genuine-review observation during the restart completion window found
an approximately129s request-to-confirmed decision: about52s analyst dispatch to
terminal result and70s afterward to the main decision. This is not a clean
before/after benchmark, and the latter interval is not isolated model-processing
time. It confirms residual latency rather than a general speedup guarantee.
Further reasoning-effort tuning is a separate user choice; no effort or model
setting was changed by this release or diagnostic.

## 2026-11-12 — Mobile chat jump navigation

Implementation: `6757d403f8a1a40175dfc4d7bba7396ff4d028b8` (1.13.0).

The user wanted a top-of-screen control while reading long mobile conversations,
with Jump to end available after returning to the beginning. Keep the existing
document scroller and add one mobile-only sticky button above the header. Its
normal-flow position leaves header controls reachable at page start; sticky
positioning keeps the button available during a long scroll.

Use the current page position to choose the action. Jump to top returns to the
document beginning. Jump to end reads the selected conversation's current
composer bounds, revealing the latest history and input without focusing it or
opening the keyboard. Recalculate after scrolling, resizing and history growth;
remove observers/listeners when changing chats, leaving mobile or unmounting.
Keep desktop reading positions, explicit history pagination, drafts and native
request behavior unchanged. No dependency, storage or native-runtime change is
needed for this browser interaction.

Six new behavior cases exercise actual component handlers with simulated hooks
and geometry. Five affected test files pass in 4.156 seconds, the production
TypeScript/build checks pass, and independent source review found no blocker.
These checks do not establish physical phone rendering, sticky geometry,
keyboard or rotation acceptance. Publication and existing-install verification
follow this source checkpoint; the broader phone acceptance task remains open.

### 1.13.0 installed outcome

Implementation `6757d403f8a1a40175dfc4d7bba7396ff4d028b8` and
payload `2468772f14af2594b5abce7b26747f8ec6d21b29` were published over SSH and
independently matched to the remote. The 21.698-second existing-install update
preserved nine protected files/metadata, all eight saved worker identities,
Coordinator/pause/report settings and the native runtime version.

The 5.085-second corrected read-only verifier matched 112 installed source files,
live 1.13.0 HTTPS/authentication/assets/listeners, tracker access and the served
mobile navigation labels/sticky styles. An earlier verifier failed after those
runtime checks because trimming an unrelated test block also removed its Node
executable-path initialization. Restore that verifier variable and rerun the
read-only check; no application fix, reinstall or second restart was needed.
Physical-phone rendering, keyboard and rotation remain unverified.

## 2026-11-12 — Show each mobile navigation destination independently

Implementation: `10862443279feb139f9d60a0e16f319e08750f2b` (1.14.0).

The user clarified that Top and Bottom are independent controls: show Top when
the app section above history is out of view, Bottom when the history end is
out of view, and both in the middle. Replace the single document-start switch
with actual history bounds. This also keeps Bottom available while the overview
is visible at a nonzero page offset. Each button retains its own direction even
before a scroll event is processed, and refreshes visibility after navigation.

Retain the existing sticky document-scrolling control and a stable-height row
so appearing buttons do not move their own visibility boundary. Observe both
history and its surrounding panel for content/overview resizing. Keep current
composer geometry for Bottom, without focusing input. Desktop positions, drafts,
native actions, explicit pagination, dependencies and storage are unchanged.

Ten actual-component regression cases pass, including both/one/neither states,
viewport boundaries, delayed scroll events, growth/collapse, switching and
cleanup. Four adjacent test files pass in 2.700s, the TypeScript/build checks
pass, and independent source review found no blocking issue. These are simulated
geometry and source checks; physical-phone keyboard, rotation and sticky
rendering remain unverified. Publication and existing-install verification
follow this source checkpoint.

### 1.14.0 installed outcome

Published implementation `10862443279feb139f9d60a0e16f319e08750f2b` and
installed payload `0abe86a84b5fb7ce5a45d64a85e01c82328463aa` were independently
matched to the SSH remote. The existing-install update completed in 20.626s,
preserving nine protected files/metadata, eight saved workers and Coordinator,
report and native-runtime settings. Independent read-only verification completed
in 5.133s: 112 installed files matched, live 1.14.0 trusted HTTPS/authentication,
both served assets, listeners, existing tracker and navigation labels/styles
passed. No model/native request was created or answered for verification.
Physical-phone rendering, keyboard and rotation remain open acceptance gaps.

## 2026-11-12 — Review safe playbooks and documents

Implementation: `857944dd584c70b85071ccb2a215ef665f09e9a8` (1.15.0).

The user requested that the existing source reader review playbooks, JSON, YAML
and Markdown as well as Python/shell helpers. The old approval-bound extension
list excluded these documents, while the ordinary project reader also lacked
JSON. Extend those existing paths rather than introducing another reader or
changing native tool grants. The compatibility path remains available to older
saved Coordinators without the dedicated approval-source tool.

Preserve exact request, token, cwd and source-hash checks for outside-project
files and recognize literal Ansible `@file` inputs. File content remains evidence,
not user authority; reads execute nothing and resolve no template values. Add
shared format-aware credential checks and recheck sensitive resolved project
paths so the wider formats retain secret/Vault protection. Native JSON parsing
handles escaped keys without executing source. Keep code annotations and normal
environment/Jinja references readable. Conservative detection can still require
private review of credential-like metadata or unusual YAML; it does not certify
that arbitrary source is secret-free.

Independent review identified numeric/escaped JSON values, a mixed-template
literal gap and false refusals for ordinary code/prose. Focused corrections and
regressions resolved those findings. Final 13 source-reader and 97 Coordinator
cases pass; six adjacent reviewer/context/hook suites pass in 1.057s. Syntax,
TypeScript/build and diff checks pass, and independent re-review found no
remaining blocking issue. These are synthetic file/tool-request checks, not a
genuine pending approval or formal AAP acceptance. Publication and installed
verification follow this source checkpoint.

### 1.15.0 installed outcome

Implementation `857944dd584c70b85071ccb2a215ef665f09e9a8` and installed payload
`c9eed7d4744d1598d67bc133b2b8804c2cf2ab65` were published over SSH and
independently matched to the remote. The 23.162s update preserved nine protected
files/metadata, eight saved workers, Coordinator/pause/reports and native runtime.
Corrected 7.445s read-only verification matched 112 installed files, live 1.15.0
trusted HTTPS/authentication/assets/listeners/tracker and existing controls.

All 170 checks across eight existing suites passed against the actual installed
server modules in 2.176s. The installer does not ship development tests; an
initial verifier failed by assuming otherwise. Stage the existing versioned
tests in a private temporary directory with their server imports linked to the
installed modules, then remove that directory on exit. README now records this
repeatable procedure. No application fix, second update/restart, dependency,
framework or genuine native approval/model call was needed. Native-client tool
exposure and subsequent genuine approval outcomes are not established by these
isolated checks; existing pending user decisions remain unchanged.

## 2026-11-12 — Preserve native chat order and delegate progress

Implementation `9e18470664691de18050e46ea20265687b665e35` (1.16.0) fixes native-history merging so
recent refreshes preserve loaded older pages, the oldest cursor and newer live
messages/completion state. Native turn/item order remains authoritative; no
clock sorting or transcript rewrite is introduced. The silent 600-record trim
was removed because it discarded fetched records, including large native turns.
Existing explicit 20-turn native pagination remains; loading larger histories
uses more process memory. The quoted incident's original messages remained in
native history, so this is an order/loaded-view correction, not recovered
deleted content. Concurrent pagination and live-update races were fixed after
independent review, while nested native question bindings remain intact.

The user selected one additional native progress helper combining routine
worker progress, linked-task/blocker monitoring and sidebar publication. This
separates routine monitoring from the sole automated approver and the existing
two optional approval analysts. The helper has bounded worker-read/sidebar
tools, the main model/effort/shared instructions and existing RPC/events. It
cannot approve, execute, message workers or change tasks; main approval checks
and concern responses remain. Unknown starts retain their slot and native
decisions remain pending. No extra service, timer or persistent store was added.
A concurrent publication race found in review was fixed with a reservation.

Validation: 16 history, 5 timestamp, 10 helper lifecycle and 4 Workspace wiring
cases pass. Wiring covers a final main approval while the helper and both
analysts are active. Independent targeted reviews, TypeScript/production build
and syntax/diff checks pass. Local full npm test passed 95/102 file suites in
50.078s. Bounded direct checks traced the seven failures to socket/subprocess
EPERM and installer fixture EROFS under the local sandbox; tests and permissions
were preserved. Normal-backend full-suite verification and existing-install
update remain pending at this source checkpoint. Synthetic tests do not prove
real model-helper publication, picker behavior or latency improvement.

### 1.16.0 publication and installed outcome

Implementation `9e18470664691de18050e46ea20265687b665e35` and installed payload
`a3503417df5bf6d195770e1cdbcce34b501d4f7f` were published by an exact standalone
SSH push and independently read back. The prior compound commit/push invocation
ran under restricted permissions and failed the system SSH ownership check; no
SSH configuration, credentials or permissions changed and no backend Git-bundle
publication workaround was used. The earlier general SSH-blocker diagnosis was
superseded; no pending user choice was answered on their behalf.

Initial backend validation lacked source-checkout build dependencies and stopped
before installation. Preparing the exact declared lockfile dependencies, already
used by the authorized installer, enabled the unchanged full suite: 1,071 passed,
zero failed, one skipped in 56.338s. The resulting validation/update completed in
82.029s, preserving nine protected files/metadata, eight saved workers, Coordinator
identity/pause/report settings and native runtime version. Installed verification
matched 113 source files, confirmed live 1.16.0 HTTPS/authentication/assets/listeners
and tracker behavior, and passed all 288 checks across 16 suites against installed
server modules in 2.951s. The temporary test harness was cleaned afterward.

Natural ephemeral progress-helper threads using the selected model were observed,
including one active. The provider refuses both paged and includeTurns history for
ephemeral threads. Metadata is evidence of startup, not completed publication or
latency improvement; these outcomes and actual browser acceptance remain unverified.
No synthetic native model turn or approval was created. The separate source-reader
false-positive investigation remains held; this release changes no reader filter.

## 2026-11-13 — Keep large browser streams open and restore Send safely

Implementation `3ef94b38fb34bed9a56051fe5131832281e06029` (1.17.0) corrects two related browser
failures. A normal full history snapshot could exceed the 4 MiB queued-output
cutoff, so a later update could close its still-valid event stream. Actual-source
authenticated-handler tests reproduced closure of a synthetic 6.65 MiB frame
and additional writes after write(false) against the prior 1.16.0 revision.
The production browser also reported an incomplete chunked response and a full
snapshot above that threshold while both native connection flags were true.
The original individual close was not logged; intermediary involvement remains
unproven rather than excluded.

The existing SSE channel now honors write/drain, with one in-flight frame and a
coalesced latest-update flag. Initial snapshots and heartbeats use the same flow
control. Session validation still runs for blocked clients; other clients proceed
independently and closed clients remove listeners/timers. Loaded history is not
trimmed. No delta protocol, new timer, service, persistent store or dependency was
added. Existing service logs receive only numeric/allow-listed native transport
codes and the first backpressure byte count per browser connection.

Browser transport loss had also overwritten a shared connected flag, displaying
a native-disconnected banner and disabling Send. Normal reconnect signals now
trigger the existing authenticated state GET. Only a current authoritative result
or snapshot restores sending; later snapshots/disconnections/reads/login changes
invalidate obsolete success and error results. Failed read-only recovery checks
can retry on later existing transport signals. This does not resume Codex, answer
requests or replay input. Browser recovery has separate wording while real native
disconnection retains its existing control. Draft/request/ownership guards remain.

Verification: five large-stream/session/cleanup cases, seventeen actual-effect
state-order/recovery cases and eight native-versus-browser UI cases pass. Seven
affected file suites passed together in 6.689s; TypeScript/production build,
syntax/diff and independent source review passed. Review corrected a diagnostic
code-payload mismatch and a test selector that matched the wrong conditional;
behavior assertions were preserved. Backend full-suite, installation and live
stream observation are pending at this source checkpoint. This is focused
application verification, not formal Ansible/AAP acceptance.
