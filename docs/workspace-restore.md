# Workspace restore

Version 0.5.0 uses the user-approved split between the existing backend's private
file and browser-local preferences. The same Node.js application on port 4242
handles persistence. Nginx remains a proxy; no additional service or database is
required. Codex retains conversation histories and Beads retains task records.

| Location | Saved state |
| --- | --- |
| `workspace.json` beside the password configuration | Up to four open worker IDs, the coordinator ID and coordinator pause state |
| Browser local storage, key `ccng.workspace.v1` | Selected tab, worker order, unsent drafts, reading positions and whether a chat was at the bottom |
| Native Codex storage | Existing conversation context, messages, branch relationships and coordinator tool history |
| Existing Beads tracker | Durable tasks, states and conversation labels |

The server file defaults to
`${XDG_CONFIG_HOME:-$HOME/.config}/command-center-ng/workspace.json`.
`CCNG_CONFIG_DIR` changes the private configuration directory for both password
and workspace files. Keep it outside the checkout and installation target so
updates preserve it. New files use mode 600 and atomic replacement; malformed,
unsafe or linked files are rejected without overwriting them.

## Startup and continuation

After an app restart, sign in with the same password. The app restores saved
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

Closing a tab saves its removal without interrupting or deleting the native
conversation. A failed individual restore leaves other tabs usable and retains
the unavailable ID for retry through Reconnect. No pending approval answer,
review token, queued summary or report is persisted or replayed. Requests owned
by another native client still require that client's controls when they are
not available to this connection.

## Browser state and limits

Drafts and preferences stay in the same browser and origin, including on phones.
They are not synchronized to another device. Drafts can contain private text;
clearing this site's browser storage removes them. Passwords, login cookies and
approval answers are excluded from the saved workspace object. Signing out ends
the session but does not erase saved drafts.

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
linked files, four-worker restoration, coordinator reuse/pause, unavailable-ID
retry, disconnected startup, explicit activation and browser-state round trips.
A disposable native restart check confirmed the same worker/coordinator and
history, private file mode, unchanged password and required login, with no
`thread/start`, `thread/resume` or `turn/start` during restoration. Rendered browser
restoration and visual review remain to be checked with the user's screenshot.
