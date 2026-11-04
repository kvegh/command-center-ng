# Current status for handover

Updated: 2026-11-04. This is a development handover snapshot. Beads remains the
task source of truth; do not use this file as a second backlog.

## Versions and publication

The authoritative development and published version is **0.10.0** in package.json
and the lockfile. Its implementation is `ec4cb6e`, published over the existing SSH
connection. The earlier 0.9.2 publication failures were cleared by the user's
explicit retry. Existing SSH configuration, keys and access controls were preserved.
The formerly local 0.6.0/0.7.0 checkpoints and the 0.7.1 spacing correction are
included, alongside the 0.8.0 conversation safeguards. The earlier published baseline was 0.5.0 at
`c24d84c318fe967993bd3e00552e129e7d32531e`.
The agent did not update or restart the user's installation or native daemon;
source publication alone does not deploy these changes. The user's last confirmed
installed version is 0.9.1.

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

Inspect Git status and history before continuing. Use SSH for authorized Git
network operations and preserve unrelated edits. Keep numeric versions and
README changes consistent with implementation commits; record their real commit
IDs in design_decisions_history.md.

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

## Requested Ansible deployment: choices awaiting direction

The user requested a playbook to deploy Command Center to a Linux VM. Reusable
deployment code belongs in the existing private environment setup repository;
private inputs belong in its existing encrypted companion. Existing installer,
authentication stdin support and local Ansible/lint capabilities were inspected.
No playbook or live deployment has been implemented. Required choices remain
install-only versus automatic startup, Linux distribution/version, and reusing
an existing Codex/Beads profile versus fresh setup. Do not infer these choices
from the intervening branch investigation. Fresh Beads/Dolt provisioning still
requires its existing separate architecture decision.

## Requested Claude monitoring: proposal awaiting direction

The user wants to follow Claude when AAP launches claude -p. Source inspection
found the existing AIOps launcher captures shell output and displays it after
completion. Official Claude documentation describes native session transcripts
and headless streaming output; the installed local CLI help/version was checked
without starting a model run. The target VM/version has not been verified.

Proposed, not approved: follow native Claude session files read-only, locally or
through existing SSH access on the agent VM, showing messages and tool activity
as saved without changing the AAP launcher. Token-by-token streaming would instead
require an approved launcher output-capture change. The user was asked for the
architecture choice and exact target. No transport, service, credential, launcher
or live AAP change has been made. Continue only after the required direction.

## Decisions still awaiting the user

The two architecture questions were asked again in this session and remain unanswered:

1. Should Open questions include coordinator-tracked unanswered decisions from
   ordinary chat, or only structured questions and approvals? Both was proposed.
2. May fresh installations offer private local shared Dolt setup with explicit
   confirmation, preserving existing setups, or should configuration remain
   manual? Confirmed local server setup was proposed for parallel agents.

The workspace's architecture-approval rule requires direction before selecting
the new server/configuration approach. Continue independent work where possible,
but do not infer approval from a default choice or elapsed time.

## Beads references

| Issue | Current work |
| --- | --- |
| bead-wd-1rl | Broader Command Center project |
| bead-wd-1rl.23 | Rendered design review; source review done, screenshot pending |
| bead-wd-1rl.24 | Structured UI changes published; ordinary-chat scope remains pending |
| bead-wd-1rl.25 | Prerequisite checkpoint published; fresh Beads/Dolt configuration remains pending |
| bead-wd-1rl.26 | Role and project-directory safeguards published in 0.8.0; semantic/legacy-name limits documented |
| bead-wd-1rl.27 | Tab/chat gap correction published in 0.7.1 and included in 0.8.0 |
| bead-wd-1rl.28 | Shared coordinator tab styling/order published in 0.8.1 |
| bead-wd-1rl.29 | Closed: recovery published in 0.9.0 and confirmed live by the user on 0.9.1 |
| bead-wd-1rl.30 | Connected folder-tab source published in 0.9.1; rendered review remains in .23 |
| bead-wd-1rl.31 | Claude monitoring investigated; connection approach and target await user direction |
| bead-wd-1rl.32 | Closed: visible-tab emphasis and doubled top spacing published in 0.9.2 |
| bead-wd-1rl.34 | Closed: fixed chat clipping inset and matching inactive tab fill published in 0.9.3 |
| bead-wd-1rl.35 | Ansible VM deployment requested; startup, platform and profile choices await direction |
| bead-wd-1rl.36 | Closed: current-conversation Branch chat correction published in 0.10.0 |
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
