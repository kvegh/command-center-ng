# Release notes

The [README](../README.md) is for installation and first use. These notes keep
version history separate from current [usage](usage.md).

Entries describe implemented source, not proof that a particular installation
has been updated or every browser workflow has passed. The
[decision history](../design_decisions_history.md) retains full rationale,
implementation commits, checks and limitations. Original detailed release text
is retrievable in the [README before this reorganization](https://github.com/kvegh/command-center-ng/blob/12ce91bd35a2a4f0b7446af63d1977605c5a1c21/README.md).

## 0.41.1 — Repair fresh Ansible workspace and tool preparation

- Prepare the separate default agent workspace and its first native Beads
  tracker without requiring a demonstration-repository checkout.
- Provision only missing approved target tools using the maintained installer
  versions; include compiler prerequisites and remove temporary downloads.
- Preserve existing trackers, routing, profiles, authentication and explicitly
  configured installation paths. Fetch the current default source on deployment.

Focused native-Ansible fixtures, syntax and strict lint pass. Real target
bootstrap and application acceptance remain unverified. Application/browser
code and the separate first-opening password requirement are unchanged.

## 0.41.0 — Keep overview settings at the bottom

- Desktop overview fills the available browser pane without extending the page.
- Report/model controls stay at the bottom while upper content, tasks and open
  questions scroll as needed; saved section heights remain bounded.
- Short windows retain access to long settings feedback. Mobile continuous-page
  layout, native request behavior and existing resize controls are preserved.

**Validation:** all 585 application tests and the production build pass.
Focused CSS/SSR checks cover bounded desktop scrolling, bottom settings with or
without questions, saved oversized heights, keyboard/reset boundaries and mobile
flow restoration. Source review found no concrete blocker. Actual short-window
browser geometry remains unverified. Publication/deployment is recorded separately.

Production payload `e9335e0a9859c93de373118cdd3c2a786bd60608` was published,
installed and restarted through the existing authorized workflow. Independent
verification matched95 source files and two assets, HTTPS health0.41.0,
login gates, both listeners and eight unchanged protected files. Bounded overview
styles/bottom settings are served; rendered desktop/phone acceptance stays open.

## 0.40.0 — Silent task checks and removal of native Goals

- Removed native Goal controls, worker state/events, API routes, task Goal
  creation instructions and special three-line announcement formatting.
- Native Goals are no longer a requirement for future harness integrations.
- Kept ordinary Beads outcomes, lifecycle updates and ready-work reassessment,
  plus existing reports, approvals, layout and branch handoff.
- Existing native Goal data is unchanged. Branch handoff retains only its
  previous read/pause checks needed to establish a safe return checkpoint.
- Added user-selected silent task-attention checks every fifteen minutes through
  the existing coordinator queue. Show the next scheduled check in its overview;
  preserve pause, native-request, ownership and handoff gates while using native
  steering for known active Codex turns at their next safe checkpoint.
- No replacement execution loop, dispatcher, service or dependency added.

**Validation:** all581 application tests and the production build pass. Focused
coverage includes15-minute cadence, active steering, coalescing, stop/request/
handoff guards, uncertain sends, hidden replay/provenance and the next-time UI.
Earlier restricted attempts could not use sockets/home fixtures or capture Node
subprocess output; the final complete run passed without changing those tests
to bypass their checks. Actual publication/deployment is recorded separately;
rendered browser and real scheduled worker acceptance remain distinct.

Production update/restart and independent verification succeeded at payload
`5bbd5bea435448f573c2e8126178ffa81e3edbd6`:95 source files and two served assets
match; actual HTTPS health reports0.40.0; login gates, both listeners and eight
unchanged protected files are verified. Removed Goal feature files are absent
and the served bundle contains the task-ping counter. Browser interaction and
actual scheduled worker adoption remain separate acceptance checks.

## 0.39.0 — Native Codex Goals and clarified task announcements

Historical release; the Goals feature and requirement were withdrawn in 0.40.0.

- Added native Goal status, objective, usage and start/pause/resume/clear controls
  under Worker specific settings, with a compact mobile summary. Viewing and
  restoration read state without activating a Goal.
- Goal replacement explicitly confirms possible accounting reset. Controls check
  the displayed Goal against fresh native evidence; stale responses cannot
  overwrite newer events or erase an unconfirmed outcome. Native cross-client
  writes have no atomic comparison API, so the final native race is not claimed
  eliminated.
- Worker instructions now clarify authorized task outcomes, use supported native
  Goals and announce confirmed creation as New Goal, Task title and Beads ID.
  Only the labels use active-task blue; values remain normal escaped text.
- Actual task lifecycle changes trigger Beads updates and ready-work reassessment
  within user scope. The native runtime owns continuation; reports, questions,
  backlog records and view restoration do not independently start Goals.
- Preserved native requests, permission controls, ownership, branch handoff and
  budget/accounting rules. Unsupported native facilities stay unavailable;
  no dispatcher, Goal database, dependency or Claude implementation was added.

**Validation:** all 606 application tests and the production build pass. Focused
review fixes cover prior-Goal identity, old native reads and HTTP replies racing
newer streamed state. A real Goal was set for this implementation using the
native tool. A direct local application RPC probe was denied by the sandbox;
actual installed Goal controls, continuation and rendered announcements remain
separate acceptance checks. Publication and deployment are recorded separately.

## 0.38.0 — Background branch handoff and compact title colours

- **Hand back & close** queues a background transfer, including during work.
  The branch reaches a safe checkpoint, settles local terminals/spawned work,
  and prepares a summary. Native questions remain manual.
- Every linked Beads task gains the parent association, retaining its original
  branch label, state, owner, dependencies and content. Full history and task
  references accompany the summary; tasks are not silently limited to ten.
- Exact native parent receipt and fresh lifecycle/task checks precede archive.
  Errors and ambiguous results keep the branch available without blind resends.
  Background closure preserves another tab's selection, focus and draft.
- The composer colour fills only a compact title folder tab attached to the
  input. The selector and status text remain neutral. Cyan, violet, green,
  blue, teal and rose are available; saved amber becomes blue because amber
  indicates pending attention elsewhere.

Handoff coordination stays in the existing backend process, with no new
service or store. Keep CCNG running while it finishes; restart does not replay
an interrupted handoff. Unsupported native safety APIs retain the branch with
an error. Send or remove unsent images before handback; unsent text stays local
and is not included in the summary. Actual native/browser acceptance is
separate from automated fixture and build checks.

**Validation:** all 560 application tests and the production build passed.
After the final generated-control provenance guard, the 20 handoff, 58
coordinator and four source-review regressions passed again. Focused review
confirmed the identified uncertainty, parent-serialization and capacity fixes.
Actual rendered title-tab geometry and native end-to-end handoff remain unverified.

Production update/restart through AAP and independent verification succeeded.
All 94 checked installed source files match published payload
`e22f020bd1400fe65007ebe5d211e3e49533fb93`; actual trusted HTTPS health reports
0.38.0, both listeners and login gates work, and two served assets match.
Eight protected configuration/authentication/service/native-profile files stayed
unchanged. This does not establish the browser/native interaction checks above.

## 0.37.0 — Image picker and pending-request visibility

Published implementation:
[`e3a01ba`](https://github.com/kvegh/command-center-ng/commit/e3a01ba6fefa45ee6e6fcacbcf444b1a7126f96e).
Documentation checkpoint:
[`12ce91b`](https://github.com/kvegh/command-center-ng/commit/12ce91bd35a2a4f0b7446af63d1977605c5a1c21).

- Added **Attach image** on desktop and mobile using existing in-memory drafts,
  limits, previews and delivery. Selection stays with the originating chat;
  cancellation and selecting the same file again are supported.
- Preserved pending cards replayed during native reconnect and recovered exact
  details already held by the connection without an unnecessary second resume.
- Bounded snapshot coalescing so continuous worker activity cannot indefinitely
  delay browser updates.
- Prevented a delayed initial browser read or old-login callback from replacing
  newer streamed questions or a newer login's state.
- Retained native request IDs, review tokens, manual answer controls and send
  gates. No image store, dependency, permission bypass or new service was added.

**Validation:** all 520 application tests and the production build passed.
Focused regressions cover file selection/cancellation, original-chat identity,
reconnect recovery, snapshot delivery and the actual frontend initialization
effect. Independent review found no concrete issue in the recovery/state-order
fixes. Actual Android Firefox and affected-runtime acceptance remain unverified;
the historical missing-card report's exact triggering sequence is unconfirmed.

Subsequent production checks through AAP confirmed the existing installation is
running 0.37.0: 92 checked source files match the published payload, HTTPS health
and served assets are correct, state/events require login, and both configured
listeners are present. It was already current, so this verification performed
no reinstall or restart. Fresh native request workflows and Android Firefox
interaction still require their separate acceptance checks.

## 0.36.1 — New-agent path validation

Trim surrounding whitespace, preserve spaces within directory names and require
an existing absolute directory before creating a native worker. Missing,
inaccessible, invalid or file paths produce useful validation errors.

All 505 application tests and the production build passed, including seven
path regressions for both provider adapters. Installed-browser acceptance was
not established by these fixtures.

## 0.36.0 — Compact mobile overview

Reduced mobile overview spacing, wrapped task totals and omitted empty question
sections only when no attention state exists. Collapsed Worker settings show
the report cadence and Report now, retaining controls and feedback on expansion.
Desktop layout and saved sizes are unchanged. All 498 tests and the build
passed; phone rendering, keyboard and rotation acceptance remain separate.

## 0.35.1 — Consistent password lengths

Aligned password creation, stdin input and login at 4,096 characters, accepting
an optional terminal newline without replacing an existing file on invalid input.
All 489 application tests, two focused Ansible password fixtures and the build
passed. This did not implement first-browser password creation or a default
password; existing configured passwords remain preserved.

## 0.35.0 — Continuous mobile page

Wrapped worker tabs, placed the full-width overview above bounded chat history,
and retained a six-line input with internal overflow. Mobile ignores desktop
saved dimensions, omits resize handles and worker coordinator recaps, and avoids
reordering tabs during touch scrolling. Existing 483 tests, four focused mobile
checks and the build passed; rendered phone acceptance remained pending.

## Earlier milestones, newest first

These are compact historical summaries. Consult the decision history or archived
README for the exact implementation commits and original validation records.

| Release | Change |
| --- | --- |
| 0.34.2 | Preserved line breaks and spacing in pasted user-message Markdown. |
| 0.34.1 | Kept the selected chat colour visible on the input header while typing. |
| 0.34.0 | Added default-route IPv4 plus localhost startup and exact-origin native HTTPS tunnel login. |
| 0.33.1 | Matched native approval buttons to the shorter height. |
| 0.33.0 | Added composer resizing, shortened overview recaps and introduced Needed/Why/Details input formatting. |
| 0.32.0 | Added installed connection configuration, optional operator-supplied TLS, prefix installation and worker input/activity indicators. |
| 0.31.3 | Repaired existing AAP deployment/bootstrap runtime delivery and target-local tool lookup. |
| 0.31.2 | Contained invisible copy-result announcements to prevent unwanted outer-page height. |
| 0.31.1 | Returned focus after successful manual Codex approval, with tab/dialog race protection. |
| 0.31.0 | Exposed native offered saved approval choices, exact scopes and save warnings; Codex retains persistence ownership. |
| 0.30.0 | Prioritized actual input-needed task titles on coordinator project cards. |
| 0.29.0 | Added classic/contrastful/light themes, input-first task ordering, explicit question context and task notification controls. |
| 0.28.0 | Added Escape as the visible conversation's native Interrupt shortcut. |
| 0.27.1–0.27.3 | Iterated brand assets from an airport tower to the accepted transparent operations-console icon. |
| 0.27.0 | Refreshed the startup dashboard from current tasks, summaries and saved report intervals. |
| 0.26.0 | Moved recurring report timing into CCNG's existing backend with silent triggers and saved intervals. Superseded agent-owned timing. |
| 0.25.0 | Added clipboard image drafts and saved report instructions. Its agent-owned timing approach was later superseded. |
| 0.24.1 | Preserved Beads tracker routing for user-service execution. |
| 0.24.0 | Added per-message/code copying, shorter coordinator concerns and clearer branch-return recovery. |
| 0.23.0 | Displayed message timestamps beside authors. |
| 0.22.0 | Added user-level systemd lifecycle, status and log controls through the launcher. |
| 0.21.0 | Prioritized reports at the next safe response checkpoint without bypassing native request gates. |
| 0.20.0 | Added resizable overview sections with keyboard controls and browser-local preferences. |
| 0.19.2 | Validated approval authority references from bounded older native history pages. |
| 0.19.1 | Resolved approval-linked helper source relative to the exact command approval directory. |
| 0.19.0 | Added official local Claude SDK source, shared runtime instructions and compact worker/task context. Claude completion/live acceptance remain postponed. |
| 0.18.1 | Limited helper review to relevant source instead of routinely recursing through dependencies. |
| 0.18.0 | Added native model/effort controls and flexible chat/sidebar width. Its agent-owned reports were superseded by 0.26.0. |
| 0.17.0 | Surfaced additional native blocking request types and one-off Report now controls. |
| 0.16.0 | Added approval-bound helper source inspection and bounded queuing of reports. |
| 0.15.0 | Added worker report settings, task input/details and full Markdown/GFM rendering; kept branch summary review inside its own tab. |
| 0.14.0 | Raised capacity to sixteen workers plus the separate coordinator. |
| 0.13.0 | Saved concise coloured coordinator decisions and non-approval feedback guidance. |
| 0.12.0 | Exposed multiple simultaneous native requests and independent review tokens. |
| 0.11.1 | Replaced opaque task-ID recaps with named work, useful results and concrete input needs. |
| 0.11.0 | Grouped tool activity, allowed editing drafts during requests, and introduced the RHEL 9 deployment playbook. |
| 0.10.0 | Made Branch chat include the current stored exchange rather than only a completed reply. |
| 0.9.0–0.9.3 | Added missing-request recovery, joined folder tabs, clearer selection and the inset below tabs. |
| 0.8.0–0.8.1 | Enforced worker/coordinator role separation, explicit project paths and matching coordinator-tab styling. |
| 0.7.0–0.7.1 | Added prerequisite checks/confirmed RHEL setup and removed the gap below tabs. |
| 0.6.0 | Surfaced native open questions and widened the desktop context panel. |
| 0.5.0 | Restored workspaces using existing backend private metadata and browser-local preferences. |
| 0.4.0–0.4.2 | Introduced the native coordinator, approval review and tab ordering. |
| 0.3.0–0.3.1 | Made Beads authoritative for tasks and waited for native request-resolution confirmation. |
| 0.2.0–0.2.2 | Added editable branch-summary return and refined workspace navigation/task presentation. |
| 0.1.0–0.1.1 | Added target-local installation/update handling and native conversation branching. |

## Superseded behaviour and evidence limits

- Current task/report instructions are in [usage](usage.md), not in historical
  release paragraphs. Old four-worker limits, native-plan task inference and
  agent-maintained report clock loops no longer describe the application.
- The shared default-password/forced-first-login-change proposal was withdrawn.
  Current setup uses a user-chosen password before server startup; password
  creation on first browser opening remains unfinished.
- Published Claude SDK code and test fixtures do not establish a completed,
  live-verified Claude integration. Claude work remains TODO.
- Native Goals execution with CCNG controls is an approved direction; the
  preparatory adapter does not mean Goals controls or Edit & rewind are complete.
- Builds, automated fixtures and source review are reported for their actual
  scope. They do not substitute for phone interaction, live native permission
  persistence or post-deployment functional verification.

Development status is maintained in [the handover](../current_status_for_handover.md)
and Beads. Operational target details and secrets do not belong in release notes.
