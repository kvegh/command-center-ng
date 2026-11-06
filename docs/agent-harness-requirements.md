# Requirements for agents and harnesses

This reference is derived from Command Center NG's source, tests and recorded
decisions through 0.27.3. It is a guide for assessing another integration, not
an implementation of one or a claim that another product is compatible.

The main finding: **model access alone is insufficient**. A managed integration
needs a native session interface, truthful state and history, safe input/control,
and a way to handle every human request on which that runtime can block.
Advanced capabilities may be unavailable if the limitation is explicit.

## What we are integrating

| Term | Responsibility |
| --- | --- |
| Model | Produces the underlying responses; a model choice alone does not identify a session runtime. |
| Agent | Follows project scope, reasons about work, uses tools, asks questions and maintains task records. |
| Harness/runtime | Runs the agent loop, owns tools and permissions, maintains native sessions/history, and exposes control and lifecycle events. |
| CCNG | Presents and controls local sessions, shows tasks/questions, coordinates eligible reviews, restores workspace views and schedules reports. |

For a name such as Gemini, Mistral, OpenCode or Copilot, first identify the exact
product, runtime/CLI/SDK, version, session interface and authentication method.
These names are candidates to assess; this document does not evaluate their
current APIs or recommend installing them. A raw model API would require a
harness as well; building one is a separate architectural decision.

Current code has explicit Codex and Claude routes, not a general plugin loader.
Adding a model to an existing harness and adding an entirely different harness
are different changes. See [workspace routing](../server/workspace.mjs) and
[native transport](../server/rpc.mjs).

## Established boundaries

- Sessions are **local to the backend host**. Browser access and Ansible
  deployment do not authorize SSH/remote session monitoring.
- Prefer the runtime's supported SDK/API and native history/settings. The
  existing backend hosts the integration. A new daemon, transcript database,
  authentication scheme or alternative transport requires a user decision.
- Preserve native authentication, sandbox, project settings and permission
  defaults. Missing dependencies require installation approval. Do not turn on
  permissive/automatic approval modes merely to make an integration work.
- Native history owns the transcript; Beads owns durable tasks. Private CCNG
  workspace metadata records open IDs, coordinator state and report settings.
  Browser-local preferences/text drafts are separate; unsent image drafts use
  browser memory. Do not create another authoritative copy of these stores.
- Worker tabs and native subagents are distinct. The current limit is sixteen
  workers plus one coordinator; the harness owns its own execution concurrency.

Sources: [contributor rules](../AGENTS.md), [workspace restoration](workspace-restore.md),
[workspace persistence](../server/workspace-store.mjs), and decisions
[0.5.0](../design_decisions_history.md#2026-11-04--restore-workspaces-and-refine-navigation-in-050),
[0.19.0](../design_decisions_history.md#2026-11-05--manage-local-claude-and-keep-worker-context-compact-in0190),
and [0.26.0](../design_decisions_history.md#2026-11-05--silent-ccng-report-timer-and-startup-recovery-in0260).

## Baseline for a managed worker

The following is an engineering summary of what the existing managed-worker
experience needs. It does not establish new permissions or require full Codex
feature parity from every runtime. An observation-only integration must be
labelled as such and must not expose unsupported management controls.

| Requirement | Needed behavior | Current implementation evidence |
| --- | --- | --- |
| Native identity and discovery | Identify the provider, native session, messages and execution boundaries; list/open existing sessions without confusing them with new sessions. Preserve parent identity where present. | [workspace](../server/workspace.mjs), [Claude adapter](../server/claude.mjs) |
| Project isolation | Read the actual native working directory/settings. New sessions require an explicit project directory. Keep coordinator and worker roles separate. | [workspace open/create](../server/workspace.mjs), [integration tests](../tests/integration.test.mjs) |
| Readable native history | Restore authoritative messages/tool activity without starting model work. Preserve native IDs across streamed/final updates and page history where available. State truncation/pagination limits. | [workspace history](../server/workspace.mjs), [Claude history](../server/claude.mjs) |
| Truthful activity | Distinguish running, waiting, idle, unavailable, failed and interrupted. Message completion is not necessarily turn completion; idle is not task completion. Do not expose private reasoning as a required integration feature. | [workspace events](../server/workspace.mjs), [Claude lifecycle tests](../tests/claude.test.mjs) |
| Input and interruption | Send to the exact session, preserve scope/settings, distinguish steering an active turn from starting another, and request native interruption. Recheck identity/availability after asynchronous work. | [workspace send/interrupt](../server/workspace.mjs), [RPC](../server/rpc.mjs) |
| Explicit ownership | Distinguish sessions controlled by CCNG from externally owned running processes. An existing transcript does not grant takeover or expose another client's callbacks. Unknown ownership/read failures must not enable takeover. | [Claude ownership guards](../server/claude.mjs), [Claude tests](../tests/claude.test.mjs) |
| Exact human requests | Expose all delivered blocking requests with their native identity, originating session, full action/options and native answer format. Keep simultaneous requests and nested questions distinct. | [native requests](../server/native-requests.mjs), [answer lifecycle](../server/workspace.mjs) |
| Confirmed outcomes | Sending an answer is not confirmation. Keep errors, timeouts, cancellation and stale/duplicate-answer protection visible; clear only after native resolution. Preserve unsupported human forms with an exact native next action. | [request tests](../tests/native-requests.test.mjs), [integration tests](../tests/integration.test.mjs), [Claude tests](../tests/claude.test.mjs) |
| Instructions | Supply project rules, the named shared AGENTS.md source and worker context through supported runtime mechanisms. Report missing sources honestly; document when running processes retain older startup context. | [shared instruction loader](../server/environment-instructions.mjs), [worker instructions](../server/worker-instructions.md) |
| Task cooperation | Working agents use the existing bd tracker with their conversation label. CCNG reads task/blocker/input state; explicit linking changes associations only. Agent prose and native plans do not replace durable task state. | [Beads integration](../server/beads.mjs), [task summaries](../server/task-summary.mjs) |
| Safe recovery | Reopening/refreshing a view must not replay actions, answers or queued messages. Separate read-only restoration from explicitly authorized startup reports. Disconnection and failed restoration remain visible. | [workspace store](../server/workspace-store.mjs), [restoration tests](../tests/workspace-store.test.mjs) |

For agents, clear handoffs also matter: state the next authorized step after
success and the concrete reasons to stop. Parallelize independent work where
useful, coordinate shared writes, and verify outcomes. A request to continue is
not new authority. The current runtime context is recorded in
[worker instructions](../server/worker-instructions.md) and
[coordinator guidance](../server/coordinator-prompt.mjs).

## Questions, approvals and coordinator review

The integration must distinguish clarification, command/file approval, native
filesystem/network grants, MCP forms/external steps and internal machine
exchanges. Internal tokens are not human questions. Status flags without
delivered request details do not prove ownership or that no request exists.
Recovery must obtain exact current details rather than invent an answer.

Agents must use the provider's structured question tool when it is available
in the current mode. The existing
fallback for unavailable forms is a worker-owned Beads input record labelled
`ccng-chat-question` and linked to the conversation. A reply must be processed
before the worker closes that record. The coordinator reads it; it does not
gain Beads-write authority or infer questions from punctuation.

The current coordinator is a **restricted Codex session**, even when workers
use another runtime. It reads open workers, publishes progress and queues
attributed messages/reports. Automatic review currently accepts only exact
Codex command/file approval request types. Claude tool permissions, other
permission grants and new user preferences remain manual. Another harness does
not inherit coordinator auto-review merely by providing an approval callback.

Eligible approval requires genuine user-instruction provenance, the current
request/token, exact action and bounded supporting source. Helper reads use the
approval's actual working directory and revalidate source/command evidence.
Reading a helper does not execute it or grant new access. Model review is a
judgment, not hard containment. Keep manual controls and concise decision reasons.

Sources: [coordinator implementation](../server/coordinator.mjs),
[approval-source reader](../server/approval-source.mjs),
[coordinator documentation](coordinator.md), and [coordinator tests](../tests/coordinator.test.mjs).

## Reports and silent control messages

CCNG owns saved 5-minute/15-minute/1-hour/Never reporting intervals. Reports use
the existing bounded delivery queue; native recurring schedules are not required.
Report now is one-off, timers coalesce with pending reports, browser refresh
does not reset cadence, and missed intervals are not replayed in a burst.
Never cancels future scheduled requests without cancelling explicit Report now.

Internal triggers reach the model but are hidden in CCNG presentation using
native identity/metadata, not by suppressing matching prose. Real user messages
and actual reports remain visible. Queue acceptance is not proof of delivery,
and delivery is not proof that a report has been produced. Preserve pending
requests, ownership, coordinator pause, branch handoffs and uncertain failures.

Reports receive priority at the next safe response checkpoint and use known
evidence without extra project work. Startup requests one silent fresh summary
per restored worker, including a one-off for Never, and publishes available
history/task/interval evidence without waiting for all workers.

Sources: [timer and queue](../server/coordinator.mjs),
[typed internal inputs](../server/report-messages.mjs),
[worker report routine](../server/worker-instructions.md),
[report tests](../tests/report-messages.test.mjs), and [startup tests](../tests/workspace-store.test.mjs).
The 0.26.0 backend timer **supersedes** the earlier agent-owned reporting design.
It does not schedule ordinary project work or guarantee unattended continuation.

## Capabilities to assess explicitly

Missing optional capability should result in a clear unavailable control, not
an imitation that silently changes its meaning. The existing UI has specific
capability guards; this table is not an already-implemented generic adapter API.

| Capability | Requirement when offered | Current limit or distinction |
| --- | --- | --- |
| Model/reasoning controls | Discover real native choices, validate per-session changes and confirm the result without global permission/settings changes. | Codex uses per-thread settings; Claude uses controls on an existing managed query. Claude restart persistence is unverified. |
| Branching and return | Native context/cutoff, parent identity and explicit summary delivery; archive only after accepted handoff, without duplicate confirmed sends. | Codex integrated; Claude branching not integrated. Completed-reply cutoff differs from branching current history. |
| Edit & rewind | Native conversation cutoff and edited resubmission, with exact input/turn semantics and clear history effects. | Requested/researched, not integrated. Codex native revert is turn-based and history-format-dependent; Claude resume/fork semantics differ. Files and external actions are separate. |
| Images | Native image input/history, validated size/type, authenticated exact message references and visible send failures. | Current clipboard limits are four images, 4 MiB each, 8 MiB total. Unsent drafts are memory-only; no remote fetch or attachment database. |
| Timestamps | Preserve native historical times; label live receipt fallback and leave unavailable history unknown. | A new provider must not fabricate old timestamps. |
| Subagents and parallel work | Surface real child identities/state where exposed; distinguish waiting for a child from waiting for the user. | No inference that every occupied slot is useful or that CCNG's tab limit controls native concurrency. |
| Native Goals/scheduling | Verify exact runtime support, budgets, stopping conditions and pause/resume semantics before exposing it. | Native Goals and a proposed stall watchdog are not integrated; neither replaces the approved report timer. |
| Restart survival | State who owns the process and what stops it; verify detach/resume separately from reading saved history. | Codex daemon is independent. CCNG shutdown stops its SDK-owned Claude queries; an extra Claude daemon was explicitly rejected. Tab/browser closure is different. |

Sources: [model validation](../server/worker-models.mjs), [branch lifecycle](../server/branch-summary.mjs),
[image validation](../server/image-input.mjs), [message times](../server/message-time.mjs),
[Claude adapter](../server/claude.mjs), and [recorded decisions](../design_decisions_history.md).

## Current implementation limits to retain in future comparisons

- SDK/CLI presence is not authenticated model readiness or proof of a live run.
- An arbitrary externally running Claude CLI session is observable, not
  automatically attachable for interactive management. Only delivered callbacks
  can be answered in CCNG.
- Closing a managed Claude tab leaves its process running. Later requests stay
  discoverable and offer reopening in CCNG; those SDK-owned callbacks cannot be
  answered by switching to a separate native client. See
  [closed-tab request coverage](../tests/claude.test.mjs).
- Claude history is currently bounded and has no older-page loading in the
  workspace adapter. Do not describe it as complete infinite history.
- A loaded instruction file does not establish agent compliance. An existing
  Claude query retains its process-startup context.
- Native SDK capabilities are not automatically CCNG features. Conversation
  rewind, filesystem checkpoint rewind and native session fork are different.
- Most control tests use protocol/SDK fixtures. Native-history fixtures do not
  prove live model authentication, browser behavior or unattended continuation.

## Evidence required before declaring another integration supported

Record the exact runtime/version/interface and ownership model, its real
authentication/permission behavior, supported operations and known omissions.
Use the existing project architecture; consult before selecting a new one.

Verification should cover relevant session/cwd isolation, read-only restoration,
stream reconciliation, input/interruption, simultaneous requests, native answer
confirmation, disconnects/stale identities, and unsupported capabilities.
Exercise instruction timing, task/report isolation, images/models/branching only
where offered. Use meaningful fixtures and a bounded authorized native smoke
check; distinguish code/build success from live provider and browser verification.
Do not install missing tools or change access controls to make checks pass.

For each candidate, summarize: **managed or observed; native session/history
interface; supported controls; human-request path; ownership/lifecycle;
instructions/tasks/reports; optional capabilities; validation and gaps**.
No candidate assessment or new integration is performed by this reference.

## Decision trail

These public implementation commits explain the main constraints. Later decisions
take precedence over historical proposals in older documentation.

| Decision | Implementation | Why it matters |
| --- | --- | --- |
| Native coordinator, 0.4.0 | `962041ced0ae6b4ff420dbeaad94f24367980324` | Separate restricted review from worker execution. |
| Private workspace restoration, 0.5.0 | `38063bf322a849ff0ddce14e205bf91e73de6a74` | Reopen views without action/approval replay. |
| Explicit project/role isolation, 0.8.0 | `e1e9363` | Prevent wrong-directory instructions and coordinator/worker mixing. |
| Every delivered request, 0.12.0 | `2f8a45ad9846ea9799112395cb9effc4bf945a36` | Preserve simultaneous requests and independent reviews. |
| Native request controls, 0.17.0 | `63c5cf173eef5c295c8041e3151e29b933fc167c` | Expose permission/MCP forms without broadening authority. |
| Official local Claude SDK, 0.19.0 | `d7d83b883a82dd73fae52e53d3d38b6ef82041af` | Real local management with ownership and instruction boundaries. |
| Approval cwd and older user provenance, 0.19.1/0.19.2 | `16006bccd4d7c17498ba26efed32d7b01ef46e51`, `3b3c868bc722c6abf7cb31b2abc2394e05fd8a0c` | Review the actual action against actual user authority. |
| Silent backend report timer, 0.26.0 | `09b9f37bcbc11c47a92a543713c62e03dd55da69` | Replace unreliable agent-owned reporting loops; retain native gates. |
| Startup summaries and intervals, 0.27.0 | `cfb0484f8b27670fc89a232a6a0e1b4a759d3bfa` | Refresh useful dashboard evidence without duplicate report requests. |

Full rationale and verification limits: [design decision history](../design_decisions_history.md).
