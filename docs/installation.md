# Linux installation

Linux is the first and primary platform for running Command Center NG.

The user selected the installation model:

- Provide a simple Linux shell script.
- Install into the invoking unprivileged user's home directory.
- Do not require root or sudo.

The interface must remain usable from a Linux desktop browser and a smartphone
browser. Browser support does not imply a selected remote-access or hosting
arrangement.

Version 0.4.2 includes the installer. Linux, Node.js 22.12+, npm, tar, realpath,
and Beads (`bd`) must already be installed. The installer validates the bd JSON/
read-only/brief-list interface before building; the app checks it again at startup.
Beads 1.3.2 was verified. See the [official installation guide](https://github.com/gastownhall/beads/blob/main/docs/getting-started/installation.md).
Use an embedded-capable Beads build if you do not already operate its server
mode. The application reuses existing Beads configuration and does not install
or manage a Dolt service. Missing tools are reported, not installed automatically. Codex must be installed and signed in to manage
agents; version 0.166.0 was tested. No system packages or services are installed.

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

Additional runtime options: `--cwd DIRECTORY` selects the default agent working
directory, and `--socket PATH` selects an existing Codex Unix socket explicitly.
`CCNG_HOST`, `CCNG_PORT`, and `CCNG_PUBLIC_ORIGIN` provide environment equivalents
for the listening options. Stop the foreground app with Ctrl+C.

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

The application password file stays in private configuration outside the target.
Restart the app after updating, using `TARGET_DIR/command-center-ng`; the installer
does not restart running applications or the Codex daemon. Update an existing
service's launch path yourself if it previously used the global shortcut.

The launcher now lives entirely inside the selected installation. During
migration, the installer removes a legacy `~/.local/bin/command-center-ng` only
if it is the exact generated launcher owned by the current user for this same
target. Other launchers and symlinks are left untouched. No PATH shortcut is created.


## Beads project setup

Ensure `bd` is on PATH for the account running both Command Center and Codex.
Each conversation's working directory must resolve to an existing Beads tracker.
Run `bd where` there to check it. If none exists, deliberately initialize it with
`bd init` according to your project's workflow before using task tracking. The
app never initializes or migrates a tracker as a side effect of viewing a tab.

Use Link tasks to associate existing issues. Automatic reads are read-only and
disable Beads auto-push. Link edits require an explicit authenticated action and
only add/remove that conversation's label. Task states remain agent-managed.
