# Current status for handover

Updated: 2026-11-10. This is a development handover snapshot. Beads remains the
task source of truth; do not use this file as a second backlog.

## Versions and publication

Working **1.2.0** groups approval buttons with scopes below and implements
Coordinator-aware tab attention. Both changes passed independent source review,
42 focused approval/child/tab regressions and the production build. Publication
and deployment remain pending; the latest verified production release is 1.1.0.
The full test command did not pass in the current sandbox: 77 of 84 test files
passed; remaining failures involve socket/subprocess or home-directory access.
Authentication passed separately after its combined-run failure. These checks
do not establish phone rendering or a fully passing integration suite.
Mobile scrolling awaits a choice between a Top controls shortcut and removing
the bounded inner history. Existing child request recovery remains blocked on
the separate native-reattachment choice; no live request was replayed or answered.

Published and installed **1.1.0** implements manual replies to eligible current
Codex assistant-message questions from a completed message within the same
known active turn. Restored/history-only metadata cannot restart a turn.
Server-derived original native message IDs/zero-based indices bind per-
question option/free-text answers through ordinary active-turn input, not
approval RPCs. Partial replies preserve other editors. Native acceptance means
accepted input, not successful task completion or confirmed question
resolution. Native terminal retirement ends eligibility. CCNG ordinary-human-follow-up
retirement is conservative policy, not exact native cross-client parity or proof
of answering. Browser-memory drafts/latches survive worker switches but not
refresh; no localStorage/workspace/server answer persistence is added. Automatic
control/handoff gates must preserve live human decisions and ambiguous sends
using existing queues. Per-attempt observations defer unsafe branch closure,
retaining drafts and releasing the existing handoff job for explicit retry.
Unsafe, truncated, inactive, historical or unbound questions stay read-only;
normal ownership, connection, pending-request and handoff gates remain. No
automatic follow-up/retry, new store, native permissions or Claude feature is
added.

Source proof uses native 0.167.0 commit
`086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`: the ordinary AppServer envelope
binds the original message/index; its title is bounded to 512 UTF-8 bytes
before CR/LF normalization to spaces. Native async `accepted: true` is
emission, not an answer. The final combined827-test suite has826 passes, one
alternate-group skip and no failure; the clean production build and independent
review pass. Canonical replies authorize only through actual human answer text,
never model-written framing.

Implementation115cf9a and payloadbbd8a2b are SSH-published/readback verified.
AAP3460 updated/restarted production in20.634s, preserving nine protected files
and unrelated Bash bytes/uid/gid/mode. Independent3461 passed in5.439s:106 source
files matched, running1.1.0 trusted HTTPS/assets/both listeners/auth gates,
21 installed backend reply/authority/queue/handoff regressions passed, and the
served answer/retained-draft/detailed-report controls matched without a browser
Node-module shim. These installed tests use isolated synthetic native transport;
actual browser/provider reply delivery and full phone workflows remain unverified.

Previously verified **1.0.0** adds a one-off Detailed report checkbox beside
Report now. Give the normal overview first, then every linked actual in-progress
Beads task by title/ID with up to ten recent attributable timestamp/action/outcome
entries. Missing/fewer/unknown evidence must be explicit. Only this request may
make bounded read-only existing Beads/native-history lookups; it authorizes no
project execution, external checks, secret reads, model calls or permission
changes. Ordinary/scheduled reports and the 32,000-character limit are unchanged.
Unsent requests may upgrade but never downgrade; an already dispatched normal
request remains normal with visible feedback and no automatic resend. Related
backend, UI, instructions and tests ship together. The combined suite ran792
cases:791 passed, one alternate-group case skipped, none failed. The production
build and independent source review pass.

Implementation e7432ed and payload59036d9 are SSH-published/readback verified.
AAP3457 updated/restarted production in19.888s, preserving nine protected files
and unrelated Bash content/permissions. Independent3459 matched105 installed
files, running1.0.0, trusted HTTPS/assets/both listeners/auth gates and five
installed report HTTP/queue/native-gate regressions. The served build contains
the detailed checkbox and installed instructions preserve timestamp-evidence
limits. Attempt3458 passed its backend checks but could not run a TS-based UI
fixture because production omits the development compiler. No compiler was
installed: desktop/mobile component tests passed before publication, and the
served build was verified independently. Actual browser-generated report content
and complete phone/native workflows remain unverified.

Published and installed **0.48.0** offers missing Codex under the user's `~/.local`
prefix or a writable `--codex-prefix`, reuses compatible existing installations,
and adds a safe, idempotent Bash PATH block after successful app installation.
Existing app-local Codex is not migrated or removed. Beads and Dolt remain
app-local; no native profile, authentication, permissions or daemon boot
management is added. Current shells require the documented manual `source`
command; unsafe profile updates retain an explicit manual PATH fallback.

The worker overview now uses a `Project:` heading and a default-collapsed
Subagents section below Tasks. Actual pending child requests and recovery
warnings remain visible independently of that section. Silent unfinished-work
checks change from fifteen to ten minutes; report interval choices and timing
remain separate and unchanged.

The final combined suite ran **784 tests: 783 passed, one skipped, zero failed**.
The skipped group-ownership case requires an unavailable alternate supplementary
group. The `.bashrc` group-preservation correction is included and final source
review is clear. The production build passed; no frontend change followed it.
Implementation `6877e20308a3f2e4aeb86ee9d00f1ffe249940a8` and payload
`82e7861fd6d2570001f0ec8757f370813c73bc5f` are SSH-published/readback verified.
AAP 3454 failed command syntax before installer actions. Corrected 3455 succeeded
in 20.902s, preserving nine protected files and unrelated Bash bytes/uid/gid/mode.
Independent 3456 succeeded in 18.144s: 105 installed files match, actual HTTPS/assets,
both listeners and auth gates pass. The deployed-source installer/profile checks
ran 18 cases: 17 passed, one alternate-supplementary-group case skipped. Actual
managed Bash updates were repeated twice; Codex 0.167.0 resolved through that PATH.
Isolated installed checks verified the ten-minute task-check deadline and
separate fifteen-minute report deadline. The user confirms the collapsible
Subagents section is visible. Fresh real Codex installation, provider sign-in,
full phone/native interaction and reboot behavior remain unverified; fixture
tests establish only their documented scope.

Published and installed0.47.0 implements user-approved native child request/status visibility
under the main chat and existing Coordinator. Verified native lineage, original
child IDs/tokens/turn/item bindings and exact native confirmation remain required.
Child attention does not lock the main composer. Recovery reads native metadata
and preserves newer events; no automatic resume, guessed approval, new request
store, tab, model call, worker slot or timer is added.

The same release clarifies installation prerequisites with/without sudo,
ordinary browser Codex login versus optional device-code login, and later Beads
setup using the existing source installer and installation prefix. Existing
installation layout, authentication and trackers remain protected.

The combined suite passed761 tests and the production build;
independent review found and verified corrections for UI projection, exact detail
reload IDs, nullable bindings, stale ownership and delayed status reads. Installer
login/defer/Beads fixtures pass without real authentication or tracker changes.
Implementation `c76502dfb01070fbfda7672c3bf06043332278c2` is committed. Payload `8a26850d762b5c1e9d8ec0fdda7ff38a989e01de` is
SSH-published/readback verified. AAP3452 updated/restarted production in21.13s,
preserving nine protected files. Independent3453 finished in5.089s and verified
105 exact files, actual0.47.0 trusted HTTPS/assets/both listeners/login gates and
isolated installed child request/ACK routing. Synthetic/native
protocol fixtures do not establish real provider event delivery or rendered phone
acceptance. No live native approval was created or answered for testing.

Published and installed0.46.1 adds the user-requested conditional recovery
sequence to the fifteen-minute main-agent ping and coordinator/base guidance.
Check every child's actual wait/external-job state; safely interrupt only a
stalled child wait, preserve history/findings/request context, verify its pwd-only
reply under unchanged permissions and resume a specific authorized next step.
Unknown external outcomes, genuine decisions and user stops remain protected.
No blanket probing, timer, dispatcher or broader permission is introduced.

Implementationd1bc08be75eab274aad317b48953d0c53034cb55 and installed/source
checkpoint56b3499f35f16548a07a24e4733953bfc9e07259 were SSH-published/readback
verified. Six focused regression files/build pass; independent review is clear.
AAP3446 completed update/restart with nine protected files unchanged. Independent
3447 matched 105 files, actual0.46.1 trusted HTTPS health/assets, both listeners,
authentication gates and installed recovery/coordinator instructions. No native
approval, live pwd probe or model run was started for acceptance. The current
Coordinator received the instruction through the native message tool; model
compliance and full live recovery remain unverified.

The standalone normal Git push worked after the user's retry request. Earlier
compound/restricted SSH checks did not establish that this approved publication
path was unavailable. No SSH configuration, identity, transport or native policy
changed. Beads updates/readback also work normally; earlier restricted gate/socket
errors are not proof of a database credentials or host failure. The publication
input is actually resolved. The separate never-opened subagent approval/status
routing fix78kx remains open; this release is checking/recovery guidance only.

Historical working version0.46.0 (superseded by installed0.46.1) strengthens silent task checks for outstanding delegated
work, tool calls and external jobs. Inspect actual timing/progress and status,
investigate stale/unknown waits, collect results or surface a precise blocker;
a launch or in_progress label alone is insufficient. Preserve exact approvals,
scope, user stops, silence and the existing fifteen-minute schedule. Guidance
cannot guarantee recovery before a worker reaches its safe checkpoint. The
current Coordinator received this user-requested guidance through its exact
native thread. Six focused test files and production build pass. The broader
run passes71 of76 files; restricted socket listening/home writes prevent the
remaining five. Native SSH refuses system-config ownership in this environment,
so publication and the authorized production update remain pending. Existing
production0.45.1 is unchanged; no security/access workaround was attempted.


Published and installed correction0.45.1 adds the single-decision question rule to worker/shared
guidance and two approved mobile README screenshots. Exact original JPEG pixels,
compressed scan data and non-EXIF segments are preserved; Android build, capture
time/timezone and unique-image EXIF identifiers are removed. No GPS tag was
present. The user approved this metadata-only method after disclosure review.
Existing questions remain with their originating workers; this is instruction
guidance, not automatic semantic splitting or answer inference. All718 tests and
the production build pass, including existing instruction checks. EXIF absence,
preserved compressed data and README image references are verified.
Implementation `6c79c8f367cd434d6cd0aa83dd1eaa0b69e1f4ef` and installed payload
`1c533b191706e9d0ffb94aedb1b00dfa7b4a152d` are SSH-published/readback verified.
AAP3438 updated/restarted the existing service with nine protected files unchanged.
Independent3439 verified105 source matches, actual0.45.1 backend HTTPS health,
assets, both listeners/login gates, the installed question rule and EXIF-free
mobile gallery. The isolated installed HTTP withdrawal checks pass again without
native calls or real user history/login changes. Actual future agent compliance,
rendered phone interactions and the previously refused public path remain unverified.

Published and installed version0.45.0 removes Edit & rewind following the user's explicit
withdrawal. Keep communication traceable by retaining earlier messages and
recording corrections or changed decisions in follow-up messages. All rewind
variants, including previously deferred individual-message and Claude proposals,
are withdrawn. Copy this, normal input and branching remain available. Preserve
native conversation history and existing tasks, decisions, logins and permissions.
Removal implementation and source review are complete: all718 application tests
and the production build pass. Authenticated removed routes return404 without
native calls; passive observation retains stale-history/error recovery guards.
No actual native history rollback is authorized or performed. Implementation
`ffa76e145225f0e022ef1721c894219a313f4082` and installed payload
`3442e14fcf81cf5c96cee654226586d2ff0a56fc` are SSH-published/readback verified.
AAP3436 updated/restarted the existing service, preserving nine protected files
including session invalidation state. Independent3437 verified103 exact source
files, actual0.45.0 trusted HTTPS health, two served assets, both listeners and
login gates. Four real authenticated HTTP requests to the installed app in an
isolated temporary fixture returned404 for the withdrawn routes, with unchanged
fixture history and zero native calls. Removed feature files/served controls are
absent; Copy this and branching remain served. No real user login/history or
proxy settings were changed for testing; actual rendered browser review and the
previously refused public-origin path were not re-tested.

Historical rewind approval/choice statements below are superseded by this
withdrawal and are not current implementation or future-work authority.

Published and installed version 0.44.0 integrates the approved whole-turn Codex Edit & rewind.
Preview full affected turns/inputs, require confirmation, use native revert and
refresh retained history before returning original text to the normal composer.
Do not auto-send or undo files/tasks/commands/permissions. Selected images are
blocked; stale, busy, pending/uncertain and handoff cases fail safely. Existing
queues/schedules/drafts remain. Native cross-client atomicity is unavailable.
Publication, deployment and verification evidence is recorded below.
No real native history was rewound.
The same release integrates approved private decision-file persistence: new
coordinator summaries reload at startup, retain older disk rows and never replay
approvals/authority. Storage state/errors remain separate from native outcomes;
normal shutdown flushes queued records. Older native history is not imported.
Final combined verification passed all 738 application tests and the production
build. Individual-message rewind and
optional installed/native/browser exercises remain deferred. Public screenshots
are now explicitly approved unchanged and placed in the README gallery with
historical-UI captions; their original SHA256 values match.

Additional report-status investigation confirmed that topic-labelled reports
without literal four-section wording can be rejected despite being visible in
native history. A delivery-turn race during instruction loading was also found.
Focused fixes/regressions passed and the baseline full suite passed 672 tests.
An independently found managed-provider early-acknowledgement compatibility edge
was corrected and reviewed; correlation with the reported AAP warning remains
unverified. No duplicate report or native answer was submitted.
The user approved login persistence and --clear-logins. Backend and frontend
implementation/tests/review are complete and the production update/restart succeeded.
The user supplied a current RHEL file-approval example containing identifiers but
no paths/diff/reason. Exact native file-change projection and read-only detail
loading are implemented for cards and coordinator reads, with full-content review
fingerprints and stale-history guards. Direct raw pending-item reads are unavailable
under current native socket permissions; the original live case is not verified.
Assistant message-only question metadata is also retained/displayed, including
empty text. No supported exact reply binding was established, so those questions
explicitly require the native client; no fabricated IDs/answer controls exist.

The incoming published 0.43.1 Ansible protected-frontend patch at22cff73 is
integrated without lowering0.44.0 metadata. Its Basic401 probe remains distinct
from application-auth403. Ansible syntax/strict production lint pass (26 files);
32 of33 native Ansible fixtures pass. One TLS fixture is blocked by local socket
permissions, with assertions unchanged. No source-review blockers remain.

Implementation `85517d8b3d461f1cdaea9d80fb0f85a90ec6b365`, integration
`af453b2c1b6f11b15f0e0661312af63dc57445cc` and installed payload
`d2f270d7d01aa5079f89e7236d2a84719fdf3bbf` are SSH-published and independently
readback-verified. Authorized AAP job3433 updated/restarted the existing service;
eight protected files are unchanged. Job3434 verified 105 exact source files,
active process and actual HTTPS health0.44.0, matching index/two assets, both
listeners and application-auth403 without a Basic challenge. Installed session
restart/clear-logins and decision reload passed in isolated private temporary
profiles; no real login was revoked for testing. Private runtime storage modes
also passed inspection. One final app login is needed for the RAM-session migration.

Job3434 failed only at its final public-proxy probe: connection refused from the
application host. Follow-up read-only job3435 confirmed the configured HTTPS
origin resolves but refuses its TCP connection. Public proxy/TLS/Basic Auth and
authenticated browser retention are therefore not verified by these jobs; no
proxy, DNS, firewall, credential or listener setting was changed. This network
observation does not negate the completed application checks above. No actual
native rewind, approval or original missing-request recovery was exercised.

Earlier published/deployed version 0.43.0 implements the user's explicit correction: Never also
excludes automatic startup reports. Keep manual Report now, stored dashboard
summary/task reads, enabled cadence/coalescing and separate task checks.
Unsent automatic startup reports can be cancelled without dropping manual,
failed/unconfirmed or in-flight work. All 618 application tests and the production
build pass. Implementation ea9d917 and payload
cdc969fe02b15f8adedf154d0d476d628a3f8712 are SSH-published/readback-verified.
Production update/restart and independent verification passed: 96 matching files,
two served assets, trusted HTTPS0.43.0, login gates, both listeners and eight
unchanged protected files. Installed startup-skip code/instructions match; no
extra model turn or live native grant was started for validation.
The user deferred optional installed/native/browser workflow exercises; do not
install Playwright/Chromium or run real native grants merely for acceptance.
Whole-turn Edit and rewind is now approved with preview/confirmation; its isolated
implementation is separate from this release. Fine per-message rewind is deferred.

Published/deployed version 0.42.0 implements the user-selected htpasswd-protected
first-browser password setup without a temporary code. Configuration is explicit
and disabled by default; existing passwords remain unchanged. Atomic creation,
exact HTTPS public-origin/Host checks, normal API gates, confirmation and secure
sessions are covered by focused backend/UI tests. The installer prints setup
instructions without prompting or generating a password. Infrastructure and
Ansible integration remain with their owning conversation. Native file-change
approval controls also expose the supported session choice omitted by the earlier
fallback; manual filesystem/network requests can use native turn or session scope,
without inventing permanent grants or expanding coordinator permissions.
Report status now distinguishes a delivered request from an actual recognized
report; ending without one produces an error, not a false ready announcement.
The original AAP delay cause remains unverified; no interrupt/retry was added.
All 614 application tests and the production build pass, including real trusted
HTTPS first enrollment and exact native response fixtures. Combined source also
passes all 17 native-Ansible deployment fixtures, preserving the independently
published 0.41.1 bootstrap changes. Implementation bd3212a and payload
1aea82fc4a65852bd175fa34495ecd300118045c are SSH-published and remote-verified.
Authorized production update/restart and independent verification passed: 96
exact installed source files, two served assets, trusted HTTPS0.42.0, login gates,
both listeners and eight unchanged protected files. Existing auth remains configured;
fresh browser/proxy enrollment and actual native approval acceptance stay unverified.
The user accepted moving fresh-install validation to AAP AutoDeploy existing
rollout; that task is no longer awaiting input in this conversation.

Version 0.41.0 implements the user's bounded desktop overview: report/model
settings stay at the bottom while task/question content can scroll within the
available pane. Preserve resize/reset, saved preferences and mobile's continuous
page. All 585 application tests and the production build pass; focused review
found no concrete blocker. Actual browser/phone geometry remains unverified.
Implementation `fcbf2031155a32f609660f69f22250e700bce932` and installed payload
`e9335e0a9859c93de373118cdd3c2a786bd60608` are SSH-published and independently
readback verified. Authorized production update/restart and independent
verification succeeded: 95 exact source files, two served assets, trusted HTTPS
health0.41.0, login gates and both listeners. Eight protected files are unchanged.
The new bounded overview CSS and bottom-settings wiring are installed/served;
that artifact evidence does not replace actual rendered browser acceptance.

Edit & rewind still needs the user's whole-turn versus per-message-support
choice. No native form is currently exposed to the coordinator, so the same
blocked input task is labelled as an ordinary Question; no duplicate form/task
or inferred answer was created. No rewind implementation/action is authorized
by this visibility reconciliation.

Version 0.40.0 removes the Goals feature at the user's explicit
request. No Goal will be assigned to kept-open tasks and the earlier batch
approval question is withdrawn. Removed worker Goal controls, HTTP routes,
state/events, native start/resume/clear adapter paths, automatic Goal creation
and announcement formatting. Native Goals are no longer a harness requirement.
Ordinary Beads tracking, task lifecycle/ready-work guidance, reports, approvals
and existing branch handoff remain. Existing runtime Goal data is untouched;
branch handoff retains only its earlier safe continuation checks. No replacement
execution engine is selected. The user separately approved a fixed15-minute
silent task-attention reminder through the existing coordinator timer/queue,
with a next-dispatch counter and existing native/pause/stop/handoff guards.
Codex-only for now; Claude stays deferred. All581 application tests and the
production build pass; independent review confirmed the final stop/handoff race
fix. Implementation `43780d183436cf05d862ffe96927872ddc084c38`, race correction
`e6871479bb475b6353eadd225ff25e8bdafb792d`, installed/published payload
`5bbd5bea435448f573c2e8126178ffa81e3edbd6` are SSH-published and readback
verified. Authorized production update/restart and independent verification
succeeded: all95 checked source files and two served assets match, actual trusted
HTTPS health reports0.40.0, login gates and both listeners work. Eight protected
configuration/authentication/service/native-profile files are unchanged. Removed
Goal feature files are absent and the served bundle contains the new counter.
Real scheduled native adoption and rendered browser/phone acceptance remain
unverified in the existing installed-workflow record; no model/request was
started merely to test them. Earlier restricted socket/home/subprocess capture
attempts did not recur in the final complete run and are not active test blockers.

Previous 0.39.0 was published at `a0467e99efc84575081393ad135d28cbaa5f1cf6`
(implementation `2ea1956c8ff83425e414ec8f5b92eeb6a80f97a0`). Production update
and independent verification succeeded: 96 installed source files, trusted HTTPS
health/assets/authentication gates and both listeners matched; eight protected
files stayed unchanged. All 606 tests/build passed for that revision, but actual
native/browser Goal controls and continuation were not accepted. The user later
withdrew the feature after the one-active-Goal-per-chat limitation was clarified.
Do not resume the explicitly paused implementation Goal or recreate it for the
removal. Historical code/decision evidence remains available in Git.

The user confirmed backlog cleanup is CCNG-only. Read-only review found no safe
extra completion closures. Claude, mobile notifications and development charts
are deferred; request-recovery and general installed-workflow records were
renamed to distinguish published code from outstanding acceptance. The approved
browser-first password flow is still unimplemented; documentation now makes
that distinction clear rather than treating current installer prompts as the
completed future flow. Keep genuine unfinished and future work visible.

Version 0.38.0 (implementation `e7bb5e0e12d5363626609893d3d53a712baeecde`) adds one-click background Hand back & close and a compact
title-only composer colour tab. Handoff requests a safe checkpoint, proves local
work settled, links every Beads task to the parent while retaining provenance,
confirms exact native summary receipt, then archives last. Pending requests stay
manual; uncertain results keep the branch. Background closure does not steal
another tab's selection or draft. Workflow state stays process-local and is not
replayed on restart. Native APIs that cannot establish safety retain the branch.

Only the title is tinted; the selector/status remain neutral. Six choices are
cyan/violet/green/blue/teal/rose; legacy amber migrates to blue. All 560 tests and
the production build passed, with final authority-related focused regressions
passing again. Published payload `e22f020bd1400fe65007ebe5d211e3e49533fb93` is SSH-pushed and
remote-readback verified. AAP update/restart and independent verification both
succeeded: all 94 checked installed source files match, actual HTTPS health is
0.38.0, two served assets match, login gates and both listeners work. Eight
protected configuration/authentication/service/native-profile files were
unchanged. Real native handoff and rendered desktop/phone acceptance remain
unverified; do not infer them from fixtures or health checks.

Previous production verification confirmed 0.37.0 was installed and running;
the 0.38.0 result above supersedes that version checkpoint.
The user configured the previously missing sudo access; authorized AAP ad hoc
checks succeeded. All 92 checked installed source files match published payload
`ce587a3fd29e191d5960425ce5d38095a8b09845`, and the actual HTTPS health endpoint
reports 0.37.0. The existing user service is active, runtime files precede its
start, the served index/two hashed assets match, API state/events require login,
and both expected listeners are present. No reinstall/restart or configuration,
password, certificate or access-control change was performed by this agent.
This supersedes the earlier sudo/deployment blocker below. The standing minor
release deployment rule remains active; actual phone and fresh native-request
workflow acceptance retain their separate records.

The README is now a 148-line product/onboarding guide. Current operation lives
in `docs/usage.md`; chronological changes live in `docs/release-notes.md`, with
archived details linked. Documentation commit:
`a0bb7b590c17f752ad6029935c15c089cb7fcebd`. All three parse as GFM; 28 local links
and five anchors resolve. No executable/version change or additional deployment
occurred for this cleanup. Keep future release narratives out of the README.

Version 0.37.0 (implementation `e3a01ba6fefa45ee6e6fcacbcf444b1a7126f96e`)
completes the transferred mobile image picker with existing
per-chat in-memory drafts, limits and native delivery. It also repairs three
request visibility defects: reconnect clearing replayed cards while retaining
their map records, indefinitely postponed snapshots during continuous changes,
and a delayed initial browser read overwriting newer SSE state. Recovery reuses
only exact current pending records; resolution/disconnection still invalidate
them. Original native IDs/tokens and manual-answer protections remain intact.
The historical RHEL incident's exact triggering sequence is not established.
Actual Android Firefox and affected-runtime verification remain separate.
All 520 application tests and the production build pass. Independent review
found no concrete issue in the recovery or browser state fixes. Native cancel
uses a cleanup ref listener because React's input props do not offer onCancel.
Earlier elevated preflights failed with a sudo denial. The newer successful
production verification above resolves that blocker; credential selection is
answered and no replacement decision is pending.

Version 0.36.1 (implementation `64c8b2376a3a552cff6129219f86ecebed877a1f`)
corrects new-agent path validation: the form and backend trim
surrounding whitespace, preserving spaces within directory names. Both provider
creation paths check existing absolute directories and reject malformed/missing/
inaccessible paths with a status-400 validation message before native creation.
No directory creation, shell expansion or permission changes are performed.
All 505 tests and the production build pass; independent source review found no
concrete issue. The existing startup-report test now compares exact worker IDs
without assuming delivery order across independent asynchronous workers.
Installed/browser acceptance remains unverified; no service was changed.

The user now requires production deployment after minor releases through AAP
ad hoc, including the normal update/restart and outcome verification. The
initial 0.36.1 deployment attempt was blocked because the selected Machine login
has no sudo rights and cannot access the installation. No update/restart or
security change occurred. The user subsequently confirmed the existing
credential and configured sudo access, now verified as working above.
Preserve configuration/auth/certificates/native profiles and native permissions.

Version 0.36.0 implements the user's MOBILE ONLY overview compaction. Padding
and section gaps shrink to eight pixels; task heading/totals wrap together.
Empty question sections are omitted only without requests or attention in both
worker and coordinator views. One Worker settings row shows cadence and Report
now; native disclosure reveals cadence/model controls without unmounting them.
Queued/pending/error feedback stays visible. Desktop controls, fonts and saved
sizes remain unchanged, as do the three-task viewport and history/input bounds.
All 498 tests and the build pass; independent source review found no issue.
Implementation: `02a8f79e4330474dc58ef81ff3f02cb21e84237c`.
Actual phone rendering/keyboard/rotation remains unverified. Check remote refs
for publication; source work does not install or restart a running instance.

The old shared-default/forced-change proposal remains withdrawn. A separately
clarified first-browser password-creation flow (without an initial deployment
password) is not implemented: current startup still requires an auth profile.
Do not claim fresh password-free unattended deployment is ready. Mobile is the
current implementation focus; no authentication redesign is selected here.

Version 0.35.1 fixes the existing password-length mismatch: creation, protected
stdin and HTTP login support up to 4,096 actual password characters. A final
LF/CRLF is allowed by stdin without enlarging the password limit; oversized
replacements preserve the prior profile. All 489 application tests, two focused
Ansible password fixtures and the build pass. Implementation: `71fa8572193901028245475fca101d85f4fc0eb3`.
Check remote refs for publication;
no installed application/service/password was changed by this source patch.

The user withdrew the shared default password and first-login forced-change
proposal. Existing setup requires a user-chosen password before startup and
preserves configured authentication. The former first-access choice is closed
as withdrawn; do not keep reporting it as pending input. The later overview
scope was answered mobile-only and is implemented above.

Release 0.35.0 implements the approved continuous mobile page: wrapped tabs,
full-width overview above about 30 lines of internally scrolling chat history,
and a six-line textarea with internal overflow. The worker Coordinator recap
and resize handles are hidden on narrow/wide coarse-pointer mobile devices;
saved desktop sizes remain intact. Touch no longer enters tab drag capture;
mouse/pen dragging and arrow reordering remain available. The existing 483-test
suite, four new mobile layout checks and build pass. Actual phone keyboard,
rotation, long-paste rendering and desktop-size restoration acceptance remain
unverified. No running installation, proxy, native configuration or service was
changed. Implementation: `bcf49e16ed80582b674c3583cc336aee3e87b8ce`.
Check remote refs for publication; Beads retains phone acceptance open.

Release version 0.34.2 preserves user-message soft line breaks and whitespace
in Markdown paragraphs/list items. Data and clipboard text were already retained;
Markdown's normal paragraph whitespace collapsed their display. Assistant
formatting, tables/fenced code and copying stay unchanged. This is a focused
CSS correction, without content classification or command execution. Targeted
checks (32 UI cases) and the build pass. Implementation:
`37a88f337b58033504c37c3ddd20546083ecdf63`. Check remote refs for publication;
actual rendered browser verification remains unperformed.

Previous release 0.34.1 makes the selected per-chat colour persistently tint only
the header tab above the input. This follows the user's correction: colour its
background, not the composer frame or top agent tabs. All 481 tests and the
build pass, including palette/cascade contrast checks. Implementation:
`acb3293875432387f3d864a58b6908731005dd5b`. Check remote refs for publication;
rendered browser verification remains unperformed.

The 0.34.0 login task is now CLOSED after the coordinator relayed actual user
verification that both external and localhost access work. This is attributed
access verification; broader application/mobile acceptance remains open. The
user's rejection of agent-side host-setting removal remains in force, and no
further production configuration or restart is authorized by that verification.

Release version 0.34.0 prioritizes the SSH HTTPS login failure and dual-address
startup. Installed config can pin a public origin while an existing explicit
loopback service is accessed through a localhost SSH tunnel. The strict single
origin check rejected login before password verification. The focused fix keeps
exact public-origin validation and permits matching local HTTPS only on a
loopback listener with actual encrypted loopback socket endpoints.

The user approved default startup on exactly the one selected default-route
IPv4 address plus 127.0.0.1; explicit --host remains single-address. Both share
one application/auth/workspace process. Listener rollback/shutdown, public-proxy
behavior and TLS tunnel login receive targeted regression checks. Certificate
name/trust requirements and live restart ownership are unchanged. All 480 tests
and the build pass after integration of the published approval-button fix.
Implementation: `03a4fef944856dd4f75f3c788c73229f3403eb3a`.
Source publication is verified; the later attributed user report confirms both access paths. Password setup and native Goals are not part
of this priority release.

The published 0.33.1 approval-button correction is included unchanged:
implementation35469d671416b4a11c4d58c65898cdb0bcd6e46e, remote head
0ac4b4e413ced237abe11333ecce7d2418dfdcbf. Labels remain on one line and whole
choices wrap at the existing shorter height.

Previous release **0.33.0**, adding a draggable vertical composer resize and
correcting the header placement after published 0.32.0. The title/colour/status strip now belongs to the composer above its
input box and below scrolling history. Upper-right branding is retained.
The history/input divider resizes the whole composer, supports pointer and
keyboard input, cancel/reset, and restores one browser-local height preference.
Bounds follow available space, including the stacked overview on narrow screens.
The overview starts with the project name without GOAL; every sidebar font is
one pixel larger. Sidebar recap fields together aim for 20 words and cap at 25;
legacy long recaps preserve their full originals in expandable details.
Input requests now lead with Needed/Why, with exact steps/background/original
notes under Details. Shared and worker base instructions use the same default;
no AAP task or password/deployment action is taken by this UI work.
The release also corrects a stale installer fixture that still expected the old
Codex package pin after the 0.32.0 version update. All 469 application tests
and the production build pass after combined integration. Independent reviews
found no blocking issue; rendered browser acceptance remains unverified.
Implementation: `fad77316cde9e30c5bbf237694b7b8a8562d22c0`. Check current remote refs for publication.
The shared bootstrap-password/forced-first-login-change proposal was withdrawn.
Keep the existing user-chosen password flow and preserve configured passwords;
no authentication code change is needed for that decision. Interactive setup
prompts if auth is absent. Headless installation may stage files without a
password, but the server refuses startup without valid authentication. Deployment
requires protected 12–4096-character initial input only when the auth file is
absent and does not rotate an existing password. No initial-access choice remains
pending for the withdrawn proposal.

Previous release version was **0.32.0** in package.json and the lockfile.
Implementation: `283692d29b8a8bdc4580f5cac0673701929431c2`. It builds on the
published 0.31.3 source at428cc0041861b6d8bb88af2b1e4ed2faefb2b53a. The earlier
four deployment design choices were explicitly approved in the owning AAP
conversation; the previous review hold is resolved. See current Git refs and the
decision history for implementation/publication IDs. Source release does not
update or restart a running installation.

The user chose HTTP as the runtime/installer default, superseding the earlier
HTTPS-default proposal. Normal installation defaults to ~/commandcenter-ng with
--prefix overrides, creates private etc/config.conf after a successful build,
and preserves settings/certificates/tools on updates. Commented HTTPS/certificate
examples precede active HTTP. The file uses literal key:value text and comments;
YAML is explicitly deferred. Foreground/systemd startup reads that file, with
explicit CLI/environment values retaining priority. Default-route IPv4 selection
and startup/help interface/address logging are implemented.

Optional application HTTPS validates real certificate/key format, dates, matching
key and SAN identities. The CaC-style app playbook generates/reuses its selected
self-signed backend pair under INSTALLDIR/etc/certs and writes HTTPS settings.
Actual environment settings and credentials stay encrypted in the private
companion. Nginx is already handled by the other conversation, as the user
clarified; this worker's duplicate nginx draft/hooks were removed from the release.
No nginx rollout, live deployment or installation was run here. Private CaC
updates and normal deployment acceptance remain with their owning conversation.

Installer/deployment attempt native structured-question setup. Startup checks
read-only. Missing/unsupported/failed Codex setup is warning-only and does not
block installation/deployment/startup. Beta warnings stay visible; no native
TOML edit, warning suppression, daemon/worker restart or model call was used.
The user enabled the native flag and both saved/effective readback confirmed true;
that input task is closed. Existing worker adoption remains a live-validation gap.

The compact chat header places title/four-colour selector left and Codex
receipt/activity/connection status right. Native ACK gates receipt; true native
updates exclude history/polling/heartbeats. The age and transport freshness are
separate, with last-known state when unconfirmed and no guessed stuck diagnosis.
Per-chat colours persist in existing browser preferences. Rendered phone/desktop
acceptance is unverified; the user will test the protected public site.

Validation:449 Node checks,24 isolated Ansible fixture checks, production build,
syntax checks and strict production lint pass. Review fixes cover nonblocking
FIFO refusal, exact installer comment ordering, visible safe Codex warnings and
browser/backend/health SAN coverage. Earlier runs included withdrawn nginx
fixtures; those are not claimed as this release's deployment acceptance.

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
source publication alone does not deploy these changes. The last explicitly
reported installed version was 0.22.0; the user subsequently confirmed the
user-level service was tested successfully and is running. This does not identify
the currently installed version. The agent's user-bus status query was restricted,
so service operation is user-verified.

The 0.29.0 work adds classic/contrastful/light themes, compact palette selection,
Logout after branding, grouped Add agent/count, Needs input ordering, ordinary
questions merged into Tasks, explicit task-input context and per-task Notify me.
Notifications use browser-local subscriptions and existing live snapshots;
desktop alerts are optional and do not work with the browser page closed.
Native requests without task identity remain worker-scoped. Report instructions
now explicitly cover every active workstream, including delegated audits.
An isolated Codex native Goal adapter is preparatory; no Goal UI/routes or
automatic activation are included. Claude Goal confirmation remains unverified.
See Git refs and the decision history for publication and validation evidence;
these changes do not upgrade or restart a running installation.

Validation for 0.29.0: all 322 application checks and the production build pass.
Coverage includes theme contrast/persistence/keyboard controls, task ordering and
input-context rendering, subscription compatibility, transition baselines,
worker-level request/error isolation and desktop permission/privacy behavior.
No live browser permission prompt, OS notification display, rendered desktop or
mobile layout, live model Goal execution or AAP deployment was tested here.

The 0.30.0 refinement moves report cadence beside coordinator project names and
prioritizes actual Needs input task titles in amber, preserving native badges
and click-to-tab navigation. Queued dependencies are excluded and cards read
only their own ready tracker. Source publication does not update the installed
copy. A later read of the configured installation's metadata found 0.27.2; this
supersedes the older last-reported 0.22.0 without proving the running process
version or browser acceptance.

All remaining Claude implementation, native Goals/rewind integration and live
validation were moved to Todo at the user's request. Retain existing published
SDK code and completed research, but do not resume Claude work automatically.
This is a historical checkpoint: Codex Goals were subsequently withdrawn in
0.40.0; Codex Edit & rewind remains unfinished.
The rollout input record is now assigned to AAP AutoDeploy by user direction;
do not repeat that credential question in this conversation. Its original CCNG
creation is evidenced, not a demonstrated cross-conversation read leak.

All 330 application checks and the production build pass for 0.30.0. Eight
new coordinator-card tests cover input priority, task/worker isolation,
dependency/unavailable exclusions, cadence/header placement and navigation.
Actual rendered desktop/mobile layout remains unverified.

Version 0.31.0 adds Codex-only native Allow always choices for offered command,
network-host and MCP tool rules, with visible scope and strict current-request
validation. Native Codex owns persistence; no CCNG permission store/config writer
was added. Native save warnings are shown per worker or globally when unscoped.
Request resolution is not independent disk-save confirmation. File/session and
turn-only permission limits, ordinary forms and coordinator restrictions remain.
Claude permission work is postponed. No live persistent approval, installation
update or native configuration change was made during implementation; deployed
native-save behavior and actual browser layout remain unverified.

All 358 application checks and the production build pass. Two bounded independent
reviews found no concrete blocking issue. Verification uses synthetic native
requests and real application protocol/HTTP fixtures; it does not establish that
a deployed provider wrote a persistent rule. No Claude code or dependencies changed.

Version 0.31.1 returns focus to the current chat draft after a confirmed manual
Codex approval. It preserves current draft text and uses the existing caret-at-end,
no-scroll behavior. Decline/Cancel/review/failure do not focus. A tab or dialog
change cancels delayed focus, including switching away and back; hidden, locked
or detached inputs are excluded. Claude behavior is unchanged. All 366 checks
and the production build pass. Actual rendered browser focus remains unverified;
no real approval, permission change, update or restart was performed for testing.

Version 0.31.2 fixes an uncontained absolute copy-status live region: each copy
control now establishes its containing block, with the hidden announcement
pinned inside it. This addresses a source-level cause of an outer scrollbar and
blank page below a bounded long-history workspace, present in the older installed
version too. Accessibility and existing chat/sidebar scrolling stay intact.
The actual browser symptom and its rendered correction remain unverified;
no browser binary was available and no installation was updated or restarted.

All 366 existing application checks and the production build pass for 0.31.2.
Independent source review identified the same containment defect. No synthetic
CSS assertion is presented as rendered overflow verification.

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

## Task records and historical checkpoints

Beads is the authoritative project backlog, including branch-associated records
outside the current conversation. The former copied status table was stale:
fresh Dolt/Beads setup, ordinary-chat questions, model controls and parent-handoff
errors are implemented and published. Their historical pending notes above are
release checkpoints, not a current implementation backlog. Later release entries
and actual task records take precedence.

The audit checked all 61 epic descendants plus standalone and branch-associated
records. Existing unfinished work remains in Beads; documented gaps for durable
decision summaries, real fresh RHEL 9 bootstrap and live report/dashboard/
notification acceptance now have explicit records. Browser visual review remains
in its older project branch. The deployment input record is AAP-owned. Do not
copy another conversation's input question into this chat or reopen completed
implementation work merely because its live acceptance is still unverified.

Read the relevant records before updating them. Use the next chat's own
conversation label, preserve other labels and ownership, and distinguish
unfinished implementation from validation or future design. No new feature,
deployment, live test, storage architecture or service is authorized by the audit.

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

0.24.0 implementation: `39b976a3f1c11db49ce36bef78a1e9a8163f91a7`.

## 0.24.1 service Beads routing correction

The existing user unit omitted explicit Beads tracker routing while worker CLI
commands used an existing shared tracker. Service generation now preserves
BEADS_DIR and BEADS_DOLT_SHARED_SERVER if supplied, alongside its existing
non-secret allowlist. It does not discover/select an alternate database, copy
credentials, initialize a tracker or start/migrate Dolt. Repeating install with
no runtime options still preserves the old unit; explicit options refresh it.

Failed task reads no longer display authoritative zero totals or a no-matches
suggestion in Link tasks. Exact errors and save protections remain. All210
application tests and production build pass. The live owner-only unit was read
but not changed; installation directories remain outside session writable roots.
Existing-unit registration with its original runtime options and the confirmed
tracker setting, restart, and actual task readback still need host verification.

0.24.1 implementation: `a7670529bc996896ecead487fb0a00679b6cbdbc`.

## 0.25.0 clipboard image input and report instruction recovery

Ctrl+V in the chat input adds removable image previews; image-only or captioned
messages use native Codex image inputs and official Claude SDK base64 blocks.
Draft images stay in per-chat browser memory across tab switches only; refresh
discards them. Newer text/images survive delayed send acknowledgements and
failed sends keep drafts. Pending questions still allow drafting but block send.
Supported types are PNG/JPEG/GIF/WebP, four images,4MiB each/8MiB total.

Authenticated message input has a12MiB request cap, other JSON routes retain
64KiB. Image signatures/base64/size/count are checked. Native history preserves
supported inline images; exact authenticated message/index URLs serve bytes,
while workspace snapshots omit image payloads. No remote URL fetch, arbitrary
local file read, upload directory, new attachment store or draft localStorage.
The native Codex receive cap is64MiB to accommodate image-bearing history pages;
a real native-protocol fixture exceeds the old16MiB cap without bloating SSE.
The nginx documentation example allows12m uploads; no live proxy was changed.

Report-setting delivery now shares safe active-turn priority with Report now,
follows queued reports and precedes ordinary summaries without bypassing failed
or in-flight messages. Failed settings allow explicit same-value retry. Saved
intervals are included in runtime instructions at native startup/new turns so
workers can reconcile without toggling the radio or replaying chat instructions.
Restoration alone remains read-only. Agent-managed timing remains selected,
with no CCNG recurring timer. Codex can follow timed instructions while active;
no documented app-server idle scheduler is established. Real native recurrence
and recovery after process termination are still unverified, not claimed fixed.

All231 tests and the production build pass. Installed Codex schema generation
confirmed image URL input shape without a daemon/model call; Claude native SDK
history fixtures preserve inline image content. No interactive browser paste
or live model image/schedule run was performed. The first expanded HTTP test
exposed a fixture missing Beads.context, which was corrected before final pass.
Running installation/systemd environment refresh remains a separate host step.

0.25.0 implementation: `a4c30659cf7150d777e9f767738721bb6b2e7196`.

## 0.26.0 CCNG timer and silent report requests

The user explicitly switched from agent-managed timing to a CCNG backend timer,
superseding the earlier no-CCNG-timer decision. The coordinator backend reads
existing saved per-worker interval metadata. After restoration, enabled sessions
queue one initial report and continue at their cadence; browser refresh and
reconciliation do not duplicate startup reports or reset deadlines. New radio
choices reset the next deadline; Never cancels unsent scheduled requests while
preserving explicit Report now and uncertain in-flight/failed actions. No missed
report bursts are replayed. Closing a tab removes its CCNG schedule.

One backend timer handles due work through existing bounded native queues,
without a coordinator model call per tick or scheduled-report completion. Native
questions, pause, permissions, ownership, unavailable runtimes and branch handoff
gates remain. Existing agent-owned report loops are canceled by the new runtime
instructions/one-off trigger, avoiding duplicate timing mechanisms. No new
service, attachment store or persistent message queue was added.

CCNG hides typed internal user report/control/coordinator-event inputs, including
restored Codex history through native client IDs or full-span UI metadata. Claude
uses official SDK synthetic input metadata; native history remains authoritative
and unchanged. Actual assistant reports, ordinary summaries and identical real
user-written text remain visible. Silence is presentation, not permission or
history deletion.

Long-running turns can release report bookkeeping when a new live completed
assistant message contains the four Standard Task Report sections in order, so
later timer reports do not wait for the whole project turn to end. This bounded
recognition changes no Beads task state or approval authority. Partial/stale/
quoted/code output stays pending; full native turn completion is a fallback.

The user separately raised interruption of CCNG-managed Claude on backend stop.
Read-only inspection confirms SDK query.close terminates its owned subprocess;
persistSession/resume retains history, not live execution. Native Claude has
background/attach commands, but supported local SDK detach/reattach compatibility
is not established. The user explicitly rejected a separate daemon/service after the assessment.
Keep current SDK ownership; no lifecycle change or restart-survival fix was made.

Validation for0.26.0: all246 application tests and the production build pass.
New checks cover saved startup intervals, no duplicate restore triggers, silent
native/SDK history, safe deferral/coalescing/Never and reports during active turns.
Live browser/provider cadence and actual running-installation update remain
separate; no model run, service restart or live unit change was used for tests.

0.26.0 implementation: `09b9f37bcbc11c47a92a543713c62e03dd55da69`.

## 0.27.0 current startup dashboard and report intervals

After saved-state loading, the coordinator requests one silent fresh startup
report per restored worker, including a one-off for Never. Existing timer/Report
now requests are reused; intervals/deadlines are not changed and Never still
means no periodic reports. Startup requests follow native questions, ownership,
pause, availability and handoff gates; errors remain visible without auto-retry.

The coordinator reads available native history, stored tasks/blockers and saved
interval/next-due metadata immediately and publishes sidebar progress. Fresh
startup results trigger finite, throttled per-worker updates rather than waiting
for every worker. Paused/unavailable coordination retains startup intent. Startup
inputs/events remain hidden; no repeated acknowledgements or summary loops.
Worker overview cards show Reports:1h/15min/5min/Never (Unknown if unavailable).

All251 application tests and production build pass, including57 coordinator
checks and15 restoration checks. Coverage includes startup coalescing, paused
Never workers, progressive results, preserved deadlines, loaded-state handoff
and coordinator sidebar publication. Running installation/model-generated
dashboard quality and browser presentation still need live acceptance. No
service restart, dependency installation or native permission change occurred.

0.27.0 implementation: `cfb0484f8b27670fc89a232a6a0e1b4a759d3bfa`.


## Mobile acceptance ownership

Responsive web layouts exist, but actual phone rendering/keyboard/approval flows
remain unverified. The user will test once the externally accessible site is
protected with htpasswd. That public nginx/htpasswd setup belongs to the other
AAP/infrastructure conversation; this chat tracks only CCNG UI acceptance. The
new mobile acceptance record is open, not a new unanswered deployment question.
Mobile notifications remain deferred and no native mobile app is selected.

The first-time walkthrough is in docs/installation.md. The user supplied their
actual update command, install.sh --update ./targetdir/, confirming the supported
installer update path with positional destination compatibility. Earlier advice
using the installed app launcher with --update was incorrect. The source wrapper
and installer entry points must be distinguished; do not request more logs merely
to establish the command already supplied.


The earlier per-user Codex location question is superseded by the user's approval
of the home default, custom prefix and managed Bash PATH approach. Its 0.48.0
candidate status and remaining verification are recorded above; it is no longer
waiting for a location decision. Native daemon boot management remains unchanged.
