# Contributor instructions

## Scope and decisions

Read README.md, docs/product-requirements.md, and design_decisions_history.md
before making changes. Linux is the first supported installation and runtime
platform. Preserve both desktop-browser and smartphone-browser usability.
The installer must be a simple Linux shell script that installs under the
invoking unprivileged user's home directory without requiring root or sudo.

The user delegated the frontend choice: React, TypeScript, Vite, and plain CSS.
Consult the user before selecting further architecture unless they explicitly
delegate the particular decision. Explain relevant tradeoffs and wait for their
direction. Do not silently add backend services, storage, agent integrations,
compatibility layers, hosting, or authentication mechanisms.

Approved v0.0.1 architecture: a local Node.js service on configurable address
and port 4242, connected to the existing Codex daemon's native Unix WebSocket
interface. Codex-only initially. Support localhost and VM-internal access behind
nginx. The user approved nginx access restrictions plus a local application
password stored only as a secure hash in private home configuration. The Linux
installer accepts a target directory or prompts for it before installing.

The user withdrew shared/default passwords and forced first-login changes.
Preserve existing valid app passwords. For fresh browser creation, the user
selected enforced htpasswd protection with NO temporary setup code. Enable only
through explicit first_password_setup: htpasswd-proxy and an exact HTTPS
public_origin, with htpasswd on all proxy routes and restricted direct backend
access. CCNG does not validate proxy credentials or infer protection from headers.
Generic installer configuration leaves setup disabled; local operators may use
the existing password CLI. Unconfigured missing auth still refuses startup.
Create the initial hash atomically without replacing an existing file; corrupt
or unsafe auth must fail closed. Preserve login, origin/Host checks, rate limits
and secure sessions. Infrastructure/Ansible integration belongs to its owner.

The user approved persistent application sessions to survive updates/restarts.
Use owner-private hashed opaque-session records beside auth configuration, with
the existing absolute 12-hour expiry, logout and password-change invalidation.
No raw cookie/password storage, extra service or memory-only fallback. Refresh
the actual password revision before issuing a session. Exact --clear-logins
rotates invalidation state for the running app and future starts, then exits
without starting listeners/native work or changing passwords/nginx. Reject old
sessions at the next check and close event streams by the next heartbeat;
already accepted agent work continues. App authentication uses explicit JSON403
codes rather than HTTP Basic401 challenges, and unavailable storage fails visibly
with503. Preserve origin/TLS/rate protections and expose no new permissions.
RAM-only sessions from older versions need one final login during migration.

The user requested a target-local launcher and installer update mode, explicitly
selecting automatic fetching of latest code. Version 0.1.0 uses the same local
service and native Codex thread/fork support for completed-reply branching with
parent navigation and optional explicit findings messages. Do not introduce a
separate branch store or Git-worktree automation without user direction.

The user subsequently selected concise generated branch summaries, followed by
native child archiving and UI tab removal after accepted delivery. Parent-only
navigation stays separate. The user approved a full-window workspace, desktop
right sidebar for goal/tasks, compact single-line tabs in the functional top bar,
and removal of redundant status text and unused heading space.

The user approved Beads as a runtime dependency and authoritative task store.
Working agents create/update task records using bd; the backend reads structured
state directly without another agent/model call. Conversation associations live
in Beads labels (ccng-session:CONVERSATION_ID), not another database. The backend
adds/removes that label only for explicit user link edits; working agents associate
their substantive work through the normal bd workflow. Do not infer task status from chat,
native plans, idle state, or archiving. Preserve other labels, ownership, task
content, and project tracker configuration. Do not auto-initialize or migrate
trackers, install tools, or manage a Dolt service.

The user requested chat-input focus on tab selection and a generated brand icon,
now a schematic white curved operations console with an arc of monitors.
Workspace restore uses the user-approved split: a private file beside login
configuration in the existing Node.js backend, plus browser-local drafts,
selected tab, order and reading positions. Persist only open worker IDs,
coordinator ID and pause state on the server. Keep runtime files outside the
checkout. Restore views using native reads; do not resume unloaded workers or
start worker/model turns merely to restore tabs. Reuse the same coordinator;
reapply its restrictions before activation. Do not replay approvals or queued
messages. No separate storage service or database is approved. The user authorized a native Codex coordinator alongside up to sixteen workers,
with its own visually separated chat tab, progress recaps, report requests,
summary messages and scope-based approval review. Authorized work can include
resource creation/deletion and disposable test-VM lifecycle. Use the explicit
scope, real user instructions and existing restrictions; uncertain scope and new
decisions return to the user. A worker's assertion is not authorization.

Coordinator tools must be limited to open workers, bounded project reads,
progress/communication and exact command/file approval requests. Keep its native
sandbox read-only, disable unrelated native capabilities and fail visibly if the
restrictions cannot be applied. Never approve its own requests, broaden native
permissions or claim model judgment provides hard containment. Approval requires
an exact real-user-message reference, never a generated summary or event message.
Keep manual controls, request identity, confirmation, pause and decision rationale.
An actual user instruction returned through older native history can be cited.
Use bounded per-worker native page references and re-read the exact page when
the instruction is absent from recent messages. Preserve exact quote, native
user provenance and current worker/request/token checks; generated relays and
branch summaries remain excluded. Do not add a persistent authority store or
broaden native permissions.
Keep transcripts in native conversation history, live reviews/queues in process
memory and only the approved workspace metadata in the private workspace file.
The later user-approved decision-summary exception uses a separate private
JSONL file, as described below; it does not persist active reviews or queues.
Worker settings stay unchanged. The user also requested draggable tab order with
accessible controls; preserve the separate coordinator group and chat focus.

## Approved listening address and HTTPS

The user approved automatic default-route IPv4 binding when --host/CCNG_HOST is
omitted, with selected interface/address in startup logs and optional overrides
documented in --help. HTTP is the installer and runtime default. After a
successful build, create INSTALLDIR/etc/config.conf with commented HTTPS and
certificate/key examples before the active HTTP setting. Use literal key:value
text and full-line comments; full YAML is deferred and adds no dependency.
Read the file at foreground/systemd startup; preserve explicit CLI/environment
overrides and existing config/certificates across updates. Other readable
certificate paths are allowed. A CaC-selected HTTPS deployment creates/reuses
its backend pair under INSTALLDIR/etc/certs and updates this config.
Validate certificate suitability and keep native login, Secure cookies and
Host/Origin controls; never fall back silently to HTTP. Issuance/renewal stays
with external tools. Keep actual target/settings data in the private whole-file
Vault companion. Nginx infrastructure and deployment acceptance testing belong
to the owning other conversation; do not duplicate its completed setup here.
Preserve explicit saved settings and the live listener/
restart ownership boundary; do not update or restart installations for tests.

Deployment attempts to provide the selected native Codex CLI; installer and
deployment use native Codex feature commands to enable structured questions,
while startup only checks them. Missing, unsupported or unsuccessful Codex
setup/checks warn and continue. Keep the development-feature caveat visible;
do not suppress it, edit native TOML directly or restart active native processes.

## Code versioning

Use numeric MAJOR.MINOR.PATCH versions. The first implementation starts at
0.0.1. For subsequent code changes automatically advance major for a major
release, minor for a minor feature or bugfix release, and patch for a patch-level
correction, resetting lower components. package.json is authoritative. Keep
package/lockfile, runtime/build, and documentation versions consistent in the
same implementation commit. Architecture still requires consultation.

## Public source

This repository is public. Never commit credentials, access
tokens, secret values, encrypted secret payloads, private conversation exports,
runtime state, or environment-specific usernames, addresses, hostnames, paths,
and configuration. Use synthetic, generic examples. Keep credentials outside
the repository, including its history. Review staged files before publication.

Specific screenshot exception: the user approved the three supplied desktop
development screenshots after reviewing their visible private/operational data.
The user also approved two supplied mobile screenshots after review of their
visible internal project/deployment text and host alias, with EXIF removed by a
lossless metadata-only script. Preserve original pixels and label historical
UI/status context. This does not authorize other screenshots, private exports
or credential disclosure.

Do not copy local agent settings or another project's environment files into
this repository. Keep screenshots and fixtures free of private data.

## Workflow

Use Beads for development tracking in the existing workspace. Do not create
Markdown task backlogs or initialize a separate tracker without user direction.
The runtime integration also uses Beads, scoped to explicit conversation labels.

Keep README.md current with design changes. Record the change, reason, and real
implementation commit ID in design_decisions_history.md. If that ID is not yet
known, commit the implementation first and add its ID in a documentation commit.
Distinguish implemented behavior from requirements and proposals.
Keep the main README focused on what CCNG is, why it exists, its principal
features, requirements and installation. Put version-by-version changes in
release notes and detailed operation in separate usage documentation. Link to
those records instead of appending release narratives to the product README.

Use SSH for agent-side Git network operations. Keep commits focused and use
concise, imperative subjects. Validate relevant behavior and inspect command
outcomes. Ask before installing missing tools or dependencies. Do not select a
license or accept legal terms on the user's behalf.

After publishing a minor CCNG release, deploy it to the existing authorized
production installation through AAP ad hoc commands. Update the installation,
restart its existing service after a successful update, and verify the actual
installed version and running result. Preserve configuration, authentication,
certificates and native agent profiles. Publication alone is not deployment;
report actual outcomes and any unperformed functional or browser checks.
This is a maintainer release workflow, not application self-updating. Native
permission gates remain in force; this instruction does not authorize unrelated
infrastructure, credential or security changes.

## Interface

Keep workspace branding at the right of the full-width navigation bar, with
Logout last, immediately after it. Put the compact classic/contrastful/light
palette menu in the former Logout position and group Add agent with its count.
Keep worker tabs on the left. Group the coordinator and prominent cyan Add agent
button together on the right, with the coordinator immediately before Add agent
and outside the workers' scrolling strip. Use the same tab shape, height,
typography and state styling as worker tabs, retaining its overview icon and
separate coordinator identity. Preserve the sixteen-pixel top inset, approximately
34-pixel inactive tabs and 40-pixel selected tab. Use a larger bold label only for
the tab whose chat history is visible, with regular inactive labels; bottom-align
tabs at the pane. Selection uses cyan top/side edges independently of the status
dot's running/attention color. The visible wordmark is command center NG. Preserve its running/attention indicators
and compact mobile presentation.
Use small folder-style tabs joined seamlessly to the pane. The selected tab
shares its fill with the pane and uses label/shape contrast, with no bottom
selection stripe or separating header/pane border. Keep horizontal tab scrolling
available without a scrollbar gutter interrupting that connection.
Keep a fixed twelve-pixel inset above the conversation scroll viewport, so
scrolling text clips below the tabs while the tabs remain attached to the pane.
Inactive tabs use the pane's background across activity states; keep status
colors in their dots/top edges and preserve the selected tab's larger bold label.
Favor simple navigation, readable type, consistent spacing, clear status labels,
accessible controls, and restrained effects. Keep the project goal and current
work easy to recover when switching contexts. Branching must remain a simple
context-preserving action with easy return navigation and optional result return.


Keep the desktop goal/task context panel about 40% wider than the pre-0.6.0
sidebar, with a visible Open questions section derived from current native
requests. Preserve request identity, confirmation/error state and manual answer
controls; showing or opening a question must not answer or resolve it. Keep
Branch chat in the chat composer beside Interrupt and Send, with per-reply
Branch here still available. Preserve stacked mobile context and wrapping
composer controls. Do not infer ordinary-chat questions without a separate
agreed approach.

Branch chat must use the native current-history snapshot without lastTurnId,
including persisted messages from an ongoing exchange. Only per-reply Branch
here supplies a validated completed-turn cutoff. Preserve deferGoalContinuation,
parent activity/questions, settings and the worker limit. A native interruption
marker belongs only to the copied partial turn in the child; do not interrupt
the parent or rewrite existing branches to apply this correction.

An attention flag without request details does not establish another client's
ownership. Preserve explicit request loading for only the selected active native
conversation, exact request IDs and native answer confirmation. Loading must not
submit a decision, start a worker turn or broaden worker permissions; startup
restoration remains read-only. Keep coordinator restrictions and existing review
policy intact.


The user requested RHEL 9 prerequisite checking and optional package installation
through sudo after installer confirmation. The application itself still installs
and runs unprivileged under the chosen target. Missing Beads/Codex CLIs may be
offered under that target; preserve compatible global tools, native settings and
existing trackers. Check-only mode must not install anything. The user approved fresh private local Dolt provisioning and Beads initialization
as follow-up installer work. Preserve existing servers and trackers; do not
initialize, migrate or start a fresh service on the development host during tests. Do not
claim other Linux distributions have been tested.

## Approved deployment and chat refinements

The user explicitly selected public command-center-ng for application code and
deployment playbooks, and private command-center-ng-secrets for Vault-encrypted
AAP CaC and environment settings, following the other AAP projects. Do not put
encrypted payloads in this public repository. Use the existing shared CaC
importer rather than adding a wrapper or second importer. Consult the user
before choosing a Vault credential source or changing this architecture.

The deployment playbook targets genuine RHEL 9 with systemd, reuses an existing
unprivileged account and signed-in Codex/Beads setup, and runs the app through a
system-managed unit with User= set. Preserve existing auth, native daemons,
trackers, SSH trust and unrelated units. Never apply this deployment to the
development host as a local validation method. Use isolated temporary fixtures.

Explicit fresh-target Ansible exception: the user approved preparing the selected
account's missing `~/ccng-wd` workspace, installing missing Beads/Dolt programs
and compiler prerequisites, and initializing its first tracker with native
`bd init --shared-server --non-interactive --skip-agents --skip-hooks`.
Use the maintained installer's tool versions and verified archives. Native Beads
owns the shared Dolt server; add no CCNG server wrapper. Preserve existing
trackers, routing, authentication, native profiles and explicit installation
paths. Native Beads may initialize local Git metadata for this fresh tracker;
do not require a source/demo repository checkout or add a remote, task import,
copied tracker or alternate routing to suppress that native behavior.
This exception applies only to the authorized deployment playbook on its
selected target. It does not authorize runtime agents, the ordinary interactive
installer or local tests to initialize trackers or install tools without their
existing approval requirements. Do not bootstrap a tracker on the development
host while validating deployment code.

On hold (`on_hold`) means waiting for a recorded, specific circumstance;
Deferred means optional future or someday work. Verify the condition and existing
authority before resuming a held task. The deployment playbook enables the native
custom state after both fresh preparation and tracker reuse, appending it only
when absent and preserving other custom states. This is a scoped tracker-setting
change, not migration, server management or permission expansion.

Group consecutive tool activity under a closed native details control, retaining
per-action details and visible running/failure counts. Keep questions and chat
messages separate. Pending requests may block sending, but must allow local
draft editing. Preserve backend send protections, IME and Shift+Enter, and newer
drafts typed while an earlier send acknowledgment is outstanding.


Lead every clarification or input request with a short answer to “What do you
need from me?” Use **Needed:** for the direct question or action (one or two
short sentences, at most 30 words), followed by **Why:** (one sentence, at most
20 words). Put exact commands, steps, background and original notes under
expandable **Details** where the interface supports it. Use the same explicit
Needed/Why/Details sections at the start of Beads input descriptions; do not
bury the actual request behind history, hashes, task IDs or scope bookkeeping.
Keep new requests understandable without opening Details. Preserve complete
technical information and native approval scopes; never ask for a password or
secret in chat when an existing secure input mechanism is required.

Coordinator recaps must explain useful outcomes, unfinished work and the concrete
blocker/next action using task names or plain-language work descriptions. Bare
IDs and closed-record lists are not explanations. Distinguish published code
from deployed/live-verified behavior. Omit routine idle/no-approval bookkeeping
unless relevant. Keep this guidance in new/restored instructions, event reminders
and worker report requests, preserving coordinator identity, review protections
and limits on messages/reports. Do not rewrite model output using guessed task
semantics or start a live worker report merely to test reporting instructions.

Expose every delivered pending request to the coordinator with explicit counts,
distinguishing request records from nested clarification questions. Each review
returns the current remaining list and preserves exact IDs/tokens and native
confirmation. Continue reviewing other eligible approvals after a referral;
existing unreviewed approvals remain scheduled after resolution/referral. Manual
questions, unchanged ask decisions and answer errors must not cause automatic
review/retry loops. Keep the one-message/report limit distinct from independent
reviews, and never add bulk approval or infer missing action/ownership details.

Approved coordinator decision reports use two short bullets: the action and
the approval with its reason. Non-approval notes, including the actual rationale
shown in a worker's approval card, normally use two or three short lines and
about sixty words or fewer: what the action does, the concrete concern, and the
exact user decision or easy permitted next step. Use plain Request:/Concern:/Next:
labels when helpful; no raw code, internal evidence dump or routine boilerplate.
Keep line breaks in approval cards. Use vivid 🟦 request, 🟢 approved, 🔴 declined, 🟠 needs-user and
🟣 unconfirmed markers plus clear words. Do not paste raw Python/shell code into
the request-summary bullet or confuse ask with decline/unconfirmed with approval.
Persist this in base instructions and event reminders. Keep exact review evidence
and current tokens in the review tools. Send concise non-approval feedback through
the existing bounded worker-summary tool, with a permitted easy alternative or
waiting for the user. Respect safe-idle/pending-request gates and distinguish
queued from delivered. Do not dismiss requests, bypass controls, broaden scope,
change credentials or retry automatically to deliver or avoid a non-approval.

The user approved preserving a dated needs-user explanation across reconnection
only for a verified current request with a matching non-secret fingerprint and
stable native identifier. Reuse the existing private decision history; legacy
or ambiguous records remain historical. Retain manual waiting until explicit
human re-review. Never restore approvals/declines, send answers or make saved
history an authorization source.

The existing source reader may read bounded generated Beads hook text for the
current Coordinator conversation only. Match its own generated-output directory
and UUID filename; reject other conversations, arbitrary temporary paths, links,
wrong ownership and credential-like contents. No shell, execution or general
filesystem permission is added. Project/helper checks remain unchanged.

## Local-only session management

The user explicitly limits Command Center session monitoring to local Claude and
Codex sessions on the backend host for now. No SSH session monitoring, remote
agent transport, remote-session fallback or remote file access is authorized.
Local Codex monitoring already exists; local read-write Claude management uses the user-approved official Claude
Agent SDK and installed local native CLI. External active processes retain their
ownership; native permissions and provider history remain authoritative. Browser access and Ansible deployment are distinct
from the monitored sessions' location. Do not infer remote-monitoring approval
from Git SSH rules, VM deployment authority or coordinator relays.

## Worker questions and task reports

Use the provider's structured question/request-user-input tool for a clarification
or choice that needs the user's answer whenever that tool is available in the
current mode. Do not ask only in chat when a supported question form is available.
Do not disguise preferences as command approvals. If the tool is unavailable,
state the needed input plainly; keep existing pending questions and do not create
duplicates or assume an answer. Continue independent authorized work while waiting.

Ask for one independently answerable decision or action per structured question
item and per ordinary Beads input record. Keep related alternatives as options
for that same decision; use separate items/records for independent decisions so
each answer can be processed and resolved separately. A provider may batch
separate question items in one tool call. Do not guess how to split or rewrite
native approval commands, modify another worker's input records, or treat a
partial reply as resolving unanswered choices. Preserve pending native controls.

Task reports begin with the fixed GFM table `Task | Status | Outcome / next step`
(optionally preceded by `## Standard Task Report`),
with one actual nonempty task and useful outcome/next action per row. Use exact
status labels: 🟩 Done, 🟨 In progress, 🟥 Blocked, 🟥 Needs input, 🟥 Failed,
🟪 On hold, 🟦 Queued, 🟧 Deferred or ⬜ Unknown. End the table with a
blank line, then follow it with
`Release: <version or unknown>; publication: <evidence or unknown>; deployment: <verified scope or unverified>.`
An empty header-only table must state `Tasks: none in scope.` or
`Tasks: unavailable — <reason>.` before that release line; never invent a task.
Use this same overview for Report now, scheduled and Detailed reports. CCNG
validates the shape and flags invalid replies visibly without automatic resends;
validation does not establish factual truth. Name actual work and useful outcomes;
cover every currently active workstream, including delegated implementation,
audits, research, documentation, verification and publication, even when unchanged.
Group related work concisely without silently omitting it. Distinguish active,
blocked, queued and deferred work; disclose uncertain coverage. Use known evidence
without extra commands solely to prepare an ordinary report or expanding project scope.
For an explicit Detailed report only, give the normal summary first, then every
actual linked `in_progress` Beads task by title/ID, with up to ten recent
attributable timestamp/action/outcome entries in chronological order beneath it. Bounded
read-only existing Beads records/notes and supported native history lookups are
allowed for that request; no project execution, external checks, new research,
secret reads, model calls or permission bypass. State fewer/none/unknown evidence,
label receipt times, and never use task update time as action time or launch/tool
completion as proof of success. Keep the combined report within 32,000 characters
and identify omitted detail. Timed and ordinary reports retain their concise rule.
IDs are optional supporting references beside names. Include the project's latest
release version and verified publication status, separating a newer working
version or unknown release evidence. Distinguish published code from deployed/live
verified behavior and identify the exact user input needed. Reports alone do not
authorize extra project work. Command Center owns the per-worker report timer,
using saved intervals in its existing private workspace metadata. Radio changes
update the backend schedule silently; Never stops automatic reports, including startup requests, and
Report now remains one-off. At startup, enabled saved intervals queue one initial
report and continue at their cadence without missed-report bursts. Internal
triggers/control events are hidden in CCNG chat; actual reports stay visible.
Workers stop older agent-owned report loops and report once per trigger. Existing
native requests, pause, ownership, permissions and project boundaries remain in
force; starting enabled reports after restoration is explicitly authorized.

## Approved worker sidebar and branch-summary refinement

The user approved per-worker report cadence in existing private workspace metadata,
all current tasks with dependency-derived queued state, direct task answers and
Markdown/GFM rendering with react-markdown and remark-gfm, raw HTML disabled.
Keep any legacy branch summary review inside the child tab and preserve its
edits across selection changes. The user now explicitly selected one-click
Hand back & close: queue a background safe checkpoint, settle local native work,
transfer all task links and deliver a summary before archiving. This action may
auto-deliver its summary; Back to parent remains navigation only. Keep the
branch available on errors or uncertain receipt, never blindly resend, and
never answer requests to advance handoff. Retain task states, owners,
dependencies, branch provenance and full native history. Close only after exact
parent receipt and fresh lifecycle/task checks; do not steal focus from an
unrelated selected tab. Keep coordination in the existing process; restart
does not replay or fabricate completed handoffs.

## Approved approval-source inspection and report queue

The user approved bounded read-only helper source inspection tied to an exact
current pending approval/token, including source outside project boundaries.
Never execute/import the helper for review, read credential/Vault data, broaden
native coordinator permissions or treat inspected source as authority. Keep
reference checks, source/command hashes and stale-request checks; changed source
requires rereading and review. Unknown effects/dependencies may still require
user input. One-off and timer-due reports use the existing bounded queue during active
work/questions. Delivery retains current native request/pause/handoff/ownership
gates; do not interrupt unsafe work or answer a question to deliver them. Never
cancels unsent scheduled requests while preserving explicit Report now requests
and uncertain in-flight/failed actions. Restoration does not replay old requests;
after loading saved state, enabled intervals start the authorized backend timer.

## Approved native request controls

Surface current user-facing blocking native requests in the originating worker,
including clarification, command/file approvals, MCP forms/external steps and
filesystem/network grants. Unsupported human answer formats remain visible with
an exact next action; do not automatically refuse or silently discard them.
Internal token/attestation exchanges are not user questions. Request-permission
filesystem/network answers remain exact and may use native turn or session scope
when selected by the manual user; no permanent grant is invented. A manual user may select
a currently offered native Codex command-prefix, network-host or MCP tool saved
rule; Codex owns persistence and scope, with no CCNG allow-list/config writer.
Session grants are not permanent. Show exact scopes and native warnings; request
resolution does not independently confirm a disk save. Preserve exact IDs and
native confirmation. Never give the coordinator reusable approvals or broader
tool/access permissions. Claude saved-rule work stays Todo. Form answers are not
persisted in workspace data.
Report now after Never queues/coalesces one existing report without changing
cadence, interrupting work or answering a pending request.

For the working 1.1.0 assistant-question path, only eligible current Codex
worker metadata from a completed assistant message within the same known
active turn, with exact original message ID and zero-based question index,
permits a manual ordinary native answer in that active turn. Derive the native
title fragment server-side; do not trust client title text or restart a turn
from restored/history-only metadata. Never fabricate an approval ID or use
approval RPCs for it. Keep per-question drafts/partial replies independent and
distinguish native input acceptance from an answered question or successful
task. Unknown, truncated, unsafe, inactive or unbound metadata stays read-only
with a truthful native next action. Native terminal state ends eligibility;
CCNG ordinary-human-follow-up retirement is conservative policy, not a claim of
identical native cross-client behavior or proof of an answer. Keep per-question
unsent text and submission/error latches across worker switches only in existing
browser memory; refresh may discard them, with no localStorage/workspace/server
answer store. The candidate must hold automatic Coordinator/report/task-check/
summary/handoff input while verified live human input or ambiguous submission is
pending, using existing bounded queues and pre-send gates; verification remains
pending. Preserve shared ordinary-send gates, native ownership/permissions and
uncertain-send errors; no automatic follow-up/retry,
question store, broader Coordinator authority or Claude support is introduced.
Publication and deployed acceptance remain pending until actual verification.

Retain known native Codex child status for backend/Coordinator readback. Show its
activity in a default-collapsed Subagents section below Tasks. Delivered pending
child approval/question cards and necessary recovery warnings stay outside that
collapsed section, under the parent,
with source-child labels and original native choices. Verify parent lineage from native metadata;
keep the existing pending map keyed by original child thread ID and typed native
request ID. Parent/child context stays transient: no new store, timer, child tab
or worker slot. Preserve native permissions and manual/Coordinator review limits.
Keep parent input available when only a child waits and the parent's own gates
allow it. Never fabricate IDs or resume a child merely for discovery.
The user approved automatic native reconnection for open worker sessions and
verified children freshly reported active and waiting for approval, accepting
that the native resume operation can also continue existing work if the session
becomes idle. Use only metadata-only thread/resume with the original thread ID,
without config, permission or input overrides. A one-turn full initial page in
that same response can supply exact pending file changes omitted by durable
history; preserve newer live bodies. The user additionally approved one guarded
snapshot reconnect for an exact delivered file approval still missing its proposal
after bounded history lookup. Bind cwd as well as request identity, epoch and
history revision; consume the allowance on failed/empty eligible attempts so
polling cannot repeat them. Delivered actionable cards with available proposals
remain outside this exception. Native replay must supply the
original request IDs/bodies; never construct an approval or answer automatically.
Respect explicit pause/stop, ownership, handoff, current connection/history and
session identity. Do not intentionally reconnect idle, not-loaded, unrelated,
closed or Coordinator sessions. Coalesce attempts in existing jobs and prevent
repeated automatic retries of a failed/empty replay. Existing polling and lifecycle
hooks must cover restored worker and known-child waits without a new timer/store.
Native command checkpoints with kind humanCommand require a fresh human decision.
Advertise requiredHumanApproval only with manual-only controls and hard backend
Coordinator queue/review denial; never create reusable/session choices for them.
Keep raw native kind, IDs and callback confirmation. Unknown supplied kinds stay
unreviewable; internal attestation and verification exchanges are not user cards.
Native replay may include foreign worker dynamic-tool callbacks. Never answer
or refuse those callbacks; leave their original executor intact. Preserve the
separate handler for CCNG-owned Coordinator tools.
Retain delivered human requests that precede child discovery privately in the
existing bounded pending map. Expose or review them only after fresh native
parent-lineage verification; foreign requests stay private and cannot trigger
metadata reads. Details never delivered remain unknown; do not infer a complete
set or claim recovery merely because a native resume returned. Verify original
request delivery or an evidenced native outcome; unresolved waits stay explicit.
This Codex-specific work does not authorize another provider's implementation.


## Approved worker controls and layout

Keep a compact header inside the composer, directly above the chat input and
below the scrolling history. Put the current chat title in a compact coloured
folder-style tab attached to the input below it. Keep the adjacent colour
selector and Codex input/activity/connection indicators on neutral backgrounds,
outside the coloured title. It belongs to the input area, not the top of the chat
pane. Keep the top-right branding and smaller text than the composer. Offer six
theme-compatible choices: cyan, violet, green, blue, teal and rose. Store choices
in existing browser preferences per conversation; migrate saved amber to blue
without losing unrelated preferences. Amber remains reserved for attention.
Confirm Input received only after native input acknowledgement. Keep real native
worker-update age separate from browser/backend heartbeat freshness; disconnected
or delayed updates show last-known activity, never an invented stuck diagnosis.
Do not add status-only pings or restart/resend work for activity indicators.
The separately approved task-attention schedule below is not a connection probe.
Claude activity integration remains deferred. Default shell installation goes to
~/commandcenter-ng; --prefix selects another home-contained app directory.
Preserve existing installations and require their explicit path for updates.

Escape uses the existing Interrupt action for the visible eligible native turn.
Keep local dialog/question/select/summary-review/resize and composition Escape
behavior; do not send repeated interrupts or affect background tabs.

Use the native model catalog and supported efforts for worker-only model changes.
Update only per-thread model/effort settings for subsequent turns and confirm
native state; do not interrupt the active turn, answer requests or change global
settings/permissions. Preserve coordinator restrictions.
Keep the desktop sidebar resizable with bounded browser-local width, keyboard
controls and stacked mobile layout. Align the coordinator with the chat column,
keep it immediately before Add agent, and display the version badge at its
existing font size in the composer footer. Chat text shrinks with its column within a90ch maximum width.
The named Standard Task Report format lives in server/worker-instructions.md;
the coordinator backend owns saved intervals and sends silent one-off timer triggers.


## Proportionate coordinator helper review

When needed for an exact pending action, read the directly referenced helper's
source, including startup statements and called functions. Do not routinely
recurse into imports or library implementations. An unread dependency alone is
not a reason to refer an otherwise understood, authorized action to the user.
Escalate concrete unresolved effects, targets or authority concerns revealed by
the action/helper. Keep source reads bounded, read-only and tied to current
command approvals, with changed-source checks; never execute the helper or read
credential/Vault data. Existing approved credential sources need no new choice.
The existing source-reader tool can use the same helper checks and return exact
current approval bindings, preserving older coordinator conversations. Reading
source does not approve a command or expand native permissions.

Source review includes safe playbooks, `.yml`, `.yaml`, `.json`, `.md`, `.py` and
`.sh` files alongside existing code formats. The file format alone is not a
reason to refuse a referenced playbook or document. Preserve exact approval
binding for outside-project files, existing project boundaries, content/path
secret protections, no execution and the current user-authority checks. Literal
credentials and Vault payloads remain excluded; source references are not
resolved to retrieve protected values.

Resolve approval-linked helper paths under the exact native approval cwd, using
worker cwd only when native cwd is absent/null. Return and recheck the directory
alongside command/source hashes. The older reader checks approval references
before the worker project and refuses ambiguous directories. Keep resolved
hidden/sensitive paths excluded even when the caller supplies a relative name.

Recognize an explicitly imported fully qualified Python module only at the exact
approval cwd or its `src` layout, mapping the full dotted name to a `.py` file.
Do not search packages, environment settings or virtual environments, resolve
dependencies, import the module or execute embedded code for source inspection.
Keep existing hidden/sensitive/data/content checks and source/command/cwd hashes.
Reader fixes do not approve an action or clear an existing manual ask.


## Shared runtime rules, ordinary-chat inputs and local Claude

Import the local Setup-Agentic-Dev-Environment/AGENTS.md into worker runtime
instructions and the coordinator, without recursive self-import, automatic
fetching or native permission changes. Codex context is read at app-started
turns; an existing managed Claude process retains its startup context until its
next process startup. Missing sources must be identified truthfully.
When structured questions are unavailable, workers with existing Beads-write
authority create/reuse a current-conversation input record labelled
ccng-chat-question. Only the worker resolves it after processing an actual
answer/withdrawal. The coordinator reads it, never writes records or treats it
as a native approval. Do not infer closure from chat, idle state or delivery.
Show ordinary recorded questions once in Tasks with a Question label; retain
native Open questions separately. Sort actual Needs input entries first after
dependency-derived queued classification. Task descriptions awaiting user input
must explain Context, Input type and exact Input needed. Do not invent missing
details for legacy records; retain the explicit clarification action.
Keep SDK tool/MCP grants manual and tied to exact callbacks. Do not take over an
external active CLI session, change native auth/settings or claim live model
validation from fixtures. Closing a tab keeps managed processes running; app
shutdown ends SDK-owned runs and retains native history. Claude branching is
not yet integrated. Preserve explicit closed-tab request reopening.
Task rows use natural height with a viewport sized to the first three rows;
assignee names remain in backend metadata rather than row presentation. Model
and Effort labels/selects stay on one line; omit routine descriptive paragraphs.

The user approved draggable horizontal overview boundaries. Resize adjacent
section heights with usable minimums and independent scrolling, using existing
browser-local layout preferences. Preserve keyboard controls, natural/reset
heights, mobile stacking and three-task default until explicitly resized.

## Task attention and notifications

Coordinator project cards keep report cadence beside the project name. Show
the worker's actual Needs input task titles in the task overview's amber before
implementation summaries. Exclude queued dependencies and unavailable tracker
rows, preserve worker identity/native status and whole-card tab navigation.

Per-task Notify me controls follow the state near the task title. Store only
worker/task subscription IDs in existing browser workspace preferences. Use
existing snapshots and first-observation baselines, never infer completion from
missing records or replay historical changes on refresh/reconnect. Runtime
requests/errors without task identity stay worker-scoped. Desktop notifications
are optional, generic and permission-gated. Send observed opted-in events through
the browser Notification API even when the page has focus; do not add in-app
completion/needs-input/error notification banners or a fallback panel. Permission
problems remain visible through existing settings feedback. No external
delivery service, service worker, separate store or closed-browser delivery is
approved. Notifications must never answer a question or change task state.

## Priority task reports

Prioritize due and one-off Standard Task Reports before ordinary work at the
next safe response checkpoint, using known evidence without extra project work
or waiting for task completion. Then resume authorized work. Explicit reports
can use existing safe active Codex steering; ordinary summaries/settings retain
idle gates. Keep native message identity, pending-request/pause/handoff gates,
failed/in-flight messages, bounds and coalescing. Never interrupt an unsafe
operation or answer questions/change permissions to force report delivery.

## User-level service management

The user approved a user-level systemd service with lifecycle/status/log controls
through the installed launcher. Preserve runtime options and native profiles,
private unit ownership and unrelated units. Unit installation reloads the user
manager but start/enable remain explicit. Do not change lingering or native
daemons automatically, interrupt running work for tests, or claim live service
activation from synthetic fixtures. Respect protected host filesystem boundaries.

## Approved clipboard images and saved report cadence

Clipboard image paste uses per-chat browser memory for unsent drafts, removable
previews and native provider image inputs. Refresh discards unsent images; text
drafts retain existing persistence. Sent images remain in native history. Serve
supported inline image content through authenticated exact message references
without repeating image bytes in workspace events. No upload directory, image
draft storage, remote image fetch or new attachment database is approved.

Command Center now owns saved report intervals and sends silent timer requests
through the existing safe native delivery queue. Workers stop older reporting
loops and generate one Standard Task Report per trigger. Browser refresh keeps
the backend schedule; startup initializes saved enabled intervals once. Preserve
native request/pause/ownership guards and distinguish queue acceptance from an
actual report. This explicitly supersedes the earlier agent-managed timer rule.

## Claude process ownership decision

The user explicitly rejected an additional daemon or service for Claude runtime
ownership. Keep the official Claude Agent SDK in the existing CCNG backend.
Stopping/restarting that backend currently stops its SDK-owned Claude processes;
closing a browser/tab does not. Saved history permits resume, not uninterrupted
execution. Do not claim restart survival or introduce a separate worker service
without a new explicit architectural decision.

## Approved startup dashboard refresh

After saved state is loaded, refresh the coordinator dashboard from current
worker history, stored tasks/blockers and saved report intervals/next due times.
Queue one silent fresh startup report only for workers with enabled report
intervals. Never excludes all automatic reports, including startup; use stored
summaries/tasks without requesting a worker model turn. Report now remains a
manual one-off. Coalesce existing startup timer/Report now work and do not change
user-selected intervals. Cancel only unsent automatic requests when selecting
Never; preserve explicit manual, failed/unconfirmed and in-flight requests. Publish
sidebar progress with available evidence immediately, then use existing
throttling for newly arrived startup results. Do not wait for all workers or
add repeated acknowledgements/chat prompts. Preserve paused startup intent,
native questions, source/approval protections, ownership and failed-send guards.

## Silent task-attention checks

The user approved a fixed ten-minute backend cadence for silent worker task
checks. Reuse the existing coordinator clock/queue and native input path.
Ask each open Codex worker to inspect neglected Beads work and reassess independent
authorized tasks that can run in parallel without conflicting writes or resources.
Also inspect outstanding subagents, tool calls and external jobs using available
exact IDs, start times, last returned results, last evidenced progress and current
status. An in_progress label or launch acknowledgement is not proof of progress.
Investigate stale/unknown waits promptly with bounded authorized checks or
targeted follow-up; identify approval/input waits, evidenced running, completion,
failure or unknown state without inferring them from age alone. Collect results
and update tasks or surface the exact blocker/next action. Do not blindly cancel,
duplicate/retry uncertain operations, answer approvals or change permissions.
For diagnosed stalled children, the main agent may use existing native controls
to interrupt only a demonstrably safe stalled child wait, preserving history,
findings and request context. First establish actual waits and external-job state;
missing job IDs prove no absence. Preserve real external work and genuine user
decisions. Use a conditional pwd-only probe under unchanged permissions, verify
each affected child's reply and resume its specific authorized next step. No
blanket periodic probes, approval bypass, blind retries or user-stop overrides.
This is a reminder to the agent, not a dispatcher selecting or executing tasks.
Process silent task checks without opening commentary, tool-use introductions,
acknowledgements, plans or no-change summaries, including before tool calls.
This internal-control exception takes precedence over generic opening/progress
guidance. Keep useful findings, errors, genuine questions and substantive work
updates visible; end quietly when nothing is ready.
Do not echo triggers/acknowledgements in either chat history. Show the coordinator
counter “Next chat task-ping to send” with the next scheduled local time.

Begin a fresh interval after startup/restoration; do not replay missed cycles.
Coalesce outstanding checks, preserve failed/uncertain delivery, and respect
coordinator pause, worker ownership, native questions, handoff and user stop.
Use the existing safe native input path for idle workers or a known active
Codex turn. The worker handles the check at its next safe checkpoint; never
interrupt a tool or bypass a native request to deliver it.
Never/report interval controls remain unchanged and apply only to task reports.
No Goal, new permission, deferred-work authorization or extra service is implied.

## Task lifecycle and withdrawn Goals feature

The user withdrew native Goals as a CCNG feature and provider requirement.
Do not create task Goals, announce Goal creation or reinstate Goal controls,
routes, state, automatic continuation or a replacement dispatcher. Preserve
existing native Goal data and explicit pause/clear decisions; removal does not
clear or resume runtime objectives. Existing branch handoff may inspect/pause
native continuation only to establish its already-approved safe checkpoint.

Keep ordinary Beads tracking: record task outcomes and acceptance criteria,
update states after actual completion, blocking/input waits, deferral/withdrawal,
failure, reopening or dependency clearance, and reassess authorized ready work.
Use native parallelism for independent authorized work. Never infer completion
from idle, reports or task-record creation; preserve questions and permissions.
Task instructions encourage continuation but do not guarantee autonomous wakeup.
The coordinator retains its read-only role; all Claude work remains postponed.

The user approved a draggable horizontal divider between history and the whole
composer (title/status strip, text input and footer). Preserve keyboard controls,
cancel/reset and available-history bounds. Store the size in existing browser
preferences; do not add server settings or alter worker/native state for resizing.

The worker overview starts with `Project: {chat/project name}`, without a GOAL
label. The Coordinator heading stays unchanged. Overview
fonts are one pixel larger than their previous sizes, with font families and
size differences preserved. Coordinator sidebar recaps aim for20 words and must
not exceed 25 words total across summary/blocker/next action; this does not limit
full task or native-question details or change review authority.

The user approved default startup on exactly the one selected default-route
IPv4 address plus 127.0.0.1, using the same port and process. Other external IPs
remain unbound; explicit --host selects only its address. Share workspace/auth
state, roll back partial starts and close both listeners on shutdown. Preserve
strict public-origin checks while permitting exact same-origin native HTTPS on
the local listener only with loopback socket endpoints. This fixes SSH tunnel
login; it does not grant HTTP/proxy-header exceptions or certificate trust.

Chat colour applies to the compact title folder tab attached above the input
and to the currently active top conversation tab, using the same background
tint. Preserve the status/frame colours. Keep the saved tint visible while
typing; inactive top tabs, selector, status area and input frame retain their
neutral/existing fills.
Preserve readable contrast across all three themes, small text and visible
keyboard focus. When narrow layouts stack status indicators, place them above
the title row so they do not separate the folder tab from the input.

Preserve soft line breaks and spacing in user-message Markdown text blocks so
multi-line pastes remain readable. Keep Markdown/code/table support and assistant
formatting, raw-HTML exclusion, copied source and native history unchanged. Do
not execute, classify or rewrite pasted terminal content.

The approved mobile layout is one naturally scrolling page: one horizontally
scrollable tab row without hover expansion or row switching,
full-width overview above chat history in the document flow, then a six-line
input with internal overflow. The user selected one-page history scrolling,
superseding the earlier approximately 30-line nested chat viewport. Do not
overwrite saved desktop chat positions from the non-scrolling mobile history.
Hide the worker Coordinator recap and resize handles on mobile, including landscape phones. Ignore stored desktop
dimensions without erasing them; retain desktop controls and the actual
coordinator dashboard. Touch scrolling must not reorder tabs. Keep phone
keyboard/rotation acceptance distinct from source/build checks.


The user explicitly scoped overview compaction to MOBILE ONLY. Keep the mobile
settings row collapsed by default with current report cadence and Report now
visible; interval and model controls stay mounted and accessible on expansion.
Keep queued/pending/error feedback visible, and retain question sections for
actual requests or attention/recovery even without request details. Empty
questions and static coordinator guidance may be omitted on mobile; tasks,
input-needed titles and dashboard controls remain available. Preserve desktop
layout, fonts, saved dimensions, three-task viewport and history/input bounds.


The desktop overview must fit its available browser/pane height. Keep the report
and model settings at its bottom, with independently bounded scrolling for upper
content/tasks/questions as needed. Saved resize heights cannot force document
overflow or push settings offscreen. Preserve resize keyboard/cancel/reset and
make settings feedback reachable on short windows. Mobile retains its continuous
page and compact settings; desktop pinning must not apply to narrow/coarse-touch
layouts. Do not change native task/request semantics for layout work.


## Edit/Rewind withdrawn; preserve traceable communication

The user withdrew Edit/Rewind to keep original communication and decisions
traceable. This supersedes the earlier whole-turn approval and withdraws all
individual-message and Claude rewind variants. Do not offer previous-message
editing, conversation rewind or history-edit controls in CCNG. Use follow-up
messages to correct or supersede earlier instructions and decisions while
preserving their original record. Branching remains separately supported and
preserves the source conversation. Other deferred Claude integration work,
native permissions, tasks and deployment ownership remain unchanged.


## Approved durable decision summaries

Persist coordinator decision summaries in owner-only decisions.jsonl beside
workspace.json, outside Git/checkout. Retain all entries until explicit deletion;
reload recent 200 at startup, keeping the existing last-20 panel. Save timestamp,
worker/project names, short Request summary, decision/rationale and native IDs
only; exclude raw command/helper bodies, credentials, active review tokens,
authorization quotes, answer forms and transport error bodies. Existing native
history remains the full reference; no automatic import of older history.

These are explanations, never authorization or replayable approval answers.
Loading the log must not submit native responses, change permissions or resume
work. Only future coordinator decisions are appended; report/delivery events
remain temporary. Mark storage pending/saved/failed separately from the real
native acknowledgement/outcome. Unsafe/corrupt/changed logs remain untouched
with a visible warning; disk failures cannot turn an acknowledged action into
an unconfirmed native outcome or trigger retries. Graceful shutdown drains queued
writes; hard kills and future unrecorded native acknowledgements have no durability
guarantee. Use bounded streaming/append and existing Node facilities, no database
or service, no silent truncation/rotation or automatic permission changes.


## Approved desktop tab expansion and rows

Above six conversation tabs, counting Coordinator, show two stable desktop rows;
place the selected worker row nearest the chat without changing saved order or
worker numbering. Normal desktop tabs share available strip width up to
Coordinator, retaining a minimum width for overflow. Hover expands horizontally
to reveal the full title, pushes neighbours aside and temporarily uses the tab's
saved chat tint; only the selected tab is taller. Keep Coordinator
separate and overflow reachable. Mobile overrides this with one horizontally
scrollable row, without hover expansion or row switching. Preserve native state,
focus, drafts, keyboard ordering, drag behavior and touch scrolling.


## Approved parallel approval analysis and event timing

Use at most two internal read-only approval analysts concurrently for independent
exact current requests. This is the initial bounded throughput choice, not a
latency guarantee. Analysts use the same policy as the main Coordinator and
only the bound read-only tools/context; they cannot execute commands, change
files, send messages, delegate or answer approvals. The main Coordinator remains
the sole automated approver, preserving real user authority, exact request/token,
command/cwd/source checks, native confirmation and all manual controls.

Prioritize pending approvals and ready findings over optional recaps. Findings
are recommendations, never authority; do not duplicate running analysis or
accept changed/stale evidence. Preserve Request/Concern/Next explanations and
manual pending asks. If an analyst receives an unexpected native question or
permission request, retain the exact callback, expose the error and native-client
next action, and grant no analyst permissions. Do not blindly retry uncertain
starts, blocked requests or unconfirmed actions to free a slot.

Before selecting canonical shared environment instructions for analysts, read
the main Coordinator's actual native working-directory metadata; do not select
the source from a stale cached directory. Carry up to twelve actual worker user
instructions and up to eight existing older-authority page cursor hints. If the
retained worker tail has no genuine user instruction, read at most one first
native history page. Main review rechecks any original paged user instruction,
including a first page identified by a null cursor. Preserve the existing
authority-page records, exact user quotes and final authority checks; add no
authority store or permission fallback. State missing actual sources honestly;
missing context alone does not establish that the requested action is forbidden.

Retain the earliest scheduled event wake and latch urgent priority across later
routine events. Defaults are a 1.5-second urgent debounce and 30-second routine
interval, not model-response or approval deadlines. Preserve native pause,
ownership, questions, active-turn gates and existing report/task-check schedules;
do not add another timer, dispatcher or permission path. Distinguish source and
synthetic verification from production deployment and real model/browser tests.

## Native request time and selected-tab attention

Show approval creation time from native `startedAtMs`, using a full local date
and time with seconds/time zone and its corresponding ISO value. Missing or
invalid native time is unavailable; do not replace it with browser arrival,
observation, chat time or rendering time, and add no timer or estimate.

Keep genuine human-attention top edges amber on selected tabs across all three
themes while preserving saved chat-colour fills. Eligible requests awaiting an
available Coordinator remain neutral under the existing attention policy; a
pending request alone does not establish that the user must answer. Preserve
manual native controls, identity, permissions and confirmation behavior.


## Readable AAP references

In user-facing AAP procedures, progress/results, reports and input requests, pair
each referenced object ID with its verified readable name. This covers jobs,
job templates, workflow templates and runs, projects, inventories, hosts,
credentials and other AAP objects. An ID alone does not identify the work to the
reader. Use generic formats such as `Job <id> — <actual job-template name>`,
`Inventory <id> — <actual inventory name>` and
`Credential <id> — <actual credential name>`.

For a job, name its actual job template and include the job's own name when it
differs; for a workflow run, do the same with its actual workflow template and
run name. For an ad hoc job without a job template, say
`Ad hoc job <id> — <verified readable purpose>`; do not invent a template.
Use names supported by existing authorized evidence. If a name is unavailable,
state `<object type> <id> — name unavailable`; do not guess or request secret
credential values to identify an object. Keep published instructions and
examples generic, without real environment names or protected values.

This is a reporting rule only. It grants no additional AAP access, configuration
change, diagnostic scope, native permission or model change.

Analysts are optional assistance, never a barrier to a main Coordinator decision
when sufficient current action, source and actual user-authority evidence is
already available. Retain every existing final check. Missing evidence may wait
for analysis; a running label alone establishes neither progress nor authority.

## Approved combined progress delegation and history order

The user selected one additional native progress helper for routine worker
monitoring, linked tasks/blockers and sidebar recaps. It is separate from the two
read-only approval analysts. Reuse existing RPC/events, selected main model/effort
and shared instructions. Limit tools to bounded worker reads and sidebar
publication. Main retains final approvals, concern responses, user decisions,
direct questions and relevant relays; do not duplicate routine monitoring or
wait for it before an approval. Preserve actual authority, native requests,
pauses, stops and unknown outcomes; no task writes, execution, new service/store
or independent timer. Saved main tools remain for client compatibility.

Native turn/item order governs chat history. Preserve older loaded pages, paging
boundaries and newer live records across overlapping reads without timestamp
sorting or silent record trimming. Existing explicit 20-turn pagination remains.
