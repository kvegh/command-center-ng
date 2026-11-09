# Command Center NG

Command Center NG (CCNG) is a browser workspace for local AI coding sessions.
Keep conversations, project tasks, questions and progress together while the
native agent runtime continues to own execution and permissions.

**One CCNG deployment is currently intended for one engineer.** The application
does not provide multi-tenant isolation. Agent tabs organize projects and
conversations, not different human users. Additional reverse-proxy logins do not
create isolated CCNG accounts or workspaces.

## Why it exists

Working across several projects makes it easy to lose context or miss a question.
CCNG puts each conversation in a tab, keeps its tasks close to the chat, and adds
a coordinator overview so you can see where your attention is needed.

![Worker chat with linked tasks and report/model settings](docs/screenshots/worker-workspace.png)

Development screenshot: worker chat, project tasks and settings in one workspace.
Screenshots show an earlier UI; displayed versions and task states are historical.

<details>
<summary>See the coordinator dashboard and image attachments</summary>

![Coordinator chat and clickable project progress overview](docs/screenshots/coordinator-overview.png)

The coordinator brings project progress and decisions together.

![A worker conversation with image attachments in its draft](docs/screenshots/image-attachments.png)

Paste or attach images while keeping the conversation and project tasks visible.

</details>

<details>
<summary>See the mobile interface</summary>

| Overview and tasks | Chat and input |
| --- | --- |
| <img src="docs/screenshots/mobile-overview.jpg" alt="Mobile wrapped tabs, project tasks and compact worker settings" width="280"> | <img src="docs/screenshots/mobile-chat-input.jpg" alt="Mobile conversation, activity status and chat input controls" width="280"> |

[Full-size overview](docs/screenshots/mobile-overview.jpg) · [Full-size chat](docs/screenshots/mobile-chat-input.jpg)

Mobile development screenshots from the 0.44.0 era; displayed versions and task
states are historical. EXIF metadata was removed without changing image pixels.

</details>

## What you can do

- Open existing Codex conversations or start new agents in explicit project directories.
- Keep up to sixteen workers plus a separate coordinator in one workspace.
- Chat, steer active work, interrupt a turn and answer native questions or approvals.
- Branch a Codex conversation, then hand tasks and a summary back to its parent.
- See linked Beads tasks, input needs, progress and optional task notifications.
- Request task reports immediately or choose a saved interval; Never disables automatic startup and recurring reports.
- Recheck overlooked tasks silently every 15 minutes, with the next check shown in the coordinator.
- Keep coordinator decision summaries across restarts in a private local file.
- Read Markdown, copy messages/code, and paste or attach images to a draft.
- Keep desktop settings at the bottom of a full-height overview, with scrollable tasks and questions.
- Use desktop resizing, a continuous mobile layout and three colour themes.

See the [usage guide](docs/usage.md) for controls and their limits.

## Requirements

The backend runs on Linux. RHEL 9 is the documented automatic-prerequisite
installation target; other Linux distributions have not been verified.

- Node.js **22.12 or newer**, with working npm.
- Git, Bash, core utilities, tar/gzip and normal system certificate trust.
- A compatible **Codex CLI**, signed in under the account running CCNG, with its
  native app-server daemon running for agent operations.
- **Beads (`bd`)** on PATH for both CCNG and agents, with a tracker for the project.
- A modern desktop or smartphone browser.
- User-level systemd if you choose background service management.

The installer can offer missing RHEL packages, local Codex/Beads tools and fresh
Beads/Dolt setup after confirmation. Existing compatible tools and trackers are
preserved. [Check prerequisites](docs/rhel9-prerequisites.md) for the details.
The [Ansible deployment](docs/ansible-deployment.md#fresh-workspace) prepares a
missing `~/ccng-wd` agent workspace and its first Beads tracker without requiring
an application-demo repository checkout; updates retain the tracker.
It requires an existing trusted HTTPS htpasswd frontend before target writes;
explicit browser-first setup uses the app's existing protected-proxy mode.

## Protect access before first start

**Protect browser-first password setup before exposing it.** That opt-in has no
existing application password: the first successful setup creates it. Normal
startup refuses a missing password; existing passwords are preserved.

Default HTTP is unencrypted; HTTPS encrypts traffic but does not restrict access.
Use, for example, a Basic Auth reverse proxy with an `htpasswd` file, or restrict
access through localhost, an SSH tunnel, VPN or firewall. The current browser-first
mode specifically requires an HTTPS htpasswd proxy with no backend bypass. The
installer does not create external protection. Read the
[first-start guide](docs/installation.md#protect-access-before-first-start).

## Install

Use an ordinary Linux account and keep the source checkout separate from the
installation directory:

```sh
git clone https://github.com/kvegh/command-center-ng.git "$HOME/command-center-ng-src"
cd "$HOME/command-center-ng-src"
./install.sh --check
./install.sh
```

The default installation directory is `~/commandcenter-ng`. To choose another
location inside your home, use `./install.sh --prefix "$HOME/apps/commandcenter-ng"`.
The installer asks before installing missing tools or initializing a tracker.

Existing application passwords are preserved; no default password is created.
For local use, choose a password of **12–4,096 characters** with
`node "$HOME/commandcenter-ng/server/password.mjs"` before starting CCNG.
For a new installation behind enforced HTTPS htpasswd protection, you can instead
[enable password creation on first browser opening](docs/installation.md#first-browser-password-creation).
The application password and your Codex sign-in are separate.

## Start and sign in

If the installer provided local tools, use its printed PATH export. For the
default installation, run the following commands. If you are not signed in
already, run `codex login` once before starting its daemon.

```sh
export PATH="$HOME/commandcenter-ng/tools/bin:$HOME/commandcenter-ng/tools/node_modules/.bin:$PATH"
codex app-server daemon start
"$HOME/commandcenter-ng/command-center-ng"
```

Open `http://localhost:4242` on the backend machine and sign in with your chosen
application password. The startup output prints the actual listening addresses.
By default these are the selected default-route IPv4 address and localhost;
`--host 127.0.0.1` selects localhost only.

HTTP is the default. Operator-supplied certificate/key files enable HTTPS through
`INSTALLDIR/etc/config.conf`. Use the [installation guide](docs/installation.md)
for remote browser access, TLS, reverse proxies, options and troubleshooting.
The basic installer does not configure nginx, certificates or firewall rules.

## Update and background service

From the clean source checkout, update the existing installation:

```sh
cd "$HOME/command-center-ng-src"
./install.sh --update
# Use the existing location if you installed elsewhere:
# ./install.sh --update --prefix "$HOME/apps/commandcenter-ng"
```

This fetches latest `main` and rebuilds the installation. Existing configuration,
certificates, password and saved workspace are preserved. Restart CCNG afterward;
the installer does not restart the native Codex daemon.

Valid application logins survive normal restarts until their original 12-hour
expiry. Upgrading from older memory-only sessions requires one final login.
To explicitly sign out every application session, run the installed launcher
with `--clear-logins`; see [login management](docs/installation.md#login-management).

For background operation, follow the [user-level systemd instructions](docs/installation.md#user-level-systemd-service).
The installed launcher supports `service install`, `enable`, `start`, `stop`,
`restart`, `status` and `logs`. Installing a unit does not start or enable it.

## Current scope and limits

- Session management is **local to the backend host**; no SSH or remote-agent monitoring.
- Codex is the current operational focus. Official Claude Agent SDK code exists,
  but Claude completion and live validation remain **TODO**.
- Conversations stay traceable: correct earlier inputs or decisions in follow-up
  messages. Edit/Rewind is withdrawn; branching remains separate and available.
- Native Goals controls and automatic Goal creation were withdrawn; tasks remain in Beads.
- Closing a tab does not stop its native conversation. Backend shutdown stops
  CCNG-owned Claude runs; native history remains available for later resume.
- Unsent image drafts disappear on browser refresh; text drafts use browser storage.
- Newer message-only Codex questions show their titles/options, but currently
  require the native client for answers; supported native request forms remain interactive.
- Automated tests/builds do not establish phone rendering or every installed-runtime
  workflow. See [release notes](docs/release-notes.md) for recorded checks and gaps.

## Documentation

| Start here | Details |
| --- | --- |
| [Installation](docs/installation.md#first-time-walkthrough) | First setup, passwords, configuration, TLS, updates and services |
| [Usage](docs/usage.md) | Chats, branches, requests, tasks, images, reports and layout |
| [Coordinator](docs/coordinator.md) | Summaries, approval review and authority limits |
| [Workspace recovery](docs/workspace-restore.md) | What is saved, restart behaviour and recovery |
| [Ansible deployment](docs/ansible-deployment.md) | Reusable RHEL 9 playbook, protected inputs and AAP setup |
| [Release notes](docs/release-notes.md) | Version history and validation checkpoints |
| [Product requirements](docs/product-requirements.md) | Agreed behaviour and boundaries |
| [Agent requirements](docs/agent-harness-requirements.md) | Requirements for future native-runtime integrations |
| [Design decisions](design_decisions_history.md) | Rationale and implementation commit references |

## Development and contribution

The frontend uses React, TypeScript, Vite and plain CSS; the backend is Node.js.
From a development checkout, run `npm ci --ignore-scripts`, `npm run password`
and `npm run dev`. Use `npm test` and `npm run build` for application checks.
`package.json` is the authoritative version source. Read [AGENTS.md](AGENTS.md)
before changing code; active work is tracked in Beads, not a Markdown backlog.

Maintainers deploy published minor releases to the existing authorized production
installation through AAP ad hoc commands, verify the result and preserve its
settings. Native permission gates still apply; this is not automatic self-updating.
See the [contributor workflow](AGENTS.md#workflow) and
[current handover](current_status_for_handover.md) for development status.

This repository is public. Keep secrets, private configuration and transcripts
outside it; protected deployment data belongs in the private Vault companion.
No license has been selected; public visibility alone does not grant a license.
