# CCNG 2.x cleanup

## Purpose and agreed scope

**2.x is a cleanup track for the same application and intended feature set.**
The user confirmed this direction on 2026-11-27. Improve correctness, simplicity,
clarity and maintainability through small, testable changes. Preserve security,
native permissions, conversation history, pending requests, saved settings and
supported workflows. Correcting existing bugs belongs in this scope.

The development branch is `2.0.0-beta`. Creating that branch does not create a
separate running application, publish a beta release or authorize deployment.
This document starts the cleanup discussion; it does not start implementation
or select a new architecture. New features, provider expansion, new services,
frameworks and material design changes require their own discussion and scope.

## Review baseline and limits

Analysis date: **2026-11-27, Europe/Vienna (CET)**; exact review start/end times
were not recorded. Reviewed application version: **1.47.5**. The working tree was
clean at source commit `1ef3ec44bcb188fd7ebeac074a911d5c77d1fef0`.

Four independent read-only reviews covered the frontend, backend lifecycle and
Coordinator, native runtime adapters, and tests/documentation/deployment. The
primary reviewer cross-checked representative findings and Git status. No tests,
builds, installations, deployments, restarts or refactoring changes were run as
part of this analysis. This is a static maintainability review, not formal AAP
compliance acceptance or a new functional-test result.

Source references below use the reviewed commit's line numbers; they can move
as cleanup proceeds. Findings distinguish code-supported failure paths from
observed behavior and unverified causes. Public documentation contains no
private endpoints, session IDs, credentials or conversation transcripts.

## Overall assessment

The underlying architecture is appropriately lightweight: a React/TypeScript
frontend, one Node.js backend, direct native provider interfaces and small
private metadata files. The application does not need a replacement stack or a
new service layer to address the findings below.

Most accumulated complexity is in mutable state, recovery, lifecycle ordering
and UI coordination. Those paths have become harder to understand and can
behave inconsistently after failures. Testing effort is substantial, but some
checks reproduce implementation details while real browser workflows remain
unverified. Stabilizing existing behavior should take priority over extending
the feature set.

## Findings and proposed improvements

### High: reconnect paths restore different things

Automatic connection recovery calls `rpc.connect()`, while the explicit reconnect
route also resumes owned conversations and reloads history. Existing `open()`
returns its cached agent, and polling reloads messages only for observing-only
workers. An owned conversation can therefore retain stale messages after the
transport recovers. This matches reported stale-history behavior; the exact
live notification-subscription loss was not independently reproduced.

Evidence: [automatic connection](server/main.mjs#L135),
[explicit reconnect](server/main.mjs#L283), [cached open](server/workspace.mjs#L278),
[observed-history refresh](server/workspace.mjs#L647).

Proposal: define one narrowly scoped reconciliation operation for reconnects,
with explicit ownership and pending-request guards. Preserve startup's read-only
restoration rules; do not turn a shared helper into permission to resume every
idle conversation or replay input.

### High: one stalled Send can block every chat

The frontend's API helper has no application-level wait deadline. Sending holds
one shared `busy` value, and every conversation's Send availability checks it.
A request that never settles can leave unrelated chats unable to send.
This is a source-supported failure path, not proof of a particular incident.

Evidence: [API helper](src/main.tsx#L77), [Send gate](src/main.tsx#L429),
[send lifecycle](src/main.tsx#L600).

Proposal: keep pending-send state per conversation and make an unresolved browser
wait visible. A timed-out POST means delivery is unconfirmed; it must not cause
automatic resending or imply that native agent work stopped.

### High: actual browser workflows are not sufficiently established

Mobile layout tests inspect selected CSS rules rather than actual keyboard or
browser geometry. The reported keyboard-open screenshot shows the composer's
bottom control row clipped. The earlier reserved Send cell addresses wrapping,
not every keyboard/viewport condition. Deployment health checks also do not
establish successful sign-in, incoming chat updates or usable mobile controls.
The README already acknowledges these limits.

Evidence: [mobile test scope](tests/mobile-layout.test.mjs#L18),
[keyboard limitation](tests/mobile-layout.test.mjs#L183),
[deployment health check](ansible/deploy_command_center.yml#L512),
[documented limits](README.md#current-scope-and-limits),
[current compact composer](src/style.css#L1087).

Proposal: add a small representative functional acceptance scope for protected
login, sending and receiving a reply, reconnecting a populated chat, and Send
visibility with the phone keyboard open. Reuse existing tooling where suitable;
any new tool/framework needs the existing approval. Preserve natural mobile
page scrolling and desktop behavior while diagnosing the measured obstruction.

The repeated browser BasicAuth challenge remains a separate unresolved issue.
Backend asset checks do not prove what the phone receives through a protected
proxy. Do not claim a frontend fallback or removal of authentication fixes it.

### Medium: small changes repeatedly rebuild the entire workspace snapshot

Each change can publish at an 80 ms cadence. A snapshot transforms every open
agent and retained message, then serializes that whole workspace for browsers.
Backpressure bounds queued writes but does not remove repeated transformation,
serialization and transfer of unchanged history. Long conversations can impose
work on unrelated tabs and mobile clients; the cost has not been benchmarked.

Evidence: [broadcast path](server/main.mjs#L162),
[whole snapshot serialization](server/main.mjs#L190),
[message projection](server/workspace.mjs#L233).

Proposal: reduce unchanged transcript work and scope updates to changed data,
keeping earlier history available through existing history mechanisms. Compare
simple caching or narrower snapshots before considering a new update protocol.
No message broker, new service or transport framework is proposed.

### Medium: protocol and handler errors can become invisible

The RPC message callback catches both JSON parsing errors and synchronous
application-listener exceptions, then emits `protocolError`. No subscriber was
found in the reviewed source. An update can be discarded while the connection
still appears ready. This is a confirmed silent-error path, not the established
cause of the reported outage.

Evidence: [RPC message callback](server/rpc.mjs#L30).

Proposal: distinguish malformed native data from application-handler failures
and surface sanitized diagnostics through existing logging/status paths.

### Medium: lifecycle state and dense code reduce clarity

Coordinator deliveries, pending reports, versions, responses, schedules and
other lifecycle state live in parallel maps and flags. Transitions and cleanup
are spread across several methods. The workspace snapshot also combines many
transformations in one very long expression. File length alone is not a defect;
the issue is how many relationships a maintainer must hold in mind to change one
behavior safely.

Evidence: [Coordinator state](server/coordinator.mjs#L77),
[delivery transitions](server/coordinator.mjs#L954),
[delivery flushing](server/coordinator.mjs#L1013),
[workspace snapshot](server/workspace.mjs#L233).

Proposal: group state that shares one lifecycle, centralize its transitions and
cleanup in focused helpers, and expand dense multi-action lines into readable
steps. Keep uncertain-delivery, request-identity and asynchronous revision guards.
A general state-machine framework is not justified by this review.

### Medium: some tests have become a miniature UI framework

Some tests extract JSX/functions by exact source names, transpile reconstructed
code, implement their own React-like hooks/effect scheduler, or require specific
source expressions. They can be expensive to maintain during harmless refactors
while still not reproducing real browser behavior. Reconnect fixtures also treat
`thread/read` and `thread/resume` alike and return empty history, hiding the
subscription distinction involved in recovery.

Evidence: [source extraction](tests/reboot-codex-ui.test.mjs#L8),
[custom hook fixture](tests/reboot-codex-ui.test.mjs#L40),
[reconnect fixture](tests/reboot-runtime.test.mjs#L46),
[initial-availability scenario](tests/reboot-runtime.test.mjs#L81).

Proposal: test named behavior directly where practical; gradually retire brittle
source-shape assertions. Add a populated-chat disconnect/reconnect regression
whose fake models subscription semantics. Keep useful CSS invariants and the
existing preservation/no-replay tests. More test count alone is not the goal.

### Medium: browser recovery and startup failures need visible outcomes

Browser stream recovery reacts to reported errors, but a silent stream stall
only changes a status label. Snapshot parsing has no error handler that invokes
the existing recovery path. The static application shell also has no visible
fallback before React renders. A failed asset or early startup error can leave
a blank page, although neither path establishes the cause of repeated BasicAuth.

Evidence: [stream observation](src/worker-status.tsx#L63),
[snapshot recovery](src/main.tsx#L507), [React mount](src/main.tsx#L728).

Proposal: reuse the existing state-revalidation path for failed snapshots and
returning to the page; retain clear unknown-connection status. Provide a small
static startup/failure message. Avoid a parallel polling service or another
recovery mechanism.

### Medium: provider state needs clearer identity, bounds and recovery

Claude's requested Auto preference, operator override and observed native mode
represent different facts, but naming and resolution are scattered. In
particular, `configuredAuto` reports operator-list membership rather than all
ways a chat can request Auto. This does not establish a new-chat Auto-default
failure, and genuine native user questions remain human decisions in Auto mode.

Evidence: [new-chat intent](server/claude.mjs#L197),
[startup mode selection](server/claude.mjs#L275),
[permission readback](server/claude.mjs#L556).

The optional Mistral adapter caches a connection-attempt promise without clearing
it on startup failure/disconnection. Subsequent attempts can reuse a rejected
promise or closed transport. Address that before treating the optional runtime
as accepted; it is not evidence of the current browser problem.

Evidence: [connection promise](server/mistral.mjs#L43),
[disconnect handling](server/mistral.mjs#L245).

Claude also accepts absent session IDs before applying mode updates from
`init`/`status` events. That display update does not require parent-event
provenance. It can therefore change the displayed mode without the exact
identity checks already used for native activity. Require matching parent/session
identity for authoritative readback; this static finding does not establish the
cause of the reported handover complaint.

Evidence: [event identity and mode update](server/claude.mjs#L355).

Claude retains a bounded display window but imports history before trimming it.
The optional Mistral adapter accumulates messages, streamed text and tool context
without equivalent aggregate bounds. These are distinct from per-message limits;
actual runtime cost was not measured. Prefer bounded projection or reuse of
unchanged imported history, and release terminal tool context when safe.

Evidence: [Claude history projection](server/claude.mjs#L234),
[history collector](server/claude-notifications.mjs#L14),
[Mistral retained state](server/mistral.mjs#L135).

Proposal: make requested mode and its source explicit through one resolver while
retaining native readback separately. Keep connection-attempt state separate from
established transport state and preserve unknown outcomes when recovering.
Provider differences do not justify a new generic adapter framework here.

### Lower priority: simplify repeated layout and verification instructions

Responsive rules redefine panel and composer behavior in several places; later
compact-layout rules undo some earlier restrictions. Consolidate the affected
rules when fixing the measured issue, preserving desktop behavior and natural
mobile scrolling. This is a clarity improvement, not proof of the clipping cause.

Evidence: [earlier compact rules](src/style.css#L469),
[later overrides](src/style.css#L1035).

Several installed verification recipes repeat temporary-directory and source/test
copying steps. Consolidating that shared procedure into one maintained invocation
would reduce drift. Keep its tested source/installation and component-versus-live
scope explicit; use existing tooling before proposing another framework.

Evidence: [installed verification recipes](README.md#development-and-contribution).

## What should remain

Retain the single-backend structure, direct official SDK/ACP interfaces, native
ownership of execution and permissions, exact request identity, epoch/revision
guards, no automatic resend after uncertain delivery, private atomic persistence,
draft preservation, focused interaction components and memoized message rendering.
These safeguards address real requirements. Removing them to shorten code would
not be a useful simplification.

## Proposed cleanup sequence

Start with recovery correctness and error visibility. Demonstrate the known
failure with a focused regression, then make automatic/manual reconnect behavior
consistent within existing ownership boundaries and isolate each chat's pending
input state.

Next, clarify state ownership and reduce avoidable snapshot/history work. Prefer
small, local changes whose effects can be checked; measure a meaningful workload
before choosing a more elaborate optimization.

Then simplify the test scaffolding and layout rules while checking representative
browser workflows. A passing build or source assertion does not replace actual
phone-keyboard and protected-login acceptance. Consolidate affected responsive
rules during relevant fixes rather than rewriting the whole stylesheet.

These are proposed work areas, not newly assigned implementation tasks or a
replacement task tracker. Durable work, blockers and outcomes remain in Beads.

## Branch and release approach

Keep `main` as the existing release line and do cleanup work on `2.0.0-beta`.
Use small, focused commits with a clear behavior being preserved or corrected,
relevant tests and current documentation. Bring necessary fixes from the release
line into the cleanup branch deliberately so the branches do not drift apart.

The benefit is a reviewable place for cleanup while the working release remains
available. The cost is keeping two lines consistent; a long-running, wholesale
rewrite would make that cost and regression risk much higher. Reassess changes
frequently and avoid a large, unverified final merge.

A Git branch isolates source changes, not services, native sessions or private
configuration. Do not point the running installation at this branch merely to
try it. Any separate runtime/testing arrangement or deployment remains subject
to existing scope, architectural consultation and permissions.

The branch name is a development label. This documentation-only branch starts
from application version **1.47.5**; it is not a released **2.0.0** beta. Update
authoritative numeric version metadata together with authorized code work under
the project's existing versioning rules. Claim a release or successful deployment
only from its actual publication and acceptance evidence.
