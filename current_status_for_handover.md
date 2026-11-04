# Current status for handover

Updated: 2026-11-04. This is a development handover snapshot. Beads remains the
task source of truth; do not use this file as a second backlog.

## Versions and publication

The authoritative development version is **0.7.0** in package.json and the lockfile.
The last verified published version is **0.5.0**, at
`c24d84c318fe967993bd3e00552e129e7d32531e`. The 0.6.0 and 0.7.0 changes below are
committed locally and have **not been pushed**. No user installation or running
application was restarted to deploy these changes.

| Version | Local implementation | Decision record |
| --- | --- | --- |
| 0.5.0 | `38063bf322a849ff0ddce14e205bf91e73de6a74` | `c24d84c318fe967993bd3e00552e129e7d32531e` |
| 0.6.0 | `5b63d56a9e99b46631dbeb166f1ca24ff3d6c46e` | `a00a400b17c295e33bfb5282c181c7dbd60c84db` |
| 0.7.0 prerequisite checkpoint | `818b3cd059325456efe206ee06f61f179d3b4a7f` | Recorded in design_decisions_history.md with this handover |

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

## Local UI changes: 0.6.0

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

## Local installer checkpoint: 0.7.0

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

## Decisions still awaiting the user

Two questions were asked asynchronously and no answer has been received:

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
| bead-wd-1rl.24 | Wider sidebar/native questions/composer branch button done locally; ordinary-chat scope and publication pending |
| bead-wd-1rl.25 | Prerequisite checkpoint done locally; fresh Beads/Dolt configuration and publication pending |
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

Environment template/rule commits are local in Setup-Agentic-Dev-Environment:
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

The development host has very little free storage. Check capacity before
repeating large builds/installations. No broad cleanup or deletion of other
projects' files is authorized. Keep secrets, actual private addresses/paths,
user transcripts and runtime configuration out of this public repository.
