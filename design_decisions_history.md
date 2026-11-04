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
