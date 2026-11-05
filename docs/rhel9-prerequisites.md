# RHEL 9 prerequisites

RHEL 9 is the documented setup target. Other Linux distributions are not yet
tested; they may reuse preinstalled prerequisites but have no assisted package
installation here. The installer runs as the ordinary user. Sudo is used only
for explicitly approved DNF transactions, never to build or run Command Center.

Checks, confirmed prerequisites and explicitly selected fresh Beads/shared Dolt
setup are implemented. Fresh tracker creation remains a terminal-confirmed
installer action, not an application startup or tab-viewing side effect.

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
| Dolt server binary | Existing Dolt, or confirmed target-local Dolt 2.2.0 prebuilt archive | Native shared-server task database access |
| curl | `curl`, only if a fresh Dolt binary must be downloaded | HTTPS download with certificate verification |

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
existing target also checks both locally installed CLI directories on PATH, and
`--workspace DIRECTORY` selects the tracker readiness check.

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
export PATH="$HOME/apps/command-center-ng/tools/bin:$HOME/apps/command-center-ng/tools/node_modules/.bin:$PATH"
codex login --device-auth
codex app-server daemon start
"$HOME/apps/command-center-ng/command-center-ng" --cwd "$HOME/projects/PROJECT"
```

The `--cwd` option sets the application's startup context. In **Start new**, enter
the intended project's directory explicitly so that worker loads its own project
instructions. Existing conversations keep their saved native working directory.

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

The approved fresh multi-writer setup uses native `bd init --shared-server`,
after an explicit workspace selection and terminal confirmation. Beads manages
one private local Dolt server and keeps project databases separate. The installer
does not add its own service wrapper or systemd unit. The normal Beads default
is embedded storage; existing trackers keep their current storage mode.
See [Beads shared-server mode](https://github.com/gastownhall/beads/blob/v1.3.2/docs/architecture/dolt.md#shared-server-mode).

Existing installations keep their tracker, routing, credentials and server mode.
In each intended working directory, verify the existing setup with:

```sh
bd where --json
bd --readonly list --json --brief --flat --limit 1
```

For a fresh workspace:

```sh
./install.sh --workspace "$HOME/projects/WORKSPACE" "$HOME/apps/command-center-ng"
```

The selected directory must already exist. Initialization uses the native
shared-server command, skipping changes to agent instructions and Git hooks;
it then verifies a read-only query. Existing parent/redirected trackers, partial
configuration and connection settings are preserved. No automatic re-init,
migration, server restart or credential/routing replacement is attempted.

If Dolt is missing, the installer offers the official Linux amd64/arm64 archive
for version 2.2.0 under the selected target and verifies its published SHA256.
That version follows the [Beads 1.3.2 standalone Dolt pin](https://github.com/gastownhall/beads/blob/v1.3.2/docs/architecture/dolt.md#which-dolt-version-to-install),
not a floating latest release. Checksums come from the
[official Dolt 2.2.0 release](https://github.com/dolthub/dolt/releases/tag/v2.2.0).
Other CPU architectures require a preinstalled Dolt. Existing Dolt is reused;
it is not downgraded or replaced. Declined/noninteractive setup reports pending
work and leaves the application available. See [installation](installation.md)
for startup, data location, failure handling and native lifecycle commands.

## Validation status

The prerequisite inventory passed on the existing RHEL 9 development VM.
Shell syntax and installer update-protection fixtures passed. Terminal consent
checks verified that yes invokes the exact simulated sudo/DNF command while no
and noninteractive execution invoke none. No actual system package, new CLI,
database or service was installed during those checks. Isolated stub fixtures
also verify native shared-server initialization arguments, private permissions,
existing/redirected tracker preservation, consent/check-only gates and pinned
Dolt download/checksum refusal. No real database or server was created for
these tests. A clean minimal-RHEL bootstrap and other-distribution testing remain
unperformed.
