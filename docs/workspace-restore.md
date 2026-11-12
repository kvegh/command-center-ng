# Workspace restore

Version 0.5.0 uses the user-approved split between the existing backend's private
file and browser-local preferences. The same Node.js application on port 4242
handles persistence. Nginx remains a proxy; no additional service or database is
required. Codex retains conversation histories and Beads retains task records.

| Location | Saved state |
| --- | --- |
| `workspace.json` beside the password configuration | Up to sixteen open worker IDs, the coordinator ID and coordinator pause state |
| Browser local storage, key `ccng.workspace.v1` | Selected tab, worker order, unsent drafts, reading positions and whether a chat was at the bottom |
| `decisions.jsonl` beside `workspace.json` | Private coordinator decision summaries, reloaded for display; older records retained |
| `sessions/` beside `auth.json` | Owner-private hashed application-session records, original expiry and explicit revocation generation |
| Native Codex storage | Existing conversation context, messages, branch relationships and coordinator tool history |
| Existing Beads tracker | Durable tasks, states and conversation labels |

The server file defaults to
`${XDG_CONFIG_HOME:-$HOME/.config}/command-center-ng/workspace.json`.
`CCNG_CONFIG_DIR` changes the private configuration directory for both password
and workspace files. Keep it outside the checkout and installation target so
updates preserve it. New files use mode 600 and atomic replacement; malformed,
unsafe or linked files are rejected without overwriting them.

## Startup and continuation

After an app restart, an unexpired application session remains signed in.
Otherwise, sign in with the same password. Memory-only sessions from older
versions require one final login during migration. The app restores saved
tabs by reading native conversation metadata and recent history. It does not
resume unloaded workers or start a model turn just to restore a view. Existing
native work can continue independently while Command Center is stopped.
The read-only views refresh every five seconds and follow native events.
Version 0.8.0 verifies the native coordinator marker/name against the saved role
before opening a view. A former coordinator listed as a worker, or an ordinary
worker listed as coordinator, is refused with a restoration warning. The other
tabs remain available; saved IDs are retained for explicit recovery. No native
resume, conversation rewrite or replacement coordinator is used to repair a
role mismatch automatically.
Sending a new message activates that conversation with its existing native
model and permission settings. The saved coordinator is reused; its restrictions
are reapplied and checked before activation. Its paused state survives restart.

This also applies when Codex unloads a conversation that was already opened in
CCNG. Native unload/close observations retain the saved tab and history; the next
eligible send reloads that same conversation before submitting input. Background
observation does not resume an unloaded worker. Replayed approvals remain pending
and block input normally; the Coordinator retains its restricted activation.
An activation failure or connection change during activation submits no message. If unloading
races the final input call, its error remains visible without an automatic retry
or resend. Check native receipt before manually repeating uncertain input.

Closing a tab saves its removal without interrupting or deleting the native
conversation. A failed individual restore leaves other tabs usable and retains
the unavailable ID for retry through Reconnect. No pending approval answer,
review token, queued summary or report is persisted or replayed.

Creating, attaching, branching and closing a worker waits for its updated open-tab
list to reach disk before the API acknowledges success. Saves sync both the file
and its directory after atomic replacement. If saving fails after a native action
succeeds, retain its real ID/outcome and show a workspace-save warning; do not
repeat the native action. A later explicit save can retry the metadata write.
Unavailable saved conversations remain recorded, even while other tabs change.

The existing five-second refresh also retries a disconnected native transport.
It does not start the Codex daemon, change CODEX_HOME, resubmit work or answer
requests. Successful connection uses the existing restoration, pause and saved
report rules. Codex reconnect remains visible when another runtime is available;
the history picker distinguishes connection errors from a successful empty list.

If histories differ between a terminal and CCNG, check their CODEX_HOME settings
and daemon selection. A project working directory alone does not select a Codex
profile. Preserve the profile containing the wanted conversations; changing the
profile is not a history migration. Do not copy authentication or session files
to make an empty picker appear populated.

The one-click **Hand back & close** workflow also runs only in the existing
backend process. Browser refresh or changing tabs leaves that process working;
stopping CCNG interrupts its coordination. Native history and Beads task links
remain, but restoration does not replay a delivery or assume a branch was
successfully archived. Inspect the retained branch and parent history before
starting another handoff after a backend restart.

Version 0.9.0 adds explicit **Load pending request** when a restored active
conversation reports attention without request details. It reads current status
and rejoins only the selected already-active conversation so Codex can replay
its pending requests. Startup still uses native reads; an unloaded worker is not
resumed to look for a request. Native IDs and normal answer confirmation are
preserved. This retrieves request details rather than replaying stored answers.
It starts no worker turn and adds no worker model/permission override. Native
user-verification requests that Codex excludes from replay remain subject to
their native controls. A failed load keeps an explicit error and the waiting
state; missing details alone do not establish ownership by another client.

## Browser state and limits

Drafts and preferences stay in the same browser and origin, including on phones.
They are not synchronized to another device. Drafts can contain private text;
clearing this site's browser storage removes them. Passwords, login cookies and
approval answers are excluded from the saved workspace object. Signing out ends
the session but does not erase saved drafts.

Application-session persistence is separate from workspace metadata and stores
only token hashes and expiry/invalidation references. Normal logout, password
changes and `--clear-logins` remain effective after restart. Clearing logins does
not erase drafts, tasks, decision summaries or native agent history.

The browser records at most 32 conversations and drafts up to 32,000 characters.
If storage is blocked, corrupt or full, the app displays an error and continues
with in-memory state. Reading positions refer to the loaded history, not a
durable message anchor. Older pages may need loading again; a position beyond
the current loaded content is clamped. Codex's model context is unaffected.

## Recovery and validation

If the server file cannot be read safely, restoration and automatic overwrites
are disabled and the dashboard reports the reason. Correct its ownership/mode,
or stop the app and move the private file aside, then restart to save a fresh
workspace. Moving it aside loses the saved open-tab list, not native histories
or Beads tasks. Keep private files and browser exports out of Git and screenshots.

Regression checks cover bounded metadata, private atomic writes, corrupt and
linked files, sixteen-worker restoration, coordinator reuse/pause, unavailable-ID
retry, disconnected startup, explicit activation and browser-state round trips.
A disposable native restart check confirmed the same worker/coordinator and
history, private file mode, unchanged password and required login, with no
`thread/start`, `thread/resume` or `turn/start` during restoration. Rendered browser
restoration and visual review remain to be checked with the user's screenshot.


## Local Claude restoration in0.19.0

Claude worker IDs use a provider prefix in the same private workspace metadata.
Restoration reads the official SDK's local session information/history without
starting a query or replaying instructions/permissions. Claude can restore while
Codex is disconnected; a connect event arriving during restoration schedules one
read-only retry for skipped Codex tabs. Missing threads do not create retry loops.
An external active Claude process retains ownership and remains observed.

Closing a tab keeps a managed SDK process running; requests in closed tabs offer
explicit reopening. Shutting down the backend ends its SDK-owned processes and
retains native history. Callback answers are not persisted or replayed. A live
provider/model run and interactive browser verification remain separate checks.


## Decision-summary persistence

The separately approved `decisions.jsonl` file reloads recent coordinator decisions
before startup dashboard restoration. It is not part of workspace.json's small
metadata whitelist and never restores approvals, queued inputs, review tokens or
authority. Its last-20 panel is independent of retained disk history. New decisions
are saved from feature installation onward; prior native history is not imported.
See [decision summaries](coordinator.md#decision-summaries-after-restart) for fields,
permissions, failure warnings and retention. Update/restart preserves the file;
a hard process kill may lose writes that were not yet recorded or flushed.
