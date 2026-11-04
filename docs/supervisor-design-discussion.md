# Supervisor and approval-review discussion

Status: historical discussion summary. The user subsequently authorized
implementation; version 0.4.0 adds the native coordinator. See
[implemented behavior and limits](coordinator.md). This document preserves the
discussion and distinguishes requested ideas from the later implementation.

## Purpose and interface

Add one automatically started coordinator with a predefined prompt to follow the
one to four worker agents. It combines coordination, progress summarization and
review of pending approval requests.

The coordinator has its own chat tab, in addition to the four possible worker
tabs. The user can question it, change its direction and review its reports and
approval decisions. Visually separate this tab from the workers with a labeled
Coordinator group, spacing and a divider, while retaining a compact tab bar and
desktop/mobile usability. Its state and requests for attention remain visible.

The coordinator must be able to push concise summaries into selected worker
chats as actual messages the agents receive, not merely sidebar text. Attribute
these messages to the coordinator and preserve the source conversations.
How to deliver information to a busy worker without unwanted interruption or
starting unintended work remains a design detail to agree.

## Progress summaries

The coordinator can read the watched conversations' history, inspect their linked
Beads tasks and request task reports when needed. This provides more context than
rendering task titles alone and should reduce the mental effort of switching chats.

Summaries should state current work, meaningful progress, blockers, decisions
with brief reasons and useful next steps. Distinguish stored Beads state,
reported progress, verified outcomes and uncertain inference. Reading a chat
does not by itself establish that a task is complete.

Beads remains the durable task source implemented in 0.3.0. The supervisor adds
interpretation; it should not replace those records with guesses. Scheduling,
report-request frequency, model choice, context limits and summary delivery
mechanics have not been selected. Event-driven updates with coalescing were
proposed to avoid repeated model calls for unchanged work.

## Approval review on demand

When a native approval request arrives, the coordinator could read the exact
pending action, relevant project instructions, conversation context and any code
needed to understand its effects. It can then approve once, decline or ask the
user. Review is triggered by a pending request rather than constant approval
polling. A factual clarification may be answerable from established context;
new preferences, scope changes and architectural decisions still need the user.

The user clarified that read-only versus state-changing is not the right dividing
line. Authorized project work can include Python calls into AAP that create or
remove resources. It can also include deleting a VM to recreate it, or reclaiming
disposable test resources needed by another authorized test.

Proposed review guidance:

> Approve a pending action when it is a reasonably necessary step toward the
> user's authorized project goal, follows their instructions and approved
> decisions, and stays within the resources, environments and limits they have
> delegated. This may include reading, creating, modifying, replacing or deleting
> resources. Do not escalate solely because an action changes or removes something.
>
> Establish authority from the user's instructions and approved scope. Check the
> actual target and expected direct and indirect effects; the requesting agent's
> statement that an action is in scope is supporting context, not authorization.
> Approve only the exact pending request. Ask the user when authority, ownership,
> consequences or scope is unclear, when an explicit restriction applies, or when
> a materially new decision is needed. Do not expand your own authority.

For VM cleanup, the delegated pool and permission to dispose of its contents must
be established. Recreating an authorized disposable test VM can fit the project.
Removing a resource owned by another project or still needed by another active
test requires permission to reclaim it; freeing capacity alone does not establish
that permission. Specific existing restrictions remain in force.

## What separate and enforceable mean

Separate means user-controlled authority rules are distinct from the model's
working prompt and cannot be rewritten by the requesting or reviewing agent.
They could live within Command Center; a separate service is not required.
Their storage and protection mechanism has not been chosen.

Enforceable means checks outside the model can refuse an action. Application code
can validate request identity and allowed targets before answering. Restricted
credentials and service-side permissions can limit the effects of execution.

These checks have limits. Approving arbitrary Python with broad administrator
credentials authorizes a process whose later API calls may exceed the visible
request. Model-based code review is a judgment, not a guarantee of containment.
Stronger bounds would require checked structured operations or appropriately
restricted execution credentials. No new API wrapper, credential, permission
change or enforcement service has been selected or installed.

## Existing evidence and remaining choices

Read-only inspection of assistant-team found a reusable event-driven private-reader
pattern. Its current summarizer requires Claude. Its permission-management document
is a proposal; the current team integration does not provide a working remote
Codex approval relay. Using a Codex coordinator inside Command Center was proposed
to keep the installation self-contained. No runtime integration was selected.

Command Center 0.3.1 waits for native request resolution rather than dismissing a
question immediately after sending an answer. Protocol tests cover command/file
decisions, timeouts, duplicate submissions, exact request identity, disconnects
and answers from another client. A real two-client clarification check confirmed
resolution in both clients and continuation of the original turn. This validates
the manual request/answer path, not the proposed automatic approval policy.

Before implementation, settle the coordinator runtime, startup/lifecycle, context
and messaging behavior, user-controlled authority rules, decision audit and what
must be escalated. Existing native permissions remain unchanged. Workspace restore
is a separate requested feature whose persistence choice is still pending.
