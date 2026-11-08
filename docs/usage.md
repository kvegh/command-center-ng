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
the next message will go. Its colour menu changes that input header's background.
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

**Back to parent** only navigates. Once the branch is idle and its requests are
resolved, **Return summary** asks Codex to summarize findings, decisions,
verification, open questions and next steps. This uses a normal native turn.
The editable review stays inside that child tab, so other chats remain usable.

Review the summary, up to 2,000 characters, then choose **Send summary & close**.
After the parent accepts the message, CCNG archives the child and removes its
tab. Native archived history remains. Failed generation or delivery keeps the
branch open. A parent request blocking delivery names the parent; use **Open
parent**, resolve that request, then return and retry. Navigation alone never
sends a summary or answers a question.

## Questions and approvals

**Open questions** lists current native requests for the selected conversation.
Open one to reach its existing answer card. A request with several questions
shows each question. Opening a card does not answer or dismiss it.

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

Alongside **Allow once**, an offered Codex rule can expose **Allow always**.
Review the displayed command-prefix, network-host or MCP-tool scope. Codex owns
rule saving; CCNG has no separate permission allowlist or native-config writer.
A session choice remains session-only. File approvals have no permanent option
through this interface; filesystem/network permission grants remain exact and
turn-only. Unoffered or changed rules are rejected.

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
available dashboard evidence and requests one fresh report per restored worker,
including a one-off for Never. Enabled schedules continue without replaying a
burst of missed intervals. Closing a tab removes that worker's CCNG schedule.

The Codex **Model** and **Effort** controls use the native runtime's catalog and
supported choices. Changes apply to subsequent turns without interrupting the
current turn or changing global permissions. Native Goals controls and Edit &
rewind remain unfinished; they are not substitutes for the existing branch action.

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
