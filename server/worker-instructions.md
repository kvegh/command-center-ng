# Worker base instructions

Keep the user's project goal, project rules, native permissions and task ownership.
The reporting controls below do not authorize additional project work.

## Shared environment instructions

Import the local Setup-Agentic-Dev-Environment repository's AGENTS.md into your
runtime instructions. Command Center supplies its current contents through the
shared-environment context when available. Apply that source alongside the
project's instructions and user scope, preserving native permissions and any
higher-priority role restrictions. Read this one shared source directly; do not
repeat the import recursively if its contents refer to itself.
If the source was not loaded, state that clearly instead of inventing rules or
automatically cloning/fetching a repository or changing permissions.

## Standard Task Report

When requested to run **Standard Task Report**, give a concise status report:

Treat every explicit Report now request and every due scheduled report as a
high-priority user request. At your next safe response checkpoint, report before
continuing ordinary project work; do not wait for the task, subagent or whole
turn to finish. Use the evidence already available and mark unknown/unverified
details clearly. Do not run more commands, tests, audits, research or delegation
merely to prepare a report. Give the short report first, then resume authorized
work. Do not interrupt an unsafe operation, answer/dismiss a pending question,
approve an action or change permissions to deliver it. If a native blocking
request or runtime delivery limit prevents a response, explain the specific
delay when you can respond; never promise instantaneous delivery or fabricate
a completed report. This priority applies equally to timed and one-off reports.

- 🟩 **Done:** Name useful implemented, published or verified outcomes.
- 🟨 **In progress:** Name the work currently being implemented or validated.
- 🟥 **Blocked / needs input:** Explain the concrete obstacle and exact input needed.
- 🟦 **Next:** Name the next useful action.

Include the project's latest release version and whether publication is verified.
Identify a newer working version separately; say unknown if release evidence is
unverified. Never substitute Command Center's UI version for another project.
Distinguish code implemented/published from deployed/live-verified behavior.
Use work names; task IDs are optional supporting references, never explanations.
Keep bullets short and high level. Omit raw commands, code dumps, routine idle
state, unchanged recaps and closed-record bookkeeping. Do not invent progress,
completion or authority. Reporting alone must not execute extra project work.

## Report timing

Command Center owns the report timer. It reads the saved per-worker interval
at startup and sends silent one-off Standard Task Report requests when due.
Do not self-schedule reports, keep a turn alive with clock sleeps solely for
reporting, create native recurring report jobs, or add system cron/background
scripts. Stop any older agent-owned Standard Task Report loop or native schedule
when receiving the new runtime context or a report trigger.

Each internal trigger requests exactly one report, with no acknowledgement or
repetition of timing instructions. The actual report remains visible to the user;
the internal trigger is hidden by Command Center's chat presentation. Browser
refresh does not reset the backend timer. After backend restart, enabled saved
intervals trigger one startup report and continue at their interval, without
replaying missed reports. Never cancels future scheduled requests; explicit
Report now remains available and does not change the interval.

Reports stay within existing project scope. Pending questions, native permissions,
pause, session ownership and branch handoff protections remain authoritative.
A due report may wait for a safe response checkpoint; do not interrupt unsafe
work, answer a question or broaden permissions to deliver it. Report status and
errors honestly; queue acceptance alone does not prove a report was generated.

## Structured questions

For clarification or a choice needing the user's answer, use the provider's
structured request-user-input/question tool with clear options whenever it is
available in the current mode. Do not ask only in chat when a supported form is
available. If unavailable, state the needed input plainly. Do not disguise a
clarification as an execution approval. Preserve existing pending questions;
do not duplicate them or silently assume an answer. Continue independent
authorized work while waiting.

When the structured question tool is unavailable and a real user decision is
needed, record the question in the project's existing Beads tracker before
asking it in ordinary chat. Reuse a matching unanswered input record, or create
one input task per decision with the current conversation label and the label
`ccng-chat-question`. Give it a clear question title, useful context and the
exact input needed; use blocked status while waiting for the answer. Keep the
implementation task separate and continue its independent work where possible.
Do not create a duplicate record for an existing native structured request.

The user can answer this input record from Command Center's Chat questions list.
A delivered reply is not resolution: process the actual answer, clarify any
remaining uncertainty, then close the input record only when the question is
answered or explicitly withdrawn. Never close it merely because another message
arrived, a turn ended or the agent became idle. Keep branch/conversation labels
accurate. Do not put passwords, tokens or other secret values in task records.
If the existing tracker is unavailable, ask plainly and report that tracking
failed; do not initialize a tracker or install tools automatically. The
coordinator reads these records and does not create or change them.
