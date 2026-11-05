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
