# Linux installation

Linux is the first and primary platform for running Command Center NG.

**Plan one CCNG deployment per engineer for now.** This application does not
provide multi-tenant account or workspace isolation. People connecting to the
same deployment share its backend account, connected agent runtimes and
application workspace/data. Agent tabs organize projects and conversations;
they do not separate human users. Reverse-proxy Basic Auth restricts entry,
but different proxy logins do not create isolated CCNG accounts or workspaces.

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

The installer offers pinned Beads 1.3.2 and Codex 0.167.0 CLI packages for optional
fresh local installation. Existing compatible CLIs are reused. The application
checks Beads JSON/read-only/brief-list support. After the application is built,
fresh tracker/shared Dolt setup is offered for an explicitly selected task
workspace. Existing trackers and connection settings are preserved. No system
package, global tool, tracker or server is changed without terminal confirmation.
Codex readiness and native question setup are advisory: missing or incompatible
Codex produces a warning while CCNG installation continues. Node.js, npm and
Beads prerequisites remain required.

## Choose a setup path before cloning

**With sudo and normal RHEL repository access:** install Git first if missing,
then run the installer as your ordinary account. It offers remaining missing
RHEL packages, including a suitable Node/npm setup, with explicit confirmation:

```sh
sudo dnf install git
```

**Without sudo:** an administrator must prepare all required system packages
and a working Node.js 22.12+ with npm before you run the installer, not only Git.
Use the [A/B/C administrator checklist](rhel9-prerequisites.md#2-no-sudo-administrator-prepares-prerequisites)
for base tools, Node and network/optional download prerequisites. The initial
shell/coreutils commands must already exist to start the installer. Other Linux
distributions retain the unverified preinstalled-prerequisite path above.

Both paths require a writable home and access to the source, npm registry and
selected tool downloads through normal certificate trust. User-local Beads,
Codex and fresh Dolt/tracker setup can still be offered with consent without
sudo once those system prerequisites are ready. Never use `sudo ./install.sh`.
Then clone as an ordinary user using the [first-time walkthrough](#first-time-walkthrough).
From the cloned repository:

```sh
./install.sh
# Optional destination override:
./install.sh --prefix "$HOME/apps/commandcenter-ng"
```

The default destination is `~/commandcenter-ng`; `--prefix DIRECTORY` selects
another destination. The destination must remain
inside your home. Unrelated directories and launchers are not overwritten.
Older positional directory arguments remain accepted for existing update scripts;
new commands should use `--prefix`. Updating a nondefault installation requires
its existing path explicitly; the installer does not discover, move or delete it.
The installer builds the frontend, prunes build-only dependencies, and creates
`command-center-ng` inside the selected target. Existing passwords are preserved;
no default or temporary setup code is generated. Choose a 12–4,096-character
password using the existing CLI for local use, or explicitly enable the protected
browser setup described below.

## Protect access before first start

**Restrict access before exposing browser-first password creation.** That
explicitly enabled setup has no pre-existing CCNG password: the first successful
visitor creates it. Keep it reachable only by the intended operator until that
step is complete. With browser setup disabled, CCNG refuses startup when its
authentication file is missing; updates preserve an existing password.

The default HTTP connection is unencrypted, including login traffic. HTTPS
encrypts traffic but does not decide who may reach the application. For example,
an HTTPS reverse proxy can require a separate HTTP Basic Auth login, with its
password hashes stored in an `htpasswd` file. Other ways to restrict access
include localhost with an SSH tunnel, a VPN or firewall rules. Do not expose a
default-route listener unintentionally; choose the listening address appropriate
for the protection you actually configured.

Those are general access-protection examples, not interchangeable setup modes.
CCNG's existing `htpasswd-proxy` browser setup specifically requires an HTTPS
proxy enforcing Basic Auth on every route, with direct backend access restricted
so users cannot bypass the proxy.
The deployment playbook additionally checks that the selected frontend returns
HTTP **401 with a Basic challenge**, using trusted HTTPS, before managed writes.
The app does not independently verify the proxy's password file or firewall.
The basic installer configures none of these external protections. See
[first-browser password creation](#first-browser-password-creation) for the
explicit opt-in and [Ansible deployment](ansible-deployment.md) for its guard.

## First-time walkthrough

1. Complete your [setup path](#choose-a-setup-path-before-cloning) before cloning.
   With sudo and normal RHEL repositories, install Git first if missing:

   ```sh
   sudo dnf install git
   ```

   Without sudo, have an administrator complete the linked A/B/C checklist,
   including base tools, Node/npm and required download access. Continue as your
   ordinary account; do not run the whole installer with sudo.
2. Clone the public repository into a source directory, separate from the final
   installation, then run the installer:

   ```sh
   git clone https://github.com/kvegh/command-center-ng.git "$HOME/command-center-ng-src"
   cd "$HOME/command-center-ng-src"
   ./install.sh
   ```

3. Follow the prompts for missing prerequisites,
   optional native Codex sign-in and the existing project directory for Beads.
   The installer asks before installing packages/tools or initializing a tracker.
   It builds CCNG into `~/commandcenter-ng`; `--prefix DIRECTORY` changes that
   destination. Prepare an existing writable task workspace before selecting it;
   tracker setup may be deferred. The application password and Codex sign-in are separate.
4. Apply the tool PATH printed by the installer and complete `codex login` if
   sign-in was deferred. Under the same Linux account, run
   `codex app-server daemon start` once if the native daemon is not already running.
   It runs in the background; its starting terminal can close. CCNG only connects
   to the existing daemon and never starts a replacement. Reuse a running daemon;
   do not restart it while agents are working. After reboot, start it again if
   not already running; the installer does not configure native boot autostart.
5. Apply the [external access protection](#protect-access-before-first-start)
   appropriate for your listener before exposing CCNG. For local use, first run
   `node "$HOME/commandcenter-ng/server/password.mjs"`
   to choose your password. Then start `"$HOME/commandcenter-ng/command-center-ng"`. On that machine, open
   `http://localhost:4242` and sign in. Fresh installations use HTTP and, without
   explicit host overrides, listen on the selected default-route IPv4 address
   and 127.0.0.1. The startup message prints the actual addresses.
6. To use a background user service, stop the foreground app, then run:

   ```sh
   "$HOME/commandcenter-ng/command-center-ng" service install
   "$HOME/commandcenter-ng/command-center-ng" service enable
   "$HOME/commandcenter-ng/command-center-ng" service start
   ```

   The same launcher supports `service stop`, `restart`, `status` and `logs`.
7. Connection settings are in `~/commandcenter-ng/etc/config.conf`. HTTPS is
   optional and needs readable certificate/key files supplied by the operator.
   The basic installer does not generate certificates or configure nginx or
   firewall rules. See the protected browser setup below if you prefer to choose
   the first application password through your existing HTTPS proxy.

The supported source-checkout update command is `./install.sh --update`, with
`--prefix` pointing to the existing destination when it is nondefault. Restart
the app after updating. Existing configuration, certificates, login hash and
saved workspace are preserved.

## Finish Beads setup later

At the Beads workspace prompt, enter an existing directory path, or leave it
blank to defer setup. This prompt is not a yes/no confirmation: `y` is treated
as a directory name. A separate confirmation follows when fresh initialization
is proposed. Leaving the path blank keeps CCNG installed, with task-tracker
setup pending.

To finish later, prepare a writable workspace and rerun the maintained installer
from the original source checkout:

```sh
mkdir -p "$HOME/ccng-wd"
cd "$HOME/command-center-ng-src"
./install.sh --workspace "$HOME/ccng-wd"
```

For a custom installation, add the same `--prefix DIRECTORY` used originally.
Existing application settings, password and usable trackers are preserved.
Fresh native Beads/Dolt initialization still requires confirmation; declining
does not turn it into an automatic setup action. Use the matching directory for
that project's agent work after setup.

## Native Codex authentication

Codex is currently the supported agent runtime. Authenticate under your own
OpenAI identity: ChatGPT sign-in with eligible workspace access/seats for Codex,
or OpenAI API-key authentication with usage-based access. An API key is optional,
not required for every user. Normal `codex login` uses
browser sign-in; `codex login --device-auth` is an optional beta alternative only
when enabled in personal settings or by the workspace administrator. You may defer
sign-in during installation, but must complete it before using agents.
The CCNG password is separate. Never
paste authentication values into chat or copy another account's managed credentials.
See [native authentication](https://learn.chatgpt.com/docs/auth?surface=cli).

### Browser sign-in from an SSH session

If CCNG/Codex runs on another machine, normal browser sign-in can still use your
local browser. On your local computer, open the SSH session with the native login
callback port forwarded (replace the example account and host):

```sh
ssh -L 1455:localhost:1455 operator@server.example.invalid
```

Keep that session open. In its remote shell, with the installed tool PATH set,
run:

```sh
codex login
```

Open the printed sign-in URL in your local browser; the SSH tunnel carries its
localhost callback to the remote Codex login. This authenticates Codex on the
backend host, not a remote CCNG agent-monitoring feature. Follow your organization's
authentication rules; do not copy another account's auth files or paste tokens
into CCNG. Device-code login is an optional alternative only when enabled.

## Login management

Application sessions survive normal CCNG updates and restarts. Each retains its
original 12-hour expiry; restarting does not extend it. Logging out revokes that
browser's session, and changing the application password invalidates existing
sessions. The first upgrade from memory-only sessions needs one final application
login because those older sessions were never saved.

To require every browser to sign in again, run this as the account that runs CCNG:

```sh
"$HOME/commandcenter-ng/command-center-ng" --clear-logins
```

Use your existing installation path if different. The command exits after
invalidating application sessions in the same private configuration profile.
It works while the application service is running: the next authenticated check
rejects an old session, and open event streams close by their next heartbeat
(within about 15 seconds). It does not stop agents, change the password or clear
nginx's htpasswd credentials. If the service uses `CCNG_CONFIG_DIR` or
`XDG_CONFIG_HOME`, run the command with the same profile settings.

Session records live in the owner-private `sessions/` directory beside
`auth.json`, outside the installation. They contain hashes of random session
IDs, expiry and invalidation references, never raw browser cookies or passwords.
Unsafe or unavailable authentication storage produces an error rather than
falling back to temporary sessions. Application authentication failures use
explicit JSON errors instead of issuing HTTP Basic authentication challenges.

## Application connection settings

After a successful build, the installer prepares `INSTALLDIR/etc/config.conf`
and an `INSTALLDIR/etc/certs/` directory before replacing the installation.
`INSTALLDIR` is `~/commandcenter-ng` by default, or the selected `--prefix`.
New installations use HTTP. The generated config contains commented HTTPS
examples before the active HTTP setting:

```text
# connection_type: https
# tls_certificate: /INSTALLDIR/etc/certs/server.crt
# tls_private_key: /INSTALLDIR/etc/certs/server.key
# Other readable certificate/key paths are supported.
connection_type: http
```

The installer fills in the actual selected installation path; `/INSTALLDIR`
above is only a documentation placeholder. Normal installation does not generate
certificates. Updates preserve existing configuration, certificate files and
managed tools. The configuration and certificate directories are private
(mode 700), and the config is mode 600. Unsafe managed symlinks are refused.

The launcher reads this same config during foreground and systemd startup.
Supported settings are `connection_type`, `tls_certificate`, `tls_private_key`,
`host`, `port` and `public_origin`. Use one literal `key: value` per line, with
`#` comments on their own lines. Spaces and `#` inside a value are literal;
quotes, environment variables, `~` and shell expressions are not expanded.
This is a small text settings format, not YAML, and adds no parser dependency.
Duplicate or unsupported keys and malformed settings stop startup with a useful
error. Certificate paths may be absolute or relative to the config directory;
other directories work when readable by the application account.

Explicit command-line options override environment values, which override this
file. Saved explicit service options still take precedence after an update.
Restart CCNG deliberately after editing settings; it does not reload them while
running. Password and saved conversation metadata use the separate private
directory described below, rather than this connection file.

## Password and saved workspace

Passwords are stored only as salted scrypt hashes in
`${XDG_CONFIG_HOME:-$HOME/.config}/command-center-ng/auth.json`, with owner-only
permissions. Set `CCNG_CONFIG_DIR` to select another private directory outside
the checkout. Reinstalling preserves this file and the existing password.
The installer does not create a default password or ask for one. For local setup,
run `node INSTALLDIR/server/password.mjs` in a terminal before starting CCNG.
The same explicit command can deliberately reset a password. The app checks the
current password revision for authentication, so a reset invalidates existing
sessions without requiring a restart. An ordinary restart preserves unexpired
sessions; `--clear-logins` explicitly revokes them.
Without an existing password, startup requires the protected setup opt-in below.

### First-browser password creation

**Set up external access protection before enabling this mode.** Until the first
password is created, there is no existing CCNG password protecting enrollment.
HTTPS alone is not an access restriction; see
[first-start protection](#protect-access-before-first-start).

This mode is for an existing HTTPS reverse proxy with enforced htpasswd
(Basic Auth). Before enabling it, require that login on **every route**, including
`/api/session` and `/api/setup`, and restrict backend access so users cannot bypass
the proxy. HTTPS, a public origin setting or forwarded headers alone do not
provide that protection. CCNG does not inspect the proxy's password file.

In `INSTALLDIR/etc/config.conf`, set your actual browser-facing origin:

```text
public_origin: https://command-center.example
first_password_setup: htpasswd-proxy
```

Keep the existing HTTP or HTTPS backend settings appropriate for your proxy;
this mode does not configure nginx, issue certificates or open firewall ports.
Restart CCNG, pass the proxy's htpasswd login, then open that exact HTTPS address.
A fresh installation asks you to enter and confirm your new CCNG password.
Creation signs you into the application. There is no temporary code, shared
password or need to supply the app password to deployment automation.

Only the first successful setup can create the hash. A concurrent attempt cannot
replace it; subsequent openings use normal application login. Existing passwords
are preserved even if this mode is enabled. Corrupt, unreadable or unsafe auth
files cause a startup error instead of being treated as fresh setup. Ordinary
app APIs remain locked before enrollment. Generic installations keep this mode
disabled; the commented example does not assert that a proxy is protected.
Set `first_password_setup: disabled` to disable browser enrollment explicitly.
The same mode is available through `--first-password-setup` or
`CCNG_FIRST_PASSWORD_SETUP`, with the normal CLI/environment/file precedence.

The app feature and its handler/UI tests are separate from deployment automation.
The [deployment guide](ansible-deployment.md#inputs-and-private-configuration)
describes the current playbook's password handling; migration to this opt-in is
owned by the deployment work and must be verified separately.

The same configuration directory holds private `workspace.json` (mode 600):
open conversation IDs, coordinator ID and pause state. It is written by the
existing Command Center backend on port 4242; that workspace file does not need
another service or database. Optional Beads setup is separate, as described below.
Installer updates preserve the workspace file outside the target, along
with the password file. Browser drafts/order/positions stay in local browser
storage. After restart, an unexpired application session can remain signed in;
sign in again when needed to see restored tabs. Restoring reads existing
history without starting worker work; already-running Codex tasks remain native.
See [workspace restore and recovery](workspace-restore.md).

If CLIs were installed under the target, export its
`tools/bin` and `tools/node_modules/.bin` on PATH before starting the daemon so native agents
can also find Beads. An already-running daemon retains its original PATH; after
adding Beads, restart it only when existing work is idle.

For native agent operation, use `codex app-server daemon start` if it is not
already running, with the same account and Codex home as
the conversations to manage, then run `"$HOME/commandcenter-ng/command-center-ng"`
(adjusting the destination to your installation). The
listening address is selected as described below; use an explicit loopback host
for local-only access. The application connects to the existing
daemon and reports disconnection rather than starting a replacement.

## Native Codex question setup

After installation, CCNG attempts to enable native
`default_mode_request_user_input` for the selected Codex profile through Codex's
own `features` commands. The deployment playbook uses the same helper. Native
Codex owns persistence; CCNG does not write TOML directly. At app startup the
helper only checks the setting and reports warnings.

Missing Codex, unsupported feature interfaces, permission failures, timeouts or
unconfirmed changes warn and continue installation, deployment or startup.
Agent use may remain unavailable until native setup is completed. The feature
is currently under development; its compatibility warning remains visible and
the installer does not suppress unstable-feature warnings. Existing daemons
and workers are not restarted, and saving the flag does not prove an already
running worker has adopted it. A selected profile may be shared with other Codex
clients, so the native setting can affect those clients too. See the
[deployment details](ansible-deployment.md#native-codex-questions).

## Listening address and HTTPS

`command-center-ng --help` (or `-h`) prints all runtime controls without reading
authentication, detecting routes, starting services or creating a workspace.
Without a configured `host`, `--host` or `CCNG_HOST`, CCNG listens on exactly two
addresses: the interface address selected from Linux's usable lowest-metric
default IPv4 route, and `127.0.0.1`. It does not bind other external interface
addresses. Both listeners use the same port, process, workspace and application
authentication. Startup prints both addresses, the selected route interface,
port and protocol; systemd captures the same stdout in its journal. Help also
describes this two-address default. The existing `ip` command from iproute is
required only for automatic selection. Ambiguous or unavailable routes fail
with guidance to select `--host ADDRESS`; there is no wildcard or loopback-only
fallback. If either listener cannot bind, startup closes any listener already
opened and fails. Normal shutdown closes both. An address changing later requires
a restart.

Use `--host 127.0.0.1` for localhost, a specific local IP for one address, or
`--host 0.0.0.0` deliberately for all IPv4 interfaces. Explicit saved service
arguments/environment remain effective; updating code does not replace them.
An explicit host selects only that bind address; it does not add a second
loopback listener.

HTTP is the launcher default. To enable HTTPS in `etc/config.conf`, set
`connection_type: https` and provide both `tls_certificate` (PEM certificate
chain, leaf first) and `tls_private_key` (matching private key). Alternatively,
use `--protocol https --tls-cert FILE --tls-key FILE`, or the corresponding
`CCNG_PROTOCOL`, `CCNG_TLS_CERT` and `CCNG_TLS_KEY` environment values.
The service account must be able to read the files. Keep actual key material
outside Git. The normal installer/runtime does not issue or renew certificates;
the application deployment playbook can generate its selected self-signed pair.
After external renewal, restart CCNG to load the replacement files. Startup checks
format, dates, key matching and browser SAN identity and shows safe public
certificate information; failures do not enable HTTP. This does not establish
browser trust in a private/self-signed issuer or perform revocation checks.

Use `--public-origin https://command-center.example:4242` for a DNS certificate
when directly browsing that nonstandard port. Behind nginx's external port 443,
the public origin instead omits the internal port. Native HTTPS uses Secure
cookies and the existing login/Host/Origin guards. Certificate-file paths are
also supported by user-service runtime options. Supplying certificate paths
alone does not change the HTTP default. An explicitly selected HTTPS mode with
missing or unsuitable certificate files fails rather than falling back to HTTP.

Deliberately select `--protocol http` (or `CCNG_PROTOCOL=http`) for localhost,
proxy or debugging use. Explicit HTTP ignores TLS file settings. It does not
enable TLS, remove the application login or configure external access.
The Ansible playbook writes its selected protocol and certificate paths into
the same application config; its default is HTTP and its HTTPS mode is explicit.

### Local HTTPS through an SSH tunnel

An SSH tunnel forwards connections; it does not change the browser's Origin.
When CCNG itself uses HTTPS, a configured `public_origin` can coexist with local
access through its loopback listener at `https://localhost:4242` or
`https://127.0.0.1:4242` (or `https://[::1]:4242` with an explicit IPv6 loopback
bind). The browser Origin must match
the request's Host and port, and both ends of CCNG's actual connection must be
loopback. Requests on wildcard/non-loopback listeners, a different origin or
port, HTTP access and forwarded headers do not enable this additional local
origin. The configured
public origin remains accepted as before. The browser must still trust the
presented certificate and validate the hostname used; tunneling adds no
certificate-trust or hostname exceptions. The application login remains required.

### Existing nginx proxy settings

Use `--protocol http --host VM_INTERNAL_IP --port 4242` for an HTTP backend on the
VM's internal interface. Set
`--public-origin https://command-center.example` to the exact browser-facing
origin. It enables Secure cookies and permits that proxy hostname. These values
are deployment placeholders; do not commit real addresses or credentials.

Browser-to-nginx HTTPS and nginx-to-CCNG HTTPS are separate connections. An HTTP
backend needs no CCNG certificate and leaves that internal connection unencrypted.
For a verified HTTPS backend, nginx must trust CCNG's certificate issuer and
verify the expected server name; a newly self-signed certificate is not trusted
automatically. Nginx's default upstream verification is off, so connectivity alone
does not establish verification. See the official
[nginx verification](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_verify)
and [trusted certificate](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_trusted_certificate)
directives. The application installer does not alter a proxy's trust configuration.
Nginx and the real environment's external route are managed separately from
CCNG's application deployment; this guide does not claim their live
configuration has been verified.

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

This service starts CCNG only; it does not start or enable the native Codex
daemon. A daemon process does not survive reboot. This installer does not enable
native bootstrap or verify separately configured native boot autostart.
After reboot, start the daemon separately if it is not already running, using
the same account/tool PATH. Saved native login and history are not erased by
the process stopping.

The installed launcher can manage Command Center as a user service. No sudo is
needed. Update the installation first so its launcher includes the service
commands, then register it with the same runtime options as your foreground app:

```sh
"$HOME/commandcenter-ng/command-center-ng" service install -- \
  --cwd "$HOME/projects/WORKSPACE"
```

Replace the installation/workspace placeholders and retain required port, public
origin and socket options. With no host override in the config file, environment
or saved arguments, this example uses the default route address plus loopback.
Add `--host 127.0.0.1` for a local-only service. Existing units with an explicit
`--host` keep that single bind address after updates. To adopt the two-address
default, deliberately register the service again without that option and remove
any other host override; apply the change with a restart when safe. Registration
alone does not restart the running service. The example leaves `etc/config.conf`
to select the protocol and certificate files. Registration writes an owner-only
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
  "$HOME/commandcenter-ng/command-center-ng" service install -- \
  --host 127.0.0.1 --cwd "$HOME/projects/WORKSPACE"
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
"$HOME/commandcenter-ng/command-center-ng" service start
"$HOME/commandcenter-ng/command-center-ng" service status
"$HOME/commandcenter-ng/command-center-ng" service restart
"$HOME/commandcenter-ng/command-center-ng" service stop
"$HOME/commandcenter-ng/command-center-ng" service logs
```

The equivalents are `systemctl --user start|status|restart|stop
command-center-ng.service` and `journalctl --user -u command-center-ng.service`.
The launcher logs command shows the latest 100 lines. To follow startup messages,
errors and Codex readiness warnings from the user service:

```sh
journalctl --user -u command-center-ng.service -f
```

The Ansible-managed system service uses `journalctl -u command-center-ng.service`
instead of `--user`, subject to the account's journal permissions. CCNG writes
to stdout/stderr; no separate log-file service is introduced.
Inactive status retains systemctl's nonzero
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
./install.sh --update
# For a nondefault existing installation:
./install.sh --update --prefix "$HOME/apps/commandcenter-ng"
```

Use your existing installation directory. Without --prefix, updates address
~/commandcenter-ng; another existing path must be supplied explicitly. No
installation is moved automatically. Git is required for updates. The installer fetches latest `main`
from `origin`, permits only a fast-forward from a clean `main` checkout, and
reruns the fetched installer. It refuses uncommitted changes, local commits
absent upstream, and another branch rather than discarding work. Source fetch
or build failure leaves the existing installation in place.

The target may be inside the source checkout, for example:

```sh
./install.sh --update --prefix ./local-install
```

The existing installation is generated output, so its untracked files do not
block the update. All tracked changes and unrelated untracked files remain
protected; targets containing tracked source files are rejected. The updater
does not change Git ignore rules or discard local work. If a source-change check
fails, run `git status --short` to inspect the files it reports.

On the first update from 0.0.1 or 0.0.2, run `git pull --ff-only` first: those
installers do not yet understand `--update`. Future updates fetch automatically.
Ordinary installation after a manual pull also remains supported.

The entire installed `etc/` tree, including settings and certificate files,
survives ordinary updates. Existing managed tools are preserved too. The
application password and workspace files stay in private configuration outside the target.
Restart the app after updating, using `PREFIX/command-center-ng`; the installer
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
./install.sh --workspace "$HOME/projects/WORKSPACE"
# Add --prefix DIRECTORY if the app should not use ~/commandcenter-ng.
```

The directory option selects the workspace; it does not approve changes. The
installer displays and asks before running native
`bd init --shared-server --non-interactive --skip-agents --skip-hooks` there.
That creates the tracker and lets Beads manage its private local shared Dolt
server, using its existing lifecycle and per-project database isolation. It does
not initialize the Command Center source checkout unless you explicitly select
it, and it leaves project agent instructions and Git hooks unchanged.

Missing Dolt is offered separately under `PREFIX/tools/bin`, using the
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
