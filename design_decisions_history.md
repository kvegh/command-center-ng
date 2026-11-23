# Design decisions history

## 2026-11-19 — Discard Claude observations superseded by live work

The refresh repair also needs to handle reads already pending when a managed
run begins. Collect metadata, history and native-status reads before applying
changes. Discard either their results or errors if a managed run started or
newer native messages replaced the observed message list. This prevents an older
read from reinstating a missing-session banner or replacing live state.
Skip disk observation of newly allocated sessions until native initialization;
no retry timer, cancellation, new store or session takeover is introduced.

Implementation: `992b97c8635560c827ea953d458030c291074d68` (1.42.1).

## 2026-11-19 — Recover Claude refresh errors from native session evidence

Recorded 2026-11-19, 09:25 CET; exact user-message time unknown. The user reported
that a missing-session banner persisted after a handover. A newly allocated
Claude session may not yet have a native transcript. Skip its history read
until session metadata exists, while preserving errors for unavailable saved
sessions. Clear a prior observation error when the matching session reports
native activity, including while its managed process stays active.

Use the existing session identity and event stream. Do not hide all refresh
errors globally, infer recovery from elapsed time, replay input, answer requests
or change runtime ownership. Pending questions and approvals, run failures and
permission state remain independent of observation recovery.

Implementation: `39f61729d9cf23ec60a7f26babffc891c54d289a` (1.42.0).

## 2026-11-19 — Retain unanswered decision cards until answer or dismissal

The user explicitly requires these question cards to stay visible until answered
or explicitly dismissed. This supersedes the earlier active-turn-only retention
requirement. Clarifications, completed turns, chat switches and refreshes must
preserve the unanswered choice. Add an explicit Dismiss question action; clearing
an answer draft is a separate action.

Implementation is pending. Keep the pending decision separate from eligibility
to answer an exact native request. Preserve original messages, manual approval
controls, ownership and uncertain-delivery protections; retaining a card must not
reactivate an obsolete native callback or resend an uncertain answer.

Persistence is an open design choice: use existing Beads Question records across
browsers and restarts, or question snapshots/dispositions in existing browser
workspace storage with browser-local limits. Neither alternative is selected.
The separate Claude question-registration/enforcement proposal remains pending.
No implementation commit exists for this requirement yet.

## 2026-11-18 — Toggle subagent messages in Project

The user requested a switch for subagent messages and placed it near Create
handover. Use a default-on, per-chat choice in the existing browser workspace
preferences. This keeps the setting with the current browser's other chat
display choices without adding server storage or changing agent execution.

Filter only messages carrying native subagent attribution, before grouping the
visible conversation. Retain original records for history and branching, and
keep question exchanges, native question controls and approvals visible. Parent
messages and user-written text resembling a subagent label remain unchanged.
The alternative of stopping subagents or deleting their messages does not serve
this display preference and is not selected.

Implementation: `ee6705b7831c09577912c5775a836f3f7018cddf` (1.41.0).

## 2026-11-18 — Keep unanswered cards usable after follow-ups

The user selected keeping unanswered Codex question cards usable after an
unrelated follow-up while the original native turn remains active. Previously,
CCNG retired every editor on ordinary human input, leaving only static text.
This supersedes that conservative policy; a follow-up is neither an answer nor
a withdrawal. Answering one question leaves other unanswered questions intact.

Implementation: `ae81565ed939d6773dad3e55a8afb3f2a392eec2` (1.40.0).

Reuse the existing exact question identity and ordinary native input path.
Ended turns, removed or changed metadata, unsafe bindings, ownership changes,
pending native requests and uncertain delivery keep their existing protections.
An unanswered question also continues to block automatic control input and unsafe
handoff completion. No answer store, automatic re-asking or replacement native
callback is introduced. The alternative was retaining native terminal-style
retirement and issuing a fresh question; the user chose continued card access.

## 2026-11-18 — Attach conversation tabs and distinguish Coordinator

The user requested that conversation tabs meet the chat history's top edge and
that the taller Coordinator control remain visually separate. Bottom-align the
worker grid rows when Coordinator determines the header height. Give Coordinator
its own spacing, divider and closed outline without changing its existing size.
Preserve worker order, two-row selection, hover expansion, dragging, themes and
the single scrolling mobile row. Reuse the existing tab groups and CSS rather
than introducing another navigation structure.

Implementation: `ae81565ed939d6773dad3e55a8afb3f2a392eec2` (1.40.0).

## 2026-11-18 — Defer Claude daemon integration

The user chose to leave Claude daemon integration for the future or wait for native
support. This supersedes the discussion of a custom persistent service as an
implementation option; no such service, upgrade or migration is selected. Native
background mode uses an interactive session and rejects print mode, while the Agent SDK
hosts a subprocess over stdio. Keeping a process warm between turns does not establish
restart-independent daemon attachment. Native background execution exists, but a
supported local SDK connection for CCNG has not been established.

## 2026-11-17, 21:16 CET — Attribute forwarded subagent messages

The user requested a Message from subagent name prefix after child progress appeared as
ordinary parent replies. CCNG will generate the visible label from native provenance,
preserving original text and copy content. The user clarified that usage documentation,
not AGENTS.md or agent prompts, should explain this feature. Reuse the pinned SDK's
parent_tool_use_id and launch metadata, with an ID fallback rather than guessed names.
Preserve separate parent/child streaming and prevent child output from becoming parent
report/completion/model evidence. No SDK upgrade, extra store, missing-child transcript
collection or native runtime change is selected.

Implementation: `0d8848629505d03ccf94e2fc8808325c6f91b1c2`.

## 2026-11-17, 21:04 CET — Relocate activity and version

The user selected activity directly below the enlarged active top tab, allowing it to
cover older conversation text. Reuse the existing status component in a zero-height
sticky wrapper with a theme-backed, click-through surface; its clock stays isolated from
App history. Move the version between branding and Logout and remove the local-workspace
footer because provider identity is already in the chat controls. Keep the input title
and tab ordering unchanged. No new architecture, storage, dependencies or native
execution behavior is selected.

Implementation: `9bba55da4edf34bf44681baf73f37041ff97894a`.

## 2026-11-17, 14:30 UTC — Make Claude tool waits and queued input explicit

After reporting a nonresponsive chat, the user required a clear view of ongoing work
rather than a generic busy label. Version 1.38.0 reuses native SDK events, existing
message metadata and the existing status component/clock. No additional service,
transport, store, model input or automatic recovery is introduced.

A tool request remains Waiting on until matching same-session/tool progress arrives.
Show its bounded description, native-request/first-seen age, progress age and reported
elapsed seconds separately. Unknown, stale and disconnected evidence cannot become a
stall diagnosis. Exact request controls take precedence. Ordinary input is queued until
its own native UUID echo is observed; HTTP queue acceptance and native receipt do not
establish model processing. The status clock remains in its existing child component and
does not redraw the conversation per tick.

This is an incremental visibility correction within the existing architecture. The
alternative of status-only model probes or another monitoring service adds unnecessary
work and authority; no such addition was selected.

Implementation: `5083e3c20596fbe907fb5e072b3cb82750f18a14`.

## 2026-11-17, 14:13 UTC — Retain answered questions

The user reported that decision cards and their answers disappear on submission. Source
inspection confirmed two Codex assistant-message display defects: explicit native null
question metadata removed the observed question, and the submitted form hid its retained
answer. Version 1.37.0 keeps observed question details on the same native item and
retires answer eligibility, while retaining submitted text in the existing
browser-memory input state. Native user reply rendering continues to provide the quoted
question and answer during history reload.

This uses existing native records and UI state, with no additional transcript store,
callback reconstruction, model input, permission change or response replay. The
alternative of persisting another answer log was unnecessary and outside the approved
storage design. A cold reload can only reconstruct data native history actually exposes;
local-only accepted text is not claimed durable.

The user then identified the affected provider as Claude and supplied a screenshot.
Claude AskUserQuestion tool calls/results were confirmed to fall into collapsed actions
after card removal. The same release retains their native activity provenance while
showing known completed question exchanges outside those groups, using original question
strings and exact matching native result text. Existing native history reconstructs this
view; arbitrary tool output is never classified as human authority.

Implementation: `366a558bb733125ccfc613cebb36efb940be27ae`.

## 2026-11-17, 13:13 UTC — Carry task records and retire stale review feedback

The user explicitly requested fixing missing handover task associations. Reuse the
existing complete Beads handoff operation before receiver instructions/import: add the
receiver association to the same records, retain source associations and every task
state/owner/dependency/content, and refresh the receiver view. Verify all statuses,
including normally hidden and closed records. A task-bearing handover requires the same
canonical project; a complete zero-task read permits a different directory. Recheck
after preparation and before input. Link/readback or safety failure retains the exact
receiver, artifact and completed links, without an import or duplicate creation. This
uses existing tracker/queue paths, not another store, copied task database or automatic
task activation.

A real user transcript established stale Coordinator wait summaries arriving after the
associated commands completed. Source diagnosis found the prompt required non-approval
summaries while the existing delivery gate waited for requests to resolve. Stop
requiring duplicate native-ask summaries. Bind necessary review feedback to exact
requests reviewed in that turn (including older tool-call shapes), validate
lifecycle/owner/connection before delivery and after awaits, and discard only
known-unsent stale bound feedback. Preserve ordinary summaries, uncertain sends,
pauses/stops and original manual controls. Bindings stay transient/private. Arbitrary
false claims in unrelated free text remain an instruction issue; no semantic content
filter, service or timer is added.

Implementation: `e5cddb597a07e8e1c8ef7427f5f4cc06abeddaa8`.

## 2026-11-17, 12:32 UTC — Retain requested Claude modes and repair review indication

The user explicitly requested enabling Auto in the current handover receiver and making
the setting survive future resumes. Native metadata proved initial Auto was applied, but
a later managed process resumed in Default. Retain requested auto/default preferences
for open Claude chats in the existing private workspace record, loading them before
read-only restoration. New creation records Auto; explicit native mode changes record
intent only after acknowledgement. Native fallback observations never silently replace
that intent. Preserve legacy chats without a preference, observer-only startup and every
pending request. This is a small extension of existing metadata, not another service,
permission database or persistent approval-rule store. A later acknowledged per-chat
Manual overrides an unchanged operator default; changed operator selection supersedes
the older preference for that affected chat. Failed native setters remain unconfirmed.

The user also reported no Evaluating/Concerned indication. Source diagnosis confirmed
stale exclusion of all Claude workers from Evaluating despite supported ask-only concern
reviews. Expose the same exact live capability to the browser and use it for active main
reviews; analysts remain Codex-only. Preserve the intentional nine-second pulse for new
concerns, mount/reconnect baselines and manual native approvals.

Implementation: `b5573ed16986d5f0a8cd0a81e6a4cac884fec15d`.

## 2026-11-17, 11:26 UTC — Exclude ordinary draft edits from history rendering

The user required ordinary chat-input keystrokes to avoid rebuilding the existing
conversation. Version 1.34.1 adds a render boundary around the existing message
list/grouping, with current data/control dependencies and stable navigation callbacks.
Composer edits, streaming messages, approvals/questions, status, history loading and
actual UI actions remain responsive. This uses existing React hooks without
virtualization, draft loss, a global rendering ban, new dependencies or changes to
native controls.

Implementation: `d6796665c5606c779c1414b455770f60fb8ff59a`.

## 2026-11-17, UTC — Correct Claude notice identity and avoid unchanged render work

The user requested a fix for native Claude completion XML labelled as You, then reported
sluggish typing in a long chat. The exact reported historical notice has native
task-notification origin metadata that the SDK's normal history projection discards.
Recover only that verified marker by exact session/message identity using one official
SDK import/projection pipeline in request-scoped memory. Keep the SDK responsible for
conversation-chain and isMeta filtering; release raw entries afterward. No custom
filesystem reader, persistent store, query attachment, new dependency or second
transcript read is added. The two pinned SDK APIs are alpha; a missing capability
retains legacy readable history without guessing identity from XML. Notification text
only supplies the readable summary/status after provenance is established; original
details remain escaped.

Draft changes currently render App's conversation tree again, including plain Markdown
and timestamp components. Memoize these two expensive components using their existing
primitive props, preserving their callable renderers, live updates, formatting, copying
and raw-text policy. This uses existing React boundaries, without virtualization,
history truncation, formatter caches or a broad rendering ban. New messages, streaming
text, status/requests and other changed visible data must continue to update. The user
endorsed updates based on changed visible data.

Implementation: `c43c261f99adf199ae1d8370f738608512b53851`.

## 2026-11-17, UTC — Prepare before automatic import and select existing versions

The user explicitly changed the handover flow: default the provider choice to the source
provider, prepare the complete file first, then start the receiver with automatic import
as its first input. Remove the Import button and waiting startup turn. This supersedes
the earlier approved manual-import/no-default flow without replaying old assignments or
changing existing chats.

A missing-file import exposed a timing race: a receiver could read before the source
wrote its artifact. Receiver creation now waits for the exact source preparation turn
and private, nonempty regular-file metadata. The source writes the completed artifact
atomically; the backend does not read its contents. Progress uses a one-off in-memory
operation and existing events, without a persistent queue, scheduler or automatic replay
after backend restart. Native questions, interruptions, stop intent and uncertain
outcomes retain their normal controls.

The user also requires a choice if the next version already exists: open that existing
chat without model input, or explicitly confirm the next unused version. Check
project-local histories and recheck before startup; do not silently bump a name that
becomes occupied. Preserve the source and native operation ownership.

Separately, the user explicitly requested native Auto-review for new Codex chats and
native Auto mode for new Claude chats. Use the installed providers' native creation
controls, retaining Codex approval policy/sandbox and existing chats' settings. Do not
add a CCNG permissions store, approval bypass or global native profile change.

Implementation: `f3d1cf6179829ef11f400ca332ea5d3332497c37`.

## 2026-11-17 — Preserve literal user markup

Version 1.32.0 preserves escaped literal HTML/XML in user messages without executing it.
This keeps pasted user text visible while retaining the existing Markdown safety
boundary.

Implementation: `66c753b3c92dcc7e39c29e1552d62d3e88fa426d`.

## 2026-11-17, UTC — Reuse the handoff skill through Project overview controls

The user requested Create handover / Import handover beneath the worker Project heading.
After discussing what transfers, the user selected creating a fresh receiving chat and
explicitly asking which agent should continue. The user's later clarification fixes the
order: Create asks Codex/Claude and the project directory, starts a waiting receiver,
and requests the source artifact. The source stays selected and available. Import in
that receiver offers its exact assigned path and submits to the same chat, without
another agent choice or another chat. This supersedes the unpublished draft in which
Import created the receiver. Closing the source tab preserves native history and native
work.

The receiving name appends ` v2` when no trailing `vN` exists, or increments that
number. Bare trailing numbers remain part of the descriptive name. The receiver loads
its instructions and waits until the user explicitly imports the artifact.

Reuse the existing installed `handoff` skill and native message/create paths. The
backend reserves a private temporary directory and retains only the assigned path/source
ID for open receivers in the existing private workspace metadata. The source worker's
normal native tools write the artifact at that exact path. Import sends a quoted path
and evidence/reconciliation instructions. The backend never reads, uploads or copies
handover content, adds another store, installs skills, archives source chats or
transfers approvals/task ownership. A reserved path or accepted request is not proof of
actual artifact/model completion.

Creation callbacks retain a known receiving-session identity if naming/opening or input
fails. Unknown allocation remains unconfirmed; neither path retries or deletes the
native conversation automatically. Existing authentication, origin, native
question/ownership and worker-slot protections remain in force.

Implementation: `66c753b3c92dcc7e39c29e1552d62d3e88fa426d`.

## 2026-11-17, UTC — Add native Claude branches in the existing workspace

The user explicitly requested implementation after learning that Claude branch controls
were disabled. This authorizes this feature independently of broader deferred Claude
work. Reuse the already installed official SDK's `forkSession` operation and existing
authenticated branch route and controls. No dependency, provider service, model call or
separate transcript store is added.

Branch chat copies current persisted native history; Branch here maps only an eligible
completed reply to its native message UUID. Live replies wait for successful native turn
completion. The SDK remaps child UUIDs and leaves the source transcript unchanged;
pending callbacks, task links and exact-session Auto selections are not copied by CCNG.
The first explicit child follow-up uses the child's identity and task context. Existing
Codex-only automatic handback stays separate from parent navigation, including backend
provider guards.

The SDK writes native fork provenance but omits it from its public session-read
interfaces. The user explicitly answered “Save links in existing workspace” and “yes”.
Reuse existing private workspace metadata for ID-only parent links, including closed
tabs, so parent navigation survives backend restarts. The alternative of process-only
links was presented and not selected. No separate database or transcript reader is
added. Retain at most 256 links in a bounded 64 KiB private file; reject invalid/cyclic
mappings and new branches at the bound rather than silently pruning relationships. Apply
links before read-only restoration. An existing schema without links remains valid.

Implementation: `c929b2972632087ca8d16fffc8fcdaad19f311d1`.

## 2026-11-16, 16:52 UTC — Attach Claude approval concerns without answering requests

The user reported a Coordinator concern missing from its originating Claude approval
card. The existing review operation rejected Claude requests, so explanations appeared
only in chat; Claude cards also omitted bound review metadata.

Reuse the existing exact-request review operation for ask-only Claude feedback and
render its bound rationale on the original card. Require the current managed query,
callback and request identities; retain existing manual controls. Automated Claude
approve/decline, analyst eligibility, source-reading authority, historical request
matching and native Auto permissions remain unchanged. No new tool, store, service or
model stage is selected. Chat prose is not converted into a review, and old concerns
cannot be replayed onto new requests.

Implementation: `f298d02558b45f079b406c93a5896841b1d8d99d`.

## 2026-11-16, UTC — Native Claude Auto mode for exact sessions

The user requested Auto mode for one existing Claude worker, then clarified that the
backend must be able to apply it without an authenticated browser action. Use the
installed SDK's native `setPermissionMode` and retain the existing provider/model. The
existing private runtime file now accepts a bounded exact session list. Owner-triggered
SIGHUP reloads only that selection; it introduces no new service, timer, state file,
permission bypass or global provider default. Selected future processes receive Auto
explicitly, while changed selections on already managed processes use the live SDK
control without restarting them. Removing a selection requests Manual only for that
previously selected session.

Optional authenticated per-chat controls use the same native operation. Native observed
mode, request acknowledgement, unconfirmed outcome and configured future selection
remain distinct. Existing callbacks, pending approvals, other workers and Codex
permissions remain unchanged. Invalid payloads, replaced queries, native refusals and
model-driven fallback do not create false success or automatic retries.
Restoration/configuration starts no model work.

Implementation: `ee2827c6067d1d48d7f2c8cf1b28671eb1477292`.

## 2026-11-16, UTC — Preserve existing Claude Vertex settings in services

The user reported that terminal Claude authentication worked while the managed chat
selected direct first-party login. The terminal selected Vertex AI through exported
provider, region and project settings that were absent from the service environment.

The user explicitly approved applying that existing Vertex setup to all Claude chats
managed by this application and restarting the existing application. The 1.29.2
correction preserves explicitly supplied provider, region and project selectors during
user-service registration and supports the same optional validated mapping in protected
Ansible runtime settings. No provider default, shell startup sourcing, additional
service, credential export or native daemon restart was selected. Existing units stay
unchanged until explicit configuration.

Implementation: `6bd3329618a6893fd0918034b3199aa086285307`.

## 1.29.0 — Explain current work and input needs — 2026-11-15, 13:55 UTC

The user requested that Report Now explain what the worker is doing, what comes next and
where it needs the user. Extend only user-selected report prompts with Doing now, Next
and Need from you lines after the existing table and Release line, before optional
detailed history. State None when no input is needed and unknown where evidence is
unavailable. Summaries do not replace native controls or create authority for new work.
Reuse current prompt composition and report recognition; no parser, store, timer or
dependency is added. Preserve captured in-flight/uncertain prompts without rewriting or
resending; an unsent scheduled report can gain the manual overview through existing
coalescing. Scheduled and Coordinator requests keep their normal report shape.

Implementation: `171e667e5d77016cea06c349a7855c3693ce00dd`.

## 1.28.6 — Keep hovered tab controls aligned — 2026-11-15

The user supplied a desktop screenshot showing the close button beside a short title in
the middle of its allocated tab during hover. The hover rule disabled title-area flex
growth while the tab retained its normal minimum width. That left unused space after the
close control.

Decision: allow the hovered title area to grow from its intrinsic width without
shrinking. This one-line CSS correction keeps spare width before the controls, preserves
full long-title reveal and leaves the existing mobile media rules, tab order, native
state and selected-tab arrows unchanged. Implementation:
`f649b534d42da138d15573da6cd504ef89531250`.

## 1.28.5 — Use the command working directory in approval explanations — 2026-11-15

An approval concern treated relative output paths as unbound even though the submitted
command specified a project checkout as its working directory. The available request
directory should govern path interpretation rather than worker startup metadata.

Decision at 07:22 UTC: clarify the shared main/analyst guidance to use request
`params.cwd`, trace any directory changes within the command, and distinguish it from
worker/analyst startup directories. Preserve native configuration scope, source
protections and actual user authorization. This routine correction is within the
existing CCNG engineering mandate; it grants no authority over the unrelated project or
its original approval. Its explicit task-tracking opt-out is preserved. No project code
or original request is changed by this work.

Implementation: `982679dc755f1330ee68bc4094bde78fff52ca0c`.

## 2026-11-14 — Retain request-bound source inspection capacity

Retain the existing limit of sixteen distinct source paths per exact pending approval
token. New questions have unique tokens, resolved-token evidence is pruned on reads, and
paging the same path consumes no new slot.

Legacy source reads under the selected all-reading policy and analyst reads remain
approval-token scoped. Retained source hashes, command hashes and working directories
must be rechecked before approval; dropping evidence to free capacity would change those
protections.

No new capacity or evidence-discard mechanism was selected.

## 1.28.4 — Retry explicitly rejected request attachments — 2026-11-14

The user reported native request details disappearing and returning with the explicit
Server overloaded; retry later error.

The attachment allowance had been consumed before thread/resume, including an explicit
transport rejection. That rejection means the turn was not dispatched and can be retried
differently from an unknown or transport-lost outcome.

Permit at most two additional attempts for only that explicit resume rejection, at least
five seconds apart through the existing observation poll. Preserve current
connection/history revision/native lineage, ownership, pause, stop, handoff and original
callback checks. Successful attachments consume their allowance even if a subsequent
read fails. Do not mark a snapshot attempted when the transport explicitly refused it.
No generic RPC retry, new timer, permission change, approval answer or command replay is
introduced.

Implementation: `c303fdc`.

## 1.28.3 — Reserve one explicit report admission at queue capacity — 2026-11-14

The user reported Report now failing when four Coordinator messages were queued. The
common queue bound remains four for ordinary messages.

Give only the existing explicit Report now path one reserved admission when the queue
contains exactly four messages and no report. Keep one outstanding report per worker
through existing coalescing. Preserve all queued rows and the existing priority
insertion, including failed and in-flight barriers. Other queue callers keep their
ordinary limit. This is a focused correction within the existing bounded queue, rather
than raising every limit, discarding messages or adding a queue store. No permission,
report cadence, native answer or retry rule changes.

Implementation: `3f16df4ff14f3932cdc6c053f65a517c46057847`.

## 1.28.2 — Keep legacy source reads bound across different directories — 2026-11-14

Implementation: `bc959d801b54ef32f2b241276b55849776063218`.

A real legacy-reader defect blocked safe source inspection when pending requests used
different working directories, especially under an operator-selected all- reading
policy. The reader collected the requests and required their directories to be identical
even when an absolute path named the same file. An older Coordinator without the
dedicated request-bound tool could not use the suggested alternative. This was an
implemented refusal, not merely a model concern.

Resolve the requested path against each request's captured directory. Read it only when
those paths identify the same file, then retain each exact request's own working
directory, command, token and inspected hash through the existing reader and
final-review checks. Ambiguous relative paths still refuse before recording evidence,
with an absolute-path next step. No new API, tool, dependency, weaker source policy,
permission grant or original-action replay is introduced.

## 1.28.1 — Distinguish literal quoting from shell evaluation — 2026-11-14

Decision recorded 07:32 UTC. Implementation: `605136a314f961c5615b49a7f717c75bd8ea97d2`.

An approval concern treated documentation backticks inside a quoted literal Python
heredoc as shell execution. Review guidance must distinguish literal text from active
expansion through each actual evaluation layer.

Clarify the existing shared review guidance to trace each actual evaluation layer,
distinguish literal quoting from active expansion and retain uncertainty when context is
unavailable. Existing main/analyst/event guidance and policy context hashing carry the
correction. A new parser, execution capability or automatic approval exception is
unnecessary. Source protections, actual-user authority, exact
request/token/command/directory/hash checks and manual decisions remain unchanged; no
originating request is replayed. This is a routine guidance correction within the
existing engineering scope, not a new approval policy.

## 1.28.0 — Refresh the website after backend updates — 2026-11-14

Implementation: `aa01da7e587fef2dc2a57d5b7e1e45c84192f0d7`.

The user reports an HTML-as-JSON error after updates, cleared by a manual browser
refresh, and explicitly selected only an automatic website refresh. The response source
was not independently captured; no generic API retry/error rewrite was added. Expose one
opaque identifier for the existing Workspace lifetime in its existing snapshots. A
replacement backend changes that identifier, including same-version policy restarts;
ordinary browser/native reconnects retain it.

Refresh once after an authoritative replacement snapshot or frontend-version mismatch.
Flush existing text draft/preferences storage first. Defer while images, answer drafts,
native forms, current submissions (including background/child requests), other open
forms or storage errors would lose browser work. This neither resubmits native input nor
answers approvals. Add no endpoint, polling, storage scheme, dependency or service.
Older tabs require one manual refresh to load the feature.

## 1.27.3 — Make source paging advance at its exact limit — 2026-11-14

Implementation: `4d1c7785ee18e62dd8ce7bf3f1cdd4952487bee8`.

Investigation of a separate oversized-input concern found an exact-boundary defect: a
16,000-character line passed the line check, then failed page fitting because an
unreturned newline was counted. The reader returned an empty page with the same
next-line position. Independent synthetic reproduction and a new regression confirmed
nonprogress; this was not established as the cause of the original approval concern.

Count only newline separators returned between page lines. Preserve the existing
16,000-character/160-line page bounds, file limits, hashes, private reading policy and
approval controls.

## 1.27.2 — Allow Tasks boundary scrolling to reach its sidebar — 2026-11-13

Implementation: `87cbcf0c521ad32fa557f0ebdf64f868752f29f1`.

The user confirmed that native touchpad vertical scrolling fails in Tasks while chat
works. Source inspection found two nested containment barriers: the measured Tasks list
and its saved-height section body. The outer desktop overview already contains
scrolling. According to the [CSS overscroll
specification](https://www.w3.org/TR/css-overscroll-1/#scroll-chaining-and-boundary-default-actions),
a scroll container without overflow is always at a boundary, and containment prevents
ancestor handoff. This establishes a concrete CSS trap for short lists/list edges; the
user's physical gesture was not reproduced and may have another cause.

Allow vertical native handoff on those two Tasks elements only. Keep horizontal
containment, outer overview bounds, chat scrolling, section heights, three-row
measurement, focus and resize behavior unchanged. Mobile list edges may hand off to the
existing naturally scrolling document. Add no custom wheel handlers, dependencies or
browser installation. Private read-all policy/native requests and the withdrawn
send-button change remain outside this correction.

## 1.27.0 — Keep deployment approval policy private — 2026-11-13

Implementation: `0a68f2ac89f3760beb283cde696c96316e22cee6`.

Repeated helper/test refusals came from conservative credential/Vault and path filters.
The user explicitly selected all local reading for our projects, kept that loose policy
separate from product defaults, accepted readable YAML and prioritized deploying it. Add
one private YAML policy with a conservative product -template; updates preserve the
active file. The exact pinned yaml 2.9.1 parser reuses the existing Node runtime and
adds no service or approval store.

The selected policy reaches main/analyst instructions, ordinary/exact-token reads and
final source-hash rechecks. Explicit all mode removes local text name/content/ reference
exclusions while retaining native permissions, no execution/decryption, bounded
UTF-8/no-NUL regular files, symlink refusal, paging and current request/
command/cwd/source checks. Reading is not action authority; manual asks remain manual.
Hook and concern/name/message sanitation remain strict. Unknown/invalid selected policy
disables automatic approval and exposes only a fixed error.

## 2026-11-13 — Give Coordinator evaluation and concerns a separate tab row (1.26.0)

Implementation commit: `d3f2abb53b4a5c34ec2131a1ee2f0c46654aa5db`.

The user chose a Coordinator tab twice the normal height, its name in the upper half and
approval activity in the lower half. Green Evaluating… reflects an eligible current
request while the main Coordinator runs or a matching analyst is current, active and has
a confirmed running turn. Settled outcomes clear it; other active reviews can keep it
visible. Unknown, queued or superseded analyst runs and pending/restoring/disconnected
state are not evaluation evidence.

A new main Coordinator ask needing the user shows amber Concerned. with three smooth
three-second fades, then clears. A finite presentation timeout also clears the static
reduced-motion alternative. Stable audit IDs and mount/reconnect/ restoration baselines
prevent old concerns or save-state changes replaying it. This reuses existing state: no
model, service, persistent option, approval answer or workflow timer is added. Existing
question cards and worker attention rules retain their behavior after the temporary
notice disappears.

## 2026-11-13 — Read current-request project source across local directories (1.25.0)

Implementation commit: `c7d371d44ceccd1e93c4579d4b888072bb1bb975`.

A real review showed a chat whose native startup directory was the application checkout
while its command used another local project. Seven existing ordinary files were refused
because they were outside the startup project and not recognized as literal command
references. The user explicitly authorized reading project source in other directories
on the same host.

Both existing readers now permit safe source inside an exact current command request's
non-root native working directory, including filenames constructed by the command.
Outside that directory and the worker project, the existing direct reference requirement
remains. The default standalone source checker is still strict; the new option is
internal and used only under current-request checks. No public flag, tool, native
permission, working-directory change, remote access or automatic approval was added.
Older Coordinator catalogs use their existing project-file reader and receive exact
approval bindings.

Source, command, cwd and token are checked again after reading; source and command
hashes are checked again before any later approval. Different matching project
directories remain ambiguous rather than selecting one. Credential/Vault/path, symlink,
regular-file, size and paging protections remain. Original manual asks are not cleared,
rewritten or automatically reviewed.

## 2026-11-13 — Explain withheld engineering concerns without exposing matches (1.24.0)

Implementation commit: `b2d678cbe9b33ce11271f3a3aba3c44fa8605cd7`.

A genuine forwarded concern lost its useful reason because ordinary wording matched the
existing code-like-text guard. Filtered original-record metadata confirmed that the
credential guards did not match. The underlying source reads were refused because an
external helper reference could not be established for an inline Python invocation; that
is separate from missing files or credential content. No refused source was retrieved,
original command executed or approval answered.

Engineering notices now explain which fixed category withheld a field: pending command
text, protected source content with its fixed detector category, credential-shaped data
or code-like text. All prior predicates, priority and the 900-character pre-scan
boundary stay identical. The whole original field is withheld, and whole-notice
live-token removal remains. A code-like match can be ordinary prose and is not evidence
of actual executable code or real secrets. Source-reference support, original manual
questions and delivery/approval guards are unchanged; old notices and rationale are not
rewritten or replayed.

## 2026-11-13 — Explain protected-content refusals without revealing matches (1.23.0)

Implementation commit: `6a570110bd9fef4e12183756f5263a1461125619`.

A second genuine engineering concern showed that command recognition now works, but the
reader's single generic content error cannot explain which rule refused the test module.
Bounded native metadata confirmed that error; the refused file was not retrieved. The
evidence does not establish a real credential or a false positive in that file.

Both existing source interfaces now append one of six fixed categories: binary data,
Vault marker, private-key marker, provider-token marker, credential-named JSON field or
credential-named literal assignment. Matching text, keys, values and excerpts stay
private. Existing detection order, thresholds and allow/block decisions are preserved.
No reader, exception, automatic re-review, approval answer or command retry was added.
The original manual request and the separate held Vault-helper issue remain unchanged.

## 2026-11-03 — Select a small interactive frontend foundation

The user explicitly delegated choosing a frontend framework for an intuitive, beautiful,
simple, dynamic interface. The selected stack is React, TypeScript, and Vite, with plain
CSS and shared design tokens. This supports reusable interactive components and explicit
state types while keeping styling dependencies small. It requires deliberate
component/state design and careful accessible styling. The choice does not select a
backend, database, agent transport, hosting provider, or component suite.

## 2026-11-03 — Make Linux the first supported platform

The user selected Linux as the primary installation and runtime platform. The complete
interface must work in a Linux desktop browser; a smartphone browser may use a simpler
interface while retaining core workflows.

## 2026-11-03 — Use a simple installer in an unprivileged user's home

The user selected a simple Linux shell installer targeting an unprivileged user's home
directory, without requiring root or sudo. This avoids administrator access as a
prerequisite for installing the application.

## 2026-11-03 — Keep branching simple and result return optional

The user clarified that Branch here should open a new conversation with the same whole
context, allow a follow-up question or subtask, and support easy return to the main
conversation and repeated branching. The user also requested an option for bringing
subtask results back to main. A formal branch-completion or merge-review workflow was an
assistant suggestion, not an accepted requirement.

Parent-child connections and retained conversations support navigation and historical
review. Branch navigation and result return are separate actions. The precise result
payload and automatic parent continuation remain undecided.

## 2026-11-03 — Implement version 0.0.1

Implementation commit: `8b84f401bd6c726bf1111230ee23628a86b05c3e`.

The user approved a Codex-only first version with four colored agent tabs, compact goals
and reported tasks/subagents, a conversation and questions area, bottom chat input,
existing-agent access, and new-agent controls. A small Node.js service connects to the
existing native Codex daemon through its Unix WebSocket interface. This provides native
state, streaming, steering, and interruption while preserving model and permission
settings. No existing daemon is restarted.

The user selected port 4242 and both localhost and VM-internal listening modes. The user
approved nginx access restrictions plus an application password stored only as a salted
secure hash in private home configuration. Real deployment addresses and authentication
values remain outside the public repository.

The Linux shell installer accepts a destination inside the user's home. Without a
directory argument it prompts before installing, as explicitly requested. It builds the
interface, prunes build-only dependencies, and creates a user launcher. It does not
install system packages or configure boot services.

## 2026-11-03 — Make the installer directly executable in 0.0.2

Implementation commit: `c1129f5a050b402452d2d850f1086b4c1322b4e6`.

The user reported the installer lacked the executable bit. Git now records install.sh
with executable mode 100755 so a Linux checkout supports ./install.sh directly.
Installer help and current installation examples use that form. The version advances
from 0.0.1 to 0.0.2 for this patch-level correction; package.json and its lockfile
remain consistent, and runtime/build version references derive from package metadata. No
dependency or architecture changed.

## 2026-11-03 — Add branching and installer updates in 0.1.0

Implementation commit: `4b91fdf293e03011e494d612782eb63c60dc576e`.

The user requested visible, simple conversation branching with retained context and a
clear return path. Branch here now uses native Codex thread/fork at a completed reply;
Branch chat uses the latest completed reply. Native stored context is copied through
that turn, with goal continuation deferred until the user sends a follow-up. This avoids
reconstructing context from the dashboard's bounded transcript. Parent metadata supports
reopening and navigation. Branches share the working directory and do not create Git
worktrees.

Back to parent navigates without sending. The optional Bring findings back dialog lets
the user review an editable message before explicitly sending it to the parent, which
starts or steers a native turn. No automatic transcript merge or branch-completion
ceremony is introduced. Each branch occupies one of the four tabs; returning to a closed
parent at capacity replaces the branch tab while keeping its native conversation.

The user requested task summaries instead of executed commands, showing at most three
tasks. The strip now prioritizes reported active plan steps and subagent assignments,
with an agent-reported summary when available. Detailed command activity stays in the
conversation. A graphite palette with cyan controls, green activity, amber attention,
and violet parent navigation responds to the requested stronger technical appearance
without new visual dependencies.

The user selected automatic latest-code fetching for installer updates. The --update
mode advances a clean main checkout only by fast-forward and rebuilds the existing
destination. Dirty or diverged source is rejected without discarding work. The
executable launcher now lives inside the selected target. Only an exact, owned legacy
launcher for that same target is removed. Private password configuration is preserved;
applications and the Codex daemon are not restarted. The feature version advances from
0.0.2 to 0.1.0.

## 2026-11-03 — Fix nested installation updates in 0.1.1

Implementation commit: `54ce896da1cc4f684f258f97ab72304ffa5fe235`.

The user installed into ./targetdir under the source checkout. Git reported that
directory as untracked, and the 0.1.0 updater incorrectly treated the generated
installation as edited source. The source-change check now excludes only the selected
installation's untracked output, using a literal path. All tracked changes and unrelated
untracked files remain protected. A target that contains tracked source files is
rejected. No ignore rules are changed and no local work is discarded. The correction
advances the patch version to 0.1.1.

## 2026-11-03 — Summarize branch results and reclaim workspace space in 0.2.0

Implementation commit: `19e7bf484b690f0d9933740b59bcbce96e802870`.

The user requested a summary on return from a branch, followed by closing the child
session and its tab. Return summary now starts a normal native Codex turn inside the
idle child, using its existing context and a structured summary response. The user
reviews an editable summary of at most 2,000 characters. After the parent accepts it,
the app archives the child and removes its tab. Back to parent remains navigation only.
This replaces the previous last-reply prefill and keeps transcripts out of the parent
handoff. Archiving preserves history rather than deleting it.

Failed generation or delivery leaves the child open. When the parent has acknowledged a
summary but archiving fails, a retry only closes the child within the current app
process. Further branch work invalidates an unsent cached summary, including after an
interrupted turn. Internal summary/handoff messages are excluded from numbered
task-request collection.

The user requested removing the large Your workspace heading, shorter tabs, removal of
the vertical scrollbar between tabs and Add agent, and a useful top bar. The existing
tabs and Add agent now occupy that bar with compact branding, counts, connection state,
and sign-out controls. Tabs are single-line, with status dots, colors, tooltips, and
accessible names; the full status label stays beside the goal. Horizontal tab scrolling
remains available on narrow screens.

The user approved letting the workspace fill the browser and placing the goal and
current tasks in a narrow right sidebar. Desktop uses that sidebar; smaller screens keep
the context above the chat. Removing the centered size limit, large heading row,
repeated tab-status text, and decorative footer gives the conversation more room without
introducing new interface dependencies.

The reported missing multiple-task display exposed two gaps: explicit Task N chat
requests were not collected, and newer native subAgentActivity records were ignored.
Numbered requests now appear immediately and are restored from loaded native history.
Matching plans or explicit agent reports supply their states; requested work is not
guessed complete from idle state. Newer native subagent events also populate task rows
using their native metadata. The maximum remains three visible tasks, with active work
prioritized. External runtime task-tracker selection remains open.

## 2026-11-03 — Move branding fully right in 0.2.1

Implementation commit: `5bebfd88b9e57843f70f08a537cc50e5d79ce84f`.

The user clarified that branding must be completely at the right of the workspace
navigation bar. The whole Brand component now follows the agent tabs and controls as the
final header item. The remaining centered width inset is removed so the bar spans the
window and branding aligns to its right padding. Compact mobile branding remains at that
same rightmost position. This corrects the placement left in 0.2.0 and advances the
patch version to 0.2.1.

## 2026-11-03 — Keep the task panel current in 0.2.2

Implementation commit: `83b1606cec1300c9e5f310b34232518cf25de3b3`.

The user ran real sessions and found the three historical numbered requests still listed
as requested. The 0.2.0 parser had made those requests visible, but that did not
establish current agent work. The panel now excludes raw requests and completed tasks.
Numbered requests supply labels only for explicit progress reports or a matching current
native plan.

Plans and explicit reports are associated with their turn. A new turn clears the prior
turn's plan/report rows, and native-history replay does not promote older plans into the
latest work. Active subagent records remain supported. Without current tasks, active
agent commentary can provide a progress summary; otherwise the panel says No current
tasks reported. This avoids treating old requests as running work or guessing that idle
means complete.

The existing native Codex integration remains the source. A project Beads integration
was offered as a separate architectural choice and has not been selected or added. No
extra model calls, service, or dependency is introduced. The patch version advances from
0.2.1 to 0.2.2.

## 2026-11-03 — Use Beads task state and refine navigation in 0.3.0

Implementation commit: `b0b9774a5435ee4744a3ff6f65a08d7378cf367d`.

The user selected Beads after native plans and chat reports proved insufficient for
durable current-work tracking. The backend now reads stored task titles, states,
ownership and parent links through bd, with no extra model call. Closed tasks leave the
current-work panel; tracker failures clear stale rows and show an error. The panel
refreshes every five seconds and after completed turns.

Conversation associations use namespaced labels in the existing tracker rather than a
second database. Explicit linking changes only the association label. On app-started
turns, application context directs working agents to maintain their substantive tasks
through bd and use their own conversation label. Branches retain separate links;
handoffs include relevant IDs and unfinished work without automatically closing or
reassigning tasks. The installer and app check the approved bd prerequisite but do not
install tools, initialize or migrate trackers, or manage a Dolt service.

The user requested immediate typing after selecting an agent. Tab selection, including
reselecting the current tab, focuses the enabled chat input at the end of its draft.
Streaming updates do not repeatedly take focus. A generated transparent airport
control-tower icon replaces the square mark and supplies the favicon; its asset and
generation prompt are documented in docs/brand.md. Branding remains at the far right. No
new npm dependency was added.

## 2026-11-03 — Confirm native request resolution in 0.3.1

Implementation commit: `64cf1a18e3810ce0ff2a755616e8ef071a424000`.

The user reported that answering in the dashboard left the original harness question
visible. The app previously dismissed its question immediately after sending an
unacknowledged response. It now waits for native request resolution before removing the
question or reporting API success. Duplicate submissions are blocked while waiting.
Timeout errors retain the question; a late resolution still clears it. Disconnects
reject unconfirmed answers and remove requests belonging to the lost connection. Exact
conversation and typed request identity prevent unrelated resolution notifications from
clearing the wrong question.

## 2026-11-03 — Document the requested coordinator

Discussion-summary commit: `44b8aa2e567e673b55b726ef6e386edf107ce2ff`.

The user requested a predefined, automatically started coordinator that follows one to
four workers, reads Beads and conversation history, requests reports and summarizes
current work. It has its own visually separated chat tab and can send summaries into
selected worker conversations. Scope-based approval review must support authorized
resource lifecycle operations, including VM recreation and reclaiming disposable test
capacity. The discussion distinguishes model judgment from independently enforced limits
and leaves uncertain authority with the user. The user subsequently authorized
implementation. The discussion document records the requested behavior and remaining
details; no supervisor exists in 0.3.1.

## 2026-11-04 — Add the native coordinator and tab ordering in 0.4.0

Implementation commit: `962041ced0ae6b4ff420dbeaad94f24367980324`.

The user authorized implementation of the discussion summary, then requested dragging
tabs into a different order. A native Codex coordinator now starts with the first
worker. It has its own visually separated chat tab alongside all four worker slots. The
existing account/model and local service are reused; no assistant-team deployment, new
provider, dependency or persistence service was introduced. The user can chat with it,
request summaries, pause/resume it, and review recent decisions and deliveries.

Host tools expose watched worker history, bounded project instructions/source, Beads
records, high-level progress publishing, report requests, summary delivery and exact
pending command/file approvals. Recaps supplement stored task state without changing
Beads. Changed evidence and completed work trigger coalesced turns; unchanged task polls
do not make model calls. Messages wait for idle, unblocked workers outside a branch
handoff and are attributed to the coordinator. Report replies wake the coordinator.
Message/report limits and suppression of summary acknowledgements prevent repeated
reporting loops. Unconfirmed sends retain an error and do not retry automatically;
queued messages can be cleared.

The approval prompt follows user-authorized project scope rather than treating all
writes/deletions as forbidden. This covers permitted resource lifecycle, including
disposable VM recreation and resource reclamation. Native request identity, a current
token, active coordinator turn and exact real-user-message reference are checked before
an approve-once response. Generated coordinator messages and branch handoffs cannot
supply authority. Uncertainty remains with the user. Preferences, broad permission
grants and connector forms stay manual. This is model judgment, not hard containment of
arbitrary scripts or AAP effects.

The coordinator's native sandbox is read-only; unrelated shell/apps/plugins, MCP,
memories, permission-request and multi-agent capabilities are disabled for its thread.
Startup verifies the sandbox and fails visibly if the restrictions cannot be applied.
Worker configuration is preserved. Unusual MCP server names currently fail coordinator
startup explicitly.

Desktop drag ordering and left/right buttons plus Alt+Left/Right reorder worker tabs
while preserving conversation identity, draft/focus behavior and the separate
coordinator group. Order is local browser memory. Native history remains with Codex;
workspace restoration and stronger remote-resource enforcement remain separate future
decisions.

## 2026-11-04 — Correct tab dragging in 0.4.1

Implementation commit: `9253e93f82aa604257860b3ce04e72dafa69cc19`.

The user updated to 0.4.0 and reported that dragging tabs did not work. Its native HTML
drag handlers were attached to the wrapper around interactive tab buttons. The patch
replaces that path with pointer capture on the tab button itself and viewport hit
testing for destination workers. The exact browser-specific cause was not reproduced
locally; no interactive browser is available.

A short horizontal movement threshold separates dragging from normal clicks. Visible
cyan markers show the drop position. Cancellation, vertical gestures, outside drops,
lost capture and a worker closing during the gesture retain a valid order. The
drag-generated click is suppressed so it cannot switch chats; ordinary clicks retain
immediate chat focus. Edge movement scrolls the tab strip. Mouse, touch and pen share
the same controller. Coordinator tabs remain outside worker reordering, and left/right
controls remain available. No dependency, persistence, task, coordinator-authority or
installer behavior changed.

## 2026-11-04 — Separate the coordinator on the right in 0.4.2

Implementation commit: `fcf05551892eef23028e45e42704a70765968f0b`.

The user clarified that the existing divider was insufficient: the coordinator must
align right while workers align left, and its appearance must communicate a different
role. It now sits outside the workers' scrolling strip as a separate header group.
Workers and Add agent stay together on the left; flexible space and a divider separate
them from the right coordinator. Branding remains the final item at the far right.

A violet surface, rounded full border and overview icon distinguish the coordinator from
the worker tabs. Status dots and the amber attention border retain running/attention
information. The compact phone treatment shortens its label to Coord, leaving room for
worker navigation. Worker drag destinations remain confined to the left strip. Project
contributor guidance records the requested placement and visual distinction.

## 2026-11-04 — Restore workspaces and refine navigation in 0.5.0

Implementation: `38063bf322a849ff0ddce14e205bf91e73de6a74`.

The user explicitly approved split file storage after discussing which server would hold
it: the existing Command Center Node.js backend, with no additional service or database.
It saves worker/coordinator IDs and coordinator pause state in a private file beside
login configuration. Browser-local storage preserves drafts, selection, worker order and
reading positions. Native histories and Beads tasks remain in their existing stores.
Runtime files stay outside Git.

Restoring views uses native read calls so opening the dashboard does not resume unloaded
worker goals or start model turns. Explicit continuation activates the existing
conversation; the coordinator reapplies its restrictions first. Missing conversations
report errors without blocking other tabs, and the same saved coordinator is retried
instead of silently replaced. Approval answers, review tokens, queued messages and live
decision lists are not replayed. Browser state is device/origin-specific and reading
positions are limited to loaded history.

The user requested the coordinator immediately beside Add agent, a more prominent Add
button, space above the colored tab borders, roughly 30% thinner tabs, a recognizable
airport tower and the exact wordmark command center NG. Workers remain left; Add and the
violet coordinator form a compact right-hand pair; branding remains rightmost. Source
review found the palette coherent and header controls crowded. The changes simplify that
hierarchy while retaining status colors and the full-window workspace. The tower uses a
clearer complete-building silhouette; its built-in generation prompt is recorded in
docs/brand.md.

## 2026-11-04 — Surface open questions and widen context in 0.6.0

Implementation: `5b63d56a9e99b46631dbeb166f1ca24ff3d6c46e`.

The user requested a roughly 40% wider summary/goal panel because overlooked questions
can leave work blocked. The desktop sidebar now scales from 260–320px to 364–448px at
the same relative width range. Goal, current task summaries and native Open questions
remain together. Amber counts/cards show clarifications, approval requests, coordinator
decision rationale and answer errors. A multi-question request lists each question;
numeric/string request identities remain distinct. Clicking a row reveals the existing
answer card and focuses an enabled control. It does not answer or resolve the request.
Native confirmation remains the condition for clearing it. Requests owned elsewhere show
a notice directing the user to the native client.

The user also requested Branch chat beside Interrupt and Send. It moves into the chat
composer with an explicit non-submit button type; per-reply Branch here and native fork
behavior remain. Controls wrap on narrow screens and mobile retains stacked context.
Ordinary prose questions are not inferred; coordinator tracking of those decisions
remains a separate unanswered scope choice.

## 2026-11-04 — Check prerequisites and offer confirmed RHEL 9 setup

Implementation: `818b3cd059325456efe206ee06f61f179d3b4a7f`.

The user requested prerequisite checks and optional installation with sudo after
approval, plus RHEL 9 documentation and Beads configuration. The local 0.7.0 checkpoint
adds a read-only inventory, Node/npm and system-tool checks, RHEL 9 RPM offers, and
separately confirmed target-local installation of missing Beads/Codex CLIs. Existing
compatible tools are reused. Deferred Codex sign-in keeps installation possible while
reporting incomplete agent readiness. Local CLI paths are included in the launcher and
documented for native daemon startup.

Fresh tracker/Dolt server configuration is deliberately not selected: the user has not
yet answered the proposed shared-server architecture choice. Existing trackers and
services remain unchanged. The RHEL 9 guide documents all package requirements,
embedded/server differences, vendor references, preserved settings and the untested
status of other distributions. Ordinary-chat question tracking also remains an
unanswered scope choice from the preceding UI change.

## 2026-11-04 — Remove the gap below agent tabs in 0.7.1

Implementation: `101f2f6`.

The user requested that chat history meet the tab bar without the extra blank strip. The
workspace now has zero top padding on desktop and mobile, preserving its side/bottom
spacing and the tab bar's existing eight-pixel internal top inset. This is a layout
correction within the existing responsive design.

## 2026-11-04 — Preserve conversation roles and explicit project selection in 0.8.0

Implementation: `e1e9363`.

The user reported workers mixing project tasks or instructions and requested
continuation of the open work after checking tools. Read-only native history and saved
workspace inspection confirmed former coordinators had been opened as workers, and RHEL
workers had started with the application's project directory and instructions. These
were verified entry points for confusion; they do not establish every cause of the
earlier behavior.

Worker selection now excludes coordinator metadata, and direct opening and restoration
check native roles before any resume. New coordinators use the existing native source
field to retain their identity through renaming. Earlier coordinators are recognized by
their reserved name; renamed older coordinators without the marker remain a documented
limitation. Invalid saved roles produce warnings and preserve IDs for explicit recovery,
without rewriting histories or creating a replacement coordinator.

New-worker directory input starts empty and must be supplied explicitly. This prevents
the application startup directory from silently determining a different project's
instructions. Existing conversations retain their native directories. Task context also
reiterates that coordinator summaries and shared records do not create assignments or
user authority. No separate role store, service, tool installation, permission override
or conversation migration was introduced.

## 2026-11-04 — Match coordinator and worker tabs in 0.8.1

Implementation: `1cfc9b8`.

The user requested the coordinator use the same kind of tab as workers and sit to the
left of Add agent, swapping their previous order. The coordinator now inherits worker
tab shape, height, typography and state styling. Its startup/retry control uses shared
tab markup too. The coordinator retains its overview icon, compact mobile label,
separate chat/role and position outside worker reordering. The existing tab-bar top
inset and zero workspace top gap are retained.

## 2026-11-04 — Recover missing pending requests in 0.9.0

Implementation: `6e78051`.

The user reported duplicate chat/sidebar messages claiming an approval belonged to
another client while using Command Center. Read-only inspection confirmed a worker was
waiting on approval. The UI inferred ownership solely from attention without local
request details; it had no ownership evidence. A regression also reproduced a request
being dropped while a conversation was opening, because request watching began after
awaiting native resume.

The app now watches a validated conversation before resume and offers explicit loading
of missing request details. It reads fresh status and rejoins only the selected
already-active native conversation, preserving original request IDs. Loading is bounded,
deduplicated and scoped to that chat, with an explicit error when replay is unavailable.
Ordinary chat sends cannot replace or steer a turn while request details are missing.
Startup restoration remains read-only, and loading submits no decision, creates no
worker turn and adds no worker permission or model override. Existing coordinator
restrictions and review policy remain. Native user-verification requests excluded from
replay retain their native limits.

## 2026-11-04 — Attach folder tabs to the pane in 0.9.1

Implementation: `162bb73`.

The original user request in coordinator history was read to verify the relayed visual
direction: small folder-like tabs should join their chat-history pane without
intervening lines, and selection should use something other than the bottom marker. The
implementation uses matching pane/tab fill, stronger selected labels and clearer side
edges. These are implementation choices for the requested effect, rather than separately
recorded user choices of exact colors or weights.

The joining header padding/border and pane top border/corners are removed. The context
panel shares the same surface, including the coordinator and stacked mobile view.
Horizontal scrolling remains available without a visible scrollbar gutter separating
tabs from the pane. The coordinator stays before Add agent; status colors, keyboard
focus and worker reordering are preserved.

## 2026-11-04 — Distinguish the visible conversation tab in 0.9.2

Implementation: `cf29429`.

The user found the selected tab difficult to identify and clarified that selection means
the chat history currently visible, independently of the agent's activity. Their newer
request doubles the top inset from 8 to 16 pixels, makes the selected tab somewhat
bigger and uses bold text only there. It supersedes the earlier eight-pixel inset and
uniform compact tab height.

The selected tab is about 40 pixels tall with a 13-pixel bold label; inactive tabs stay
about 34 pixels with regular 12-pixel labels. Bottom alignment preserves the folder-tab
connection. Cyan top/side edges and a brighter upper fill fading into the pane reinforce
selection for every activity state, while status dots retain their independent colors.
Worker/coordinator styling and mobile behavior follow the same rule, with no bottom
selection stripe or joining line.

## 2026-11-04 — Keep scrolling text below the attached tabs in 0.9.3

Implementation: `a9f29df`.

The user wanted chat-history text to disappear a little before it reaches the tab
bottoms, while retaining the folder-tab connection. A fixed twelve-pixel inset moves the
conversation's scroll viewport inside the pane. Unlike ordinary content padding, that
space remains clear when the conversation is scrolled. The composer and sidebar retain
their existing placement and behavior.

The user also requested the chat-history background for inactive tabs. Worker and
coordinator tabs now use the shared pane fill across activity states; the amber
attention fill is removed while status dots/top edges remain. Selected height, bold
label, top/side outline and brighter fill remain intact. Mobile uses the same fixed
inset, with no new joining border or outside gap.

## 2026-11-04 — Preserve the ongoing exchange when branching in 0.10.0

Implementation: `ec4cb6e`.

The user reported conversation messages missing from a branch. Native history metadata
and the specific message boundary confirmed that Branch chat had selected an earlier
completed reply and omitted the later exchange. This matched the previous
implementation, but made the composer action an unexpected historical branch instead of
a current-conversation snapshot.

The existing native fork transport supports the correction without adding a service or
context store. Branch chat now omits the historical cutoff and forks current stored
history. The native child receives an interruption marker for an incomplete copied turn
while the parent continues. Branch here retains its explicit completed-turn cutoff.
Deferred goal continuation, settings, parent questions and worker limits remain intact.
The composer can branch during the first turn, before a completed reply exists.

## 2026-11-04 — Compact activity, editable drafts and RHEL 9 deployment in 0.11.0

Implementation: `70490b8ffd8a6225ba0d3b831b5f20088b0765ce`.

The user requested collapsing intermediate command rows while retaining access to each
command's existing details. Consecutive activity now uses an initially closed native
disclosure group. Its summary keeps running, failed and stopped counts visible; chat
messages and request controls stay in their original order. The user also requested
typing while a question is displayed. Draft editing is separate from send readiness,
with newline behavior while blocked and protection against an older send acknowledgment
erasing newer typing. Native/backend request protections and answer confirmation remain
unchanged.

The user approved an Ansible playbook for genuine RHEL 9, automatic systemd startup with
an unprivileged application process, and reuse of an existing Codex/Beads profile. A
first OS guard runs before target changes; the maintained installer handles application
files. The playbook protects existing auth, profile paths, native services, unrelated
units and local Git work. It verifies application health and version without
provisioning a fresh agent environment.

## 2026-11-04 — Explain coordinator progress through named outcomes in 0.11.1

Implementation: `a75515d093660ab6ac2aafb047b3adc80c674e8d`.

The user found recaps dominated by unfamiliar task IDs, idle state and stored
closed-record bookkeeping unhelpful. Coordinator reporting guidance now leads with the
useful outcome, names the actual work, identifies unfinished work and states a specific
blocker or next action. It distinguishes implementation and publication from deployment
and live verification. IDs are supporting references beside names only when requested or
needed in an internal handoff. Routine idle, closed-record and no-approval notices are
omitted unless relevant to the question or an actual problem; unchanged evidence needs
no new bookkeeping recap.

The same guidance reaches initial/restored native instructions and each event reminder,
including existing coordinators that retain earlier tool descriptions. Worker report
requests now ask for named work and concrete results. Sidebar summary, blocker and
nextStep fields have separate purposes. Existing identity, message/report limits,
request controls and approval policy remain unchanged. No new model provider, task
store, service or output-rewriting mechanism was added.

## 2026-11-04 — Expose and continue review of every delivered request in 0.12.0

Implementation: `2f8a45ad9846ea9799112395cb9effc4bf945a36`.

The user reported the coordinator detecting one request when four were open. Source
inspection found the backend already stores a full request array.. The change makes that
list explicit to the coordinator with requestSummary counts, including the distinction
between a native request and its nested clarification questions. Each independent review
now returns the current remaining requests and counts, including requests received while
an earlier answer awaited confirmation.

A referral to the user leaves that exact request open while other eligible approvals can
be reviewed. Remaining unreviewed approvals stay marked in the existing event scheduler
after a referral or native resolution. Requests already referred to the user or showing
answer errors do not cause repeated automatic review. New/restored instructions and
event reminders require inspection of the whole list and rechecking before finishing,
independently of the existing one-message/report limit. Each approval retains its own
current token, exact user authority and native resolution confirmation. No bulk
approval, extra service/store, changed permission policy or automatic native rejoin was
added. Counts cover delivered request details, not a guaranteed total of native requests
whose details have not reached this client. Incomplete actions remain manual.

## 2026-11-05 — Save two-bullet decisions and non-approval feedback in 0.13.0

Implementation: `36f5eff4e66283314e4749fd82bcdcea3c07d819`.

The user explicitly requested Git-saved instructions and a direct message to the
existing coordinator. A shared decision policy now requires exactly two bullets per
request: a high-level action/target/effect summary, then the real outcome and rationale,
each at most one or two sentences. Vivid Unicode markers distinguish request, approved,
declined, needs-user and unconfirmed states alongside explicit words. Raw code is
excluded from the user-facing request summary; exact native actions, current tokens and
authorization evidence remain in the review tools. The same policy is present in
new/restored instructions and each event reminder.

The user also requested feedback to workers after non-approval. Instructions use the
existing bounded summary channel, combining results per worker and explaining an easy
permitted alternative or waiting for the user. This is model guidance using an existing
tool, not a new guaranteed notification transport. Pending requests remain open;
feedback waits for native resolution and safe idle. It never authorizes bypassing
controls, changing credentials, expanding scope or automatically retrying a refused
action. Delivery acknowledgement/errors must be reported honestly. No tool schema,
service/store or approval authority changed.

## 2026-11-05 — Raise worker capacity to sixteen in 0.14.0

Implementation: `d69bbb9ebead227e107869e33e72ab80b68efb27`.

The user requested a sensible increase from the four-worker limit. Sixteen worker tabs
give room for several projects and branches while retaining a bounded workspace. The
coordinator remains separate. One shared limit now controls the browser, native
open/create/fork guards, parent navigation, coordinator instructions and private
workspace save/restore. Existing saved records need no migration. Native subagent
concurrency, worker permissions, coordinator restrictions and the scrolling tab layout
are unchanged.

## 2026-11-05 — Make worker reports, tasks and branch reviews usable in 0.15.0

Implementation: `af85de795c2339b64bf72e1256cc656d763491a6`.

The user requested per-worker report timing, meaningful state totals, all tasks instead
of a three-row preview, and answering task questions without copying text into chat. The
existing private workspace metadata now holds only report cadence; existing safe-idle
delivery schedules bounded status requests. Never is the default, restoration starts a
fresh delay, pause/native questions/work prevent delivery and failures require an
explicit settings change. Instructions require vivid named outcomes, project
release/publication evidence and structured clarification tools when available, without
changing native feature flags. All active linked tasks are visible with
dependency-derived queued state, and task-detail input uses the normal worker send
protections. Beads remains the single task store and the working agent owns status
updates.

The user approved full Markdown/GFM through react-markdown and remark-gfm with raw HTML
disabled. Tables scroll, links retain safe scheme filtering, code stays literal and
remote images do not fetch automatically. The parser packages were installed from
verified existing public cache content. Existing auth and CSP remain intact. The user
also requested branch summary review inside the child tab so it does not block
navigation. Reviews stay mounted while switching tabs, retain edits and remain explicit
send/archive actions. Failed parent delivery names the parent and explains how to
resolve its request, without answering it.

## 2026-11-05 — Inspect approval helpers and queue due reports in 0.16.0

Implementation: `4248900ba0629b4400dd281755f0352f63870c59`.

The user approved read-only inspection of helper source tied to a specific pending
approval, including temporary Python files outside a worker project. The existing
coordinator now has a bounded source-only tool requiring the exact current token and a
visible script reference or explicit Python import/search directory. It never
imports/runs the code or reads credential/Vault data. Sensitive paths, symlinks,
non-source/oversized files and obvious embedded credentials are refused. Inspected
command/source hashes are checked before approval; changed evidence requires rereading.
This detects changes until the check, not a lock against later changes or proof of
safety. Unresolved dependencies/effects still need user review. The native read-only
sandbox and exact authority/confirmation rules remain.

The user clarified that report input can queue while a worker is busy. Due reports now
enter the existing queue during active work or native questions, with visible
queued/generating state. One outstanding report coalesces missed intervals. Normal
delivery gates prevent interrupting/answering questions; Never cancels an unsent
schedule and completion starts a fresh delay. The user also capped the task list at
three visible rows while preserving scrolling, all records and full totals.

## 2026-11-05 — Answer current native user requests and request reports in 0.17.0

Implementation: `63c5cf173eef5c295c8041e3151e29b933fc167c`.

The user broadened request support from MCP/permissions to all user-facing native
blocking requests. A shared current-protocol catalog now drives worker-specific cards
and backend responses for supported MCP primitive forms, external actions and exact
native-requested turn-scoped filesystem/network access, alongside existing
clarification/command/file controls. Unsupported schemas, legacy and unknown
approval-style callbacks stay visible instead of being automatically refused. Internal
token/attestation exchanges remain internal. External steps require an explicit browser
action and completion; unsupported answer formats still require the native client.
Policy-changing command choices remain native.

Manual grants cannot inject extra permissions or a session duration. The coordinator
remains unable to approve MCP/permission requests or broaden its own restrictions
through manual controls. Typed IDs, exact worker identity, native confirmation and local
per-request answer state are preserved.

The user also requested Report now immediately after Never. It queues the existing vivid
report prompt without changing cadence, including when automatic reports are disabled.
Existing requests coalesce; active work/questions/pause/ handoff gates remain, with no
interruption or automatic request answer.

## 2026-11-05 — Give workers model controls, room and report ownership in 0.18.0

Implementation: `9aed87fb843463d3ec9cb23a27a21e87bef8cbce`.

The user requested model/effort controls under Worker specific settings. Native
model/list provides actual supported choices, and thread/settings/update changes only
the selected worker's model/effort for subsequent turns. Native metadata and
notifications confirm the saved state, including late confirmation after a missing
acknowledgment. Current work and questions remain intact; no global settings,
permissions, new agent loop or provider abstraction was introduced. Unsupported native
settings operations fail visibly.

The user requested a movable boundary to reclaim chat space. A bounded desktop divider
adjusts both columns and saves the width in existing browser preferences, with pointer
and keyboard controls. The coordinator follows the chat edge before Add agent; chat text
no longer has its fixed character-width cap. The version badge moves into the composer
footer at its existing font size. Mobile remains stacked. A consistent six-pixel task
gap preserves the three-row viewport.

After discussing timers and native capabilities, the user explicitly rejected CCNG's
recurring report clock. That choice supersedes the earlier timer design: radio changes
send one Standard Task Report interval instruction, replace an unsent older setting, and
Never asks the worker to cancel its recurring reports. The worker owns timing using its
runtime capabilities. CCNG recurring polling, due-time state and repeated report
reminders were removed. Startup Markdown holds the named report function and format.
Report now remains one explicit request; exact native client identity hides only its
owned prompt from rendered chat, preserving native history and actual user/report
messages. Restoration restores selection without replay or model turns; a stopped worker
is not woken. Existing private cadence metadata and delivery/request gates are reused.

## 2026-11-05 — Keep coordinator helper reviews proportionate in 0.18.1

Implementation: `ab05d4fb17544a9918dea7df2502b943f062a9b5`.

The user asks for direct helper source inspection without a routine recursive review of
dependencies. Coordinator startup/restored/event guidance now covers startup statements
and called functions, and asks for concrete unresolved concerns rather than treating an
unread import as sufficient reason for referral. Source is evidence, not authority; the
rule does not approve an action or expose data.

Inspection also found an older saved coordinator without the newer helper tool in its
native catalog. Its existing source-reader entry point now uses the same approved
helper-source validator for outside-project helpers directly referenced by current
command approvals. It returns every exact request/token binding and records
source/command hashes for independent later review. No pending command means no
outside-helper read. Existing stale-source, sensitive-data, symlink, execution and
permission restrictions remain. This preserves the conversation and history without
rewriting native state or introducing another tool service.

## 2026-11-05 — Manage local Claude and keep worker context compact in0.19.0

Implementation: `d7d83b883a82dd73fae52e53d3d38b6ef82041af`.

The user selected the official Claude Agent SDK for local read-write sessions. The
existing backend now uses SDK0.3.212 and the installed native CLI to discover headless
conversations, follow history and manage streaming/follow-ups/interrupts. No remote
session transport, auth replacement or permission-default change was introduced. Active
external processes retain ownership; managed SDK callbacks are manual and tied to exact
requests. Closed-tab requests offer explicit reopening. Closing a tab keeps its process
alive; backend shutdown ends SDK-owned processes and preserves native history. Native
idle events, serialized startup and read-only restore retry prevent duplicate processes
and incorrect turn/connection assumptions. Claude branching and restart persistence of
managed-process model settings remain outside this version.

The user requires shared environment AGENTS at runtime. A small local reader supplies
the full bounded named source through existing native context, reporting missing sources
without fetching or inventing rules. Codex gets context on app-started turns and Claude
at process startup. Higher-priority roles remain in force. Matching native source showed
the coordinator's old V1-only no-subagents flag was insufficient, so coordinator-only
canonical/V2 restrictions were added.

Ordinary-chat fallback questions reuse existing worker-owned Beads input records and
context/reply controls. Explicit labels and exact worker/task IDs avoid punctuation
guesses, fabricated native requests, extra model classifiers and a new question store.
Polling exposes recorded questions before a turn ends; only the worker resolves them
after actual answers/withdrawal. Coordinator reads have the complete subset and separate
native/nested clarification counts.

The installer now offers confirmed fresh native Beads/shared-Dolt setup for an explicit
workspace, preserving existing trackers/settings. Official Dolt2.2.0 archives are
checksum verified and installed under the selected unprivileged target. No custom Dolt
service wrapper or development-host setup was introduced.

The user restored a90ch maximum text width, removed task assignee presentation,
requested natural task heights/first-three-row viewport and one-line Model/Effort
controls without routine explanatory text. These preserve sidebar resizing, narrow-pane
wrapping, actual error feedback and backend ownership metadata.

## 2026-11-05 — Resolve approval helpers from native command cwd in 0.19.1

Implementation: `16006bccd4d7c17498ba26efed32d7b01ef46e51`.

The existing reader looked under the worker directory before checking pending approvals.
A command running in another repository could therefore produce ENOENT or inspect a
same-named worker file instead of its own helper. Both readers now use the exact native
approval cwd, falling back only when omitted or null. Literal relative source
references, including quoted subprocess argv entries, match equivalent absolute paths
without executing or evaluating code.

Working directory is returned and saved with command/source hashes; changed cwd requires
fresh inspection before approval. The older reader checks approval references first and
refuses ambiguous cross-directory matches. Resolved hidden/sensitive paths remain
excluded even through relative input. Ordinary project reads, native permissions and
exact per-request review remain intact.

## 2026-11-05 — Validate approval citations from older native history in 0.19.2

Implementation: `3b3c868bc722c6abf7cb31b2abc2394e05fd8a0c`.

The coordinator could read a genuine user instruction on an older native worker page,
but approval validation searched only recent worker/coordinator messages. It therefore
rejected an exact native ID/quote even while the reader exposed the instruction and
current request together. Older reads now retain at most 128 native ID/cursor references
per open worker instance, without transcript text, browser metadata or additional
persistence. A recent read does not clear them. Closing/reopening the worker or
restarting requires a fresh older read.

For a cited message absent from recent context, review re-reads that exact page in the
same native worker and applies existing real-user/exact-quote checks. It rechecks
worker/request/token after the asynchronous read. Assistant text, coordinator relays and
branch summaries remain excluded; stale/missing native evidence and closed/resolved
requests are refused. Existing review authority, source safeguards, manual controls and
native restrictions remain in force.

## 2026-11-05 — Resize overview sections in 0.20.0

Implementation: `76350c8ca73166dc001a5ea79f93974e3302911c`.

The user requested draggable horizontal boundaries between right overview sections.
Worker and coordinator sections now have pointer and keyboard splitters with independent
scrolling, bounded heights, cancellation and double-click reset. When the following
section reaches its minimum, further downward dragging grows the upper section and moves
later sections down, so a short empty section does not prevent Tasks from expanding.
Existing browser preferences retain sizes across tabs/reloads without server storage.
Mobile keeps natural stacked sizes; Tasks retain the three-row default until explicitly
resized.

## 2026-11-05 — Prioritize reports and add user systemd management

Report-priority implementation: `b7856e84dc958f4e753b5d9693fca72d0c981b62` (0.21.0).
User-service implementation: `391a1f2fa57f5e324c4f22db3ce6688a86a45111` (0.22.0).

The user requested prompt due/one-off Standard Task Reports and a user-level service
instead of foreground Ctrl-C. The shared report definition now requests known-evidence
reporting at the next safe checkpoint before more project work, then resumes. It is
loaded from the installed worker-instructions.md on backend startup and supplied to
workers and coordinator without adding worker-write authority to the coordinator.
Priority requests precede unsent summaries and use native Codex steering or owned Claude
streaming next-priority input. Native blocking requests, pause/handoff, queue
bounds/coalescing, failed/in-flight messages and external session ownership remain
protected. No automatic tool interruption or recurring CCNG timer was introduced. Native
checkpoint/admission limits still apply.

The maintained launcher now installs and controls an owner-only systemd user unit with
explicit install/start/stop/restart/status/logs/enable/disable/uninstall. It preserves
supplied runtime options and non-secret profile/PATH variables; reinstall without
options preserves an owned unit. Unrelated/symlink units are refused. Installation
reloads the user manager; start/enable are separate, allowing deliberate foreground
migration. Lingering and native daemons are unchanged. The live unit directory is
outside this session writable roots, so normal-terminal installation remains pending
rather than claimed deployed.

## 2026-11-05 — Show message times beside authors in 0.23.0

Implementation: `45c2ac9df9d73df5a1aa64ccf3ad44a3d33da4bf`.

The user requested author/time headers such as Codex | hh:mm. Conversation headers now
show a browser-local24-hour clock for user, Codex, Claude and Coordinator messages, with
full date/source tooltip. Native Codex item start times and available Claude native
message times are preserved. Completion-only times are a fallback for untimed history,
not a reason to move an existing live receipt time. Live received/sent times remain
stable through streaming, final replacement and same-ID history refresh; native start
time can supersede them.

Historical items without an available timestamp show an unavailable marker. The official
Claude SDK history interface can omit timestamps even when native JSONL has them; no
direct transcript parser, inference from reload time or new timestamp store was added.
Existing native history/permissions remain intact.

## 2026-11-05 — Copy controls, concise coordinator concerns and branch return in 0.24.0

Implementation: `39b976a3f1c11db49ce36bef78a1e9a8163f91a7`.

The user requested copying complete messages beside Branch here, separate code block
copying, and a simpler icon-style logo. Browser clipboard controls now copy exact
message/code text with visible success/failure feedback and accessible labels. Supported
legacy copying is used only when the browser clipboard API is absent; native permission
rejection is not retried. The generated cyan tower icon replaces the header/favicon
asset; the reproducible prompt is documented.

The user found non-approval feedback too long and complicated. Saved coordinator
instructions, event reminders and the actual rationale tool-field description now ask
for the action, concrete concern and needed decision/next step in two or three short
lines, usually about sixty words or fewer. Worker approval cards preserve those line
breaks. Existing rationales are not truncated or rewritten; review evidence, permissions
and outcome distinctions remain authoritative.

A restored child displayed as idle could fail handoff because native notLoaded was
rejected by the summary guard. Explicit summary/return now activates through the
existing native resume path and rechecks the actual state before proceeding. Restoration
alone remains read-only. Named errors distinguish child questions, active responses and
unavailable sessions, while parent errors retain their separate identity. Native
requests are not answered or bypassed to return a branch, and confirmed delivery/archive
retries remain protected.

## 2026-11-05 — Retain Beads tracker routing in user services in 0.24.1

Implementation: `a7670529bc996896ecead487fb0a00679b6cbdbc`.

Installed-app task reads failed with no Beads database while worker CLI commands could
resolve the existing shared tracker. Read-only inspection found that the user unit
retained PATH but omitted the terminal/agent tracker routing. Service generation now
explicitly preserves supplied BEADS_DIR and BEADS_DOLT_SHARED_SERVER, without choosing
another database, copying credentials or initializing/migrating a tracker.
Reinstallation without runtime options continues to preserve the old unit; explicit
registration refreshes it.

The Tasks header now withholds totals until the tracker is ready. A failed Link tasks
lookup says loading failed instead of suggesting there are no matches or work should be
created. Existing error detail, input/save guards and conversation associations remain
unchanged.

## 2026-11-05 — Clipboard images and saved report instructions in 0.25.0

Implementation: `a4c30659cf7150d777e9f767738721bb6b2e7196`.

The user approved Ctrl+V image input and memory-only unsent drafts. The composer now
shows removable previews and supports image-only or captioned messages for local Codex
and managed Claude. Per-chat draft IDs bind asynchronous reads and send acknowledgements
to the original chat; newer typing/images are retained. Tab switches preserve drafts,
refresh discards images, and text keeps its existing browser persistence. No attachment
database or upload directory was introduced. Native provider history owns sent image
content.

A shared limit definition bounds images to four,4MiB each/8MiB total, with supported
image signatures and canonical base64 checked before dispatch. Only the authenticated
message endpoint accepts12MiB JSON; other controls retain 64KiB. Native image history is
mapped to existing message records. Authenticated message/index URLs serve bytes while
snapshots carry references, avoiding repeated full image payloads in live events. Remote
URLs/local paths are not fetched/read. Native Codex receive capacity is bounded at64MiB
for image-bearing history. The generic nginx example permits12m request bodies; no live
proxy or host configuration was changed.

The user also reported missing periodic reports. Interval instructions previously waited
for idle and could sit behind ordinary summaries. They now share safe active-turn
priority with Report now and support explicit retry of failed settings without automatic
retries or crossing failed/in-flight barriers. Saved intervals are supplied in native
startup/new-turn instructions, so a resumed worker can reconcile its cadence without
another radio change or chat replay. Read-only restoration, native questions, pause,
permissions and ownership remain protected. Agent-managed timing stays selected; no CCNG
report timer was added. A one-time prompt/saved radio does not prove real recurrence.
Codex can use available timing while active; a documented app-server idle scheduler has
not been established.

## 2026-11-05 — Silent CCNG report timer and startup recovery in0.26.0

Implementation: `09b9f37bcbc11c47a92a543713c62e03dd55da69`.

The user explicitly replaced agent-owned reporting loops with a CCNG timer and required
silent internal communication in worker/coordinator chat plus automatic startup use of
saved intervals. The existing coordinator backend now owns one shared timer and
per-worker deadlines using the existing private workspace settings. Enabled restored
sessions queue one initial report after restoration, then continue at their selected
interval. Refresh/reconciliation is idempotent, interval changes reset deadlines and
missed slots do not cause report bursts. No coordinator model call is made per timer
tick or scheduled-report completion.

Reports reuse native queues and safe active-turn delivery. Pending requests, pause,
ownership, availability, permissions and handoffs remain protected. One report is
outstanding per worker; Report now coalesces with timer work and survives Never.
Failed/in-flight requests are not silently retried/discarded. A new live completed
four-section Standard Task Report can release report bookkeeping within a long-running
turn, allowing later intervals without ending the job. This bounded recognition changes
no task status or approval authority; stale, partial, quoted/code and unrelated-turn
content cannot satisfy it. Native turn completion remains the fallback.

Internal inputs are hidden in CCNG presentation using native client IDs/typed text
metadata and official Claude SDK synthetic inputs. Those inputs still reach the model;
native history is retained. Actual reports, ordinary summaries and identical real user
text stay visible. Workers receive one-off report semantics and cancel older agent-owned
report loops to prevent duplicate timing.

The user separately rejected an additional Claude daemon/service after a read-only
SDK/native lifecycle assessment. Current SDK queries still stop with CCNG; saved history
is not uninterrupted execution. Native background commands exist, but supported local
SDK detach/reattach is not established. No lifecycle service, detachment workaround or
runtime change was implemented.

## 2026-11-05 — Current startup dashboard and report intervals in0.27.0

Implementation: `cfb0484f8b27670fc89a232a6a0e1b4a759d3bfa`.

The user requested current worker summaries/task progress after startup and visibility
of required report intervals. After saved-state loading, the backend queues one silent
startup report per restored worker, including a one-off for Never. Existing timer or
Report now requests are reused without changing saved intervals or deadlines.
Reconciliation remains idempotent, and Never continues to disable periodic reports
rather than this explicitly requested startup summary.

The coordinator is notified to read current native history, stored tasks, questions,
report intervals and next due times. It publishes available evidence to sidebar progress
immediately and applies finite throttled updates as each fresh startup result arrives.
Blocked/external workers do not gate others. Paused/unavailable coordination retains its
intent; failed native requests stay visible without automatic retries. Startup status is
separate from actual work completion and Beads task state.

Git-saved prompt guidance tells new/reused coordinators to use progress tools, qualify
missing evidence and avoid instruction echoes, duplicate requests and chat recap loops.
Worker overview cards display saved1h/15min/5min/Never or Unknown. No new service/store,
interval inference, worker implementation scope or native permission expansion was
added.

## 2026-11-05 — White airport control tower in 0.27.1

Implementation: `8b9e520996af082c27379d72ad803d144289c236`.

The user rejected the cyan icon and requested white artwork with a recognizable airport
tower. The shared header/favicon PNG now depicts a wide three-window cabin, projecting
roof, tapered shaft and base on the existing graphite background. Transparent generation
attempts had rough edges and window artifacts; the clean opaque result was selected. The
final prompt and built-in generator provenance are documented in docs/brand-assets.md.
Previous integrated icons remain tracked or recoverable in Git history. No runtime
logic, dependency or service ownership changed.

## 2026-11-06 — Schematic operations-console icon in 0.27.2

Implementation: `942fe35dcb905993b7f1ada55585243402ef5980`.

The user requested an operations-center symbol instead of a tower: a curved control
console with switches/buttons and a matching arc of monitors, very schematic. The new
shared header/favicon PNG uses three blank screens and three button marks in white on
the existing graphite background. The built-in image generator produced the asset; its
exact prompt is in docs/brand-assets.md. Earlier integrated icons remain available in
Git, and the white tower's prompt was preserved. The image reference variable now
describes the brand rather than a tower; rendering, accessibility and layout behavior
are unchanged.

## 2026-11-06 — Preserve the accepted icon and remove its background in 0.27.3

Implementation: `1a39c45bf5e1146e8f9a28c16a78fbd38a95d11a`.

The user approved the console design but required a transparent background for the very
same icon. Two built-in generative background edits introduced speckles and changed
negative spaces; neither was integrated. The user then approved a direct pixel
conversion using existing Node.js standard-library tooling, with no tool installation or
application runtime helper. The original dimensions and foreground contour were
retained, opaque foreground RGB was preserved, and dark negative spaces now have alpha
zero. Edge alpha is described in the brand notes. The original image and generation
prompt remain recoverable in Git.

## 2026-11-06 — Interrupt the visible agent with Escape in 0.28.0

Implementation: `1f7dc8f42a65615b9e3f7570cd8e747303b82bb0`.

The user requested Escape as a stop control. It now shares the existing Interrupt action
for the visible connected Codex/Claude turn, with a visible Esc hint and accessible
shortcut metadata. Native request and ownership protections are unchanged. Local Escape
behavior is preserved for dialogs, question controls, selects, summary review, tab
dragging, resizing and text composition; modified, repeated and in-flight duplicate
interruption requests are suppressed. Drafts and other tabs remain untouched.
Interrupting does not undo completed work.

## 2026-11-06 — Add three themes and task attention controls in 0.29.0

Implementation: `f11242fe1080b4212055ee24a4ce61e7d21d1854`.

The user chose classic, contrastful and light themes. Classic preserves the original
palette; the other themes address measured weak text and control contrast. A compact
palette menu uses existing browser preferences. Logout follows the branding, while Add
agent and its count form one group.

Tasks needing real input appear first, with dependency-waiting work remaining Queued.
Ordinary recorded questions now appear once in Tasks with a Question label. Native
requests stay in Open questions. Input dialogs show explicitly recorded context, input
type and exact input needed, with truthful clarification for older vague records. Worker
instructions require those description fields.

The user approved per-task Notify me controls, after the state near the title, with
in-app alerts and optional native desktop notifications. Existing live snapshots supply
observed transitions; subscription IDs use browser workspace preferences rather than a
new service or database. Initial/restored observations are baselined, not replayed.
Missing records are not completion evidence. Worker-level requests/errors remain
worker-scoped when task ownership is unknown. Desktop permission is requested only
through a user gesture, desktop text stays generic, and in-app alerts remain usable when
desktop access is unavailable. Delivery requires the page to remain open; cross-window
deduplication is absent.

A deployment-focused report had omitted a delegated audit. Saved instructions now
require every active workstream, including delegated audits, research, documentation,
verification and publication, without extra commands solely for reporting. Concise
grouping must not silently omit unchanged active work.

The user also approved native Goals execution with CCNG controls and made native Goals a
requirement for future full managed integrations. The reference and project guidance
record that choice.

## 2026-11-06 — Prioritize coordinator input needs in 0.30.0

Implementation: `ed2b4738c5c4db3e0073e8f27bb5bd1c4b32afb6`.

The user values the coordinator's clickable project overview but wants pending input
ahead of implementation details. Each project card now places its report cadence beside
the name and shows every current Needs input task title instead of the progress recap
when such tasks exist. The label and titles use the same amber theme token as worker
task totals. The native activity badge and whole-card tab navigation remain independent.

The card reads only its worker's ready tracker and derived display states. Queued
dependencies and unavailable/stale rows do not become input questions; cards without
recorded input needs retain the existing summary/goal. The small component separates
this presentation from the application shell without adding backend state, requests,
model calls or dependencies.

The user separately deferred the remaining Claude integration work. Existing SDK
functionality remains in place; the decision does not activate unfinished provider
features.

## 2026-11-06 — Native saved approval choices for Codex

Implementation: `8d06dab79c31b714e9b622650282755eec039c65` (0.31.0).

The user requested Allow always alongside Allow once through the provider's own
permission management, then explicitly limited this work to Codex. The interface now
exposes exact offered command-prefix, network-host and native MCP-tool rules, showing
each scope before submission. Native session choices retain their own label. Ordinary
MCP forms, turn-only filesystem/network permission requests and file approvals do not
acquire invented permanent permissions.

One shared choice validator serves the interface and backend. Answers must match the
current worker/request and offered proposal; native confirmation still owns request
resolution. Codex owns saving and enforcing rules in its existing user settings, which
may affect other matching sessions. CCNG adds no permission store or settings-file
writer. The coordinator cannot choose reusable approvals or expand its own tool/access
permissions. All Claude work stays postponed.

Native save warnings are displayed for their worker, or globally when unscoped. A
resolved action is not independent disk-save proof: native persistence can fail while
the current action proceeds, and MCP may fall back to session access without a separate
client confirmation. The interface states these limits.

## 2026-11-06 — Return to the chat draft after manual approval

Implementation: `71585f27fe5a8751653245fc3bf7499297fd4662` (0.31.1).

The user confirmed this request belongs to Command Center after withdrawing an
unpublished attempt in another conversation. A successful manual Codex approval now
returns focus to its editable chat input, with the caret at the end of the current draft
and without scrolling. The native answer must be confirmed first; Decline, Cancel,
review requests and failed answers do not move focus.

The interface captures the originating input and current tab/dialog revision before
sending. A later tab or dialog change cancels focus return, including switching away and
back. Hidden pages, locked/detached inputs and another worker's composer are excluded.
Focus is never queued for a later render. Existing native permission and coordinator
behavior stays unchanged; Claude work remains postponed. No new dependency, backend API
or storage was needed.

## 2026-11-06 — Contain invisible copy announcements in long histories

Implementation: `dfc1fc68cbf58f8adbcde2e2dd549c2fed41fc6a` (0.31.2).

The user reported an outer page scrollbar and empty space below the bounded workspace.
The hidden copy-result live region was absolutely positioned without a positioned
ancestor inside the chat. Every message/code copy control emits this element, even while
empty. Such descendants can escape intervening scroll-container clipping when their
containing block is outside it, as described by the [CSS overflow
specification](https://www.w3.org/TR/CSS22/visufx.html#overflow-clipping). The installed
older version and current source share this defect.

Each copy wrapper now establishes the containing block and pins its hidden announcement
inside it. This is a small correction to the offending element, preserving live-region
accessibility and normal chat/sidebar scrolling instead of hiding overflow on the whole
document. No runtime, dependency or storage change was needed.

## 2026-11-07 — Installed configuration, optional TLS and clear worker activity

Implementation: `283692d29b8a8bdc4580f5cac0673701929431c2` (0.32.0).

The user selected HTTP as the ordinary installation/runtime default and a small
plain-text config under INSTALLDIR/etc. This supersedes the earlier HTTPS-default and
separate private-home config proposal. The installer creates commented HTTPS certificate
examples before active HTTP, accepts --prefix with a home-directory default, and
preserves existing settings, certificates and tools on updates. Foreground and systemd
startup read the same file; explicit CLI/environment settings retain priority. Full YAML
was deferred, so no parser dependency was added. Unsupported files fail safely,
including nonblocking FIFO rejection.

Optional native HTTPS validates certificate format, dates, matching private key and
browser identity, with no silent HTTP fallback. An omitted listening host selects the
Linux default-route IPv4 interface, reports the interface/address and allows explicit
overrides. The CaC-style app playbook can create/reuse a self-signed backend pair under
INSTALLDIR/etc/certs, verify all configured backend/browser/health identities and write
HTTPS settings. All actual deployment settings remain in the encrypted private
companion. Nginx provisioning remains outside this application change.

The user ultimately required native Codex setup in both installer and deployment, with
read-only startup checks. Native commands own feature persistence. Missing, unsupported
or unsuccessful setup warns and continues; the development-feature caveat is retained.
Deployment may provide the pinned CLI locally when absent. No direct native TOML edits,
warning suppression or automatic daemon/worker restarts were added. Existing logs remain
stdout/stderr and systemd journals.

A compact fixed chat header identifies the current chat and its browser-local
four-colour choice on the left, with Codex receipt/activity/connection information on
the right. Receipt is confirmed only after native acknowledgement. Real worker updates
and transport heartbeats remain separate; disconnected/delayed activity is last-known
and silence never invents a stuck diagnosis. This addresses input uncertainty and
mistaken chat selection without additional worker pings.

## 2026-11-07 — Resize input and shorten overview requests (0.33.0)

Implementation: `fad77316cde9e30c5bbf237694b7b8a8562d22c0`.

The user clarified that the title/colour/status strip belongs directly above the input,
below history. It now stays inside the composer, with a draggable divider that resizes
the whole input area. Keyboard controls, cancel/reset and available history bounds
follow existing divider conventions; height is saved in existing browser preferences
rather than another settings store. Upper-right branding is preserved.

The overview now begins with the project name without GOAL, and all its fonts are one
pixel larger while retaining their families and size hierarchy. Sidebar recaps aim for
20 words and permit at most 25 combined across summary, blocker and next action.
Overlong publications are rejected for correction without mutating existing progress.
Legacy long recaps keep a short, honest preview and full originals under expandable
details; questions and approval scopes remain unchanged.

The user approved Needed/Why as the default input-request format. Worker and shared
instructions require a direct question/action first, then a short reason. The task
dialog bounds verbatim legacy previews and keeps commands, background and original
records under Details. Its clarification button explicitly requests the same format from
existing workers. This changes presentation and guidance, not native permissions or AAP
deployment state.

## 2026-11-07 — Keep native approval buttons at their shorter height (0.33.1)

Implementation: `35469d671416b4a11c4d58c65898cdb0bcd6e46e`.

The user reported Allow once wrapping onto two lines and becoming taller than Allow
always. Source inspection found a non-wrapping flex row squeezing the scope-free choice
beside a longer saved-rule scope. Approval choices now wrap as whole groups, retain
their minimum content width and keep button labels on one line. Existing button padding,
typography and the shorter single-line height are retained. The scope text can still
wrap. All changes are confined to native approval layout; decisions, saved rules, click
handlers and disabled/read-only guards remain unchanged.

## 2026-11-07 — Restore HTTPS tunnel login and two-address startup (0.34.0)

Implementation: `03a4fef944856dd4f75f3c788c73229f3403eb3a`.

A user accessing the app through a localhost HTTPS SSH tunnel could not log in when
installed configuration specified the public proxy origin. The request was rejected
before password verification. Keep that public origin exact, while also accepting a
canonical matching HTTPS Origin/Host and port on an explicitly local listener with
native TLS and both actual socket endpoints on loopback. The same check covers login,
logout and authenticated mutations. No HTTP downgrade, forwarded-header trust,
certificate exception or authentication bypass was added.

The user explicitly approved default startup on exactly the one IPv4 address chosen for
the default route plus 127.0.0.1 at the same port. Explicit host settings continue
selecting one address. Both listeners share the same Node process, authentication,
sessions and workspace; failed partial startup rolls back the listeners and shutdown
closes both. Startup logs/help and installation guidance explain the two addresses and
preserved explicit host overrides.

## 2026-11-07 — Persistent colour on the input header tab (0.34.1)

Implementation: `acb3293875432387f3d864a58b6908731005dd5b`.

The selected chat colour previously affected a small marker and the colour selector's
focus outline, making identification unclear after moving focus into the input. The user
clarified that only the background of the tab directly above the input should be
coloured. Its existing per-chat value now supplies a persistent theme-compatible
background tint and matching border. The composer frame and top agent tabs retain their
existing styling; text sizes, status, wrapping, drafts, persistence and resizing are
unchanged.

## 2026-11-07 — Preserve line breaks in pasted user text (0.34.2)

Implementation: `37a88f337b58033504c37c3ddd20546083ecdf63`.

A user's pasted terminal output displayed as a single paragraph. The message source and
Markdown renderer retained newline text nodes, but normal paragraph whitespace collapsed
them in the browser. User-message paragraphs and list items now use pre-wrap, preserving
soft line breaks and spacing. This display-only correction keeps normal Markdown
interpretation, fenced code/tables, exact copied source, assistant formatting and stored
native history. It does not classify, execute or rewrite clipboard content. Literal
syntax and column alignment can still use the existing fenced-code support.

## 2026-11-07 — Make mobile a continuous page with bounded text areas

The user approved natural page scrolling instead of retaining the desktop's
viewport-height workspace on a phone. Worker tabs wrap, the full-width overview comes
before chat, and history/input retain their own scroll areas after about 30 and six text
lines respectively. These limits keep long conversations and pastes manageable without
clipping controls to a phone's viewport.

Implementation `bcf49e16ed80582b674c3583cc336aee3e87b8ce` (0.35.0) hides mobile resize
handles and the worker Coordinator recap, retaining the actual coordinator dashboard and
stored desktop dimensions. The same layout applies to wide landscape coarse-pointer
devices. Finger gestures no longer enter tab reorder capture; mouse/pen dragging and
explicit arrow controls remain. A measured CSS variable lets the three-task viewport
return on mobile even when desktop overview sections have saved sizes.

## 2026-11-08 — Retain user-chosen setup passwords and align supported lengths

The user withdrew the proposed shared initial password and forced first-login change.
Fresh setup uses a user-chosen password and updates preserve configured authentication.
The interactive installer already prompts for absent auth; headless staging is possible,
but startup refuses to listen without valid auth. The existing Ansible password task
requires protected input for first creation and preserves an existing private owned
profile. No first-access channel choice or bootstrap-password implementation remains
pending.

Setup accepted up to 4,096 characters but login rejected more than 1,024. Implementation
`71fa8572193901028245475fca101d85f4fc0eb3` (0.35.1) aligns creation/login at 4,096
actual characters and allows one final LF/CRLF in bounded stdin input. Oversized
replacements fail before modifying a stored profile. Existing scrypt format, ownership
checks, origin protection, sessions, throttling and cookies are retained; no password is
reset by this patch.

## 2026-11-08 — Give mobile chat more space with a compact overview

The user explicitly chose mobile only after requesting a substantially smaller overview
than the earlier layout. Desktop defaults and saved sizes are retained. Implementation
`02a8f79e4330474dc58ef81ff3f02cb21e84237c` (0.36.0) reduces mobile padding/section gaps,
puts task totals in a wrapping heading row and omits empty question sections only when
no requests or attention/recovery state exists. The same checks cover worker and
coordinator views; actual requests and input-needed titles remain visible. Static
coordinator guidance and excess project-card spacing are reduced.

Mobile worker settings start as one native disclosure row with the current cadence and
an always-visible Report now. One expansion exposes cadence radios and model/effort
controls. They stay mounted across layout changes; report queue/pending/error feedback
stays outside the collapsed body. Desktop retains the original open controls, Report now
after Never and feedback order. Both responsive Report now buttons share
delivery/disabled state, with only one visible and keyboard reachable in each layout. No
new store, scheduler or framework is introduced. Font sizes, three-task viewport,
history/input bounds, drafts and native approval handling are retained.

## 2026-11-08 — Validate pasted working-directory paths before agent creation

A trailing space in the new-agent directory made creation fail because it was passed
literally to the filesystem. Implementation `64c8b2376a3a552cff6129219f86ecebed877a1f`
(0.36.1) trims surrounding whitespace in the form and backend while retaining spaces
within directory names. The backend requires an existing absolute directory and gives
useful validation errors for missing paths, file components, embedded control
characters, excessive length and permission denial before calling either native
provider. Symlink spelling is preserved. This does not expand shell expressions, create
directories, change access controls or override native agent settings.

## 2026-11-08 — Add image selection and repair pending-request visibility in 0.37.0

The user transferred mobile Firefox image attachment and missing-request work to this
project conversation. Implementation `e3a01ba6fefa45ee6e6fcacbcf444b1a7126f96e`
completes the partial Attach image control using the existing in-memory drafts,
validation, previews and native image delivery. A native multiple-file picker avoids
dependence on clipboard image availability. Its target is captured when opened so a
later tab switch cannot redirect the selected images. Cancellation and same-file retries
are supported; a native cancel listener uses React 19 ref cleanup rather than an
unsupported input event prop. No dependency, upload service or image store was added.
Pending requests still block sending while permitting draft attachments.

Three independent request-visibility defects were corrected. Reconnect erased replayed
cards after native resume while duplicate delivery cleared them again; recovery now
retains exact current requests and their original controls. If native approval state
lacks details, explicit recovery exposes records already held by the current connection
without an unnecessary resume. Output coalescing delivers the latest snapshot at bounded
intervals, while a slow browser cannot hold up other clients.

## 2026-11-08 — Hand branch work back safely without holding the tab open

Implementation: `e7bb5e0e12d5363626609893d3d53a712baeecde` (0.38.0).

The user selected one-click Hand back & close, usable while work is running, with
background completion after leaving the tab. This supersedes the mandatory
idle-before-click and manual-summary-review steps for the new action. Back to parent
remains navigation only. The backend requests a safe checkpoint rather than forcing
interruption, checks spawned work, background terminals and native Goals, and leaves
pending permissions manual. Goal pause follows actual idle; it is not assumed to be a
safe way to interrupt a tool.

The user prioritized avoiding task or information loss. Every branch task gains the
parent label without losing branch provenance, metadata or state. Summary receipt is
verified against exact native identity, with a unique complete-message reference when
native history omits clientId. Fresh lifecycle and task-link checks precede archive.
Uncertain checkpoint/send/archive outcomes retain the branch and avoid blind retries.
Parent/child handoff serialization prevents an outgoing parent summary from racing an
incoming child result. Background closure only navigates when that exact removed branch
is still selected.

Coordination stays in the existing backend process; no new service, task store or
continuation engine was added. Restart does not replay in-memory handoffs. Unsupported
safety APIs and unresolved local work keep the branch available. A full workspace needs
another tab closed before an absent parent can open. Unsent images block handback until
sent/removed; unsent text remains local and is explicitly excluded from the native
summary.

The user separately narrowed chat colouring to a compact title folder tab attached to
the composer. Activity/connection text and the selector retain the normal theme
background. Blue replaces amber, which is reserved for attention; teal and rose expand
the palette to six. Existing amber preferences migrate to blue without changing
unrelated settings. All three themes retain readable text.

## 2026-11-08 — Use native Codex Goals for clarified work

Implementation: `2ea1956c8ff83425e414ec8f5b92eeb6a80f97a0` (0.39.0).

After discussing provider differences and a concrete release example, the user selected
implementation with clarified Goals announced in chat. Codex owns execution, persistence
and continuation; Beads owns task outcomes, finish checks and dependencies. CCNG adds
native status and start/pause/resume/clear controls, with explicit replacement
confirmation and no new Goal store or dispatcher. Newly authorized clarified worker
tasks can use native Goal tools; ordinary questions, reports and backlog creation alone
do not activate a Goal. Preserve an unfinished Goal, native accounting, user pause/clear
and real scope. Reassess ready authorized work after actual task-state changes and use
native parallelism where independent work permits it. Claude implementation stays
postponed.

The user selected an exact three-line announcement: New Goal, Task title and Beads ID.
Only confirmed creation uses that message. Labels use active-task blue and values remain
normal escaped text. Rendering is opt-in for worker assistant messages, preserving
native source/copying and raw-HTML exclusion.

Review identified stale UI confirmation, old native reads and delayed HTTP responses as
concrete risks. Controls now compare the displayed objective, creation time and budget
against fresh native evidence, preserve newer native state/errors, and invalidate old
replacement confirmation. Branch handoff and Goal mutations are guarded against
conflicting operations. Native APIs provide no atomic cross-client comparison; no such
guarantee is claimed.

## 2026-11-09 — Withdraw native Goals and add silent task checks in 0.40.0

The user withdrew the Goals idea and implementation after learning that one conversation
can have only one active native Goal. Per-task Beads objectives were not equivalent to
independently active runtime Goals. Earlier approvals for Goal controls, automatic
creation/announcements and future harness requirements are superseded. Existing native
data remains untouched; the implementation Goal was paused before withdrawal. Only the
existing branch handoff's narrowly scoped continuation read/pause safety remains.

The user separately selected a fixed fifteen-minute controller nudge asking workers to
review neglected tasks and independent parallel opportunities without conflicting writes
or resources. Reuse the existing coordinator backend clock, queue and native input path
rather than introduce another execution engine. Known active Codex turns use native
steering at safe checkpoints; requests, pauses/stops, ownership, unknown turns and
handoffs retain their guards. Outstanding unsent checks coalesce. Confirmed native
acceptance allows the next scheduled check, without claiming that the worker has
completed it. Failed or uncertain sends are not automatically retried, startup starts a
fresh interval and missed cycles do not burst. Claude work remains deferred.

The coordinator displays “Next chat task-ping to send” with the next local time. Typed
native message identities keep triggers hidden across history reloads without hiding
real user lookalikes or useful worker responses. Routine checks do not fill the
coordinator's delivery history or wake its model for an echo. Existing report intervals
remain independent; Never applies to reports only. Ordinary task outcomes, lifecycle
updates and ready-work guidance stay in Beads.

Asynchronous activation and instruction loading can race a user stop, handoff or
Coordinator pause. Recheck the same current identity, ownership and lifecycle
immediately before native delivery; active task checks must steer only the known active
turn and never fall back to starting another turn.

Implementation: `43780d183436cf05d862ffe96927872ddc084c38`.

## 2026-11-09 — Bound the desktop overview and anchor settings in 0.41.0

The user requested that the overview use its available browser height without extending
it, keeping report/model controls at the bottom while tasks and questions may scroll.
The previous whole-sidebar scrolling let long content or saved section sizes push those
controls below the visible pane.

Worker overview sections now put upper content in a bounded scrolling group and keep the
final settings section outside it. The sidebar fills its pane; settings are capped to55%
of the available section height and scroll internally when short windows or long
feedback require it. Existing adjacent resize, keyboard/cancel/reset controls and saved
sizes are retained without rewriting preferences. The coordinator retains all content in
its scrolling group. Mobile restores normal flow, including wide coarse-touch layouts,
preserving its continuous page and compact settings. No native behavior or storage
changed.

Implementation: `fcbf2031155a32f609660f69f22250e700bce932`.

## 2026-11-09 — Protected browser setup, native scopes and truthful report status

The user selected first-browser password creation behind enforced htpasswd and rejected
a temporary setup code. Release 0.42.0 implements that choice with an explicit
disabled-by-default htpasswd-proxy mode and exact HTTPS public origin. Operators must
protect all proxy routes and restrict backend access; the setting cannot verify
infrastructure or proxy credentials. Local operators retain the existing password CLI.
Existing valid passwords are preserved, corrupt or unsafe files fail closed, and atomic
no-replace creation prevents concurrent setup from changing the first successful
password. Installer output documents both paths; no default password, new auth service
or setup token was added. Ansible/proxy integration remains with the separately owning
deployment work.

The user also requested every native approval choice. Installed Codex protocol supports
session file approvals without an explicit availableDecisions field; CCNG omitted that
fixed-schema choice. The fallback now includes it while honoring explicit restrictions.
Exact filesystem/network grants offer native turn/session scope for manual user
selection, superseding the earlier turn-only presentation. Allow always remains limited
to actual native saved-rule choices. No permanent file/permission grant, local
allow-list, direct settings writer or coordinator permission expansion was introduced.

A user report of a missing AAP task report revealed two misleading states: delivery was
labelled generation, and an ordinary completed turn could claim a report was ready
without recognizing one. Feedback now describes waiting for a response, and absent
recognized reports produce an explicit error. Existing response records also handle
report/turn completion before delivery acknowledgement. No new retry, timeout,
scheduling loop or interruption was added. This corrects source defects but does not
establish the original live delay's cause.

Implementation: `bd3212a95fbc5ed116f8630c860b9aae79b37c90`.

## 2026-11-09 — Prepare a fresh agent workspace through Ansible

Implementation: `1b3c074029646c3224bbc98a6c4905741e8bcbb0` (0.41.1).

The user selected the maintained default application installation directory, the newest
application source at each deployment and a separate `~/ccng-wd` agent workspace. A
fresh default workspace receives its own native Beads tracker; updates preserve the
selected existing tracker and authentication. No AAP demo repository checkout is
required. Existing explicitly configured paths remain supported, so an unrelated
production installation is not migrated implicitly.

The deployment now creates only a missing private workspace and delegates its first
initialization to native `bd init`, preserving agent instructions and Git hooks. Partial
trackers, inherited routing for the new default workspace and conflicting user
configuration stop without resets. Beads retains ownership of its shared Dolt server; no
new CCNG server wrapper or persistent ownership file is introduced. Compatible existing
Beads and Dolt programs are retained. Missing target tools use the maintained
installer's pinned package/archive versions through native package/download modules,
with private temporary staging and cleanup. Compiler RPM prerequisites are included in
approved package setup. Application password setup is unchanged and remains a separate
dependency.

The maintained Beads 1.3.2 initialization source confirms that the prefix can default to
the directory name and native setup may create local Git metadata. That is distinct from
requiring an AAP demo source checkout: no remote, task import or existing tracker is
supplied. Native defaults are retained without adding alternate tracker routing.

## 2026-11-09 — Respect Never during startup dashboard refresh

The user observed a report in a Never worker. Native history confirmed the trigger was
the previously selected one-off startup dashboard report, not the recurring timer. The
user explicitly changed that choice: Never now excludes all automatic reports, including
startup. Report now stays a manual one-off; stored summaries, tasks, input needs and
schedule information still populate the dashboard without requesting a worker report.
Separate task-attention checks remain unchanged.

Implementation marks startup reports with the existing automatic provenance so selecting
Never can cancel unsent automatic rows while retaining explicit manual requests,
uncertain/error rows and in-flight work. Enabled startup/cadence coalescing remains.
Review found interval changes could erase the visible reason for a retained uncertain
startup delivery; that reason now remains in both worker and dashboard state. No native
cancellation, new timer/store or automatic retry was added. Already delivered report
requests cannot be withdrawn by this setting.

Implementation: `ea9d91719f1faca8e308e266e648bfa19060f798`.

## 2026-11-09 — Require the protected frontend before Ansible deployment

Implementation: `ec10ae0d4207079c382803621010f100e5e81635` (0.43.1).

The owner requires htpasswd protection before every CCNG AAP deployment. The existing
playbook now checks its exact configured HTTPS public origin before managed target
writes. A single unauthenticated request must receive HTTP 401 with a Basic challenge,
using normal certificate verification and no redirects or automatic netrc login. Failed
frontend verification stops deployment rather than exposing a fresh application. Proxy
provisioning and restrictions on all routes/direct backend access remain the
infrastructure owner's responsibility; the probe does not claim to establish those
complete network boundaries.

The application already supports explicit protected-proxy password creation. Ansible now
accepts that existing option through its protected per-instance settings and renders it
into the installed runtime configuration. The default remains disabled. Explicit
browser-first mode leaves a missing auth file for the user's first protected browser
opening; it creates no default password or setup code. Existing valid auth remains
validated and preserved, and unsafe files are refused. Backend/UI auth code, the
installer and native daemon ownership stay unchanged. Default latest-source,
installation and fresh agent workspace behavior are retained.

## 2026-11-09 — Preserve workspace context and show native request content

Implementation: `85517d8b3d461f1cdaea9d80fb0f85a90ec6b365`, integrated with the
protected-frontend deployment patch and message-question display in
`af453b2c1b6f11b15f0e0661312af63dc57445cc` (0.44.0).

The user approved whole-turn Codex Edit and rewind. A preview and explicit confirmation
use the supported native revert operation, refresh retained history after
acknowledgement, and restore original text to the normal composer without sending it.
Existing drafts, busy work, questions and handoffs remain protected. Files, tasks and
permissions are not rolled back. Finer boundaries remain deferred; the native API cannot
prevent another client racing the confirmation.

The user approved private durable coordinator decision summaries so restart no longer
loses that display history. The JSONL file retains explanations/references, not raw
requests, credentials, authority quotes or replayable approvals. Storage failure remains
separate from the real native outcome. Older history is not automatically imported, and
normal shutdown cannot promise hard-kill durability.

The user approved persistent application logins and `--clear-logins`. Private hashed
session records preserve their original twelve-hour expiry; logout, password revision
changes and an atomic generation marker invalidate sessions across processes and
restarts. Application errors use HTTP 403 rather than HTTP 401; unavailable storage
fails closed with HTTP 503. Drafts survive implicit expiry and stale login responses
cannot override a newer sign-in. The old memory-only sessions still require one final
login during migration.

Native file paths/diffs were discarded separately from approval parameters. Retaining
bounded context on existing native-message records restores an exact worker/turn/item
view for the user and coordinator. Read-only reload, full-content fingerprints and
stale-history guards prevent another edit from supplying the reviewed body.
Missing/truncated content remains explicit; no new proposal store or approval authority
was added.

Message-only structured question titles/options were also dropped, sometimes with the
entire empty-text message. They now remain visible and reach coordinator reads. A
supported exact reply binding for this newer format was not established; the interface
directs answers to the native client without fabricated IDs or reply encoding. Existing
native server-request forms remain interactive.

Report recognition now accepts ordered coloured topic summaries and binds receipt to the
actual acknowledged delivery turn. This fixes formatting and turn-change false negatives
without treating ordinary progress, quoted text or old messages as reports.

## 2026-11-09 — Withdraw Edit/Rewind to preserve traceable communication

Implementation: `ffa76e145225f0e022ef1721c894219a313f4082` (0.45.0).

The user withdrew Edit/Rewind altogether because earlier communication and reasons for
decisions should remain traceable. Corrections and changed decisions belong in follow-up
text. This supersedes the previous whole-turn approval and withdraws individual-message
and Claude variants rather than postponing them. Native branching remains a separate
supported action preserving its source.

Remove the UI action/dialog and native mutation implementation, endpoints, feature state
and obsolete tests. Restore Copy this on user text/captions and retain ordinary input,
drafts, branching, approvals, reporting and login. CCNG can still observe an external
native history-change notification; it makes no mutation request. Such observations
invalidate stale transcript/file-approval bodies and old reads, preserve authoritative
task/request state, and show errors without leaving a stale warning after a successful
current refresh.

## 2026-11-09 — Keep input decisions independent

Implementation: `6c79c8f367cd434d6cd0aa83dd1eaa0b69e1f4ef` (0.45.1).

The user rejected a Needs input prompt that combined a Vault-source choice with approval
of configuration scope. Shared and worker guidance now asks for one independently
answerable decision/action per structured question item or ordinary Beads input record.
Alternatives for one decision remain together; separate questions can be answered and
resolved independently. Preserve exact native approval payloads, pending choices and
originating-worker ownership. This is instruction guidance, not an automatic semantic
parser or a claim of guaranteed agent compliance. No other conversation's input record
was changed.

## 2026-11-09 — Explain access protection before initial password creation

Documentation implementation: `fa2b96d18d53d188a083f526f83ba5fa1e9bff22`.

The user requested a prominent generic first-start warning without details of our
infrastructure. README and installation guidance now explain that explicitly enabled
browser-first enrollment has no pre-existing application password: the first successful
visitor creates it, so external access protection must work before exposure. Normal
startup instead refuses missing authentication. Existing passwords remain preserved; no
default password or new setup mode is introduced.

Default HTTP is unencrypted and HTTPS alone does not restrict access. Give generic
examples such as a Basic Auth/htpasswd reverse proxy or a restricted network, while
keeping the current browser-mode and deployment requirements explicit in the
installation guide. Do not imply that CCNG installs external protections or that
equivalent new authentication modes are implemented. No environment-specific nginx
settings, private identifiers or configuration were added.

## 2026-11-09 — State the single-engineer deployment boundary

Documentation implementation: `d383bc78d9b86e13288d623d87779193ac43f2f4`.

The user clarified that CCNG is currently an application for one engineer per
deployment, without multi-tenant isolation. README and installation guidance now state
this prominently. Tabs organize projects/conversations, while people using the same
backend share its runtime/account/application workspace. Separate reverse-proxy logins
restrict entry but do not create isolated CCNG users.

## 2026-11-09 — Check actual progress behind in-progress tasks

The user reported delegated calls left unchecked for hours while their tasks still
appeared active. Extend the existing silent fifteen-minute reminder and worker
instructions to inspect outstanding subagents, tool calls and external jobs using
available exact IDs, timing, returned results and evidenced progress. Investigate
stale/unknown waits promptly, collect outcomes or state the exact blocker and safe next
action; do not wait for the next ping after noticing a gap. Age alone establishes
neither execution nor an approval wait. Preserve native approvals, explicit stops, scope
and the existing silent delivery gates. The coordinator asks the owning worker to
investigate; its read-only role and exact command/file approval-review authority remain
unchanged.

Implementation: `9eb6ce5c369a36fb1db162aa2e90058d76a5f1f0`.

## 2026-11-09 — Recover diagnosed child waits through the main agent

The user supplied a successful incident-recovery sequence and requested it in existing
fifteen-minute task pings. Implementation `d1bc08be75eab274aad317b48953d0c53034cb55`
advances working code to0.46.1. The main agent checks all children and actual
external-job state, safely interrupts only a diagnosed stalled child wait while
preserving native history, findings and request context, verifies a pwd-only response
under unchanged permissions, then resumes a specific authorized next step. Real external
work, genuine pending user decisions and explicit stops remain protected. A missing job
ID does not prove no execution, and a probe does not prove job success. This is
conditional recovery, not blanket probing or a new timer/dispatcher.

## 2026-11-09 — Keep delegated native requests with their parent

Implementation `c76502dfb01070fbfda7672c3bf06043332278c2` (0.47.0) follows the user's
selected behavior: show known native Codex child requests and truthful waiting state
under the main chat using the same cards and Coordinator review path. Opening every
child tab must not be required. The source previously ignored requests from never-opened
children; native metadata now verifies lineage before actions become available.

Retain original child thread/typed request IDs, tokens, native turn/item bindings and
confirmation. Preserve exact native choices and existing manual permission limits; a
parent instruction is usable only after verified child ownership. Keep parent input
available during child-only waits. No new approval store, tab, worker slot, schedule,
automatic child resume or model call is introduced. Read-only recovery cannot replace
newer events or authorize a stale relationship.

## 2026-11-09 — Explain prerequisite and sign-in choices before setup

The same implementation `c76502dfb01070fbfda7672c3bf06043332278c2` corrects onboarding
after user-reported Git bootstrapping, disabled device login, mistaken workspace input
and missing terminal PATH. Keep the existing source installer and installation layout.
Show sudo-plus-RHEL-repository and administrator-prepared prerequisite paths before
cloning. Beads and Dolt remain consent-based upstream local tools.

Offer normal native browser Codex login by default after consent, device-code login only
as an explicit policy-permitted alternative, and deferral. Explain separate OpenAI/app
authentication and the native SSH callback. Never collect credentials, silently fall
back between login methods, alter existing sign-in or write a shell profile in this
release. Print the exact local tool PATH beside login/start instructions because child
installers cannot change their caller.

A workspace path is not a yes/no answer. Explain how to create an intended directory and
rerun with the existing workspace/prefix options and separate initialization consent.
Retain configuration, passwords and existing trackers.

Native daemon boot startup remains separate and unconfigured by CCNG. The user
subsequently requested a separate per-user Codex installation and persistent Bash PATH;
its exact location is still being clarified. That later change is not implemented or
implied by this release.

## 2026-11-09 — Keep user tools available and compact worker activity

Implementation `6877e20308a3f2e4aeb86ee9d00f1ffe249940a8` (0.48.0) follows the user's
existing home-default/custom Codex location and persistent Bash PATH request. The later
location question was unnecessary and withdrawn, not answered for the user. Missing
Codex uses the existing consent-based pinned npm method under the chosen user prefix;
compatible existing installations are retained. No native sign-in, CODEX_HOME, daemon
startup or multi-user design is introduced.

A marked Bash PATH block preserves surrounding bytes and original ownership/group and
mode, safely quotes paths and does not grow on repeated sourcing. Unsafe profiles remain
unchanged with manual guidance. The invoking terminal must source its own profile. Keep
stable launcher paths, custom-prefix retry hints and existing Beads/Dolt data. Existing
Node built-ins supply the small atomic profile helper; no additional dependency or
configuration store is required.

The user reconsidered hiding routine child activity and chose a default-collapsed
Subagents section below Tasks. Closing it releases saved expanded height. Actual child
approval/question cards remain outside it with original native controls. The overview
heading becomes Project: followed by the chat name. The user also shortened only the
existing silent task-check cadence to ten minutes; report choices, queue gates, native
permissions and conditional recovery remain intact.

## 2026-11-09 — Add optional detailed task reports (1.0.0)

Implementation `e7432ed5d4442d7608618c0d207b05636ed1c04a` adds the user's Detailed
report checkbox beside Report now on desktop and mobile. Keep the normal concise report
first, followed by every actual linked in-progress task and up to ten attributable
recent actions with evidenced timestamps and outcomes. Unavailable history, fewer
actions, receipt times and unknown results remain explicit. Task update time is not
action time; starting a tool is not success. Only this explicit request permits bounded
existing task/history reads.

Reuse the existing HTTP route and bounded queue. Upgrade an unsent request without
duplicates or downgrades; preserve the mode captured by a dispatched or uncertain send
and display truthful feedback rather than resending. Keep native questions, pause,
ownership, authentication/origin checks, silent request markers, report confirmation and
independent schedules. No new action store, service, timer, native permission or model
call is introduced. Mobile uses a natural-flow checkbox/button row below the collapsed
settings header rather than squeezing controls into fixed absolute space. The choice
remains local to the chat view.

## 2026-11-09 — Reply through the native asynchronous-question interface

Implementation `115cf9a36449b8acac3ebec21da3569b6b99d296` (1.1.0) follows the existing
conditional requirement to enable replies once an exact supported native binding is
established. Ordinary authorized Git SSH retrieved exact Codex 0.167.0 source
commit086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a. It proves the canonical
answered-question envelope uses ordinary App Server input and the original message ID
plus original zero-based question index. Earlier schema-only unsupported assumptions and
restricted source-fetch failures were insufficient.

The previous display projection discarded indices while filtering questions. Retain
original indices and privately bind the complete source content before using bounded
display text. Hash source changes and preserve the native UTF-8 question framing. Only a
live completed question in its known active worker turn can be answered; history, cold
restoration, unsafe/truncated bindings and terminal questions remain read-only. Native
emission/accepted input is not model processing or task resolution. Actual blocking
approval/form responses remain separate.

Use existing input, ownership, request and handoff guards. Partial native replies retire
only addressed identities; exact source-supported input shapes, replay and other-client
observations cannot resurrect closed editors. Browser-memory drafts and delivery/error
latches survive worker switches without persistent form storage. Uncertain sends cannot
be blindly repeated; definite size rejection permits an explicit shortened retry.
Readable question/answer display preserves raw native history and original Copy this
text. Keep Node hashing out of browser-shared code.

Automatic reports, task checks and informational summaries wait for live human decisions
through existing queues. Exact manual answers remain possible while an owned handback
waits/stops; ordinary composer input stays locked. Per-attempt observations in the
existing handoff record defer unsafe terminal/changed/missing/ unconfirmed question
closure, retaining the branch and unsent text. Explicit retry rebaselines observations.
Existing draft hints/start guard and explicit local discard prevent hidden draft loss.
No extra transport, store, daemon, timer, permission grant or model call is introduced.

Canonical native user input contains model-written question framing as well as human
answers. Approval quotes therefore match only individual actual answer strings; titles,
IDs, JSON and oversized unsupported envelopes cannot supply user authority. Existing
native provenance/current-request checks remain required.

## 2026-11-10 — Keep approval choices together and reduce unnecessary tab attention

Implementation `0223c113c2fb5ffaa18ae9ae81970348467950b6` prepares the unpublished 1.2.0
candidate. The user's phone screenshot showed a long saved-rule description separating
Allow once from Allow always. Group the buttons in one wrapping row and show exact
scopes below, with matching numbered labels and accessible descriptions when several
reusable rules are available.

The user also reserved amber agent tabs for requests needing human attention. Delivered
command/file approvals that an available Coordinator can evaluate stay neutral while
awaiting review. Referrals, manual questions, unavailable request details and requests
the Coordinator cannot handle retain attention. Native confirmation remains a separate
wait. Apply the same presentation to child requests, tab labels and the attention count;
preserve actual native status, request contents, manual controls and execution gates.

## 2026-11-10 — Automatic native detail display and one-page mobile history

Implementation `eb319b6369c63050ea022f275ccb78818aae13c3` advances the working
application to 1.3.0 and includes the unpublished 1.2.0 approval-button and tab
attention changes recorded above. The user selected one-page mobile scrolling because
the inner chat viewport trapped swipes and made page controls difficult to reach. Mobile
history now participates in the document flow; the six-line input remains internally
scrollable. Desktop dimensions and reading positions survive compact mode, same-chat
rotation and tab changes; branch-return selection continues to follow the current
conversation.

The user also rejected extra Load/Retry clicks. Delivered native file approvals now
acquire only their exact matching change item through a coalesced bounded read-only
history query. Newer live bodies, request identity, ownership and connection/history
changes protect against stale proposals. Native events show late content automatically.
Missing content remains explicitly unavailable; no answer, inferred diff or automatic
execution is introduced.

Native source inspection established that newly created children can deliver requests
before their parent activity reaches CCNG. The application previously discarded that
delivery. Retain original human callbacks privately in the existing pending map, with a
limit of 128 undiscovered requests, until fresh native metadata verifies the complete
parent relationship. Foreign callbacks remain absent from user/Coordinator views,
background counts and answer paths; there are no speculative foreign reads, additional
timers or request stores. Resolution, disconnection and changed ownership invalidate
admission. The UI uses truthful missing-detail status and removes ineffective routine
child retries. Parent reconnection remains an explicit advanced control. This cannot
reconstruct already-lost or never-delivered callbacks; automatic child resume and its
potential idle continuation remain unapproved.

The task-dialog screenshot had no recorded Needed/Why fields, so no short question
existed to render. A separate confirmed classification bug promoted all blocked work to
Needs input. Keep ordinary blocked work distinct from explicit input states/Question
records across the task panel, notifications, dialog and Coordinator card, preserving
dependency queues and original Details. No other worker's question or task state was
rewritten, and missing questions are not invented.

## 2026-11-10 — Stop treating missing native details as a user question

Implementation `62ad95f1d2d9e0bf1f52bed1fc3ed2d15db1410e` advances the application to
1.3.1. The user's post-1.3.0 screenshot showed an amber Needs your answer footer with
empty native child waits. Native attention proves neither that CCNG has a question nor
that the user can act. The footer previously used the aggregate native status directly,
while neutral helper results could still fall back to the tab's amber attention CSS
class.

Use the existing request presentation evidence for both tabs and the input header. Empty
own, child and Coordinator waits now remain neutral and explicitly say request details
are unavailable. Real delivered manual questions, permission choices, Coordinator
referrals and answer errors retain attention; eligible Coordinator review and native
confirmation stay distinct. Composer guidance no longer tells the user to answer an
absent question. Native backend states, request controls, send/interrupt/branch guards
and Coordinator restrictions are unchanged. Empty-card placement remains a discussed
recommendation, not a selected layout change, and no request is dismissed by the new
wording.

## 2026-11-10 — Reconnect eligible native waits after explicit user approval

Implementation `6947ad373f6d6f3e1d964da2844f41264ba823bf` advances the application to
1.4.0. The user selected automatic reconnection after reviewing the native resume
operation's possible idle-continuation side effect. This supersedes the unanswered
reconnection choice recorded for 1.3.1. Native metadata reads alone cannot replay an
existing request stream, so the existing five-second poll now reattaches open local
worker roots and verified known children freshly active with waitingOnApproval and no
delivered request.

Keep the original native conversation and request identities, coalesce one attempt per
connection and continuous waiting episode, and stop automatic retries after an empty or
failed replay. Exclude intentional idle/unloaded, foreign, paused/stopped, Coordinator
and handoff contexts; preserve ownership, native permissions and newer live outcomes.
The accepted race can continue existing work if a qualifying conversation becomes idle
before native resume arrives. The implementation sends no approval answer, command retry
or configuration and permission override. No new timer, persistent store or dependency
is added.

The native client now declares support for human-only command checkpoints so those
callbacks can be delivered. Their decisions remain manual, with hard Coordinator review
denial and no reusable grants. Unsupported kinds fail closed. Replayed foreign worker
tool callbacks are left with their original executor; replying or refusing them would
consume another client's real pending work. CCNG-owned Coordinator tools retain their
existing handler. Missing-details cards stay in place; their removal was not selected.

## 2026-11-10 — Read pending file details from the reconnect snapshot

Implementation `3e8cccd51942310ca5796b253ebf2f0f1512d405` advances the application
to1.4.1. A real recovered file approval still lacked proposed paths/diff. Native 0.167
source shows that patch approval and started events are transient, while paginated
durable history omits the live overlay. The approval callback retains its identity but
does not itself contain the proposed changes.

Request one descending full initial turn page on the same already-approved native resume
operation. Use only its exact current pending file item by thread, turn and item
identity, keeping original callback IDs/parameters and approval controls. Preserve newer
live records, including unavailable/non-file records. Native resume responds before
replaying callbacks, so consume its bounded page both immediately and after the existing
replay wait. A delivered card does not trigger another resume, and an absent or
mismatched proposal remains unavailable. No new timer, store, native profile or
configuration override is added; patches are never inferred from a nearby shell/tool
call.

## 2026-11-10 — Preserve request explanations and recover missing context in1.4.2

Implementation `124abacb154dcd185e09ace1064d54b658438b9f` applies three explicitly
selected corrections using the existing request jobs, source reader and private decision
history.

A delivered file approval missing its proposal may receive one guarded full snapshot
after bounded history lookup. The user approved this narrow extension of the previous
no-extra-attachment boundary. Keep exact callback/token, cwd, lineage,
connection/history and native waiting/ownership/stop/handoff/response checks; eligible
failures consume the original allowance without a poll loop. No native answer, command
resubmission or permission override is added.

The source reader previously refused generated Beads hook text because it lay outside
both project source and directly referenced approval helpers. The user selected
read-only paging of only the current Coordinator's generated hook output. Enforce its
own conversation directory and UUID filename, ownership, nonlinked regular
files/ancestry, bounded reads, concurrent-change checks and credential/binary screening.
Existing project/helper access stays unchanged; hook context is not independent action
authority. The exact previously refused file now passes this reader with contents
withheld from diagnostic output.

Native reconnect can recreate a request without its in-memory review, although the dated
concern remains saved. The user selected restoring the latest saved needs-user
explanation only for an independently current request with matching typed identity,
strong native discriminator and non-secret canonical fingerprint. Show it as an earlier
review and retain manual waiting until explicit re-review. Unavailable or newly enriched
file details do not erase that same callback's historical wait; any later approval still
needs current proposal and real-user authority. Legacy ambiguous records remain
history-only. Never restore positive approval decisions, native callbacks or answers
from the audit. A final guard also prevents an in-flight review from answering after
another review refers the request to the human.

## 2026-11-10 — Preserve complete generated-hook pages in1.4.3

Implementation `3fece96459bc4403691a623153f9e085d902a2f3` corrects an observed paging
gap in the same approved reader. The real hook file has338 mixed-length lines. Its first
nominal160-line page exceeds the16000-character limit, so a final string slice cuts a
line without supplying the next original line.

Pack complete lines under both existing bounds and return nextLine. Report a single
overlong line explicitly as an incomplete excerpt rather than claiming full context.
Restored Coordinator guidance tells the caller to follow the cursor. No path, ownership,
link, credential, execution or approval boundary changes; no new tool, input format,
store or timer.

## 2026-11-11 — Reproduce conditional On hold configuration

Implementation `6b28bc9cd7e214d9c06db6a1491436952e8be75d` adds the approved native On
hold custom status through the existing deployment workspace tasks. Preserve other
states and native data, skip an already-present value and reject unknown configuration
responses.

## 2026-11-11 — Keep agent tabs durable and recover a late native connection

Implementation `67c9bc3a192090a497d1103dd50c4cd7925475c2` follows a reboot report: the
website was running while its Coordinator, worker tabs and history picker were
unavailable. The existing private workspace file still held their IDs. Starting the
native runtime later could leave CCNG disconnected because startup made one connection
attempt; another available provider could also hide Codex's reconnect control. These are
verified source failure paths, not proof of the complete historical incident sequence.

Reuse the existing five-second refresh for transport reconnection and the existing
workspace file for lifecycle persistence. Acknowledge create/open/fork/close only after
pending metadata writes settle; sync the file and containing directory, preserve
unavailable saved IDs and drain shutdown writes. Expose a save warning without turning a
successful native action into failure or repeating it. Keep Codex reconnect available
independently of another provider and distinguish a failed history read from an empty
list. Do not change profiles or copy histories.

## 2026-11-11 — Reproduce Beads settings and its approved boot service

Implementation: `c58aad4f5327ddc39f3f796f28de2e34933d8f15` (1.7.0).

The user requested deployment/CaC coverage for the current Beads configuration and
explicitly approved an owner-level service using native database start/stop. The
existing runtime loader now accepts a nine-key string map and a strict boolean startup
option. Empty/default inputs preserve existing settings. The native CLI applies changed
values only, retaining unrelated settings, tracker identity and tasks. This preserves
disabled history-shortening settings without running maintenance or introducing a
configuration wrapper.

The optional unit uses the verified native tracker location, starts before required
database reads and preserves existing shared data. Owner checks and exact prior-unit
adoption prevent replacing a conflicting service. Privileged manager operations use
trusted system executables. Native Codex bootstrap stays separate at its already
approved safe idle checkpoint; no new daemon or startup architecture is substituted.

## 2026-11-11 — Keep blocked child tasks visible

Implementation: `b8a4d4e6f5ccb0387c0609e666bdbabd65458ef3` (1.8.0).

The user reported a blocked task missing from TASKS. The native record had its correct
conversation link, and the installed projection included it, but native blocked output
listed its hierarchy parent as a prerequisite. CCNG displayed Queued and placed it after
eight running tasks, outside the three-row viewport. No frontend task truncation was
found.

Exclude only the explicitly identified hierarchy parent from prerequisite blocking;
preserve distinct unfinished prerequisites. After classification, show genuine Needs
input first, actual Blocked work second and retain the existing stable order for
remaining tasks. Do not infer questions from prose, change another worker's records or
answer its pending native confirmation.

## 2026-11-12 — Reload unloaded native conversations before input

Implementation: `91ac24a56aafdcdc27e9c721fc43f3026f4ea6ad` (1.9.0).

The user reported that saved chats refused input with native thread-not-found errors.
Read-only native inspection confirmed that every saved conversation still existed, while
several were unloaded. A previously attached CCNG view could observe this state but skip
activation because it had been loaded before. The next input then targeted a missing
live session rather than its saved history.

Use the existing activation path when current native status is notLoaded, and observe
native close notifications. Keep background reads passive. Resume the same worker with
no model or permission overrides; the Coordinator reapplies its existing restrictions
and requires native read-only confirmation. Verify exact identity, current
connection/ownership and returned input permission before submitting a message. Preserve
pending requests, explicit stops, handoff gates and active steering; never catch and
resend an uncertain native submission.

## 2026-11-12 — Keep internal task checks free of routine commentary

Implementation: `ce44c3849b660778af27f8cd662d0f01c0cf91ab` (1.9.1).

The user reported repeated acknowledgements before silent checks. Some workers were
following ordinary tool-introduction guidance despite the existing request for silence.
Make the specific internal-control exception explicit: no opening commentary, tool
introduction, acknowledgement, plan or no-change summary, even before tools. Unchanged
held, deferred or blocked tasks are not new findings. Useful findings, failures, real
questions and substantive work updates stay visible.

Put the rule in runtime base guidance for new/restored turns and in each check payload
for already-active steering. Keep existing native history, rendering, provenance,
cadence, queues and permission guards unchanged. Authoritative and mirrored shared
instructions receive the same scoped rule; preserve unrelated drafts.

## 2026-11-12 — Enforce task-table reports and improve conversation tabs

Implementation: `9c74a68e065f107812db291362c5997a185733ff` (1.10.0).

The user requires a consistent vivid Report now overview: one task, exact coloured
status and useful outcome/next action per table row. Put the canonical format in base
guidance and every manual/scheduled/Detailed trigger, including already-active steering.
A small dependency-free validator replaces the older colour-bullet recognizer in the
existing completed-report path. Require a blank line after the table and
release/publication/deployment evidence. Empty or unavailable task lists are explicit,
without invented placeholder tasks.

Reject tables inside prose, code, quotes or comments by requiring the overview at the
start, optionally after the exact Standard Task Report heading. Invalid replies remain
visible with a useful format error; no automatic resend, hidden output or new reporting
pipeline is added. Preserve exact turn/message/native acknowledgement guards and
Detailed history bounds. Shape validation cannot establish task truth or guarantee model
obedience.

Desktop hover reveals full titles horizontally while only selection increases height.
Above six conversation tabs, counting Coordinator, use two stable grid rows and put the
selected worker row nearest the chat. Preserve saved/global order and keyed tab
identities. Keep a separate Coordinator and a native horizontal overflow strip without a
scrollbar gutter. Mobile explicitly supersedes older wrapped-tab guidance: one
horizontally scrollable row with no hover/row switching. The user's follow-up makes the
active worker/Coordinator background match its input-title tint using shared existing
palette tokens; inactive fills and status/frame rules are unchanged.

## 2026-11-12 — Fill available tab space and keep browser-only alerts

Implementation: `8283b993dbc7d8cf169c4f5030afb4efc0ec6698` (1.10.1).

After seeing1.10.0, the user confirmed tab resizing and requested normal tabs fill
available space before Coordinator while preserving the six-tab threshold. Use the
existing worker strip as an inline-size CSS container, dividing its actual viewport by
the stable column count after gaps, with a170px minimum. The hovered title keeps this
baseline minimum and may widen intrinsically; its width cannot feed back into the
viewport calculation. Mobile keeps fixed-width horizontal scrolling. Hover also
temporarily adopts the conversation's saved input-title tint, preserving frame/status
colours and restoring neutral inactive fill on leave. No observer, new setting or
dependency is added.

The user rejected the in-app Completed/Open task banners and clarified browser
notifications were wanted. Remove banner state/rendering/component/CSS and banner-only
text. Preserve Notify me subscriptions, exact origin click handling, generic desktop
payloads, deduplication and reconnect baselines. Send new opted-in events through the
native Notification API while focused as well as hidden; otherwise removing the banner
would silently consume foreground events. Permission prompts remain explicit
checkbox/button gestures; denied/unsupported states use existing settings feedback
without a fallback panel. No service worker, external delivery service or closed-browser
delivery is added.

## 2026-11-12 — Share approval analysis while keeping one final approver

Implementation: `a5e25c5f6aac4a3930334c0a29dd6738c086087e` (1.11.0).

The user selected two read-only reviewers after observed approval waits and required the
main Coordinator to keep its concern/next-step explanations and identical review
criteria. Use two bounded ephemeral native analysis threads on the existing connection.
Share the actual policy text and bounded read tools; recommendations never approve
anything. Preserve current request/user/source checks, native confirmations, manual
asks, pauses and unknown outcomes. Supply findings through existing list/read tools so
saved Coordinator conversations need no replacement or new dynamic tool. Retain unknown
work until evidence resolves it, and prune terminal ownership without a new scheduler or
store.

Fix the independent scheduling defect by retaining the earliest event wake and urgent
priority through a busy main turn. This removes avoidable timer delays; neither it nor
two parallel analyses establishes an end-to-end response deadline.

The user also requires readable verified AAP object names beside IDs. Put one shared
reporting rule in worker and Coordinator guidance, with explicit unknown names and ad
hoc purposes rather than invented templates or secret reads. A reported source-reader
refusal exposed an auth-substring filename false positive. Share one path predicate
between generic and exact-token readers, recognizing auth-specific name components while
allowing ordinary authenticated and author words; retain all other source, credential
and request protections. The original command is never executed or approved by fixing
its reader.

## 2026-11-12 — Native approval times and optional analyst assistance

Implementation: `d6830c58523f7ccbfdf7444fb498b8ea280c3d50` (1.12.0).

The user wanted the time an approval was actually raised, after message age was mistaken
for waiting time. Use the native command/file request startedAtMs field for Requested at
with full local date, seconds, timezone and exact ISO datetime. Missing/invalid native
time stays unavailable; do not infer it from chat, tools, arrival or restoration. Keep
native actions and identity unchanged.

A reported slow visualization review exposed avoidable context and instruction problems.
Analysts now receive shared rules from current main native metadata rather than stale
tab cwd, plus bounded original user instructions and existing page-reference hints. A
single native first-page read may recover user context missing from the retained tail.
Main approval still refetches the original page; references and assistant summaries
never authorize actions. Context-read failure remains explicit while preserving request
metadata and pending manual asks.

Remove the unnecessary instruction to wait for an analyst when sufficient current
action, source and real-user evidence is already available. The main Coordinator may
decide immediately through its unchanged final guards. Analyst queue/dispatch, native
acknowledgement, evidenced activity and terminal receipt are distinct lifecycle facts;
provider queue versus reasoning time is unknown. This does not reduce model effort or
guarantee a response time.

A directly imported Python module can map only to exact approval cwd or cwd/src source
layouts. There is no package lookup, import execution or dependency walk. A separate
selected-tab CSS bug hid genuine human-attention amber beneath the selection frame;
preserve the amber top in all themes without changing chat tint or the neutral
indication for eligible Coordinator review.

## 2026-11-12 — Mobile chat jump navigation

Implementation: `6757d403f8a1a40175dfc4d7bba7396ff4d028b8` (1.13.0).

The user wanted a top-of-screen control while reading long mobile conversations, with
Jump to end available after returning to the beginning. Keep the existing document
scroller and add one mobile-only sticky button above the header. Its normal-flow
position leaves header controls reachable at page start; sticky positioning keeps the
button available during a long scroll.

Use the current page position to choose the action. Jump to top returns to the document
beginning. Jump to end reads the selected conversation's current composer bounds,
revealing the latest history and input without focusing it or opening the keyboard.
Recalculate after scrolling, resizing and history growth; remove observers/listeners
when changing chats, leaving mobile or unmounting. Keep desktop reading positions,
explicit history pagination, drafts and native request behavior unchanged. No
dependency, storage or native-runtime change is needed for this browser interaction.

## 2026-11-12 — Show each mobile navigation destination independently

Implementation: `10862443279feb139f9d60a0e16f319e08750f2b` (1.14.0).

The user clarified that Top and Bottom are independent controls: show Top when the app
section above history is out of view, Bottom when the history end is out of view, and
both in the middle. Replace the single document-start switch with actual history bounds.
This also keeps Bottom available while the overview is visible at a nonzero page offset.
Each button retains its own direction even before a scroll event is processed, and
refreshes visibility after navigation.

Retain the existing sticky document-scrolling control and a stable-height row so
appearing buttons do not move their own visibility boundary. Observe both history and
its surrounding panel for content/overview resizing. Keep current composer geometry for
Bottom, without focusing input. Desktop positions, drafts, native actions, explicit
pagination, dependencies and storage are unchanged.

## 2026-11-12 — Review safe playbooks and documents

Implementation: `857944dd584c70b85071ccb2a215ef665f09e9a8` (1.15.0).

The user requested that the existing source reader review playbooks, JSON, YAML and
Markdown as well as Python/shell helpers. The old approval-bound extension list excluded
these documents, while the ordinary project reader also lacked JSON. Extend those
existing paths rather than introducing another reader or changing native tool grants.
The compatibility path remains available to older saved Coordinators without the
dedicated approval-source tool.

Preserve exact request, token, cwd and source-hash checks for outside-project files and
recognize literal Ansible `@file` inputs. File content remains evidence, not user
authority; reads execute nothing and resolve no template values. Add shared format-aware
credential checks and recheck sensitive resolved project paths so the wider formats
retain secret/Vault protection. Native JSON parsing handles escaped keys without
executing source. Keep code annotations and normal environment/Jinja references
readable. Conservative detection can still require private review of credential-like
metadata or unusual YAML; it does not certify that arbitrary source is secret-free.

## 2026-11-12 — Preserve native chat order and delegate progress

Implementation `9e18470664691de18050e46ea20265687b665e35` (1.16.0) fixes native-history
merging so recent refreshes preserve loaded older pages, the oldest cursor and newer
live messages/completion state. Native turn/item order remains authoritative; no clock
sorting or transcript rewrite is introduced. The silent 600-record trim was removed
because it discarded fetched records, including large native turns. Existing explicit
20-turn native pagination remains; loading larger histories uses more process memory.
The quoted incident's original messages remained in native history, so this is an
order/loaded-view correction, not recovered deleted content. Concurrent pagination and
live-update races are guarded while nested native question bindings remain intact.

The user selected one additional native progress helper combining routine worker
progress, linked-task/blocker monitoring and sidebar publication. This separates routine
monitoring from the sole automated approver and the existing two optional approval
analysts. The helper has bounded worker-read/sidebar tools, the main model/effort/shared
instructions and existing RPC/events. It cannot approve, execute, message workers or
change tasks; main approval checks and concern responses remain. Unknown starts retain
their slot and native decisions remain pending. No extra service, timer or persistent
store was added. Reserve in-flight sidebar publication to prevent a concurrent update
from replacing the helper’s current result.

## 2026-11-13 — Keep large browser streams open and restore Send safely

Implementation `3ef94b38fb34bed9a56051fe5131832281e06029` (1.17.0) corrects two browser
failures. A normal full-history snapshot could exceed the queued-output cutoff and close
its still-valid event stream, while a shared browser/native connected flag could disable
Send after browser transport loss.

The existing SSE channel now honors write/drain, with one in-flight frame and a
coalesced latest-update flag. Initial snapshots and heartbeats use the same flow
control. Session validation still runs for blocked clients; other clients proceed
independently and closed clients remove listeners/timers. Loaded history is not trimmed.
No delta protocol, new timer, service, persistent store or dependency was added.
Existing service logs receive only numeric/allow-listed native transport codes and the
first backpressure byte count per browser connection.

Browser transport loss had also overwritten a shared connected flag, displaying a
native-disconnected banner and disabling Send. Normal reconnect signals now trigger the
existing authenticated state GET. Only a current authoritative result or snapshot
restores sending; later snapshots/disconnections/reads/login changes invalidate obsolete
success and error results. Failed read-only recovery checks can retry on later existing
transport signals. This does not resume Codex, answer requests or replay input. Browser
recovery has separate wording while real native disconnection retains its existing
control. Draft/request/ownership guards remain.

## 2026-11-13 — Recognize container test files and expose blocked-task context

Implementation `2434d83bae4aa34e090f9523ea55bffef3e1387d` is version 1.18.0. The
original Windows review refused an outside-project test because its command named a
Python unittest module inside a read-only container mount. The reader did not associate
that module with its host file; the credential scan was never reached in the confirmed
main-reader failure. This corrects the earlier suspicion that this particular refusal
came from secret detection. Recorded native command metadata reproduces false before the
change and true afterward, without opening the test or executing its command. The
analyst's retained recommendation reports access refusals, but its exact underlying
reader error was not retained.

The fix recognizes only literal supported unittest targets, optionally through one
explicit read-only Podman mount and working directory. Review caught ambiguous unquoted
Bash wrappers and reserved unittest discovery targets; both are refused. Unrelated
files, writable/ambiguous or shadowed mounts, traversal, import-path overrides and shell
expressions stay outside this supported form. Existing credential/path/size/symlink,
current-request and changed-source hash checks remain. The separate historical
Vault-helper content false-positive investigation is still unresolved; this change does
not relax that detector or answer approvals.

The user also reported task popups that announced input needs without useful context.
Ordinary task descriptions and notes now appear directly, with queued prerequisite
names. Only actual current question metadata activates Needed/Why answer presentation.
Old question text remains recorded context. Ordinary blockers offer Ask about blocker,
requesting the real blocker and next step without inventing a user action or authorizing
more project work. Native-send and draft guards are preserved. No new component,
dependency or store was introduced.

## 2026-11-13 — Preserve current turn identity and make amber actionable

Implementation `fd79ea9e49aa9131ca2b0376da347ec3cb378003` is version 1.19.0. The
reported turn-ID mismatch was traced to the Visualization conversation: the expected
turn was interrupted while a newer turn was active. The user clarified that typing and
Send worked but delivery failed, then reported recovery before this fix was deployed.
That recovery does not verify the implementation. Separate current native approval flags
and absent card details did not establish that the user's Send button was disabled; the
earlier explanation was corrected.

Older completion events and delayed start acknowledgements could replace newer state.
The fix retains bounded private current and superseded identities on the existing agent,
preserves newer question/wait state and still accounts for each native completion.
Unknown success does not clear a known stop. No component, persistent store, service or
timer is added.

Only the exact native turn-ID precondition rejection can trigger a bounded current
turn/status read and one active-turn retry with the original payload and identity.
Ownership, native epoch, stop, pause, handoff and request gates are rechecked. Unknown
errors never retry, recovery never starts a new turn, and question answers never move to
a different turn. Known rejected answers become read-only rather than falsely
unconfirmed. Newly discovered missing approvals use existing guarded reconnection.
Coordinator delivery records distinguish not sent from unconfirmed, restore rejected
task-check progress flags and keep failed queues without resend.

The user separately selected amber frames only for actual concerns, decision questions
and specific input. Existing code incorrectly treated temporary Coordinator
unavailability as a human decision and reviewed confirmation as attention. Saved/startup
configuration is now separate from momentary availability for presentation: configured
review waits stay neutral; genuinely unconfigured manual approvals, human-only requests,
explicit referrals/errors and current linked-task input remain amber. The actual native
controls and Send guards are unchanged. No analyst recommendation becomes main
Coordinator authority.

## 2026-11-13 — Recognize literal direct container Python scripts

Implementation `d160e17f96babb2452264a9b5a74d491e91671ed` (1.20.0) extends the narrow
source-reader grammar after a direct container script, absolute Python entrypoint and
--userns=keep-id were independently refused before credential-content scanning.

The existing literal parser now accepts the exact keep-id option once and the existing
ordinary Python executable grammar for entrypoints. A direct normalized absolute `.py`
path must be in the already validated container workdir and map through the sole
explicit read-only volume to exactly the requested host file. Other namespace modes,
shadowing/ambiguous mounts, traversal, shell expressions, unrelated files and existing
secret/path/symlink/size restrictions remain refused. No permission, component,
dependency, shell execution or automatic approval was added; original pending asks
remain authoritative.

## 2026-11-13 — Forward concerns for proactive in-scope engineering fixes

Implementation `28bfb906eaccb439f9a8ad90f25fce8b794a2fe3` is version 1.21.0. The user
asked the Coordinator to collect its concerns and send details to the engineering
conversation so recurring in-scope problems can be investigated and fixed proactively.
They clarified the goal was future prevention; genuine user decisions remain with the
user. The selected implementation uses the existing worker-message queue and an optional
destination in existing private runtime configuration, without a second approval stage,
store, service or timer.

Only new actual main ask decisions are captured. Batches are released after their exact
main turn completes, preserving source project, parent/child and request identities plus
bounded concern fields. They exclude raw action/source serialization, protect
credential-looking content and remove the exact live approval token even when echoed in
otherwise ordinary text. Historical asks and analyst recommendations do not trigger
notices. Original requests remain pending; forwarding is not authority, an answer or
automatic re-review.

The existing queue delivers only at a verified authorized idle point. Exact destination
object, native epoch and queue membership are checked again after context loading and
immediately before the native write, alongside stop/pause, handoff, ownership and
native/async question gates. Unavailable destinations/full queues remain explicit,
uncertain deliveries never replay, and clear/close can cancel an unsent notice during
preparation. A notice cannot route back to its own originating parent/child or to the
Coordinator/Claude/external session.

## 2026-11-13 — Fix the first genuine routed source-review concern

Implementation `d620a7764977ee8f652f897e9164dcb49bf07f8d` (1.22.0) extends source-file
recognition for commands with a numeric container user, a read-only SELinux-label mount
option and multiple explicit unittest selectors.

The existing literal parser now accepts one numeric UID:GID, exact `ro,Z` or `ro,z`
alongside `ro`, and multiple validated explicit selectors. Only an actually named module
in the validated workdir maps to its host `.py` source; package/dependency discovery,
unknown selectors/options, ambiguous/writable mounts and unrelated files remain
excluded. Existing request, cwd, hash, secret, symlink and size checks remain. Relabel
options can change host metadata if a command executes; recognizing their source
reference does not authorize that effect, change permissions, execute Podman or answer
an approval.

## 2026-11-16, UTC — Recover obsolete Coordinator turn bindings

An activated Coordinator could be excluded from native observation and retain an
obsolete active-turn binding after a lost terminal notification, preventing its
scheduler from handling waiting approvals.

The focused 1.29.1 correction reuses the current observation poll and existing
completion wake path. Only fresh inactive native state with a recognized latest terminal
head can clear the stale binding; current questions, active work, pauses and newer
events remain authoritative. Restoration uses the latest native head rather than
resurrecting an older unfinished turn. No additional timer, service, transport, storage,
automatic approval or permission path was added.

Implementation: `4cc2ad545e419329637a8eb728032cf5b104b721`.


## 2026-11-19 — Discuss proposals before approval cards

Recorded 2026-11-19, 09:40 CET; exact user-message time unknown. The user supplied an
example of a premature approach-choice card and requested cards for approvals
after clarification. Ordinary chat now handles exploratory discussion; a
concrete, explained proposal precedes a final approval card. This supersedes the
blanket preference for structured clarification questions. Actual unanswered
chat questions still use the existing Beads input records and Question labels.
Native command/file/permission/MCP approvals, existing pending requests and
already authorized work retain their controls and scope. The correction changes
instructions, not card storage, approval transport or automatic enforcement.
CCNG runtime-instruction implementation: `5ac148fe51363f64646486d2d5e105a8abbd8917`.
Shared environment rule implementation: `fb274fc70c1cc935d287d532967c37fe1dcd8fac`.


## 2026-11-19 — Select shared instructions independently of chat directories

Recorded 2026-11-19, 10:50 CET; exact user-approval time unknown. The user approved
one explicit shared-instructions path in the existing private runtime config,
keeping conversation working directories unchanged. Project/backend ancestor
discovery alone can miss the shared source when chats and the installation live
in separate directory trees. Changing their working directories would also
change project context, so the selected approach adds only the optional
`shared_instructions_file` config key and its existing Ansible configuration
surface, `command_center_shared_instructions_file`.

The path is literal, absolute or relative to the config directory; no additional
CLI or environment-variable interface is introduced. An explicit source is
authoritative: unavailable content is reported without falling back to another
source. Omitting the setting preserves discovery. Existing file-size, regular-file
and final-symlink safeguards, native permissions and instruction precedence
remain. An already managed Claude process receives changed instructions only
at its next process startup; this is not a hot-reload mechanism.

Implementation commit: `8569a770d722ded6e551a00ec27aa166f88a03ba`.


## 2026-11-19 — Inherit requested Claude permission mode in branches

Recorded 2026-11-19, 12:32 CET (Europe/Vienna); exact user-approval time unknown.
The user requested fixing Claude branches that failed to retain Auto and first
setting Auto on two existing running branches. For new reply-level and whole-chat
branches, inherit the parent's explicit requested Auto/Manual preference. Without
one, use the existing new-chat Auto default. Preserve explicit Manual; observed
native fallback is not user intent and must not redefine the requested mode.

Reuse existing private workspace preference persistence. No new schema, store,
model call or transfer of native approvals/callbacks is selected. Configured
intent, native acknowledgement and observed mode remain separate evidence;
existing native controls and pending requests keep their scope.

Implementation commit: `077b2e2861733fa44102f3a0d87f10096b3d7a7f`.


## 2026-11-19 — Add local Mistral Vibe through official ACP

Recorded 2026-11-19, 15:56 CET (Europe/Vienna); exact user-approval time unknown.
The user approved the concrete proposal for Mistral Vibe as a third local worker
through its official Agent Client Protocol interface. Reuse the existing Node
backend, conversations, Beads task links, native request controls, private
workspace metadata and artifact handovers. The Coordinator remains Codex.
An extra service/database or custom model-execution loop was not selected.

Official ACP reuses Vibe's native runtime and authentication. Preserve its exact
permission options, pending requests and advertised capabilities. Missing local
Vibe must leave the other providers usable. Unsupported Mistral branching stays
unavailable. Native session load can initialize engine/MCP activity; observation
must not silently resume external/restored work or imply read-only loading.
No native approval or callback transfers across provider handovers.

The approval covers this architecture and source work, not installing Vibe or
its tooling, choosing credentials, running real native/model smoke calls or
deploying the new release. Neither `vibe` nor `vibe-acp` was found on the checked
PATH; installation elsewhere is unknown. Optional pinned setup instructions are
unexecuted. Controlled source tests cannot prove native/browser acceptance.

Coordinator integration explicitly reserves Codex history/authority RPCs,
analyst jobs, task checks and engineering concern destinations for Codex/legacy
records. Mistral native requests remain manual; queued reports wait for idle
and bind actual native turn/completion evidence. Existing Claude concern
behavior remains supported. Eight controlled coordinator regressions passed;
this is not native Vibe, model or browser verification.

Source verification on 2026-11-19, 16:11 CET: full suite 1,491 passed, zero
failed, one existing supplementary-group scenario skipped; TypeScript/Vite build
passed. Controlled protocol/HTTP/UI fixtures do not establish real Vibe or
deployed behavior. The existing bundle-size advisory remains.

Implementation commit: `f90094e76844855393129c4eca0d7d4c5a5dbb2b`. Source release: 1.46.0. The implementation was published through the existing
SSH remote and verified by remote-head readback on 2026-11-19, 16:13 CET.
Deployment and actual-runtime validation remain pending; the last verified
deployment at record time is 1.45.0.


## 2026-11-20, 03:23 CET — Update existing native Codex and Claude installations

The user explicitly requested updating Codex and Claude. Keep each established
native installation and supported update path; do not migrate package managers,
change automatic-update preferences or interrupt active sessions. Codex CLI and
daemon packages are distinct, explaining why the command-line package could lag
behind already-current background servers. This is routine dependency upkeep,
not a new agent architecture. Exact user-request timestamp is unknown.

Actual outcome: native `codex update` installed 0.171.0 from 0.167.0; native
`claude update` installed 2.1.329 from 2.1.325. Version readbacks passed, and
Claude's binary digest matched its official manifest. Existing configuration,
CCNG service and observed Codex processes were preserved; previous binaries
were retained. A pre-existing Claude process remains on 2.1.325 until normal
restart. Fresh native model/browser behavior was not tested. No source code or
application release was changed; these are native upstream package versions,
so there is no application implementation commit for the runtime update.

Official references: [Codex 0.171.0](https://github.com/openai/codex/releases/tag/rust-v0.171.0),
[Claude Code 2.1.329](https://github.com/anthropics/claude-code/releases/tag/v2.1.329),
[Claude manifest](https://downloads.claude.ai/claude-code-releases/2.1.329/manifest.json).


## 2026-11-22 — Support Claude branch handback through the existing SDK

Recorded 2026-11-22, 19:06 CET; exact user-request time unknown. The user requested
Claude support for **Hand back & close** alongside Codex. Extend the existing
process-local handoff coordinator and official Claude Agent SDK rather than
adding another service, transport, task store or dependency. Reuse native
conversation history and the current Beads task-label transfer.

Claude lacks an archive API. Wait for an authoritative idle checkpoint, completed
summary and exact persisted parent-message receipt, then end input to the settled
owned process and confirm its exit. Preserve native history for reopening,
manual questions and approvals, task states/ownership/dependencies, background
work, external ownership and uncertain-delivery protections. Known completed
failures may be retried explicitly; unknown input acceptance retains its identity.
Newer branch work invalidates an old completed summary. Reopening a successfully
returned branch clears only transient handoff gates.

The user explicitly directed deployment later. This supersedes the normal
minor-release deployment workflow for 1.47.0; source publication does not imply
runtime activation. Other deferred Claude integration remains outside this scope.

Implementation commit: `af6cbf3caf348dec23484e5c88fe9814a61ce7ef`. Source release: **1.47.0**.


## 2026-11-22 — Separate mobile jump controls at opposite screen edges

Recorded 2026-11-22, 20:34 CET; exact user-request time unknown. The user requested
Jump to top at the top of the screen and Jump to bottom at the bottom after
showing both grouped at the top on a phone. Anchor each existing mobile control
to its respective viewport edge, with device safe-area spacing. Keep the space
between them available for normal interaction and scrolling. A shared sticky row
could not provide the requested independent placement.

Preserve independent visibility, existing document-scroll destinations, native
button accessibility, touch sizes, desktop reading positions and native state.
This is a presentation correction, with no new component, dependency, setting
or service. Deployment remains deferred by the user's existing instruction;
source checks do not establish phone rendering.

Implementation commit: `2d7f808189a4473dcd133c0b48069fa4adbd7d43`. Source patch: **1.47.1**.


## 2026-11-23 — Request official Claude input replay acknowledgements

Recorded 2026-11-23, 05:04 CET; exact user deployment-instruction time unknown. The
user resumed the earlier deployment deferral with Deploy. The real native
acceptance exposed completed Claude replies whose inputs remained queued because
CCNG had not explicitly requested native replay acknowledgements. Enable the
documented boolean replay-user-messages option through the already approved
official SDK. Keep exact session/input identity, authoritative completion and
persisted parent-receipt checks before closing a settled child.

Treating SDK queue acceptance or an assistant reply as delivery proof was rejected
because neither establishes exact persisted parent receipt. This correction
changes no provider, transport, native permission or task store. Include a
repeatable, explicitly invoked disposable native acceptance script with tools,
MCP and hooks disabled only for the test; retain uncertain work and native history.

Implementation commit: `38c4c0bd528e468b578fe4c675ae6d47f28edfd0`. Patch: **1.47.2**.

## 2026-11-23 — Keep cross-chat messaging at the discussion stage

Recorded 2026-11-23, 05:04 CET; exact request and reply times unknown. The user asked
whether CCNG should reuse assistant-team for Claude-to-Codex communication, then
selected further discussion and questioned whether the extra capability is
needed. Compared that repository with CCNG's existing Coordinator relay.

Direct worker send/reply tools in the existing backend remain one proposal; the
full assistant-team broker/container/tmux setup is another. Neither was selected
or implemented. Parent handback addresses the original branch-return request
independently. No broader architecture, service, store or messaging permission
was approved by this discussion. There is no messaging implementation commit.
