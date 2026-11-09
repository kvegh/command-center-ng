# Using Command Center NG

This guide describes current controls, rather than the order they were added.
Start with [installation](installation.md#first-time-walkthrough) if the backend
or native Codex runtime is not ready. Claude completion and live validation
remain postponed; published SDK code is not a claim of production acceptance.

## Open the right conversation

Choose **Add agent**, then **Open existing** or **Start new**. New agents require
an explicit existing absolute project directory on the backend host. Surrounding
whitespace is ignored; spaces within directory names are kept. Opening an
existing conversation retains its native working directory and instructions.
CCNG does not silently substitute its own installation directory for a project.

Up to sixteen workers and one separate coordinator can be open. This limit does
not change native subagent concurrency or permissions. Closing a tab removes
its view and report schedule, not its native history or running conversation.

The selected tab has a larger bold title and highlighted edges. Status dots
indicate running or attention states independently of selection. Selecting a
tab focuses its input; the title directly above the input helps identify where
the next message will go. Only the compact title folder tab is coloured and
attached to the input below; its adjacent colour selector and status indicators
stay on neutral backgrounds. Choose **cyan**, **violet**, **green**, **blue**,
**teal** or **rose**. Older saved amber choices become blue, leaving amber for
attention states and preserving other preferences. Narrow layouts place stacked
status indicators above the title so the tab stays attached to the input.
Tab order, chat colours, text drafts and reading positions use existing browser
preferences. They do not synchronize across browsers or devices.

## Chat, activity and interruption

**Enter** sends when sending is available; **Shift+Enter** inserts a newline.
You can keep editing a draft while a question or approval is pending. Sending
waits for resolution; Enter inserts a newline while sending is unavailable.
New text entered during an earlier send acknowledgement is preserved.

The input header distinguishes **Sending**, native-acknowledged **Input received**,
**Working**, **Needs your answer** and completed/interrupted outcomes. Input
received confirms runtime acceptance, not model understanding. Connection health
and time since the last real agent update are separate: browser heartbeats do
not prove agent progress, and quiet work is not automatically declared stuck.

Consecutive command/tool activity appears in a closed **N actions** group.
Expand the group for individual actions, then expand an action for details.
Running, failed and stopped counts remain visible while the group is closed.

Use **Interrupt** or **Escape** for the eligible running turn in the visible
chat. The action preserves the unsent draft and does not undo completed commands
or files. Escape keeps its local meaning in dialogs, selects, question controls,
summary editing, resizing and text composition. Other tabs are unaffected.

## Task outcomes

Beads stores each task's expected outcome, acceptance criteria, state and
dependencies. Workers update those records after real changes and reassess
other authorized ready work, using subagents for independent work when useful.
Native questions and permissions still apply; idle does not mean complete.

Native Goals controls and automatic Goal creation were withdrawn. CCNG does not
start Goals or a replacement task dispatcher. Existing runtime Goal data is
preserved. Task-report requests ask for status; they do not wake workers to
execute their backlog.

## Silent task checks

Every 15 minutes, the coordinator backend asks each open Codex worker to review tasks
that may have lost attention and identify independent authorized work it can
perform in parallel without conflicts. The request is silent in both chats;
useful agent findings and work remain visible. This is separate from task reports,
so **Never** stops recurring reports but does not disable task checks.

The coordinator overview shows **Next chat task-ping to send** with the next
scheduled local time. It is a schedule, not a guarantee of immediate delivery:
a pending question, paused coordinator, disconnected session, unknown active
turn or branch handoff can defer it. Known active Codex turns receive the check
through supported steering for their next safe checkpoint; no tool is interrupted. Checks coalesce and do not replay missed intervals
when CCNG restarts. Explicit user stops and project permissions remain in force;
the reminder does not authorize an arbitrary backlog task or native Goal.

## Branch and return a summary

**Branch here**, beside a completed Codex reply, copies history through that
reply. Intermediate progress messages do not offer that completed-turn control.
**Branch chat**, beside the composer controls, takes a native snapshot of current
stored history, including the ongoing exchange. Later parent messages are not
part of the snapshot. The parent continues running; a copied partial turn can
be marked interrupted in the child without interrupting the parent.

The branch waits for your follow-up. Its first message becomes its goal.
Branches share the project's directory; they do not create Git branches or
worktrees. Existing branches retain their original snapshots after an update.

**Back to parent** only navigates. **Hand back & close** starts a background
handoff with one click, including while the branch is working. You can switch
tabs immediately. CCNG asks the branch to finish at a safe checkpoint, settle
its local background work and prepare a concise summary of findings, decisions,
verification, open questions and next steps. It does not forcibly interrupt work
or answer a pending request. Resolve any request in its originating chat.

Every branch task is linked to the parent without changing its state, owner,
dependencies or existing branch association. The parent receives the summary
and a reference to the full native branch history and original task records.
Only after native receipt and fresh safety/task checks does CCNG archive the
branch and remove its tab. If it is selected, the parent opens; if another tab
is selected, that tab and its draft keep focus.

The branch status shows waiting, preparation, transfer, delivery or an actionable
failure. A full workspace may need a free tab slot for the parent. Errors and
uncertain delivery keep the branch available; retry does not blindly resend a
summary. The workflow runs in the existing backend process, so keep CCNG running
until it finishes. A restart preserves native history and Beads records, but
does not automatically resume an interrupted handoff. Navigation alone never
sends a summary, archives a branch or answers a question.

## Questions and approvals

**Open questions** lists current native requests for the selected conversation.
Open one to reach its existing answer card. A request with several questions
shows each question. Opening a card does not answer or dismiss it.

Some newer Codex questions arrive as assistant-message metadata rather than a
pending native request. Their titles/options remain visible even when the native
message has no text. These are displayed read-only with a native-client answer
instruction: the installed interface does not establish an exact reply binding
for this message-only format. They do not create approval controls or claim an
unanswered/blocking state. Supported native request forms remain interactive.

Manual answers retain the exact native request identity and wait for native
resolution. Duplicate submissions are blocked while confirmation is pending.
A failed or unconfirmed answer stays visible with an error. Answers made in
another client clear here after the corresponding native resolution arrives.
Some external steps or unsupported answer formats still require the exact
native action shown by the card.

If attention is reported without details, use **Load pending request**. It
recovers current requests for that selected active conversation, reusing details
already held by the connection when available. Loading submits no decision,
starts no worker turn and changes no native permissions. Missing details alone
do not prove another client owns the request. Failed recovery retains the
waiting state and an error rather than inventing an approval card.

File approvals show the native proposed paths, change types and diffs when Codex
supplies the matching file-change item. CCNG joins it only to that conversation's
exact turn/item/request; the coordinator receives the same content. Large
proposals show explicit file-count and size limits rather than implying the
visible excerpt is complete. If content is unavailable, **Load change details**
uses native read-only history without approving or executing the edit. Native
backends that do not supply the item still show an explicit unavailable notice.
Request identifiers alone do not describe the proposed changes.

Alongside **Allow once**, an offered Codex rule can expose **Allow always**.
Review the displayed command-prefix, network-host or MCP-tool scope. Codex owns
rule saving; CCNG has no separate permission allowlist or native-config writer.
**Allow for this session** grants only the native session scope. File-change
requests expose that supported session choice even when the protocol does not
include an explicit decision list; they have no permanent option. Filesystem/network
permission requests offer once (turn) or session for exactly the requested profile,
never an invented permanent permission. Coordinator permission grants remain
unavailable. Unoffered or changed rules are rejected.

Native save warnings remain visible. Request resolution alone does not prove
that a rule was saved to disk; shared native settings can affect other sessions.
After a confirmed manual Codex approval, focus returns to the same editable
input unless tab/dialog changes or visibility make that unsafe. Decline,
coordinator review and failed answers do not move focus. Claude approval work
remains postponed.

Codex structured questions use an under-development native feature. Installation
attempts its native setup and startup checks it; missing or unsuccessful setup
warns and continues. Existing native workers are not restarted automatically.
See [native question setup](installation.md#native-codex-question-setup).

## Tasks, answers and notifications

The task section reads the project's existing Beads tracker directly. Agents
maintain task states; chat prose, plans and idle status do not close tasks.
Totals describe all linked current work. Actual **Needs input** items come first;
**Queued** means unfinished dependencies and does not mean a user decision.
Three natural-height rows are visible by default; scroll for the rest.

**Link tasks** associates existing records with this conversation through Beads
labels. It changes no task state, ownership, content or other labels. Link only
work that belongs in this chat. A record can deliberately have multiple links.
An unavailable tracker shows an error, rather than treating missing rows as
resolved work. CCNG does not initialize or migrate a tracker merely by opening it.

Click a task to read details. **Send to worker** sends your answer with task
context; **Ask what is needed** requests clarification. Input dialogs lead with
**Needed** and **Why**, with steps and background under expandable **Details**.
The worker must process the answer and update Beads. Sending it neither closes
the record automatically nor grants execution outside the existing scope.

Ordinary prose questions are not guessed from transcripts. When native question
tools are unavailable, agents record input needs in Beads; those appear once in
Tasks with a **Question** label. Native approvals remain in Open questions.

**Notify me** watches observed input needs, errors and completion for that task.
Dismissible in-app alerts remain available while the page is open. Optional
desktop notifications require browser consent and a supported secure context;
denial leaves in-app alerts working. Mobile notification work is postponed.
Refresh/reconnect establishes a baseline instead of replaying historical events.
Missing records do not imply completion, and Beads closure is not independent
proof of successful delivery. There is no closed-browser or email delivery.

## Reports, model and effort

Worker settings offer **Task report every**: **1h**, **15min**, **5min** or **Never**,
plus one-off **Report now**. Never is the default. Saved intervals belong to
CCNG's existing backend timer; browser refresh does not reset the deadline or
require selecting the radio again. Workers do not need their own report loops.

Reports use concise coloured Done / In progress / Blocked or needs input / Next
bullets, covering all active workstreams and the project's release/publication
status. This format is in [worker base instructions](../server/worker-instructions.md).
Instruction guidance cannot guarantee perfect model compliance.

Internal report triggers are hidden in CCNG history; actual reports remain
visible. Native provider history is not deleted. At most one report is
outstanding per worker; Report now coalesces with a queued due report. Native
questions, pause, ownership, branch handoff and failed sends still gate delivery.
Reports request the next safe checkpoint; they do not interrupt unsafe tools.

Stopping CCNG stops its report timer. Startup loads saved intervals, publishes
available dashboard evidence and requests one fresh report only for workers
with enabled intervals. Never skips startup reports as well as recurring reports;
the dashboard uses stored summaries/tasks. Report now remains a manual one-off.
Enabled schedules continue without replaying a
burst of missed intervals. Closing a tab removes that worker's CCNG schedule.

The Codex **Model** and **Effort** controls use the native runtime's catalog and
supported choices. Changes apply to subsequent turns without interrupting the
current turn or changing global permissions. Edit & rewind is described below;
use the existing branch action for a separate conversation.

## Images, Markdown and copying

Paste an image into the input with the platform's paste shortcut, or choose
**Attach image** to use the native file picker. The picker works independently
of clipboard-image availability and stays tied to the chat where it opened.
Cancellation adds nothing; the same file can be selected again after removal
or a read error. Previews can be removed before sending.

Supported types are PNG, JPEG, GIF and WebP: at most **four images**, **4 MiB
each** and **8 MiB total** per message. An image can be sent alone or with text.
Provider/model limits still apply. Pending native requests permit drafting
attachments but block sending. Actual Android Firefox interaction remains
unverified; local tests do not prove the phone picker experience.

Unsent images live only in this page's per-chat memory. They survive tab changes
but disappear on refresh or page close; text drafts keep their existing browser
persistence. Sent images remain in native history and use authenticated message
URLs in CCNG. Remote image URLs and native local-file references are not fetched.
There is no image-draft upload directory, database or localStorage persistence.

Chat supports Markdown headings, lists, quotes, links, task lists, fenced code
and GitHub-flavoured tables. Tables scroll horizontally. Raw HTML remains
disabled; remote Markdown images appear as links instead of loading themselves.
Pasted user text retains line breaks and spacing. Code examples remain literal.

**Copy this** copies a message's complete source text. Each fenced or indented
code block has a separate copy control. Copy never runs code or sends messages.
Native clipboard denial is not bypassed; selectable text remains for manual copy.

## Layout and lifecycle

The palette menu offers **classic**, **contrastful** and **light** themes. Desktop
overview width, section boundaries and the history/composer divider are resizable
with keyboard controls. Preferences stay in the current browser.


### Desktop overview height

The desktop overview fills its available pane height without extending the page.
Report and model controls stay at the bottom; the upper content, tasks and open
questions scroll when necessary. Saved section heights remain bounded by the
pane, so enlarging a section cannot push settings beyond the browser. Short
windows and long feedback can scroll within the settings area. Existing divider
keyboard controls and reset remain available. Mobile keeps its continuous page
and compact expandable settings rather than a pinned desktop footer.

Mobile uses one naturally scrolling full-width page with wrapped tabs, compact
overview, bounded history of about 30 text lines and a six-line input. Long input
scrolls internally. Mobile hides resize handles and worker coordinator recaps,
ignores desktop sizes without erasing them, and keeps the actual coordinator
dashboard. Worker settings collapse to a cadence/Report now row; expand for the
other controls. Phone keyboard and rotation acceptance remain separate checks.

Codex owns its native conversations and execution. Closing a browser or tab does
not end native work. The unfinished Claude integration currently owns its SDK
processes inside CCNG: stopping the backend interrupts those runs, while native
history permits later resume. No separate Claude daemon has been introduced.

See [workspace restore](workspace-restore.md) for persistence and recovery,
[coordinator guidance](coordinator.md) for review boundaries, and
[release notes](release-notes.md) for historical implementation evidence.

Report feedback distinguishes queuing from a confirmed request waiting for a
response; it does not claim the worker has started writing. If the turn ends
without a recognized Standard Task Report, a visible error replaces a false ready
announcement. Pending permissions and unsafe work are not interrupted, and
unconfirmed delivery is not automatically retried.

Recognition accepts a fresh completed status summary with green outcomes,
yellow work and a blue Next bullet, including topic labels instead of the
recommended section names. A red blocker bullet is optional for recognition;
its absence does not establish that no blockers exist. Quoted/code examples,
older messages and other turns cannot satisfy an outstanding request.


## Edit a previous input and rewind

On an eligible Codex text input, **Edit & rewind** replaces its Copy this action.
A preview lists the entire selected turn and every later turn that will be removed,
including any other inputs in the selected turn. A turn is one agent work cycle
and may contain several inputs. Review the list, select the confirmation checkbox
and choose **Rewind & edit input**. Only after native acknowledgement does the
original text enter the normal chat draft; edit it there and send when ready.
Nothing is sent automatically. Cancel leaves conversation history unchanged.

This changes conversation history, not files or the machine. Prior commands,
commits, deployments, Beads tasks and saved permissions are not rolled back.
Branching remains separate: it creates another conversation and preserves the
original. Individual-message rewind and Claude support remain deferred.

Rewind requires an idle editable worker, no pending native/coordinator requests,
no prepared or incoming handoff, and an empty target chat draft. Existing text or
image drafts are preserved. Selected image/attachment inputs are disabled because
they cannot yet be restored to the draft. Larger or incomplete native history,
legacy/ephemeral threads and unsupported runtimes fail with a specific explanation.
There is no direct native-history-file rewrite or fallback.

If history changes after preview, refresh and review it again. An uncertain
native response may mean the rewind already happened: inspect history before
another attempt; CCNG never retries it automatically. Other workers keep their
drafts/focus, and stored report/task-check schedules remain active. Do not edit
the same conversation from another native client during confirmation: the native
API cannot atomically compare that client's changes against this preview.


## Saved coordinator decisions

Recent decisions show two readable bullets: the request and the decision/rationale.
A separate Saved/Saving/Not saved status describes local persistence; it does not
change whether a native approval was acknowledged. Coordinator summaries are
saved privately and reload after restart, including recorded names for closed
tabs. Delivery events remain temporary. A visible warning explains unavailable
or unsaved history even when the list is collapsed. Records are explanatory only;
answer current requests in Open questions. See [storage details](coordinator.md#decision-summaries-after-restart).
