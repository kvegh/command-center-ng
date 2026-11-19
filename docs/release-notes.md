# Release notes

The [README](../README.md) is for installation and first use. These notes keep
version history separate from current [usage](usage.md).

For design rationale, alternatives and implementation references, see the
[decision history](../design_decisions_history.md). Earlier detailed release
text remains available in the [archived README](https://github.com/kvegh/command-center-ng/blob/12ce91bd35a2a4f0b7446af63d1977605c5a1c21/README.md).

## 1.45.0 — Retain Claude permission preferences when branching

Both reply-level and whole-chat Claude branches inherit the parent's explicitly
requested Auto/Manual preference. Without one, they use the new-chat Auto default.
Explicit Manual stays Manual; observed native fallback does not replace user
intent. Existing private workspace persistence is reused without transferring
native approvals or pending callbacks.

## 1.44.0 — Select a shared instruction file

Operators can set `shared_instructions_file` in the existing runtime config to
load shared environment rules independently of chat working directories.
An explicitly selected file never falls back to discovery when unavailable.
Ansible exposes the same optional setting through protected deployment variables.
Existing Claude processes retain their startup instructions until restarted;
native permissions remain unchanged.

## 1.43.0 — Discuss proposals before approval cards

Worker guidance now keeps exploratory clarification in chat and reserves cards
for approval of a concrete proposal after discussion. Actual unanswered chat
questions remain tracked in Tasks. Native approval controls retain their scope.

## 1.42.1 — Preserve live Claude state during an older refresh

A refresh that started before Claude resumed no longer restores an obsolete
error, replaces newer messages or marks an active session idle. New chats wait
for native initialization before disk observation begins.

## 1.42.0 — Clear stale Claude refresh errors

New Claude chats no longer show a missing-session error while their native
history is first being created. When the same Claude session reports activity,
clear an earlier refresh error without removing pending questions or approvals.
Actual unavailable-session and run failures remain visible.

## 1.41.0 — Show or hide subagent messages

Add **Show subagent messages** beside **Create handover** in Project. Messages
are shown by default, with each chat's choice remembered in the current browser.
The switch changes the display without removing history or stopping agents;
question exchanges and approval controls stay visible.

## 1.40.0 — Keep unanswered cards and restore attached conversation tabs

Unrelated follow-up messages leave unanswered Codex question cards usable while
their original turn remains active. Answering one question preserves the others.
Ended turns, removed or changed native metadata, unsafe bindings and uncertain
delivery retain their existing reply protections.

Keep the conversation tabs attached to the chat's top edge when the taller
Coordinator tab increases the header height. Coordinator retains its size and
has its own divider, spacing and closed outline, visually separate from the chat.
Mobile keeps one horizontally scrolling conversation-tab row.

## 1.39.0 — Identify forwarded Claude subagent messages

Display **Message from subagent ‹name›:** using native source metadata, with a
launch-ID fallback when no name is available. Keep original message/copy text,
separate interleaved streams and parent reply/model state, and retain provenance
from existing native history when available. No prompt instruction, new store,
SDK upgrade, permission change or custom Claude daemon is added. Includes the
1.38.1 layout correction.

## 1.38.1 — Move activity away from the input

Keep live status below the selected top tab as a compact overlay over older
conversation text. Its existing child-local clock and evidence rules are unchanged.
Move the version badge between the branding and Sign out, including narrow
layouts, and remove the redundant local-workspace footer. Tab order and native
controls remain unchanged.

## 1.38.0 — Make long Claude tool waits visible

The composer now shows Claude tool requests, descriptions and confirmed native
progress, with separate request age, last progress and reported run time. Missing
or disconnected evidence stays unknown/last known. Exact native input echoes
separate CCNG queuing from Claude receipt, without claiming model processing.
Pending requests retain priority; no status-only model input, new timer/store,
permission change or automatic interruption is added. The 1.37.0 question
history corrections are included.

## 1.37.0 — Keep answered questions visible

Completed Claude AskUserQuestion exchanges remain visible in the main conversation
instead of disappearing into collapsed actions. The original question and native
response are read-only and reconstruct from the existing native transcript,
without relabeling tool output as a human message. Pending cards and exact native
answer controls retain their existing behavior.

An explicit native removal now retires a previously observed assistant-message
question's controls while retaining its original displayed details. Submission
also keeps the answer visible beside the question. Native reply messages keep
their existing quoted-question/answer display and raw copy through history reads.
No answer is replayed, no callback is reconstructed and no transcript store is
added. Browser-only text cannot survive refresh until native history records it.

## 1.36.0 — Carry handover tasks and stop stale approval-wait summaries

Before a handover receiver imports its file, CCNG adds its association to the same
source Beads tasks and verifies every link. It retains source links, closed/held/
deferred states, ownership, content and dependencies. Task-bearing handovers must
stay in the same canonical project; complete empty-source reads preserve ordinary
cross-project handovers. Failure retains known receiver/artifact/partial links and
does not send an import or create another chat automatically.

Native concern feedback stays on the original approval card. Review-related
summaries bind to their exact requests, including older same-turn tool calls;
resolved or changed requests cancel only unsent bound feedback, with a final
pre-write guard. This prevents the confirmed queue path from delivering “wait
for approval” after the approval is finished. Ordinary summaries, uncertain sends,
pauses/stops and manual native controls are preserved. No content filter, new
timer or persistent approval store is introduced. The 1.35.0 changes are
included in this release.

## 1.35.0 — Retain Claude modes and show current concern reviews

New Claude chats and handover receivers retain their requested Auto mode through
managed-process resumes and app restarts while retained in the workspace. Explicit
acknowledged Auto/Manual choices are kept in the same private metadata; native
fallback observations do not overwrite that intent. Existing chats without a
preference retain their operator/default behavior. No pending approval is answered
by restoration or by changing the mode.

The Coordinator tab now includes supported current Claude concern reviews in
Evaluating, using the backend's exact ask-only capability. Analyst evaluation
remains Codex-only. Concerned remains a nine-second pulse for newly observed
feedback, without replay on refresh or reconnect. Claude approvals remain manual.

## 1.34.1 — Keep rendered history stable during ordinary typing

Ordinary composer draft edits reuse the existing rendered message list, including
its grouping, rather than rebuilding it per keystroke. Message data, branch/control
availability and native question changes still update the list; approvals,
recovery controls and composer updates remain live. This strengthens the 1.34.0
Markdown/timestamp optimization without removing history or adding a framework.

## 1.34.0 — Readable Claude activity and cheaper long-chat typing

Verified Claude task notices render as collapsed activity with readable headings
and retained original details. Native origin metadata, not matching XML tags,
establishes their identity in live and restored messages. History uses one
official SDK read/projection pipeline without another persistent store or raw
transcript rewriting; genuine user markup stays visible as user text.

Unchanged Markdown and absolute timestamp rendering now reuse React's existing
render boundaries during typing and unrelated snapshots. Changed text, status,
questions and other visible data still update. No history is removed and no
new rendering framework is added.

## 1.33.0 — Prepare before automatic handover startup

Create handover defaults to the source provider. It prepares and verifies the
complete private artifact before starting the versioned receiver, whose first
input imports automatically. The separate Import button is removed. Missing or
unsafe files prevent startup; native questions and uncertain outcomes are not
answered, cancelled or retried automatically. Existing version names offer an
explicit open-existing or create-next-unused choice, with a second name check
before startup. Reopening an existing chat sends no import or model request.

New Codex chats request native Auto-review routing with their approval policy
and sandbox retained; new Claude chats start in native Auto mode. Existing chats
keep their settings.

## 1.32.0 — Project overview handover controls

Workers show Create handover and Import handover beneath the Project heading.
Create asks Codex or Claude, starts a new waiting receiver and requests the source
skill to write its exact assigned file. Source-name suffixes advance to v2/v3.
The source remains available. In the receiving chat, Import defaults to that
file and explicitly sends to the same chat; it never creates another chat or
automatically imports. Only IDs and path use existing private workspace metadata.
No extra store, artifact upload, approval transfer or automatic task mutation
is added. Pending native questions and ownership gates remain authoritative;
uncertain allocation/input is not retried and known created IDs remain visible.

User-message rendering also preserves HTML/XML-looking text as safe escaped
text instead of silently dropping HTML blocks. Raw HTML remains unexecuted;
assistant rendering and native history are unchanged.

## 1.31.0 — Claude branching

Claude Branch chat and completed-reply Branch here use the installed official
SDK's native fork operation through the existing authenticated routes. Forking
starts no model turn and preserves the parent's live approvals and activity.
The branch has fresh native message IDs and its own conversation/task context.
Back to parent navigates; automatic Hand back & close remains Codex-only.

The user approved keeping ID-only parent links in the existing private workspace
file. Closed/reopened tabs and backend restoration retain parent navigation.
No new database, transcript store or provider permission mechanism is added.

## 1.30.1 — Show Coordinator concerns on Claude approval cards

The existing review tool can attach an ask rationale to one exact current,
managed Claude tool approval. The original request remains pending for its
manual decision; automated Claude approval and decline remain unavailable.
Claude cards display the bound rationale, including Request/Concern/Next.
Stale callbacks, replaced runs, external sessions and unrelated questions are
rejected. Feedback stays separate from native Auto mode and cannot replay an
old request after restart.

## 1.30.0 — Select native Claude Auto mode per session

Select exact Claude worker IDs through `claude_auto_review_sessions` in the
existing private runtime configuration. Startup applies Auto only to selected
future managed processes. An owner-triggered SIGHUP reload applies changed
selections through the native live SDK control, preserving current work,
pending requests and other chats without starting sessions. A repeated unchanged
selection does not retry an uncertain native action. Optional authenticated
per-chat Auto/Manual controls expose native acknowledgement and observed mode
separately. Native availability/refusals and model fallback remain authoritative;
no bypass-permissions mode or global default is introduced.

## 1.29.2 — Preserve explicit Claude Vertex service settings

Explicit user-service registration retains the existing Vertex provider,
region and project selectors. Ansible deployments can supply the same three
keys through an optional validated environment mapping in protected runtime
settings. No provider is enabled by default, credential variables are not
copied, and startup does not source shell files. Existing user units remain
preserved until deliberately reconfigured; application updates alone do not
rewrite their environment.

## 1.29.1 — Recover stale Coordinator turn state

Use the existing observation poll to verify a Coordinator that still appears
to have an active turn. Fresh inactive native state and its latest terminal
history can clear an obsolete turn binding and wake already pending reviews.
Newer live events, unknown state, genuine questions, pauses and active work keep
their existing gates. History restoration also avoids reviving an older
unfinished turn after a newer terminal turn. Observation does not start a model
turn, answer an approval or change permissions.

## 1.29.0 — Explain current work and input needs in Report now

User-selected reports request three concise lines after the task table and
release evidence: Doing now, Next and Need from you. No input needed is explicit;
missing evidence remains unknown. Detailed reports put their action history
after these lines. Scheduled and Coordinator-requested reports, saved cadence,
native questions and delivery/coalescing safeguards retain their existing behavior.
Already dispatched or uncertain sends are not rewritten or resent.

## 1.28.6 — Keep hovered tab close buttons at the right edge

Let the desktop tab title area fill spare space during hover. Short titles keep
their close button and selected-tab reorder controls at the right edge; long
titles retain their full-width reveal. Mobile hover rules remain unchanged.

## 1.28.5 — Distinguish command and startup working directories in reviews

Clarify shared Coordinator/analyst guidance: an approval's supplied cwd binds
relative command paths even when its chat started elsewhere. Preserve the
existing source, authority and native approval checks.

## 1.28.4 — Recover request details after explicit native overload

Retry a missing-request attachment only when Codex explicitly rejects that
`thread/resume` before dispatch with its exact overload code and message. Use
the existing poll for at most two additional attempts, five seconds apart.
Preserve current request identities, pause/stop/handoff and lineage guards.
Timeouts, disconnects, successful attachments and other errors do not gain
retries. A rejected attachment does not count as a delivered file snapshot.

## 1.28.3 — Keep Report now available when the message queue is full

Reserve one bounded admission for an explicit Report now when four ordinary
Coordinator messages are queued. Retain those messages, existing report
coalescing and priority, and every pause, native-request, failed-send and
in-flight delivery guard. Scheduled and Coordinator-generated requests keep
the ordinary queue limit. No queue clearing or approval answer is introduced.

## 1.28.2 — Read one helper across requests in different directories

Fix the older Coordinator project-file reader rejecting a source read merely
because pending requests use different working directories. Resolve each path
against its own request and allow the read when all identify the same file.
Keep each request's command, directory, token and file-hash checks. Ambiguous
relative paths still refuse with guidance to use an absolute path. No new tool,
approval answer, permission grant or automatic retry is introduced.

## 1.28.1 — Distinguish literal shell text during approval review

Clarify shared Coordinator/analyst guidance after an exact command was incorrectly
flagged for documentation backticks inside protected quoting. Review each actual
shell evaluation layer and retain genuine expansion/syntax concerns. This adds
no execution tool, automatic approval exception or replay of an earlier request.

## 1.28.0 — Refresh the website after updates

Refresh the browser page once a replaced backend is available, including
same-version restarts. Use the existing workspace stream with a per-start
identity; ordinary network/native reconnects do not refresh. Save existing text
drafts and preferences first, and wait for unsent images, answer drafts, open
forms, current actions or a browser-storage problem. No input or approval is
replayed. Tabs opened before this release need one manual refresh to load it.

## 1.27.3 — Advance source paging at its character boundary

Read a line exactly 16,000 characters long as a complete page instead of returning
an empty page with the same next-line position. Preserve the existing page and
file limits, private reading policy, and manual approval decisions. Longer single
lines remain outside the source reader's supported format.

## 1.27.2 — Let Tasks scrolling continue to its sidebar

Remove vertical scroll containment from the Tasks list and its saved-height
section. Short lists and list edges can hand native scrolling to the bounded
desktop sidebar or mobile page, keeping existing heights, resizing and chat
behavior.

## 1.27.1 — Complete policy packaging regressions

Include the new conservative policy template in isolated installer fixtures and
retain explicit generated-hook reader guidance. This corrects full-suite coverage
before the first policy-enabled installation; active policy behavior is unchanged.

## 1.27.0 — Private YAML approval policy

Move deployment approval instructions and source-reading exceptions into a private
YAML file. The product ships a conservative `approval-policy-template.yml` and
preserves active policy on updates. Explicit all-reading mode covers ordinary,
exact-token, analyst and final-hash local text reads without weakening native
permissions or answering pending requests. Invalid selected policy disables
automatic approval with a fixed error. See [policy configuration](approval-policy.md).

## 1.22.0 — Review explicit multi-test container commands

The first genuine engineering concern exposed another literal source-reference
gap: a container command with a numeric user, read-only SELinux-label mount
option and two explicit unittest selectors was not recognized. The reader now
maps only actually named test modules for these supported forms while preserving
its existing source, request, path, hash, symlink and credential protections.

This changes source recognition only. It does not run tests or containers,
relabel host files, grant permissions or answer the original manual approval.
The actual effects of label/user options still require normal scope review.

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

## 1.13.0 — Mobile chat navigation

Mobile chat has a sticky **Jump to top** button at the top of the viewport. At
the page beginning it switches to **Jump to end**, showing the latest history
and composer without opening the keyboard. The control uses the existing page
scroller, follows conversation changes and current content height, and preserves
desktop chat positions. Narrow layouts and landscape coarse-pointer phones use
the same control. History pagination and native request actions are unchanged.

## 1.12.0 — Native request time and approval context

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

## 1.9.1 — Keep silent task checks silent

Make the internal-check exception explicit in worker guidance and each task-check
reminder: no opening acknowledgement, plan, tool-use introduction or no-change
summary, including before tool calls. Keep useful findings, errors, real questions
and substantive work updates visible. Native history and ordinary chat rendering
remain unchanged.

## 1.9.0 — Restore input after native conversation unload

Reload an existing Codex conversation before sending input when the native
runtime has unloaded it, including a previously attached tab. Observe native
close events and retain read-only background polling. Reuse the same history;
do not create a replacement conversation, automatically resend input or change
worker permissions. The Coordinator uses its existing restricted activation.

Recheck conversation identity, connection and direct-input permission after
activation. Pending approvals, explicit stops, handoffs and active steering keep
their existing gates.

## 1.8.0 — Keep blocked tasks visible

Keep a blocked child marked Blocked when its only dependency is its parent-task
relationship. Preserve genuine unfinished prerequisites as Queued. Show genuine
Needs input first, then Blocked work, before the remaining task order so blockers
stay visible in the compact task list. All task rows remain scrollable.

This does not infer user questions from task text, answer approvals or change
Beads task records, ownership or native controls.

## 1.7.0 — Reproduce Beads settings and database startup

The existing deployment can apply an explicit nine-key Beads maintenance map
through native `bd config`, preserving unrelated settings and task data. Empty
configuration preserves existing values. Copy disabled compaction flags as
strings without running task-history shortening. The protected runtime loader
accepts only the documented map and a strict boolean boot-start option.

An explicit boot-start selection installs the already approved owner-level
native Dolt start/stop unit, retaining the existing database and tracker. It
refuses conflicting units and keeps Codex bootstrap separate from active work.

## 1.6.0 — Preserve open agents and recover after startup

Persist the open-agent list before acknowledging create, attach, fork and close
actions. Sync the file and atomic rename, retain unavailable saved IDs, drain
shutdown writes and show metadata-save failures separately from native success.
Reuse the existing refresh to reconnect when Codex starts after the website,
without launching its daemon or replaying worker inputs. Preserve request, pause,
ownership and saved-report controls. Keep Codex reconnect available independently
of Claude, and distinguish history errors, empty results and already-open tabs.

## 1.5.0 — Reproduce conditional On hold configuration

The existing Ansible workspace preparation enables native Beads `on_hold` on
fresh setup and repeat deployments. Preserve other custom states and tracker
data; skip writes when it is already configured. Unknown native response formats
and command failures stop safely. Deferred remains optional future work, distinct
from a recorded conditional wait. No task state is changed by deployment.

## 1.4.3 — Keep generated hook pages contiguous

Generated hook text can contain long lines. Pack complete lines within the
existing page limits and return the exact next line, so the character cap cannot
silently skip context. Explicitly mark an overlong single-line excerpt.
This changes paging only; the own-conversation, ownership, link and credential
checks remain unchanged.

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

## 1.4.1 — Recover pending file changes from the live snapshot

Pending native patch approvals can outlive their transient file-change events,
while durable paginated history omits those events. Request one full recent turn
in the already-approved reconnect response and match only its exact current
pending file item. Preserve newer live bodies and existing request identity,
permission, ownership and replay guards. No extra reconnect, answer or command
retry is added for delivered cards. Missing/nonmatching data remains unavailable.

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

## 1.3.1 — Distinguish native waits from user decisions

- Use the same request evidence in the input header and agent tabs. A native
  attention flag without a delivered request is a neutral missing-details
  diagnostic, rather than Needs your answer.
- Keep actual manual questions, Coordinator referrals and answer errors visible;
  distinguish eligible Coordinator review and native confirmation waits.
- Preserve all native states, request controls and send/interrupt gates. This
  presentation correction does not recover, dismiss or resume a native wait.

## 1.3.0 — Clearer requests, task input and mobile scrolling

This release includes the 1.2.0 changes.

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

## 1.0.0 — Optional detailed task reports

- Add a Detailed report choice beside Report now. Keep the normal overview first,
  then show every linked in-progress task with up to ten evidenced recent actions,
  timestamps and outcomes. State missing history, unknown times or fewer entries.
- Permit bounded existing Beads/native-history reads only for explicit detailed
  requests. Ordinary reports, intervals and permission boundaries are unchanged.
- Upgrade unsent reports without downgrading them. An already dispatched normal
  request stays normal, with visible feedback and no automatic duplicate request.

Detailed reports retain the existing 32,000-character recognition limit and
explicitly state missing action history.

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
  not fabricated or replayed.
- Explain first-time RHEL prerequisites with and without sudo before cloning.
  Offer normal browser Codex sign-in, optional policy-permitted device-code login
  and deferral. Explain later Beads workspace setup using the existing installer.

## 0.46.1 — Guide safe recovery of stalled subagent waits

The existing fifteen-minute ping tells the main agent to check every child's
actual wait and external-job state, preserve conversation/findings/request
context, interrupt only a demonstrably safe stalled child wait, verify a pwd-only
response under unchanged permissions, then resume specific authorized work.
Nonreply blockers remain explicit. No real external job cancellation, approval
bypass, blind retries, blanket periodic probes or additional timer is introduced.
The usage guide lists generated control messages and distinguishes visible
handoffs and runtime context.

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

## 0.45.0 — Preserve traceable conversations

- Edit & rewind is withdrawn at the user's request. Original messages and
  decisions stay visible; explain corrections and changed decisions in follow-up
  messages.
- Remove history-edit controls and CCNG native history-mutation endpoints.
- Keep Copy this, ordinary follow-up input and separate conversation branching.
- Individual-message and Claude rewind are withdrawn rather than future work.
- Existing native history, task states, saved decision summaries and logins are
  preserved; this release does not perform a rewind.

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

## 0.43.0 — Honor Never for startup reports

- Never skips automatic startup reports as well as recurring reports.
- The dashboard uses stored summaries/tasks for those workers without requesting
  a model report; manual Report now remains available.
- Selecting Never cancels unsent automatic startup reports while preserving
  manual requests, uncertain/in-flight delivery and existing native safeguards.
- Enabled startup/cadence coalescing and separate task checks are preserved.

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

## 0.41.1 — Repair fresh Ansible workspace and tool preparation

- Prepare the separate default agent workspace and its first native Beads
  tracker without requiring a demonstration-repository checkout.
- Provision only missing approved target tools using the maintained installer
  versions; include compiler prerequisites and remove temporary downloads.
- Preserve existing trackers, routing, profiles, authentication and explicitly
  configured installation paths. Fetch the current default source on deployment.

## 0.41.0 — Keep overview settings at the bottom

- Desktop overview fills the available browser pane without extending the page.
- Report/model controls stay at the bottom while upper content, tasks and open
  questions scroll as needed; saved section heights remain bounded.
- Short windows retain access to long settings feedback. Mobile continuous-page
  layout, native request behavior and existing resize controls are preserved.

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
and is not included in the summary.

## 0.37.0 — Image picker and pending-request visibility

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

## 0.36.1 — New-agent path validation

Trim surrounding whitespace, preserve spaces within directory names and require
an existing absolute directory before creating a native worker. Missing,
inaccessible, invalid or file paths produce useful validation errors.

## 0.36.0 — Compact mobile overview

Reduced mobile overview spacing, wrapped task totals and omitted empty question
sections only when no attention state exists. Collapsed Worker settings show
the report cadence and Report now, retaining controls and feedback on expansion.
Desktop layout and saved sizes are unchanged.

## 0.35.1 — Consistent password lengths

Aligned password creation, stdin input and login at 4,096 characters, accepting
an optional terminal newline without replacing an existing file on invalid input. This did not implement first-browser password creation or a default
password; existing configured passwords remain preserved.

## 0.35.0 — Continuous mobile page

Wrapped worker tabs, placed the full-width overview above bounded chat history,
and retained a six-line input with internal overflow. Mobile ignores desktop
saved dimensions, omits resize handles and worker coordinator recaps, and avoids
reordering tabs during touch scrolling.

## Earlier milestones, newest first

These are compact historical summaries. See the decision history for rationale
and implementation references.

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

## Superseded behaviour

- Current task/report instructions are in [usage](usage.md). Historical worker
  limits, native-plan task inference and agent-maintained report loops no longer
  describe the application.
- Shared default passwords and forced first-login password changes were withdrawn.
  Current password setup is described in [installation](installation.md).
- Native Goals and Edit & rewind were withdrawn. Use follow-up messages for
  corrections and separate branching when needed.

Development status is maintained in [the handover](../current_status_for_handover.md)
and Beads. Operational target details and secrets do not belong in release notes.
