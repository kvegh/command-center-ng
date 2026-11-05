# Linux installation

Linux is the first and primary platform for running Command Center NG.

The user selected the installation model:

- Provide a simple Linux shell script.
- Install into the invoking unprivileged user's home directory.
- Run as an unprivileged user; optional prerequisite RPM installation may use
  sudo only after explicit terminal confirmation.

The interface must remain usable from a Linux desktop browser and a smartphone
browser. Browser support does not imply a selected remote-access or hosting
arrangement.

The installer checks RHEL 9 prerequisites and
can offer missing RPMs and user-local CLI packages after confirmation. Other
Linux distributions are not yet tested; automatic package setup is RHEL 9 only.
Run `./install.sh --check` for a read-only inventory. Full details and package
names are in [RHEL 9 prerequisites](rhel9-prerequisites.md).

Beads 1.3.2 and Codex 0.166.0 are the verified CLI versions used for optional
fresh local installation. Existing compatible CLIs are reused. The application
checks Beads JSON/read-only/brief-list support. After the application is built,
fresh tracker/shared Dolt setup is offered for an explicitly selected task
workspace. Existing trackers and connection settings are preserved. No system
package, global tool, tracker or server is changed without terminal confirmation.

From the cloned repository:

```sh
./install.sh "$HOME/apps/command-center-ng"
```

The directory parameter selects the destination. Without it, the installer asks
for a target directory before doing any work. The destination must remain
inside your home. Unrelated directories and launchers are not overwritten.
The installer builds the frontend, prunes build-only dependencies, and creates
`command-center-ng` inside the selected target. On the first interactive install, it prompts
for an application password of at least 12 characters.

Passwords are stored only as salted scrypt hashes in
`${XDG_CONFIG_HOME:-$HOME/.config}/command-center-ng/auth.json`, with owner-only
permissions. Set `CCNG_CONFIG_DIR` to select another private directory outside
the checkout. Reinstalling preserves this file. For noninteractive installs or
password changes, run the installed `server/password.mjs` with Node in a terminal,
then restart the app. Sessions are invalidated when the app restarts.

The same configuration directory holds private `workspace.json` (mode 600):
open conversation IDs, coordinator ID and pause state. It is written by the
existing Command Center backend on port 4242; that workspace file does not need
another service or database. Optional Beads setup is separate, as described below.
Installer updates preserve the workspace file outside the target, along
with the password file. Browser drafts/order/positions stay in local browser
storage. On restart, sign in again to see restored tabs. Restoring reads existing
history without starting worker work; already-running Codex tasks remain native.
See [workspace restore and recovery](workspace-restore.md).

If CLIs were installed under the target, export its
`tools/bin` and `tools/node_modules/.bin` on PATH before starting the daemon so native agents
can also find Beads. An already-running daemon retains its original PATH; after
adding Beads, restart it only when existing work is idle.

Start `codex app-server daemon start` using the same account and Codex home as
the conversations to manage, then run `"$HOME/apps/command-center-ng/command-center-ng"`
(adjusting the destination to your installation). The
default URL is http://localhost:4242. The application connects to the existing
daemon and reports disconnection rather than starting a replacement.

## VM access through nginx

Use `--host VM_INTERNAL_IP --port 4242` for the VM's internal interface. Set
`--public-origin https://command-center.example` to the exact browser-facing
origin. It enables Secure cookies and permits that proxy hostname. These values
are deployment placeholders; do not commit real addresses or credentials.

Nginx should enforce its own authentication, preserve Host, and avoid buffering
the live event stream. A generic location inside an existing TLS server is:

```nginx
location / {
    auth_basic "Command Center";
    auth_basic_user_file /PRIVATE_CONFIG_PATH/command-center.htpasswd;
    proxy_pass http://VM_INTERNAL_IP:4242;
    client_max_body_size 12m;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

Replace every placeholder. Keep proxy credentials outside this repository. The
application password remains required behind nginx. Proxy, certificate, firewall,
and VM configuration are not changed by the installer.

Additional runtime options: `--cwd DIRECTORY` selects the application's working
directory for startup checks, and `--socket PATH` selects an existing Codex Unix
socket explicitly. In **Start new**, always enter the intended project directory;
it is no longer filled from the app's working directory. Opening an existing
conversation preserves that conversation's saved native directory.
`CCNG_HOST`, `CCNG_PORT`, and `CCNG_PUBLIC_ORIGIN` provide environment equivalents
for the listening options. Stop the foreground app with Ctrl+C.

## User-level systemd service

The installed launcher can manage Command Center as a user service. No sudo is
needed. Update the installation first so its launcher includes the service
commands, then register it with the same runtime options as your foreground app:

```sh
"$HOME/apps/command-center-ng/command-center-ng" service install -- \
  --host 127.0.0.1 --port 4242 --cwd "$HOME/projects/WORKSPACE"
```

Replace the installation/workspace placeholders and retain your existing host,
port, public origin and socket options. Registration writes an owner-only
`${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/command-center-ng.service`
and reloads the user manager. It does not start, restart or enable the app.
It preserves the current PATH and explicitly configured Codex/Claude/CCNG profile
locations in the generated private unit. Version0.24.1 also preserves explicit
`BEADS_DIR` and `BEADS_DOLT_SHARED_SERVER` values. Database passwords and other
credential variables are not copied; do not put secrets in CLI arguments.

If agents resolve an existing tracker through `BEADS_DIR`, register the service
from a terminal with that same setting. Use `bd where` there to confirm the
existing tracker before registration. Do not run `bd init` to repair a service
that lost its tracker setting. For example, replace this generic path with your
existing tracker, retain your current runtime options, and then restart when safe:

```sh
BEADS_DIR="$HOME/EXISTING_WORKSPACE/.beads" BEADS_DOLT_SHARED_SERVER=1 \
  "$HOME/apps/command-center-ng/command-center-ng" service install -- \
  --host 127.0.0.1 --port 4242 --cwd "$HOME/projects/WORKSPACE"
```

The shared-server value above applies only when already used by that tracker;
omit it for a setup that does not use it. Registration alone never starts a Dolt
server, initializes Beads, migrates data or changes the running CCNG process.
Existing units need this explicit registration step; application update plus
restart alone leaves their old saved environment intact.
Unrelated, linked or differently owned units are refused.

After current managed Claude work has finished, stop the foreground CCNG copy
once with Ctrl+C, then use:

```sh
"$HOME/apps/command-center-ng/command-center-ng" service start
"$HOME/apps/command-center-ng/command-center-ng" service status
"$HOME/apps/command-center-ng/command-center-ng" service restart
"$HOME/apps/command-center-ng/command-center-ng" service stop
"$HOME/apps/command-center-ng/command-center-ng" service logs
```

The equivalents are `systemctl --user start|status|restart|stop
command-center-ng.service` and `journalctl --user -u command-center-ng.service`.
The launcher logs command shows the latest100 lines; add `-f` to the direct
journalctl command to follow output. Inactive status retains systemctl's nonzero
exit status. The service restarts after unexpected failure and stops gracefully
on request; stopping CCNG ends its SDK-owned Claude runs while native history
survives. The separately running Codex daemon is not started, stopped or changed.

Use `service enable` for startup when your user manager starts (normally login),
or `service disable` to remove that startup choice. These commands do not
start/stop the current app. Boot-before-login operation requires separately
configured user lingering; registration does not change loginctl or permissions.
`service uninstall` explicitly disables/stops only this owned user unit, removes
it and reloads the manager; it leaves the installation and private app data intact.

After normal application updates, use `service restart` when ready. Register
again with explicit runtime options to replace saved options/profile/PATH values.
Repeating `service install` without options preserves an existing owned unit.
Running the launcher without `service` still starts it in the foreground.

## Updates

From the source checkout, run:

```sh
./install.sh --update "$HOME/apps/command-center-ng"
```

Use your existing installation directory. Without a directory the installer
asks for it. Git is required for updates. The installer fetches latest `main`
from `origin`, permits only a fast-forward from a clean `main` checkout, and
reruns the fetched installer. It refuses uncommitted changes, local commits
absent upstream, and another branch rather than discarding work. Source fetch
or build failure leaves the existing installation in place.

The target may be inside the source checkout, for example:

```sh
./install.sh --update ./targetdir
```

The existing installation is generated output, so its untracked files do not
block the update. All tracked changes and unrelated untracked files remain
protected; targets containing tracked source files are rejected. The updater
does not change Git ignore rules or discard local work. If a source-change check
fails, run `git status --short` to inspect the files it reports.

On the first update from 0.0.1 or 0.0.2, run `git pull --ff-only` first: those
installers do not yet understand `--update`. Future updates fetch automatically.
Ordinary installation after a manual pull also remains supported.

The application password and workspace files stay in private configuration outside the target.
Restart the app after updating, using `TARGET_DIR/command-center-ng`; the installer
does not restart running applications or the Codex daemon. Update an existing
service's launch path yourself if it previously used the global shortcut.

The launcher now lives entirely inside the selected installation. During
migration, the installer removes a legacy `~/.local/bin/command-center-ng` only
if it is the exact generated launcher owned by the current user for this same
target. Other launchers and symlinks are left untouched. No PATH shortcut is created.


## Beads project setup

Ensure `bd` is on PATH for the account running both Command Center and Codex.
Each conversation's working directory must resolve to a Beads tracker. Run
`bd where` there to check it. The installer first checks the invoking workspace
without auto-starting a server. If an existing project/parent/redirected tracker
resolves, it is reused without initialization, migration or server changes.

For a fresh setup, select an existing task workspace at the terminal prompt, or
pass it explicitly:

```sh
./install.sh --workspace "$HOME/projects/WORKSPACE" "$HOME/apps/command-center-ng"
```

The directory option selects the workspace; it does not approve changes. The
installer displays and asks before running native
`bd init --shared-server --non-interactive --skip-agents --skip-hooks` there.
That creates the tracker and lets Beads manage its private local shared Dolt
server, using its existing lifecycle and per-project database isolation. It does
not initialize the Command Center source checkout unless you explicitly select
it, and it leaves project agent instructions and Git hooks unchanged.

Missing Dolt is offered separately under `TARGET_DIR/tools/bin`, using the
official Linux amd64/arm64 archive pinned to Dolt 2.2.0 for Beads 1.3.2. Its
published SHA256 is checked before extraction; existing Dolt is reused rather
than replaced. Downloading requires curl; a missing RHEL 9 curl RPM is offered
through the same confirmed DNF flow. No shell profile or global binary is changed.

Fresh setup runs only after the application build and replacement succeed, so
the native server uses the final tool path. It applies an owner-only umask and
verifies a read-only Beads query after initialization. A failed native setup is
reported and left intact for diagnosis, without force/reinitialization retries.
If initialization is declined or there is no terminal, the application remains
installed and reports task setup pending. Existing partial tracker, routing or
connection configuration is left for deliberate review rather than overwritten.

Beads stores shared-server state under its native `~/.beads/shared-server` and
manages startup on demand. From the selected task workspace, use `bd dolt status`,
`bd dolt start` or `bd dolt stop` for deliberate lifecycle actions. No CCNG Dolt
wrapper, systemd unit or boot autostart is installed. Keep the installed local
tool directories on PATH for new terminals and agent daemons.

The application never initializes or migrates a tracker as a side effect of
viewing a tab. Read-only `--check` reports tracker readiness without setup.

Use Link tasks to associate existing issues. Automatic reads are read-only and
disable Beads auto-push. Link edits require an explicit authenticated action and
only add/remove that conversation's label. Task states remain agent-managed.


## Optional local Claude runtime

Claude management requires a signed-in native Claude CLI on the backend host.
The application pins the official Agent SDK0.3.212 and uses the installed CLI;
this installer does not replace Claude login, user/project/local settings or
permission defaults. The CLI interface was checked with2.1.316. An unavailable
Claude runtime is reported separately; Codex workflows remain available.
Source publication does not update the running app. Plan updates when managed
Claude work can stop: backend shutdown ends SDK-owned processes, while closing
only a tab leaves them running and native history survives either action.
