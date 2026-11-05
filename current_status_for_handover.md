# Current status for handover

Updated: 2026-11-05. This is a development handover snapshot. Beads remains the
task source of truth; do not use this file as a second backlog.

## Versions and publication

The authoritative version is **0.24.0** in package.json and the lockfile.
0.15.0 implementation: `af85de795c2339b64bf72e1256cc656d763491a6`.
Worker capacity implementation: `d69bbb9ebead227e107869e33e72ab80b68efb27`.
Implementation: `36f5eff4e66283314e4749fd82bcdcea3c07d819`.
Implementation: `2f8a45ad9846ea9799112395cb9effc4bf945a36`.
It adds explicit multiple-request visibility and continued independent review to
the published 0.11.1 recap wording and 0.11.0 UI/deployment artifacts. See
current Git/remote refs and design_decisions_history.md for implementation and
publication state. Earlier SSH publication retries preserved the existing keys
and access controls.
The formerly local 0.6.0/0.7.0 checkpoints and the 0.7.1 spacing correction are
included, alongside the 0.8.0 conversation safeguards. The earlier published baseline was 0.5.0 at
`c24d84c318fe967993bd3e00552e129e7d32531e`.
The agent did not update or restart the user's installation or native daemon;
source publication alone does not deploy these changes. The user's last confirmed
installed version is 0.22.0; the current user service status has not been confirmed.

| Version | Local implementation | Decision record |
| --- | --- | --- |
| 0.5.0 | `38063bf322a849ff0ddce14e205bf91e73de6a74` | `c24d84c318fe967993bd3e00552e129e7d32531e` |
| 0.6.0 | `5b63d56a9e99b46631dbeb166f1ca24ff3d6c46e` | `a00a400b17c295e33bfb5282c181c7dbd60c84db` |
| 0.7.0 prerequisite checkpoint | `818b3cd059325456efe206ee06f61f179d3b4a7f` | `70ad201` |
| 0.7.1 spacing correction | `101f2f6` | `7ea87d4` |
| 0.8.0 conversation-role/project safeguards | `e1e9363` | Recorded in design_decisions_history.md |
| 0.8.1 coordinator tab style/order | `1cfc9b8` | Recorded in design_decisions_history.md |
| 0.9.0 pending request recovery | `6e78051` | Recorded in design_decisions_history.md |
| 0.9.1 connected folder tabs | `162bb73` | Recorded in design_decisions_history.md |
| 0.9.2 visible-tab emphasis and top spacing | `cf29429` | Recorded in design_decisions_history.md |
| 0.9.3 chat clipping inset and inactive tab fill | `a9f29df` | Recorded in design_decisions_history.md |
| 0.10.0 current-conversation branching | `ec4cb6e` | Recorded in design_decisions_history.md |
| 0.11.0 compact activity, drafts and RHEL 9 playbook | `70490b8` | Recorded in design_decisions_history.md |
| 0.11.1 named coordinator outcomes | `a75515d` | Recorded in design_decisions_history.md |
| 0.12.0 all delivered pending requests | `2f8a45a` | Recorded in design_decisions_history.md |
| 0.13.0 saved decision format and feedback | `36f5eff` | Recorded in design_decisions_history.md |

Inspect Git status and history before continuing. Use SSH for authorized Git
network operations and preserve unrelated edits. Keep numeric versions and
README changes consistent with implementation commits; record their real commit
IDs in design_decisions_history.md.

## Worker capacity: 0.14.0

The workspace accepts sixteen workers plus the separate coordinator. UI, backend,
branching, parent navigation and workspace save/restore use the same limit from
server/limits.json. Existing four-worker saved files need no migration. Native
Codex subagent concurrency and permissions are unchanged. Source publication
does not upgrade or restart an existing installation.

## Named outcomes in coordinator recaps: 0.11.1

The user explicitly rejected recaps dominated by task IDs, idle status and closed
record bookkeeping. Shared reporting guidance now asks for named work, useful
outcomes, unfinished work and a specific blocker/next action, distinguishing
published code from deployment and live verification. IDs are optional references
beside names when asked or needed for an internal handoff, not explanations.
New/restored native instructions, event reminders and worker report requests
carry the guidance. This does not require replacement of an existing coordinator
or updated native tool descriptions. After updating the app, Summarize now or
the next automatic event can produce a new recap; old prose is not rewritten.
No live worker report/model call was used for validation, and no approval policy,
native daemon or user installation was changed. Model wording still requires
real use to assess. Deployment and Claude prerequisites remain open separately.

## All delivered requests in coordinator review: 0.12.0

The user reported the coordinator seeing one request while four were open.
Source inspection and native-protocol fixtures confirm the backend already
retains simultaneous requests; the coordinator did not reliably inspect/continue
the full list. Worker reads now expose requestSummary counts alongside every
request's received parameters and independent token. Counts separate request
records from nested clarification prompts. Review results return the current
remaining list, and resolution/referral keeps other unreviewed approvals marked
for the existing scheduler. An ask leaves that request open without blocking
independent review of the others. Existing referrals/errors do not create
automatic repeat reviews. New/restored instructions and events carry this rule.
No bulk approval, permission change or automatic native rejoin is introduced.
Native waiting flags still cannot prove the number of unreplayed requests.
All 90 application tests and build pass; two new regressions failed before the
fix. Validation used synthetic requests only, not real user approvals.

The user also asked why two dashboard tasks looked blocked despite delivered
features. Existing records were narrowed to the pending ordinary-chat question
tracking choice and fresh Beads/Dolt provisioning choice. The wider sidebar,
structured questions and prerequisite installer remain delivered; no decision
was inferred from this status question. Ownership/labels/dependencies were kept.

## Saved decision format and worker feedback: 0.13.0

The user explicitly requested Git-saved instructions plus a direct message to
the existing coordinator. The message was sent through the native follow-up tool;
no restart, permission change or worker approval was performed. Base instructions
and every event now carry a shared decision-format/feedback policy: two bullets
per request, one high-level action summary and one actual decision/rationale,
each one or two sentences. Vivid Unicode status markers and words make them
findable in chat without new UI/HTML rendering or a new dependency.

Non-approval feedback is instructed through existing ccng_send_summary, combined
per worker within its message limit. Offer an easy legitimate alternative or
wait for the user; no security workaround or automatic retry is authorized.
An ask remains pending. Feedback queues until pending requests are resolved and
the worker is idle; do not claim earlier delivery. A fixture verifies this path
without replying to or interrupting the blocked worker. This is model guidance
using an existing tool, not a new guaranteed notification transport.

The user answered YES to ordinary-chat unanswered-question tracking: the old
scope-choice blocker is resolved and that task is open for implementation/design.
The user also requested Markdown rendering; the current renderer remains partial.
A full GFM renderer using react-markdown plus remark-gfm was recommended; library
installation/scope approval remains pending. Neither feature is implemented by
this instruction-format release.

## Delivered baseline: 0.5.0

The published baseline includes native Codex workers and a separate coordinator,
Beads task links, native approval/question resolution, branch-summary return and
child closure, worker-tab reordering, and workspace restoration. A private
backend file saves open worker/coordinator IDs and coordinator pause state;
browser storage saves drafts, selected tab, order and reading positions.
Restoring views does not resume unloaded workers or start model turns.

It also includes the clearer airport-tower logo, exact command center NG
wordmark, compact worker tabs with top spacing, and a right-hand Add agent plus
violet coordinator group. Branding stays rightmost. Rendered design review still
awaits the screenshot the user offered after updating.

## Published UI changes: 0.6.0

The desktop goal/task sidebar is approximately 40% wider: 364–448px instead of
260–320px, with the existing responsive sizing. Mobile context remains stacked.

Open questions shows live native clarification requests, command/file approvals,
coordinator requests for user decisions, and unconfirmed-answer errors. Amber
counts/cards retain request identity and remain until native resolution. A
request with several questions lists each one. Clicking a row reveals its
existing answer card and focuses an enabled control; it never answers or
resolves the request. Requests owned by another native client show a notice.
The implementation is in src/open-questions.tsx and src/main.tsx.

Branch chat moved from the goal sidebar to the chat composer beside Interrupt
and Send. Per-reply Branch here remains. Composer controls wrap on narrow screens.

**Not implemented:** inference/tracking of unanswered questions written in
ordinary chat prose. The user has not answered the scope choice below. If the
coordinator is extended for this, verify compatibility with restored native tool
schemas instead of assuming existing coordinator threads automatically acquire
new tools or fields. No new question store or model call has been introduced.

## Published installer checkpoint: 0.7.0

The user requested RHEL 9 prerequisite checking, offers to install missing RPMs
using sudo after approval, Beads installation/configuration, and complete RHEL 9
documentation. Other distributions must be described as not yet tested.

Implemented in install.sh and installer/prerequisites.sh:

- `--check` inventories the environment without installation or configuration.
- RHEL 9 checks cover Node.js 22.12+, npm, Bash, Git, coreutils, tar/gzip,
  certificate trust, Beads interface compatibility, Codex daemon support and
  sign-in credential presence. The Dolt binary is reported separately.
- Missing RPMs can be offered through sudo with explicit terminal confirmation;
  DNF also shows its transaction. No stream reset or automatic conflict removal.
- Missing Beads/Codex CLIs can be offered as pinned target-local npm installs
  (`@beads/bd@1.3.2`, `@openai/codex@0.166.0`). Compatible global tools are reused.
- CLI packages are staged with the app and preserved across updates. The
  launcher includes its local CLI directory on PATH.
- Native device-code login can be offered. Deferring sign-in allows installation
  to finish while clearly reporting that agent operation is not ready.

The detailed guide is docs/rhel9-prerequisites.md. It explains RPMs, RHEL
repositories/Node streams, CLI locations, native daemon PATH, Beads/Dolt modes and
validation limits. Existing daemons retain their original PATH; do not interrupt
running work merely to add the newly installed Beads path.

**Not implemented:** fresh tracker initialization, Dolt server installation or
configuration, and Codex Beads hook setup. Existing trackers/routing/credentials
remain untouched. This required part of the installer request awaits the user's
architecture choice. Beads 1.3.2 supports embedded Dolt without a separate server;
its documented multi-writer mode uses a Dolt SQL server. A private local shared
server is proposed for four workers plus the coordinator. Do not silently select
that approach, initialize or migrate a tracker, or start a new service.

## Conversation confusion and spacing corrections: 0.7.1/0.8.0

Read-only diagnosis confirmed that older coordinator conversations could be
selected/restored as workers. It also confirmed RHEL conversations whose native
working directory and loaded instructions belonged to the application project.
The investigation did not establish every cause of the reported task mixing.

Version 0.8.0 excludes coordinators from worker selection and checks roles before
native resume or read-only restoration. New coordinators carry a native source
marker; older ones are recognized by their reserved native name. A renamed old
coordinator without the marker remains a documented limitation. Role mismatches
warn and preserve saved IDs for explicit recovery, without history rewrites or
replacement coordinators. New-worker creation requires an explicitly entered
project directory. Existing chats keep their native directories and histories.
Task context reiterates that summaries and shared records are not assignments or
user authorization. No new database, service or permission policy was added.

Version 0.7.1 removes the extra workspace top padding below the tab bar on desktop
and mobile, preserving the tab bar's internal top inset. All 67 current regression
checks and the production build pass. Three role regressions failed before the
fix; they now pass, alongside an explicit-directory regression. Browser rendering
remains unverified because no browser executable/tool is available.

The existing shared Dolt server was started at the user's request with
`bd dolt start`; independent status, task and memory reads succeeded. This restores
an existing server and does not approve fresh-installer server provisioning.
Some combined shell commands can still encounter sandbox socket/filesystem
permission errors; those errors alone do not prove Dolt stopped. Tools confirmed
working include shell/file edits, Node/npm, Git over SSH, Beads and native Codex
conversation reads/title updates. No new dependency was installed.

## Coordinator tab revision: 0.8.1

The user explicitly requested the coordinator match worker tabs and move to the
left of Add agent. It now uses the shared tab shape, height, typography and state
styling, retaining its own icon/chat and staying outside worker reordering.
Startup/retry uses shared tab markup as well. Existing compact mobile labels and
the zero workspace top gap remain. Project contributor rules and current docs
reflect this newer direction. All 67 existing checks and the production build
pass; header-order source review passed. Rendered browser review remains pending.
The agent did not update or restart the running user installation.

## Missing request recovery and folder tabs: 0.9.0/0.9.1

The user reported attention notices claiming another client owned a pending
request while using Command Center. The native thread was waiting for approval,
but the old UI inferred ownership from missing details. A regression reproduced
requests being dropped during resume before watching was registered.

The app now watches before resume and offers Load pending request for the selected
already-active conversation. Fresh status is read first; a native rejoin can
replay the original request IDs. It starts no worker turn and adds no worker
model/permission override. Ordinary chat sends wait while request details are
missing. Loading/errors remain scoped to that conversation, and unavailable
replay leaves an error and the pending state. Coordinator restrictions and its
existing review policy remain. Native user-verification requests excluded from
replay keep their native limits; missing details alone prove no client ownership.
Startup restoration remains read-only, with no stored answers replayed.

All 75 checks and the production build pass; six regressions failed before the
fix. Matching native 0.166.0 source confirms replay behavior. Direct arbitrary
socket diagnostics are restricted in the session sandbox; native read tools work.
No worker approval, interruption, permission change or application restart was
performed by this development work. The user subsequently confirmed their
installation was on 0.9.1 and that Load pending request worked. The latest native
read showed the worker active without an approval-wait flag. This verifies live
request recovery; it does not establish completion of the worker's underlying
task. The recovery bug is closed.

The user's original folder-tab request was verified in coordinator history.
Version 0.9.1 joins selected tabs to the pane using common fill and stronger
label/side edges, removing the bottom selection stripe, header/pane joining
border and scrollbar gutter. Horizontal scrolling, status/focus controls and the
coordinator-before-Add-agent order remain. Rendered browser review is unverified.

## Visible-tab emphasis: 0.9.2

The user clarified that the selected tab means the conversation whose chat history
is currently visible, independently of running/idle/attention status. Their newer
direction doubles the top inset from 8 to 16 pixels, makes that tab bigger and
uses bold text only for its label. The selected tab is about 40 pixels tall with
a 13-pixel bold label; inactive tabs stay about 34 pixels with regular 12-pixel
labels. Both groups align at the pane. Cyan top/side edges and brighter fill
fading into the pane reinforce selection; status dots retain their own colors.
No bottom selection stripe or joining line returns. Mobile uses the same inset
and size distinction. All 75 existing tests and the production build pass;
rendered desktop/mobile review remains pending. No installation was restarted.

## Chat clipping and inactive tab fill: 0.9.3

The user wanted scrolling text to disappear before reaching the bottom of the
tabs and inactive tabs to share the chat-history background. The conversation
scroll viewport now starts twelve pixels inside the pane. This fixed inset stays
clear while content scrolls, preserving the folder-tab/pane connection. Inactive
worker/coordinator tabs use the pane fill across activity states; the earlier
amber attention background is removed, with status dots and top edges retained.
Selected size, bold label and fill treatment remain. Desktop/mobile share the
inset. All 75 tests and the production build pass; rendered review remains open.
No running installation or native daemon was updated/restarted.

## Current-conversation branching: 0.10.0

The user identified a branch ending at an earlier reply despite later conversation
messages being visible in its parent. Read-only native metadata and message checks
confirmed the app's default completed-turn cutoff excluded the newer exchange;
this was not random session mixing or just unloaded history. No private transcript
or native identifier is stored in source.

Branch chat now omits lastTurnId and takes the native current stored-history
snapshot, including persisted messages from an ongoing turn. Its copied partial
turn is interrupted only in the child; the parent keeps working and its questions
remain unanswered. Branch here still passes a validated completed-turn cutoff.
Both actions retain deferred goal continuation, worker limits and existing
settings. The composer no longer requires a completed reply to offer branching.

Two synthetic regressions failed before the correction; all 77 tests and the
production build now pass. Matching installed protocol/source and the official
App Server documentation confirm native snapshot handling. No real user branch
was created, rewritten, archived or interrupted for this validation. Existing
branches keep their old snapshot; after updating, make a fresh branch to include
a previously omitted exchange. Rendered review remains pending.

## RHEL 9 deployment and chat refinements: 0.11.0

The user approved genuine RHEL 9, an unprivileged systemd application process,
and reuse of an existing Codex/Beads account/profile. The later explicit layout
puts deployment code, templates, synthetic examples and tests in this public
project. AAP CaC and actual deployment settings belong only as whole-file Vault
ciphertext in private command-center-ng-secrets. The companion was created and
GitHub private visibility verified. Its scaffold has no actual payload yet.
The required Vault credential source has been asked for and remains undecided.
Target identity is recorded only in protected context/Beads, not public source.

The entry point is ansible/deploy_command_center.yml. Its first guard rejects
other platforms before target changes. It preserves existing auth and native
services, protects profile/project paths, refuses unrelated units and dirty or
divergent source, and deploys using the maintained installer. Its system unit
runs as the existing account. No new Codex/Dolt bootstrap or proxy setup is added.
All seven isolated real-Ansible fixtures, syntax checking, offline unit parsing
and production lint pass. This development machine was not a deployment target.
A live target run, shared AAP importer catalog integration, actual CaC capture,
credential bindings and browser access verification remain open.

Consecutive tool activity now appears in closed expandable groups, retaining
per-action detail controls and visible running/failure counts. Native question
cards and conversation messages stay separate. Draft editing stays enabled while
questions/attention block sending; Enter becomes a normal newline while blocked.
The existing backend send guard stays in force. Delayed send acknowledgment does
not erase newer typing. All 85 application tests and the production build pass.
Interactive browser review remains unperformed. No user installation was restarted.

## Local Claude management and remaining setup

The user explicitly selected local read-write Claude management through the
official Claude Agent SDK. This supersedes the older read-only/SSH proposal.
Use the existing local backend and native login/permissions; no remote monitoring,
new daemon or permission bypass. Claude integration is not implemented in 0.15.0.

Ordinary-chat unanswered-question tracking and fresh local Dolt provisioning plus
Beads initialization are approved follow-up work, not unanswered scope choices.
The working development server/trackers stay untouched during installer tests.
The AAP deployment target is confirmed, but actual encrypted payload/importer
bindings and a live rollout remain unfinished. Review the earlier credential
answer before treating the user's choice as missing; Machine and Vault credentials
are separate concerns. Model/effort controls are requested, not implemented.

## Worker sidebar, Markdown and branch review: 0.15.0

All linked current tasks are returned in a scrollable panel with total, in-progress,
needs-input and queued counts. Queued is based on actual unfinished prerequisites.
Task details allow direct answers/clarification through the existing worker input,
leaving Beads changes to the working agent. Worker-specific scheduled reports offer
1h/15min/5min/Never, persist cadence privately, wait for safe idle, respect pause,
and do not start turns during restoration. Instructions require vivid report
labels, project release/publication evidence and available structured questions.

Chat renders Markdown/GFM with raw HTML disabled and horizontally scrollable
tables. Branch summary review is a nonmodal card in the child tab. Each review
retains its own edits while switching tabs; blocked return errors name the parent
and offer Open parent. No request is answered or dismissed by navigation.
Source publication and updating the running installation are separate operations.
Interactive desktop/mobile review remains unperformed.

## Beads references

| Issue | Current work |
| --- | --- |
| bead-wd-1rl | Broader Command Center project |
| bead-wd-1rl.23 | Rendered design review; source review done, screenshot pending |
| bead-wd-1rl.24 | Scope approved: implement ordinary-chat unanswered-question tracking |
| bead-wd-1rl.25 | Fresh local Dolt/Beads provisioning approved; implementation pending |
| bead-wd-1rl.26 | Role and project-directory safeguards published in 0.8.0; semantic/legacy-name limits documented |
| bead-wd-1rl.27 | Tab/chat gap correction published in 0.7.1 and included in 0.8.0 |
| bead-wd-1rl.28 | Shared coordinator tab styling/order published in 0.8.1 |
| bead-wd-1rl.29 | Closed: recovery published in 0.9.0 and confirmed live by the user on 0.9.1 |
| bead-wd-1rl.30 | Connected folder-tab source published in 0.9.1; rendered review remains in .23 |
| bead-wd-1rl.31 | Local read-write Claude SDK integration approved; implementation pending |
| bead-wd-1rl.32 | Closed: visible-tab emphasis and doubled top spacing published in 0.9.2 |
| bead-wd-1rl.34 | Closed: fixed chat clipping inset and matching inactive tab fill published in 0.9.3 |
| bead-wd-1rl.35 | RHEL 9 playbook implemented and locally validated; live target run pending protected inputs |
| bead-wd-1rl.36 | Closed: current-conversation Branch chat correction published in 0.10.0 |
| bead-wd-1rl.37 | Collapsed tool activity implemented in 0.11.0 |
| bead-wd-1rl.38 | Draft editing during questions implemented in 0.11.0 |
| bead-wd-1rl.39 | Closed: private companion scaffold published; actual setup remains in .40 |
| bead-wd-1rl.40 | Actual AAP/VM rollout unfinished; review prior credential answer first |
| bead-wd-1rl.41 | Closed: coordinator recap wording published in 0.11.1 |
| bead-wd-1rl.42 | Closed: multiple-request visibility/review published in 0.12.0 |
| bead-wd-1rl.43 | Two-bullet vivid decision instructions saved in 0.13.0; consult Git for publication |
| bead-wd-1rl.44 | Non-approval feedback policy and safe-idle fixture in 0.13.0 |
| bead-wd-1rl.45 | Markdown/GFM rendering implemented in 0.15.0 |
| bead-wd-ywg | Existing shared Dolt restart and successful reads verified |
| bead-wd-9so | Closed: generated Beads no-remote Git rule investigated and corrected |

Read these records before updating them. Use the next chat's own conversation
label when working on an issue; do not inherit the previous chat's label or
relabel unrelated tasks. Keep remaining work open until actually delivered.

## Git hook correction

Beads 1.3.2's native SessionStart hook generated an unconditional no-remote Git
rule when run from the non-Git parent workspace. Running the same bd prime
command inside this repository produced normal user-authorized Git wording.
The user explicitly asked to remove the generated restriction.

The supported resolved-tracker PRIME.md override is now installed. Its generic
source is maintained in Setup-Agentic-Dev-Environment/beads/PRIME.md. Exactly
five Git-authority wording entries were corrected; other workflow guidance,
native hooks, SSH settings and sandbox controls were preserved. Regenerated
workspace-root output was verified without the blanket prohibition, including
after the reported failure.

The previous session still had its original injected restriction and performed
no Git network operation for 0.6.0 or 0.7.0. This is not a repository-level GitHub
access restriction. In the next chat, inspect its actual current instructions and
existing user authorization before publication; do not treat the historical
generated ban as permanent policy or bypass active higher-priority instructions.

Historical environment template/rule commits in Setup-Agentic-Dev-Environment:
`800efccc95c0024acf146c9703085300383e5048` and
`4c83ae73dfd9f6390d788dd866768be109d6f235`. Keep workspace setup/rule document
copies synchronized when recording subsequent environment changes.

## Validation and recovery

All **63 regression checks** and the production build passed after prerequisite
changes. Shell syntax, metadata/privacy review, question rendering/navigation,
typed request targets and composer placement checks passed. Terminal tests with
simulated package commands verified yes, no and noninteractive consent paths.
A fresh staged home installation with a spaced target passed using existing
CLIs. No actual RPM, new CLI, tracker or service was installed during validation.
A clean minimal-RHEL bootstrap and interactive desktop/mobile rendering remain
unverified.

After the reported failure, shell/filesystem, local Git, Node/npm, the Beads
database, and native Codex socket/read requests were verified working. Files and
local commits survived. This Codex version does not support daemon status;
use the native socket for a read-only check rather than assuming that subcommand.
No owned asynchronous validation process or subagent remains running.

The latest capacity check did not reproduce the earlier critically low storage
condition. Recheck capacity before large builds/installations. No broad cleanup or deletion of other
projects' files is authorized. Keep secrets, actual private addresses/paths,
user transcripts and runtime configuration out of this public repository.

Validation for 0.14.0: the production build and all 61 tests that do not require
local sockets or installer writes under the home directory pass. Fixtures cover
concurrent opens/creates at the sixteen-worker boundary, branching, parent
navigation and read-only restoration of sixteen workers plus the coordinator.
The full suite was attempted; sandbox policy blocks its local Unix sockets and
installer home-directory fixtures. Interactive browser verification remains
unperformed. No live conversation was created or interrupted for these tests.

Validation for 0.15.0: all 109 application tests and the production build pass,
including real protocol/HTTP/installer fixtures, sixteen-worker boundaries,
report scheduling/restoration and request gates, dependency-derived task totals,
readonly task details, Markdown safety and named parent-handoff failures.
One older integration assertion still assumed four workers; it now uses the
shared capacity. Normal npm test ran these fixtures successfully in the parent
session; an alternate invocation encountered sandbox setup restrictions, so the
cause of earlier cross-invocation differences is not inferred. Interactive
browser review remains unperformed. No live approval, worker interruption,
service restart or VM deployment was performed for validation.

## Approved helper inspection and report queuing: 0.16.0

User explicitly approved read-only helper inspection for an exact pending approval,
including temporary source outside the project. ccng_read_approval_source enforces
current token/reference binding, bounded non-symlink source, sensitive/data-file
exclusions and hash rechecking before approval. It does not run helpers or change
native sandbox/approval policy. Remaining indirect-effect uncertainty stays manual.
Reports now queue when due during active work/questions and show queued/generating
state. Only one pending report accumulates; Never cancels unsent schedules and
completion starts a fresh delay. Existing request and handoff protections remain.
Comprehensive native request controls and local Claude SDK management are still
unfinished. SDK dependency version was checked; no live provider run was started.

The task-list viewport is capped at three visible rows on desktop and mobile;
all remaining tasks remain available by scrolling, and header totals include
the entire current list. This changes the viewport only, not task retrieval.

Validation for 0.16.0: all 113 application tests and the production build pass.
Synthetic helper fixtures verify request/token/worker binding, import references,
no execution, stale/changed-source rejection, symlink/sensitive/data/oversize
refusal and unchanged approval protections. Scheduler fixtures cover active work,
pending/missing requests, one queued report, generating state, Never cancellation,
fresh post-report delay and no interruption/answer. The three-row viewport was
checked through CSS/build review; interactive desktop/mobile review is pending.

0.16.0 implementation: `4248900ba0629b4400dd281755f0352f63870c59`. Consult current remote refs for publication.

## Native user requests and manual reporting: 0.17.0

Current Codex human requests render with worker identity, supported MCP form/
external controls and exact requested turn-scoped filesystem/network decisions.
Unsupported/legacy/unknown approval callbacks remain visible without auto-refusal.
Token refresh/attestation remain internal. Native confirmation, typed IDs,
coordinator exclusions and permission restrictions are tested. Report now after
Never queues/coalesces a report with normal delivery gates and no cadence change.
All 122 tests and build pass; no live approval or provider call was used.
Model/effort controls, the requested resizable sidebar/tab/version layout and
local official Claude SDK management are still unfinished. SDK package version
was checked, but no package installation or actual integration has occurred.

0.17.0 implementation: `63c5cf173eef5c295c8041e3151e29b933fc167c`. Check remote refs for publication.


## Worker model settings, flexible layout and report ownership: 0.18.0

Native model/effort controls, the resizable desktop sidebar, coordinator alignment,
full-width chat text and composer-footer version badge are implemented. The user
explicitly chose agent-owned report timing. CCNG recurring report polling/due-time
state is removed. Radio changes send one named Standard Task Report instruction,
coalesce unsent replacements and Never sends cancellation. Restoration preserves
selection but starts no turn and replays no instruction. Report now remains a
one-off request with exact native client identity and normal delivery gates.
The named format/timing/question guidance lives in server/worker-instructions.md.

All 129 tests and production build pass. No interactive browser review, live
provider timing test, global auto-review change, runtime restart or deployment.
Shared environment AGENTS runtime loading, official Claude SDK management,
fresh-install Dolt/Beads, ordinary-chat unanswered questions and actual AAP-to-TRA
CaC/live rollout remain unfinished; credential history review precedes re-asking.

0.18.0 implementation: `9aed87fb843463d3ec9cb23a27a21e87bef8cbce`. Consult current remote refs for publication.


## Proportionate coordinator helper review: 0.18.1

The user wants direct helper Python source read when necessary, without routinely
inspecting deeper dependencies. Base/restored/event guidance and the helper tool
description now state that boundary; project-reader rejection points to the
approval-source tool. Concrete unresolved concerns still require user review.
This is not permission to execute helpers, read credential/Vault data or approve
the quoted real action. The saved coordinator was found to retain its older tool
catalog without the helper reader. The existing reader now applies the same approval-scoped helper checks and
returns exact current bindings for directly referenced outside helpers. This
preserves that coordinator/history and native registration. Source publication
still requires an installation update before live behavior changes.

0.18.1 implementation: `ab05d4fb17544a9918dea7df2502b943f062a9b5`. Regression suite/build pass; installation not updated.


## Local providers, runtime rules and context refinements: 0.19.0

Implemented: official Claude Agent SDK0.3.212 with installed native CLI interface,
local headless history, managed streaming/send/interrupt and manual SDK requests;
shared local environment AGENTS import; worker-owned Beads ordinary-chat question
records and replies; confirmed fresh native Dolt/Beads installation;90ch maximum
chat text, hidden task assignees, natural-height first-three-row task viewport and
single-row model/effort controls without routine explanations. Current source
supersedes historical unfinished statuses above. See README for provider limits.

Root/subagents used separate source ownership and root reviewed integration.
External active Claude processes remain their own owners. Closing a tab keeps
managed work alive, closed-tab requests can be reopened, and app shutdown ends
SDK-owned processes while retaining native history. Model controls are managed-
process scoped; persistence across process restarts remains unverified. No live
model/approval, service restart or deployment is used for validation.

Remaining: actual AAP deployment/CaC/credential setup and live verification.
The original-chat audit found target/architecture choices but no captured Machine
or Vault source choice; a display acknowledgment is not an answered question.
The default environment template now allows7subagents+primary, but the live
user-level edit was blocked EROFS and automatically rejected for sandbox
escalation. Its application remains a separate blocked task, not a CCNG release.


Validation for0.19.0: all **163 application tests** and the production build pass.
Coverage includes real official-SDK reads of isolated native JSONL, local/external
ownership, streamed controls and exact callbacks, provider disconnect/restore
races, closed-tab pending requests, shared-source rereads/missing sources,
complete recorded chat questions, variable task-row sizing and isolated confirmed
Dolt/Beads installer fixtures. No live model/approval, development-host database
setup, runtime restart or deployment was used. Interactive browser/live provider
verification remains pending.

0.19.0 implementation: `d7d83b883a82dd73fae52e53d3d38b6ef82041af`. Source publication does not update a running installation.

## Approval helper directory correction: 0.19.1

Both coordinator readers use the pending command's native cwd for directly
referenced helpers, with worker cwd only for absent/null native cwd. Relative
source names in quoted subprocess argv lists match their equivalent absolute
paths. The older reader checks current approvals before worker-root realpath;
cross-directory ambiguity requires an exact token. Evidence includes cwd and
rejects directory changes before approval. Resolved hidden/sensitive paths remain
refused, including through relative names. Validation uses synthetic repositories
and never approves or executes the reported live action. Updating source does
not restart the user's running backend.

All172 application tests and the production build pass. Nine new synthetic
cases cover cwd/path matching, bindings, decoys, ambiguity, stale directory
evidence and resolved hidden/sensitive paths. A redirected test invocation
reported installer/integration file-wrapper failures without inner details;
the ordinary npm test invocation then passed all172. The separately tracked
test-environment discrepancy is not established as fixed by this reader patch.

0.19.1 implementation: `16006bccd4d7c17498ba26efed32d7b01ef46e51`.

## Older-history approval citation correction: 0.19.2

The coordinator reader exposed older user instructions while review searched
only recent messages. Bounded native page references now let review re-read the
exact page in the same worker and validate the actual user ID/quote. References
are tied to the open worker object, capped at 128 and contain no transcript text.
Other recent reads do not discard them; close/reopen or restart requires fresh
history inspection. Generated relays, branch summaries and assistant messages
cannot authorize actions. Recheck worker/request/token after asynchronous native
reads. No live approval, request replay, native permission change or service
restart is used for validation. Running installation update remains separate.

All **180 application tests** and the production build pass. Eight new synthetic
cases cover older citations and intervening reads, wrong quotes/provenance,
worker/reopen boundaries, unavailable/changed pages, resolved/closed-worker races,
bounded references and messages omitted by the response budget.

0.19.2 implementation: `3b3c868bc722c6abf7cb31b2abc2394e05fd8a0c`.

## Resizable overview sections: 0.20.0

Desktop worker and coordinator overviews have draggable horizontal boundaries
that resize both adjacent sections with independent scrolling and bounded
minimum heights. Keyboard controls and double-click reset are included. Heights
use existing browser preferences; mobile remains naturally stacked. Tasks keep
three rows by default and can show more when manually enlarged. No backend or
native permission changes, live model calls or running-service restart.

Validation: all183 application tests and production build pass, including
adjacent-section sizing, short-pair growth, separator semantics and browser
preference restoration/refusal checks. Interactive browser visual review remains
unperformed; no running installation was updated or restarted.

0.20.0 implementation: `76350c8ca73166dc001a5ea79f93974e3302911c`.

## Priority Standard Task Reports: 0.21.0

The shared report definition prioritizes due/explicit reports at the next safe
checkpoint using known evidence, then resumes work. Backend startup reloads
the installed MD; worker and coordinator runtime context carry the definition.
Report now precedes unsent summaries and reaches active Codex through native
steering/native message identity, or owned active Claude through SDK next
priority. Blocking requests, pause, handoff, failed/in-flight queue messages,
bounds, coalescing and external Claude ownership stay protected. No interrupts
or recurring CCNG timer. Focused coordinator checks and production build pass;
combined validation is recorded below.

## User-level systemd management: 0.22.0

The installed launcher supports service install/start/stop/restart/status/logs/
enable/disable/uninstall. The owner-only unit preserves supplied runtime options
and known non-secret native profile/config paths. Reinstall without options keeps
the existing owned unit, and unrelated/symlink units are refused. Installation
only reloads systemd; foreground migration and service start/enable are explicit.
No lingering/native daemon change or host activation was performed. The live
unit directory is outside the executing session writable roots; normal-terminal
installation remains necessary. See installation guide for exact commands.

Combined validation for0.22.0: all192 application tests and production build pass,
including six priority-report regressions and three user-service fixtures.
Systemd user-unit parser verification exits0 for a synthetic unit, with sandbox
bus/socket warnings; live manager activation is unverified. No installed copy,
live service, native daemon or lingering setting was changed by these tests.

0.21.0 report implementation: `b7856e84dc958f4e753b5d9693fca72d0c981b62`.
0.22.0 user-service implementation: `391a1f2fa57f5e324c4f22db3ce6688a86a45111`.

## Message author timestamps: 0.23.0

Conversation author headers display a24-hour browser-local clock, with full
date/source tooltip. Native timestamps are preferred; live receive time is
explicitly identified and remains stable through streaming/completion/refresh.
Historical untimed items stay unavailable. No separate transcript/time store
or native permission/provider-setting change. Older Claude SDK history can
omit native timestamps; no private transcript parser was added for this feature.

Validation for0.23.0: all200 application tests and production build pass. Eight
new timestamp checks cover provider/history mapping, stable streaming/refresh,
invalid/unknown times and local24-hour header rendering. No live model run or
running installation restart was used; interactive browser review is pending.

0.23.0 implementation: `45c2ac9df9d73df5a1aa64ccf3ad44a3d33da4bf`.

## 0.24.0 clipboard controls, concise concerns and branch return

Copy this sits left of Branch here and copies complete message text; each
fenced/indented Markdown block copies only its own exact code. Native clipboard
denial is surfaced rather than retried through another method. Browsers without
the API can use their supported legacy copy action, with focus/selection cleanup.
The header/favicon use a new simple generated cyan tower icon; its source asset
and reproducible prompt are documented in docs/brand-assets.md.

Coordinator instructions and the review tool's rationale description now request
short plain-language non-approval notes: the action, concern and actual user
decision/next step, normally two or three short lines and about sixty words.
Approval cards preserve line breaks. Existing notes, required evidence and native
approval safeguards remain intact; live model adherence has not been verified.

Restored unloaded branches now activate only on explicit summary/return actions,
then recheck native state. Named child errors distinguish pending requests,
active responses and an unavailable runtime. Read-only restore, exact questions,
parent delivery and archive retry protections remain.

All209 application tests and the production build pass. No browser executable
was available for interactive clipboard/layout verification. No live summary
turn was started, no request answered and no running installation restarted.
Update/restart and browser review remain separate from source publication.
