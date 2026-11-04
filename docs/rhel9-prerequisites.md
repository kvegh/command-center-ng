# RHEL 9 prerequisites

RHEL 9 is the documented setup target. Other Linux distributions are not yet
tested; they may reuse preinstalled prerequisites but have no assisted package
installation here. The installer runs as the ordinary user. Sudo is used only
for explicitly approved DNF transactions, never to build or run Command Center.

The 0.7.0 installer changes are in development. Checks and confirmed prerequisite
installation are implemented; fresh Beads tracker/shared Dolt configuration
awaits the user's choice and is not yet automated.

| Prerequisite | RHEL 9 package or installation | Purpose |
| --- | --- | --- |
| Node.js 22.12+ and working npm | `nodejs:22/common` AppStream profile; includes npm | Build and run the app; install optional CLIs |
| Bash | `bash` | Standard Linux agent shell |
| Core utilities | `coreutils` | id, uname, dirname, realpath, mktemp, mkdir, mv, cp, rm, chmod, sha256sum |
| Git | `git` | Source checkout, updates and Beads |
| Archive tools | `tar`, `gzip` | Stage installation files and dependency archives |
| System certificate trust | `ca-certificates` | Verify HTTPS package/download connections |
| sudo and DNF | Existing administrator-provided access | Optional installation of missing system prerequisites |
| Beads CLI | Existing compatible `bd`, or approved target-local `@beads/bd@1.3.2` | Read and maintain project tasks |
| Codex CLI and sign-in | Existing compatible Codex, or approved target-local `@openai/codex@0.166.0` | Native agent conversations and daemon |
| Dolt server binary | Required for the proposed parallel-writer server mode | Shared task database access |

No Go compiler, C/C++ compiler, Python, ICU headers or Beads MCP server is needed
for the prebuilt CLI installation path. Source-build requirements are separate.
The [Beads installation guide](https://github.com/gastownhall/beads/blob/v1.3.2/docs/getting-started/installation.md)
describes the supported npm/prebuilt methods and source-build dependencies.

## Prepare RHEL repositories and Node

RHEL BaseOS and AppStream repositories must be accessible through the machine's
normal subscription or managed mirror. The installer does not register systems,
enable third-party repositories or bypass TLS/GPG checks. An administrator can
install the missing base packages:

```sh
sudo dnf install bash coreutils git tar gzip ca-certificates
sudo dnf module install nodejs:22/common
node --version
npm --version
```

The app checks the actual Node version, which must be at least 22.12. Some RHEL
minor-release documentation labels newer Node streams Technology Preview; review
the applicable vendor support status. See the official
[RHEL 9 Node.js stream documentation](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/9.7_release_notes/technology-previews).
An existing older stream may require an administrator-reviewed
`dnf module switch-to nodejs:22/common`. The installer does not reset a stream,
remove conflicting packages or silently replace an existing Node environment.
If PATH still selects an older user-managed Node, correct PATH before retrying.

## Check and install

From the source checkout:

```sh
./install.sh --check
./install.sh "$HOME/apps/command-center-ng"
```

Check-only mode reports command availability, the Node/npm requirements, Beads
interface compatibility, Codex daemon support and presence of sign-in credentials.
It does not install packages, initialize trackers or start services. Supplying an
existing target also checks its locally installed CLI directory on PATH.

Interactive installation lists the exact RPM command and asks before sudo. DNF
also presents its transaction. Missing Beads/Codex CLIs can be installed under
`TARGET_DIR/tools` through pinned npm packages after separate confirmation;
their upstream installation scripts are part of that approved CLI installation.
Compatible global tools are reused. No global npm prefix, shell profile or
existing tool is overwritten. Noninteractive runs never treat supplied text,
elapsed time or a default selection as approval for missing prerequisites.

New CLI packages are staged with the application. A failed application build
keeps the previous installation. Approved system RPM transactions remain installed
even if a later build fails. An incompatible existing Beads version is reported
for deliberate upgrade review; existing databases are not migrated automatically.

## Codex and native agent PATH

Use the target you selected:

```sh
export PATH="$HOME/apps/command-center-ng/tools/node_modules/.bin:$PATH"
codex login --device-auth
codex app-server daemon start
"$HOME/apps/command-center-ng/command-center-ng" --cwd "$HOME/projects/PROJECT"
```

Replace PROJECT with an existing task workspace. Native Codex supports browser
sign-in and device-code sign-in; `codex login status` reports credential presence.
The installer suppresses its authentication output and never collects tokens.
If sign-in is deferred, installation can finish but clearly reports agent setup
pending. See the official [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
and [login commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

The launcher exports its local CLI directory for the backend. The Codex daemon
also needs that PATH so its agent shells and hooks can find Beads. Existing
daemons retain their original environment; restart one only when existing work
is idle after adding Beads. The installer never interrupts or restarts it.

## Beads and Dolt configuration

Beads 1.3.2 uses Dolt storage. Its embedded-capable build can run without a
separate server; the documented multi-writer setup uses a Dolt SQL server.
See the versioned [Beads quick start](https://github.com/gastownhall/beads/blob/v1.3.2/docs/getting-started/quickstart.md).
Command Center can run four workers plus its coordinator, so a private local
shared server is proposed for a fresh installation. This architecture choice
is still awaiting user approval; it is not silently selected or installed.

Existing installations keep their tracker, routing, credentials and server mode.
In each intended working directory, verify the existing setup with:

```sh
bd where --json
bd --readonly list --json --brief --flat --limit 1
```

Fresh tracker initialization, Dolt server installation/startup and Codex Beads
hook setup are not yet automated. Do not initialize the Command Center source
checkout merely to satisfy the task panel. Each agent's working directory must
resolve the intended existing project or parent tracker.

## Validation status

The prerequisite inventory passed on the existing RHEL 9 development VM.
Shell syntax and installer update-protection fixtures passed. Terminal consent
checks verified that yes invokes the exact simulated sudo/DNF command while no
and noninteractive execution invoke none. No actual system package, new CLI,
database or service was installed during those checks. A clean minimal-RHEL
bootstrap and other-distribution testing remain unperformed.
