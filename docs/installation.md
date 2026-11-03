# Linux installation

Linux is the first and primary platform for running Command Center NG.

The user selected the installation model:

- Provide a simple Linux shell script.
- Install into the invoking unprivileged user's home directory.
- Do not require root or sudo.

The interface must remain usable from a Linux desktop browser and a smartphone
browser. Browser support does not imply a selected remote-access or hosting
arrangement.

Version 0.0.1 includes the installer. Linux, Node.js 22.12+, npm, tar, and realpath
must already be installed. Codex must be installed and signed in to manage
agents; version 0.166.0 was tested. No system packages or services are installed.

From the cloned repository:

```sh
sh install.sh "$HOME/apps/command-center-ng"
```

The directory parameter selects the destination. Without it, the installer asks
for a target directory before doing any work. The destination must remain
inside your home. Unrelated directories and launchers are not overwritten.
The installer builds the frontend, prunes build-only dependencies, and creates
`~/.local/bin/command-center-ng`. On the first interactive install, it prompts
for an application password of at least 12 characters.

Passwords are stored only as salted scrypt hashes in
`${XDG_CONFIG_HOME:-$HOME/.config}/command-center-ng/auth.json`, with owner-only
permissions. Set `CCNG_CONFIG_DIR` to select another private directory outside
the checkout. Reinstalling preserves this file. For noninteractive installs or
password changes, run the installed `server/password.mjs` with Node in a terminal,
then restart the app. Sessions are invalidated when the app restarts.

Start `codex app-server daemon start` using the same account and Codex home as
the conversations to manage, then run `~/.local/bin/command-center-ng`. The
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
for the listening options. Stop the foreground app with Ctrl+C. To update, pull
the source, rerun the installer, and restart the application.
