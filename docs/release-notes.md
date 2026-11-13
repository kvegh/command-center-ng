# Release notes

The [README](../README.md) is for installation and first use. These notes keep
version history separate from current [usage](usage.md).

Entries describe implemented source, not proof that a particular installation
has been updated or every browser workflow has passed. The
[decision history](../design_decisions_history.md) retains full rationale,
implementation commits, checks and limitations. Original detailed release text
is retrievable in the [README before this reorganization](https://github.com/kvegh/command-center-ng/blob/12ce91bd35a2a4f0b7446af63d1977605c5a1c21/README.md).

## 1.21.0 — Send Coordinator concerns for proactive engineering review

The optional `concern_review_worker` runtime setting designates an existing local
Codex chat for new actual Coordinator concerns. Bounded batches use the existing
message queue and identify the originating project, worker and request while
withholding raw commands/source, protected-looking details and approval tokens.
The engineering worker can investigate recurring causes and repair routine CCNG
defects within authorized scope; genuine decisions and original approvals stay
with the user. An engineering notice does not approve or replay an action.

Delivery waits for an authorized idle point and repeats stop, pause, ownership,
handoff, native-question and cancellation checks after context loading and before
the native write. No active steering, new scheduler/store, historical referral
replay or uncertain-message retry is introduced. Queue and runtime errors remain
visible; delivered notices do not establish investigation or successful repair.

## 1.20.0 — Recognize direct container test scripts

Source review also recognizes a literal absolute Python script in the validated
read-only Podman working directory, ordinary absolute Python entrypoints and
the exact `--userns=keep-id` option. The earlier unittest module form remains
supported. The reader maps only that explicit script to its host file; it never
runs a container or script, searches unrelated mounted files or changes access.
Credential, symlink, path, size and exact-current-request protections remain.

This corrects a confirmed reference-recognition refusal before content scanning.
A separately reported container execution `Permission denied` remains a runtime
access issue; source review does not fix it or establish test success. Historical
approval and source-reader failures remain diagnosable after a human resolves
the original request, without replaying it or granting a standing permission.

## 1.19.0 — Preserve current turns and reserve amber for user action

Amber tab frames now mean actual user action: a Coordinator referral/concern,
decision question, specific linked-task input or native manual approval. An
otherwise eligible request stays neutral while a configured Coordinator evaluates
it, starts up or is temporarily unavailable; a pending native confirmation also
stays neutral. Temporary availability no longer invents a user decision. Native
manual-only requests and the genuinely unconfigured manual route remain explicit.
Selected/unselected frames retain the policy across all three themes without
changing native request controls or send gates.

Late completion of an older turn and delayed turn-start acknowledgements no longer
replace a newer known turn or retire its question state. Native completion
accounting still receives the original turn's completion.

An exact native expected-turn mismatch is a rejected input, distinct from an
unknown delivery. CCNG reads the current turn/waiting state and may retry ordinary
input once with its original payload and identity after current ownership,
request, stop, pause and handoff checks. It never starts a new turn as recovery,
retries an uncertain response or moves a question answer to a different turn.
Newly discovered missing request cards use existing guarded recovery. Other
failures keep the draft and give an explicit not-sent explanation when rejection
is known. Existing native approval and permissions remain authoritative.

## 1.18.0 — Review container tests and show real blocked-task context

Source review now recognizes the supported literal Python unittest command form,
including an explicit read-only Podman volume and container working directory.
Previously a command naming a test module instead of its host `.py` path could
fail the source-reference check and fall back to an outside-project refusal.
The reader maps only the named module; it runs no command/container and preserves
the existing secret, path, size, symlink, current-request and hash checks.
Unsupported or ambiguous command forms remain refused.

Ordinary task popups show their original description and recorded notes directly;
queued work shows prerequisite names. They no longer lead with empty Needed/Why
placeholders or imply all blockers require an answer. Current input records keep
their explicit question presentation; historical Needed text alone does not
establish a current question. Blocker clarification asks for the actual blocker
and next step while preserving scope, draft and native-send guards.

Installed on 2026-11-13 after the full backend suite passed 1,093 checks with no
failures and one skip. Independent installed verification matched 113 source
files, checked HTTPS/authentication/served assets and passed all 411 checks across
25 affected suites. The installed matcher recognizes the exact original command
metadata without reading or executing its test. The served build includes the new
task-context controls; an actual browser click remains unverified. Nine protected
files/metadata, eight workers and native runtime settings were preserved.

## 1.17.1 — Restore web sending and handle large update streams

Browser-stream loss no longer appears as native Codex disconnection. Recovery
reads current workspace state before restoring Send, with snapshot/disconnect/
login guards and read-only retries on existing transport signals. No native
conversation resume, approval response or input replay is performed.

The former 4 MiB queued-output cutoff could terminate a stream while a larger
legitimate history snapshot was being sent. Initial snapshots and updates now
honor write/drain flow control, coalescing pending updates to the latest complete
state. Slow browsers do not gate others; session validation and heartbeat checks
remain active. Loaded history is retained. Existing service logs receive only
sanitized transport codes and the first backpressure event per connection.

The 1.17.0 pre-install full suite passed 1,084 checks with one failure and one
skip. The failure was an obsolete assertion requiring the old session-guard
spelling; actual-effect recovery/login tests already cover the stronger current
guard. 1.17.1 removes that redundant source-text check, preserving behavior tests.
The corrected full backend suite passed 1,085 checks with no failures and one
skip in 58.424s. Installed on 2026-11-13: the 85.138s validation/update preserved
nine protected files/metadata, eight saved workers, Coordinator/report settings
and the native runtime. Corrected installed verification matched 113 files,
passed live HTTPS/authentication/assets/listeners/tracker checks and all 341
checks across 21 suites in 6.683s against installed server/frontend source.
The initial verifier was rejected before execution because of an apostrophe in
a comment interpreted by the Ansible argument splitter; correcting the comment
required no application change or second restart. The user then successfully
submitted a real message from the affected web UI. This confirms restored web
sending; long-term connection stability and the exact original per-connection
closure remain distinct from that observation and the synthetic reproduction.

## 1.16.0 — Preserve chat order and delegate progress monitoring

Recent-history refreshes preserve loaded older pages and native turn/item order,
retain the oldest pagination cursor and protect newer live messages, completion
state and question bindings. The former silent 600-record trim is removed;
explicit native fetching remains 20 turns per page. Compaction does not become a
chat-deletion claim, and timestamps are not used to reorder the transcript.

One internal progress helper now follows worker progress, linked tasks/blockers
and publishes sidebar recaps separately from the main Coordinator and the two
approval analysts. Bounded tools, current evidence checks and existing shared
instructions/model/effort apply. Main approval checks and concerns remain; a
progress run never gates an approval. Unknown runs retain ownership and pending
native decisions remain untouched. No extra service, timer or task store.

Source validation: 16 history and 5 timestamp cases pass, together with 10
progress lifecycle and 4 Workspace wiring cases. Independent targeted reviews,
TypeScript/production build and syntax/diff checks pass. Full local npm test
passed 95 of 102 file suites; the seven sandbox-limited suites were subsequently
covered by the unchanged backend suite: 1,071 checks passed, none failed and one
was skipped in 56.338s. The backend source checkout first lacked build packages;
preparing the already-declared lockfile dependencies resolved that setup issue.

Published and installed on 2026-11-12. The 82.029s validation/update preserved
nine protected files/metadata, eight saved workers and Coordinator/report/native
settings. Installed verification matched 113 files and passed HTTPS/authentication,
assets/listeners/tracker checks plus all 288 checks across 16 suites in 2.951s.
Natural progress-helper threads using the selected model were observed, one active.
The provider refuses ephemeral history reads; completed native publication and
latency improvement remain unverified. Browser acceptance is separate. No test
model turn or approval was manufactured. A standalone SSH push succeeded without
configuration changes; the earlier compound-command failure did not require a
backend publication workaround.

## 1.15.0 — Review safe playbooks and documents

Both Coordinator source readers now accept safe YAML playbooks, JSON and
Markdown, alongside Python/shell and existing code formats. The project reader
also accepts JSON. Exact Ansible `@file` references use the approval's directory;
older Coordinators retain the existing bound project-reader path.

Reads do not run files or answer requests. Existing token/directory/source-hash,
path and size/page checks remain. Shared format-aware checks reject detected
literal credentials, renamed Vault payloads and binary content; JSON escaped
keys are decoded and template/environment references are not resolved. The
project reader rechecks resolved sensitive paths. Conservative content filtering
may still require private review of credential-like metadata or unusual YAML.

Final source tests: 13 source-reader cases and 97 Coordinator cases pass, plus
six adjacent reviewer/context/hook suites in 1.057s. TypeScript/production build,
syntax and diff checks pass; independent focused review found no remaining
blocker. Published and installed on 2026-11-12: the 23.162s update preserved nine
protected files/metadata, eight saved workers and Coordinator/report/native
settings. Corrected 7.445s verification matched 112 installed files and checked
live 1.15.0 HTTPS/authentication/assets/listeners/tracker. All 170 checks across
eight suites passed against installed server modules in 2.176s, using existing
tests staged temporarily from the source checkout. The first verifier assumed
tests were shipped inside the installation; correcting the harness required no
application change, reinstall or restart. No genuine approval or model turn was
created for testing, and no pending human decision was resolved.

## 1.14.0 — Independent mobile chat navigation

Mobile navigation now uses two independent buttons. **Jump to top** appears
when the app section above the chat history has scrolled out of view.
**Jump to bottom** appears when the end of the chat is outside the viewport.
Both are available in the middle of a long history; neither is needed when both
ends fit on screen. This replaces the single control that offered the end action
only within four pixels of the document beginning.

Visibility follows actual history bounds, viewport changes and overview/history
resizing. Buttons keep their own destinations even before a scroll event is
processed. The existing document scroller, composer destination, desktop reading
positions, drafts and native controls are preserved. No dependency is added.

Ten component behavior cases pass, covering both/one/neither button, visibility
boundaries, growth, switching, deferred scroll events and cleanup. Four adjacent
test files pass in 2.700s, the TypeScript/production build passes, and independent
source review found no blocking issue. Published and installed on 2026-11-12:
the 20.626s update preserved nine protected files/metadata, all eight saved
workers, Coordinator/report settings and native runtime. Independent 5.133s
verification matched 112 installed source files, live 1.14.0 HTTPS/authentication,
both served assets and the independent navigation code/styles. Physical-phone
geometry, keyboard and rotation remain separate acceptance checks.

## 1.13.0 — Mobile chat navigation

Mobile chat has a sticky **Jump to top** button at the top of the viewport. At
the page beginning it switches to **Jump to end**, showing the latest history
and composer without opening the keyboard. The control uses the existing page
scroller, follows conversation changes and current content height, and preserves
desktop chat positions. Narrow layouts and landscape coarse-pointer phones use
the same control. History pagination and native request actions are unchanged.

Six new component behavior cases cover navigation, live geometry, switching,
viewport changes and listener cleanup. Five affected test files pass in 4.156s,
the TypeScript/production build passes, and independent source review found no
blocking issue. Published and installed on 2026-11-12: independent verification
matched 112 installed source files, live 1.13.0 HTTPS/authentication/assets and
the served navigation labels/sticky styles. Nine protected files and all eight
saved worker identities, Coordinator and report settings were preserved.
Physical-phone keyboard, browser rendering and rotation acceptance remain
separate from source/component and artifact checks.

## 1.12.0 — Native request time and approval context

Published and installed on 2026-11-12. Independent verification matched111
installed source files and passed308 installed backend cases (synthetic native
transport), trusted HTTPS/assets/authentication and protected-state checks.
Actual browser rendering and subsequent end-to-end approval latency remain
separate verification gaps.

Approval cards show **Requested at** from the native request's `startedAtMs`,
with a full local date, seconds, time zone and corresponding ISO value. This is
request creation time, separate from later chat/browser arrival or rendering.
Missing or invalid native time stays unavailable; no observation-time fallback,
estimate or new timer is added. Selected tabs retain their amber top edge for
genuine human attention across all three themes. Eligible Coordinator-review
waits remain neutral, and saved chat-colour fills are preserved.

Bounded helper inspection recognizes explicitly imported fully qualified Python
modules at the exact approval cwd or its `src` layout. It performs no package
search, environment/virtual-environment lookup, import or embedded-code execution.
Existing source guards, hashes and original manual asks remain unchanged.

Analysts select canonical shared instructions from current main-Coordinator native
working-directory metadata and receive actual worker user instructions plus
existing older-authority page hints. If the retained tail has no genuine user
instruction, one first native history page may supply it. The main Coordinator
still rechecks the original native authority page, including a null first-page
cursor. Missing context is reported honestly rather than treated as invented
authority or an automatic prohibition. No authority store, permission fallback
or change to the sole approval writer is added.

See [request time and attention](usage.md#request-time-and-attention) and
[approval review](usage.md#coordinator-approval-review) for current semantics.

Analysts are optional assistance. The main Coordinator can decide without waiting
when it already has sufficient current evidence, retaining all final checks.
Existing analysis metadata distinguishes client queue/dispatch, native turn
acknowledgement, first evidenced activity and terminal result; provider queue
versus reasoning time is not inferred.

## 1.11.0 — Parallel approval analysis and earlier event wakes

Published and installed on 2026-11-12. Independent verification matched111
installed source files and passed294 installed backend cases using synthetic
native transport; trusted HTTPS/assets and protected saved state also passed.
A subsequent read-only observation confirmed an actual analyst recommendation
reached the saved Coordinator through its existing tools on a genuine request.
Final native approval execution, end-to-end latency and physical browser
acceptance remain separate verification gaps.

Use up to two internal read-only analysts for independent approval requests under
the same policy as the main Coordinator. Recommendations are evidence; the main
Coordinator remains the sole automated approver and retains all exact-request,
real-user authority, command/cwd, source-hash and native-confirmation checks.
Keep Request/Concern/Next explanations and manual pending asks. Unexpected analyst
native questions/permissions remain preserved with a visible error and exact
native-client next action; no analyst permission grants or blind retries are added.

Keep the earliest event wake instead of postponing it during a burst, and retain
urgent priority when later routine events arrive. Defaults remain a 1.5-second
urgent debounce and a 30-second routine interval. Neither these intervals nor the
initial two-analyst limit guarantee approval latency; model reasoning, tool round
trips and native waits remain separate contributors. Report and task-check
schedules keep their existing behavior.

Source inspection now recognizes auth-specific path/name words without rejecting
ordinary authenticated/author helper filenames. The older generic-reader path
and exact-token source reader share the same predicate; protected auth data,
hidden/credential/Vault paths, content checks and pending manual asks stay guarded.

Worker and Coordinator guidance now pairs AAP object IDs with verified readable
names, including actual job/workflow template names and differing run names.
Ad hoc jobs use verified purposes; unavailable names are explicit and secret
values are not requested. This changes reporting only, without expanding access.
See [approval review](usage.md#coordinator-approval-review) and
[AAP references](usage.md#readable-aap-references).

## 1.10.1 — Fill tab space and use browser notifications

Normal desktop tabs share available width before Coordinator, retaining a minimum
width when overflow is necessary. Hover reveals the full title and temporarily
shows that conversation's saved chat-colour tint. Mobile remains one fixed-width
horizontally scrollable row; row membership and status frames stay unchanged.

Task alerts use native browser notifications for opted-in observed events,
including while the page is focused. Remove the additional in-app completion
banners and fallback-panel wording. Keep existing subscriptions, permission
controls, deduplication, reconnect baselines and notification-click navigation.
No background delivery service or closed-browser delivery is added.

## 1.10.0 — Consistent task tables and reachable tabs

Report now, scheduled and Detailed reports use the same task/status/outcome table,
with exact colourful status labels and a release/publication/deployment line.
CCNG checks the format on the existing completed-report path. Invalid replies
remain visible with a specific error and no automatic retry; validation cannot
establish factual truth. Detailed history and native delivery guards are preserved.

Desktop tab titles expand horizontally on hover. Above six conversation tabs,
counting Coordinator, two rows keep the selected worker row nearest the chat
without changing saved order or numbering. Overflow remains reachable beside
Coordinator; two-row mouse dragging and single-row/touch protections are retained.
Mobile explicitly uses one horizontally scrollable row without hover/row switching.
The active worker/Coordinator tab shares its input-title background tint across
all themes; inactive fills and status frame colours are preserved.
Source checks/builds do not establish actual browser hover or physical-phone behavior.

## 1.9.1 — Keep silent task checks silent

Make the internal-check exception explicit in worker guidance and each task-check
reminder: no opening acknowledgement, plan, tool-use introduction or no-change
summary, including before tool calls. Keep useful findings, errors, real questions
and substantive work updates visible. Native history and ordinary chat rendering
remain unchanged; instructions do not guarantee future model compliance.

## 1.9.0 — Restore input after native conversation unload

Reload an existing Codex conversation before sending input when the native
runtime has unloaded it, including a previously attached tab. Observe native
close events and retain read-only background polling. Reuse the same history;
do not create a replacement conversation, automatically resend input or change
worker permissions. The Coordinator uses its existing restricted activation.

Recheck conversation identity, connection and direct-input permission after
activation. Pending approvals, explicit stops, handoffs and active steering keep
their existing gates. Focused regressions and production-build results are
recorded in the decision history; live installation and actual browser input
acceptance remain distinct.

## 1.8.0 — Keep blocked tasks visible

Keep a blocked child marked Blocked when its only dependency is its parent-task
relationship. Preserve genuine unfinished prerequisites as Queued. Show genuine
Needs input first, then Blocked work, before the remaining task order so blockers
stay visible in the compact task list. All task rows remain scrollable.

This does not infer user questions from task text, answer approvals or change
Beads task records, ownership or native controls. All43 affected task, attention
and notification checks and the production build pass; independent review has
no blocking findings. Installed verification is separate from actual browser
acceptance.

## 1.7.0 — Reproduce Beads settings and database startup

The existing deployment can apply an explicit nine-key Beads maintenance map
through native `bd config`, preserving unrelated settings and task data. Empty
configuration preserves existing values. Copy disabled compaction flags as
strings without running task-history shortening. The protected runtime loader
accepts only the documented map and a strict boolean boot-start option.

An explicit boot-start selection installs the already approved owner-level
native Dolt start/stop unit, retaining the existing database and tracker. It
refuses conflicting units and keeps Codex bootstrap separate from active work.
All14 affected native-Ansible fixture tests, strict production lint across17
Ansible files, syntax and the production build pass; independent source review
has no blocking findings. A wider deployment run passed28 of29 cases, with the
remaining local frontend test denied its socket by native permissions. These
checks do not prove a reboot or a normal AAP deployment rerun.

## 1.6.0 — Preserve open agents and recover after startup

Persist the open-agent list before acknowledging create, attach, fork and close
actions. Sync the file and atomic rename, retain unavailable saved IDs, drain
shutdown writes and show metadata-save failures separately from native success.
Reuse the existing refresh to reconnect when Codex starts after the website,
without launching its daemon or replaying worker inputs. Preserve request, pause,
ownership and saved-report controls. Keep Codex reconnect available independently
of Claude, and distinguish history errors, empty results and already-open tabs.

All41 focused persistence, authenticated-handler, component and request-recovery
checks pass, along with the production build and independent source review.
Broader local protocol tests remain limited by native socket/subprocess
permissions. Publication, installed checks and actual browser acceptance are
recorded separately when performed; source fixtures do not establish restored
tabs in a real browser.

## 1.5.0 — Reproduce conditional On hold configuration

The existing Ansible workspace preparation enables native Beads `on_hold` on
fresh setup and repeat deployments. Preserve other custom states and tracker
data; skip writes when it is already configured. Unknown native response formats
and command failures stop safely. Deferred remains optional future work, distinct
from a recorded conditional wait. No task state is changed by deployment.

Three targeted tests passed across16 disposable Ansible fixture plays, including
fresh/repeat and custom-state/failure preservation. This change is included in
1.6.0; normal target-playbook acceptance remains pending. The broader
1.4.2 full-suite execution limitations still apply. The CaC audit found nine
compaction settings absent. Existing immutable CaC source selections need an
explicit update before they can consume the newer playbook.

## 1.4.3 — Keep generated hook pages contiguous

Generated hook text can contain long lines. Pack complete lines within the
existing page limits and return the exact next line, so the character cap cannot
silently skip context. Explicitly mark an overlong single-line excerpt.
This changes paging only; the own-conversation, ownership, link and credential
checks remain unchanged. Five focused cases and the production build pass.
All eight pages of the real338-line hook file reconstruct its complete contents
with a matching digest; no contents were printed. Source is published and
running1.4.3 is verified:108 matching installed files, trusted HTTPS/assets,
authentication gates/both listeners and149 installed synthetic cases pass.
The1.4.2 broader-suite execution limitations and actual new-callback/physical-
browser acceptance gaps still apply.

## 1.4.2 — Retain request explanations and recover missing context

- Give an exact delivered file approval one guarded live snapshot when bounded
  history cannot supply its proposal. Keep working-directory and request identity
  checks; failed eligible attempts cannot create an automatic retry loop.
- Allow the Coordinator's existing source reader to read its own generated Beads
  hook-output pages within the explicitly approved path, ownership, link and
  credential checks. No shell or general filesystem access is added.
- Restore a dated needs-user explanation only when a current native request has
  the same fingerprint and stable identity. Keep it waiting for the human until
  explicit re-review; ambiguous older records stay historical. Never restore
  approvals or submit native answers from saved history.

Validation: 185 affected checks, production build and independent review pass.
The full-suite attempt is not clean: broader socket/subprocess/home-directory
checks are restricted in this execution environment, with some child CLI output
unavailable. No permissions were changed to run them. Source is published and
running1.4.2 is verified:108 installed file matches, trusted HTTPS/assets,
authentication gates/both listeners and148 installed synthetic cases pass.
The actual Coordinator also read16000 characters of its own previously refused
hook text through the existing tool. New callback and physical-browser acceptance
remain separate;1.4.3 corrects the observed page cursor limitation.

## 1.4.1 — Recover pending file changes from the live snapshot

Pending native patch approvals can outlive their transient file-change events,
while durable paginated history omits those events. Request one full recent turn
in the already-approved reconnect response and match only its exact current
pending file item. Preserve newer live bodies and existing request identity,
permission, ownership and replay guards. No extra reconnect, answer or command
retry is added for delivered cards. Missing/nonmatching data remains unavailable.

Validation:894 tests,893 passed, one alternate-group skip, zero failures;
production build and independent review pass. Source is published and running
1.4.1 is verified with108 matching source files, trusted HTTPS/assets,
authentication gates/both listeners and114 installed synthetic cases. Actual
native readback also confirms all four proposed files and complete diffs without
truncation, followed by once-only approval under existing scope. The older AAP
call completed normally without resubmission and its actual job succeeded. Both
recovery observations are answered; physical-browser acceptance remains separate.

## 1.4.0 — Reconnect eligible native waits automatically

- Use the existing five-second poll to attempt native reattachment for open local
  Codex workers and verified known children with fresh active state with `waitingOnApproval`
  state and no delivered current request. Existing actionable cards keep their
  native controls without reconnect. Coalesce once per context, connection and
  wait episode; do not add an
  automatic retry loop when details remain missing or an attempt fails.
- Reattach through `thread/resume` with `threadId` and `excludeTurns: true`,
  retaining native request IDs and manual controls. Send no approval answer,
  permission/configuration override or project-command retry.
- Exclude intentional idle/unloaded, foreign, paused/stopped, Coordinator and
  handoff contexts. An active context becoming idle during the attach race may
  continue natively, as explicitly approved. Claude remains deferred.
- Receive native human-only command checkpoints with explicit client support.
  Keep their decisions manual, reject Coordinator queue/review and reusable
  permissions, and preserve original request identity and native confirmation.
  Internal attestation/client-owned verification exchanges are not user cards.
  Leave replayed foreign worker tool callbacks with their original executor,
  without answering or rejecting them.
- Keep the current missing-details cards and diagnostics. Failed attempts retain
  existing manual controls; no new timer or persistent store is introduced.

**Validation/publication:** 890 tests, 889 passed, one alternate-group skip and
zero failures; production build and independent review pass. Source is published
and production1.4.0 is verified:108 matching source files, trusted HTTPS/assets,
authentication gates/both listeners and110 installed synthetic backend cases.
Fresh live readback received four original RHEL approvals automatically, and the
original AAP connection-check callback returned and completed its process.
One separate older MCP wait remains unresolved; do not equate this release with
recovery of every cold callback. Phone/browser acceptance remains separate.

## 1.3.1 — Distinguish native waits from user decisions

- Use the same request evidence in the input header and agent tabs. A native
  attention flag without a delivered request is a neutral missing-details
  diagnostic, rather than Needs your answer.
- Keep actual manual questions, Coordinator referrals and answer errors visible;
  distinguish eligible Coordinator review and native confirmation waits.
- Preserve all native states, request controls and send/interrupt gates. This
  presentation correction does not recover, dismiss or resume a native wait.

The final combined suite ran 867 tests:866 passed, one unavailable alternate-
group case skipped, zero failed. Production build and independent review pass.
Implementation62ad95f and payloade31c1f1 are SSH-published/readback verified.
AAP3478 updated the existing installation in24.637s, preserving nine protected
files and unrelated Bash bytes/ownership/mode. Independent3481 passed in6.882s:
107 installed source files match, actual running1.3.1 trusted HTTPS/assets,
authentication gates and both listeners pass;75 installed synthetic backend
regressions pass. The served build includes the corrected missing-details
composer guidance. Physical browser acceptance remains unverified. The existing
cold-callback recovery decision remains unanswered; the native wait still reports
waitingOnApproval and has no current actionable approval envelope.

## 1.3.0 — Clearer requests, task input and mobile scrolling

This release includes the previously unpublished 1.2.0 changes; 1.2.0 was not
separately released or deployed.

- Keep Allow once and offered Allow always actions together in a compact
  wrapping row. Place long exact saved-rule scopes below the actions, using
  matching numbered labels and accessible descriptions for multiple saved rules.
- Reserve amber agent tabs for requests needing the user. Eligible delivered
  command/file approvals awaiting an available Coordinator stay neutral, with
  a truthful review-wait label. Native confirmation is a separate wait; actual
  backend statuses, request controls and execution gates remain unchanged.
- Load matching native file-change proposals automatically through bounded
  read-only history, preserving exact request/thread/turn/item identity and
  truthful loading, unavailable and truncation notices.
- Retain early received child requests privately until native parent-lineage
  proof permits their existing cards to appear under the parent. Discovery does
  not resume children or recover never-delivered/lost cold callbacks.
- Describe missing request details as a waiting/loading/error status. Received
  requests appear automatically; children have no ineffective Load/Retry button.
  Optional parent reconnect stays an explicit advanced action.
- Scroll mobile chat history with the phone page rather than a separate
  approximately 30-line inner viewport. Keep the six-line input's internal
  scrolling and desktop layout unchanged.
- Keep ordinary blocked work distinct from Needs input. Only explicit input
  states or Question tasks request an answer; missing Needed/Why information is
  reported as missing rather than invented.

The final combined suite ran 864 tests: 863 passed, one unavailable alternate-
group case skipped, zero failed. The production build and independent source
review pass. Implementation eb319b6 and payload 862169b are SSH-published and
remote-readback verified. AAP 3476 updated production in 25.245 seconds and
preserved nine protected files plus unrelated Bash content/permissions.
Independent 3477 passed in 6.741 seconds: 107 installed source files match;
running 1.3.0, trusted HTTPS, served assets, authentication gates and both
listeners pass. Twenty-one prior question/handoff and 54 request/task backend
regressions pass against installed modules with synthetic native transport.
The user confirms version 1.3.0 is visible. Physical phone behavior and recovery
of already-lost native callbacks remain unverified. A subsequent user screenshot
still shows unknown native waits and exposes a separate footer classification
error: aggregate native attention is incorrectly called Needs your answer even
without a delivered question. That presentation correction shipped in1.3.1;
the underlying missing native request remains unresolved.

## 1.1.0 — Answer eligible assistant questions

- Answer eligible current Codex assistant-question cards with an option or free
  text, using each original native message ID and question index. Require a live
  completed message in the same known active turn; do not restart restored
  turns. Keep other question editors available after a partial reply.
- Use the proven ordinary native input envelope within that active turn.
  Accepted input is not proof of an answer being applied or a task completing. Retired editors do not
  imply resolution; uncertain/truncated/unbound cases stay read-only.
- Preserve browser-memory answer drafts/latches across worker switches, without
  persistence across refresh. Keep ordinary-send gates and explicit errors;
  automatic controls preserve live decisions using the existing queues.
- Preserve branch/draft information when a handoff encounters an unanswered or
  uncertain question. Explicit retry rechecks the retained branch. Show readable
  question/answer text while preserving original native history and Copy this.
- Permit approval-authority quotes only from actual human answer text in native
  reply envelopes, excluding model-written question text and protocol metadata.
  Add no automatic follow-up, retry, question store or permission changes.

The native0.167.0 source contract is verified. The final combined suite ran827
cases:826 passed, one unavailable alternate-group case skipped, none failed.
The production build is clean, with no browser Node-module warning; independent
source/UI/provenance review is clear.

Implementation115cf9a and payloadbbd8a2b are SSH-published/readback verified.
AAP3460 updated/restarted production in20.634s, preserving nine protected files
and unrelated Bash bytes/uid/gid/mode. Independent3461 passed in5.439s:106 source
files matched, running1.1.0 trusted HTTPS/assets/both listeners/auth gates,
21 installed backend reply/authority/queue/handoff regressions passed, and the
served answer/retained-draft/detailed-report controls matched without a browser
Node-module shim. These installed tests use isolated synthetic native transport;
actual browser/provider reply delivery and full phone workflows remain unverified.

## 1.0.0 — Optional detailed task reports

- Add a Detailed report choice beside Report now. Keep the normal overview first,
  then show every linked in-progress task with up to ten evidenced recent actions,
  timestamps and outcomes. State missing history, unknown times or fewer entries.
- Permit bounded existing Beads/native-history reads only for explicit detailed
  requests. Ordinary reports, intervals and permission boundaries are unchanged.
- Upgrade unsent reports without downgrading them. An already dispatched normal
  request stays normal, with visible feedback and no automatic duplicate request.

The combined suite ran792 tests:791 passed, one alternate-group case skipped,
and none failed. The production build and independent source review pass,
including authenticated HTTP, queue/ACK/native-gate and desktop/mobile component
regressions. Implementation e7432ed and payload59036d9 are SSH-published/readback verified.
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
 This option does not guarantee complete action history or change the
existing 32,000-character report recognition bound. This release supports the
current single-engineer, Codex-focused scope; full live approval recovery,
provider question replies and phone acceptance remain separate verification.

## 0.48.0 — Per-user Codex and compact worker overview

- Offer missing Codex under `~/.local` or a writable `--codex-prefix`, while
  reusing a compatible existing CLI. A managed Bash PATH block makes the selected
  CLI and app-local tools available without replacing unrelated profile content.
  Current shells still need the documented `source` command; no daemon startup
  or native authentication is configured automatically.
- Keep Subagents below Tasks in a default-collapsed section. Pending child
  approval/question cards remain visible independently. Worker overviews show
  `Project:` followed by the chat title; the Coordinator heading is unchanged.
- Check unfinished work silently every ten minutes. Task-report interval choices
  and their separate schedule are unchanged.

Validation: the final combined suite ran 784 tests: 783 passed, one group-ownership
case skipped because no alternate supplementary group was available, and none
failed. The production build passed. The Bash-profile group-preservation fix is
included and final source review is clear. Implementation 6877e20 and payload 82e7861
are SSH-published/readback verified. AAP 3454 stopped before installer execution;
corrected 3455 updated/restarted production, preserving nine protected files and
unrelated Bash bytes/group/mode. Independent 3456 matched 105 installed files,
trusted HTTPS/assets/both listeners/auth gates and actual managed Bash updates
plus Codex 0.167.0 lookup. Deployed-source checks passed 17 cases with one
alternate-group skip; isolated installed checks verified ten-minute task checks
and the separate fifteen-minute report deadline. The user confirms the collapsed
Subagents section is visible. Fresh real Codex installation, provider sign-in,
full phone/native interaction and daemon availability after reboot remain unverified.

## 0.47.0 — Show delegated approvals under their parent

- Delivered native Codex child requests and waiting states appear under their
  parent chat, using the existing request cards and Coordinator review path.
  Child names identify their source; parent input stays available during a
  child-only wait. No extra tabs, worker slots or schedules are created.
- Verify native parentage before offering actions. Preserve original child
  thread, typed request ID, review token, turn/item bindings and native resolution
  confirmation. Unrelated collaboration targets and stale ownership cannot
  supply approval authority. Existing manual-only permissions remain manual.
- Child request refresh is read-only and preserves newer live updates. Requests
  never delivered to this client, or predating all native child discovery, are
  not fabricated or replayed. Actual native/browser delivery remains unverified.
- Explain first-time RHEL prerequisites with and without sudo before cloning.
  Offer normal browser Codex sign-in, optional policy-permitted device-code login
  and deferral. Explain later Beads workspace setup using the existing installer.

Validation: all761 application tests and the production build pass. Independent
source review found no remaining blocking issue. Payload8a26850 is SSH-published
and independently read back. AAP3452 updated/restarted production with nine
protected files unchanged; independent3453 matched 105 installed files, actual
0.47.0 trusted HTTPS/assets/both listeners/login gates and isolated installed
child routing/ACK identity. Real provider delivery, browser interaction and an
organization-managed sign-in were not exercised for this release.

## 0.46.1 — Guide safe recovery of stalled subagent waits

The existing fifteen-minute ping tells the main agent to check every child's
actual wait and external-job state, preserve conversation/findings/request
context, interrupt only a demonstrably safe stalled child wait, verify a pwd-only
response under unchanged permissions, then resume specific authorized work.
Nonreply blockers remain explicit. No real external job cancellation, approval
bypass, blind retries, blanket periodic probes or additional timer is introduced.
The usage guide lists generated control messages and distinguishes visible
handoffs and runtime context. Six focused regression files and the production
build pass; independent source review found no blocking issue. The current
Coordinator received the requested guidance through the native message tool.
Application source56b3499 was SSH-published and independently read back. AAP3446
updated/restarted production with nine protected files unchanged; independent3447
verified105 installed files, running0.46.1, trusted HTTPS, served assets, both
listeners and the installed recovery prompt. No live probe or approval was
started for verification. This guidance does not prove future compliance, recover
every wait or fix the separate never-opened subagent approval-routing defect.

## 0.46.0 — Check progress of outstanding delegated work

- Silent task checks now explicitly inspect outstanding subagents, tool calls and
  external jobs, including tasks already marked in progress. Workers must check
  available IDs, timing, last returned results and last evidenced progress.
- Investigate unexplained waits promptly, distinguish approval/input waits from
  evidenced running, completion, failure or unknown state, and collect results or
  explain the exact blocker and next action. Elapsed time alone proves no state.
- Preserve the existing fifteen-minute cadence, silent delivery, safe checkpoints,
  native permissions and stops. No blind retry/cancellation, extra watchdog,
  dispatcher or timer is introduced.

**Validation:** six focused test files covering coordinator/task-ping delivery,
silence, cadence and native approval guards pass; the production build passes.
The broader run passes71 of76 test files; five files encounter restricted socket
listening or home-directory writes. Publication/deployment remain pending after
SSH refuses the system configuration ownership. This is stronger worker guidance,
not proof that every future model response complies or a recovery mechanism for
a worker unable to reach a safe checkpoint.

## 0.45.1 — Separate independent questions and show mobile screenshots

- Worker guidance asks for one independent decision or action per structured
  question item and per ordinary Needs input task. Independent answers remain
  separate; related options can stay together. Existing native approvals retain
  their exact content and controls.
- The README includes two user-approved mobile screenshots showing the overview
  and chat input. Hidden EXIF data was removed with a lossless metadata-only
  script; compressed image data and the other JPEG segments are unchanged.
- Captions mark their earlier UI/version/task state as historical. No other
  conversation's questions or task records are automatically rewritten.

**Validation:** all 718 application tests and the production build pass, including
the existing worker-instruction checks. JPEG inspection confirms EXIF is absent
and the compressed image data/non-EXIF segments are preserved. README image
references resolve. Instruction guidance does not guarantee every future agent
question complies.
Source is SSH-published and production update/restart succeeded (AAP3438),
preserving nine protected files. Independent3439 verified105 source files,
actual0.45.1 trusted backend HTTPS/assets/both listeners/login gates, installed
question guidance and the EXIF-free mobile README gallery. No actual user history
or login was modified for testing; browser interactions remain unverified.

## 0.45.0 — Preserve traceable conversations

- Edit & rewind is withdrawn at the user's request. Original messages and
  decisions stay visible; explain corrections and changed decisions in follow-up
  messages.
- Remove history-edit controls and CCNG native history-mutation endpoints.
- Keep Copy this, ordinary follow-up input and separate conversation branching.
- Individual-message and Claude rewind are withdrawn rather than future work.
- Existing native history, task states, saved decision summaries and logins are
  preserved; this release does not perform a rewind.

**Validation:** all718 application tests and the production build pass. Regression
checks cover authenticated rejection of removed routes without native calls,
unchanged messages, follow-up/copy/branch behavior and passive external-history
refresh with stale-read/error recovery guards. Independent review found no
remaining issue. Source is SSH-published; AAP3436 update/restart preserved nine
protected files including session invalidation state. AAP3437 verified103 exact
source files, actual0.45.0 trusted HTTPS health/assets/both listeners/login gates.
Four real authenticated HTTP requests against the installed app in an isolated
temporary fixture confirmed404, unchanged messages and zero native calls. No
real native history/login was changed for testing; browser rendering and the
previous public network-path failure were not re-tested.

## 0.44.0 — Rewind inputs and preserve logins and decision history

The rewind feature described below was subsequently withdrawn in0.45.0. Other
0.44.0 features remain supported; this entry preserves the release history.

- Edit & rewind previews every affected turn/input before explicit confirmation.
- Native acknowledgement refreshes retained history and places the original text
  in the normal editable draft; no automatic send or file/task/permission rollback.
- Busy requests, stale previews, incomplete history and prepared handoffs block
  destructive changes; existing drafts and uncertain outcomes are preserved.
- Text-only initially; image inputs, individual-message and Claude variants remain
  unavailable. Avoid simultaneous edits from another native client.

- Coordinator decision summaries now append to a private JSONL file beside
  workspace metadata and reload recent entries at startup without approval replay.
- Readable request/decision bullets and saved status preserve historical names;
  storage failures remain visible without changing native acknowledgement outcomes.
- Retain all disk entries until explicit deletion; no raw approval bodies or
  automatic import of prior native history. Graceful shutdown flushes queued writes.

- Report recognition accepts topic-labelled green/yellow/Next summaries and an
  omitted red blocker bullet without changing the recommended report format.
- Requests bind to the actual native delivery turn so work ending during
  instruction loading cannot prematurely produce a missing-report warning.
  Existing acknowledgement, freshness, quote/code and request guards remain.

- Private hashed application sessions survive normal updates/restarts with their
  original 12-hour expiry. Logout, password changes and exact `--clear-logins`
  revoke sessions without changing nginx or stopping accepted agent work.
- Application authentication failures use explicit JSON403 codes instead of
  interfering with HTTP Basic login. Storage503 failures remain visible and
  fail closed; expiry preserves drafts and the selected conversation.
- The first upgrade from RAM-only sessions requires one final application login.
- File approvals retain matching native paths/change kinds/diffs for the card and
  coordinator, with explicit missing/truncated content and read-only detail loading.
  Current request identity, native answers and changed-content guards remain.
- Message-only native question titles/options remain visible, including empty-text
  messages. Their answer route remains the native client; no fake request IDs,
  approval controls or unverified reply encoding is added.
- Three user-approved original development screenshots illustrate the README;
  captions identify historical UI versions and task states.

**Validation:** all 738 application tests and the production build pass, including
real HTTP/TLS authentication checks, restart/logout/clear/password-rotation
fixtures, stale login responses, file-content matching/review/history races,
message-only question display, report delivery and native whole-turn guards.
Private decision append/reload/failure and graceful shutdown checks also pass.
Independent source reviews found no remaining blockers. Ansible syntax and strict
production lint pass across 26 files; 32 of 33 native Ansible fixtures pass. The
remaining protected-frontend TLS fixture cannot create its local test socket
under the current permissions; no assertion was relaxed. Source is SSH-published
and production update/restart succeeded (AAP3433), preserving eight protected
files. AAP3434 verified 105 installed source files, actual HTTPS health0.44.0,
served assets, both listeners and application-auth403 behavior. Installed session
restart/clear-logins and decision reload passed in isolated temporary profiles.
That job failed at its final public-proxy probe; read-only3435 confirmed TCP
connection refusal from the application host, so public access is not verified
by these checks. No proxy or connection settings were changed.
No actual native conversation was rewound;
browser login retention and the original pending RHEL body remain unverified.
Optional installed/native browser exercises remain deferred.

## 0.43.1 — Require the protected frontend before Ansible deployment

- Every application deployment verifies the selected HTTPS public origin returns
  HTTP 401 with a Basic challenge before managed target writes. The probe uses
  normal certificate verification and sends no credentials or netrc login.
- Protected per-instance settings can explicitly select the existing
  `htpasswd-proxy` first-password mode. The application configuration receives
  that mode and exact origin; fresh setup leaves password creation to the first
  protected browser opening without a supplied password or setup code.
- Browser-first setup remains disabled by default. Existing authentication is
  validated and preserved. Backend/UI authentication, installer behavior and
  native daemon lifecycle are unchanged.

**Validation:** all 20 existing/extended native Ansible deployment fixtures pass,
including trusted/untrusted TLS, missing challenge/refusal before writes,
credential-free probing, fresh browser-first configuration, retained passwords
and native workspace/tool setup. Strict production lint passes across 17
encountered Ansible files; syntax, compilation and diff checks pass. The full
application suite/build was not rerun for this Ansible-only correction. Actual
frontend provisioning and fresh browser enrollment remain deployment acceptance.

## 0.43.0 — Honor Never for startup reports

- Never skips automatic startup reports as well as recurring reports.
- The dashboard uses stored summaries/tasks for those workers without requesting
  a model report; manual Report now remains available.
- Selecting Never cancels unsent automatic startup reports while preserving
  manual requests, uncertain/in-flight delivery and existing native safeguards.
- Enabled startup/cadence coalescing and separate task checks are preserved.

**Validation:** all 618 application tests and the production build pass. Checks
cover Never startup with stored input needs, manual Report now after Never,
cancelled automatic versus retained manual/uncertain/in-flight work, enabled
startup coalescing and unchanged task checks. Published/deployed payload
`cdc969fe02b15f8adedf154d0d476d628a3f8712` was independently checked:
96 source files, two served assets, trusted HTTPS0.43.0, login gates, both
listeners and eight unchanged protected files. Startup-skip code/instructions
match; no extra model or live permission exercise was started.
Optional installed/native browser exercises are deferred by the user.

## 0.42.0 — Protected first-browser password setup and native approval choices

- Fresh installations can create their first app password through an explicitly
  enabled htpasswd-protected HTTPS proxy, without a default password or setup code.
- Exact HTTPS origin/Host checks, authenticated app APIs, rate limiting, private
  hash storage and atomic first-creation preserve the existing login safeguards.
- Existing passwords are preserved. Generic installation leaves browser setup
  disabled and prints local CLI/protected-proxy instructions instead of prompting.
- File-change requests expose the native session-only approval choice; exact
  filesystem/network permission requests also offer native turn or session scope.
  Command and MCP permissions retain their supported/offered choices, including
  saved rules where available. Session grants are not permanent permissions.

- Report feedback says the request was accepted and is waiting for a response,
  rather than claiming generation has begun. A turn ending without a recognized
  report shows an error instead of a false ready announcement; no retry is added.

**Validation:** all 614 application tests and the production TypeScript/Vite build
pass. Checks include real trusted HTTPS enrollment/session/preservation, concurrent
setup, invalid authentication, request scopes/confirmation/coordinator limits,
installer configuration preservation and report response/acknowledgement ordering.
Independent source review found no concrete blockers. The final normal test run
passes; a redirected run hit known subprocess/socket environment restrictions.
Payload `1aea82fc4a65852bd175fa34495ecd300118045c` was SSH-published and
remote-verified, installed/restarted through AAP and independently checked:
96 matching source files, two assets, trusted HTTPS0.42.0, required login,
both listeners and eight unchanged protected files. The merged Ansible bootstrap
also passes all 17 disposable deployment fixtures.
Actual browser/proxy first-enrollment acceptance remains separate from tests and
from production preservation checks on an installation with an existing password.
## 0.41.1 — Repair fresh Ansible workspace and tool preparation

- Prepare the separate default agent workspace and its first native Beads
  tracker without requiring a demonstration-repository checkout.
- Provision only missing approved target tools using the maintained installer
  versions; include compiler prerequisites and remove temporary downloads.
- Preserve existing trackers, routing, profiles, authentication and explicitly
  configured installation paths. Fetch the current default source on deployment.

All 585 application tests, the production build, focused native-Ansible
fixtures, syntax and strict lint pass. Real target
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
