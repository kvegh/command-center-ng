# Deploy Command Center on RHEL 9

`ansible/deploy_command_center.yml` is built for genuine Red Hat Enterprise Linux
9 with systemd. Its first preflight rejects other distributions and major
versions before target changes. RHEL-compatible distributions are not accepted
by this playbook. Application code and deployment automation share the version
in `package.json`.

## Existing target prerequisites

Provision the selected HTTPS frontend with htpasswd before running this playbook.
Every deployment verifies its exact `command_center_public_origin` through one
unauthenticated, certificate-verified request from the execution environment.
The response must be HTTP 401 with a Basic challenge. Redirects and automatic
netrc credentials are disabled. A missing or incorrect frontend stops before
package installation or other managed target writes. This probe does not prove
every proxy route or direct-backend firewall restriction: the infrastructure
owner must enforce htpasswd on all routes and restrict direct backend access.
Proxy/TLS configuration remains outside this application playbook.

The playbook reuses an existing unprivileged Linux account and its home. The
default agent workspace is `~/ccng-wd`; first setup creates that directory and
initializes its native Beads tracker when none exists. Existing trackers and
authentication are preserved. It does not create the account, migrate project
data or manage a Codex service. Native Beads owns its shared Dolt server.
Compatible `bd` and `dolt` programs on the application PATH are reused. With
package management enabled, missing programs are provisioned unattended using
the same versions as the maintained installer, without answering terminal prompts.
Codex availability,
login and native daemon checks produce warnings when unavailable; they do not
prevent CCNG installation. Agent operation still needs a usable native runtime.
When package management is enabled, deployment attempts a missing Codex CLI in
the application's local tool directory, then configures native questions as
described below. Existing global tools and other profile settings are preserved.
The application checkout accepts the existing SSH
mode or credential-free HTTPS for a public repository. SSH needs existing Git
access and trusted host keys; HTTPS uses normal certificate verification. No
automatic trust acceptance or authentication exception is used.

The maintained installer distinguishes native home telemetry from a workspace
tracker: only the exact real `~/.beads/machine-id` plus `eventsData/` layout may
be ignored when checking whether a selected fresh workspace already has routing.
Actual trackers, configuration, redirects, unexpected files and symlinks retain
their existing protection. The Ansible PATH includes both target-local
`tools/bin` (Dolt) and `tools/node_modules/.bin` (Codex/Beads).

Ansible connects using an existing Machine credential with become permission.
The playbook can install `acl`, `ca-certificates`, `coreutils`, `gcc`, `gcc-c++`,
`git`, `gzip`, `make`, `python3` and `tar`, plus RHEL's Node.js 22 common module
profile when the selected Node does
not meet 22.12+. It does not reset a conflicting module stream. Set
`command_center_manage_packages: false` when prerequisites are managed separately.
HTTPS mode also requires OpenSSL; the playbook installs the existing utility's
RPM when package management is enabled. These package operations run on the
selected VM only. It does not provision nginx, firewall rules or an external
access route.

## Inputs and private configuration

Inventory must contain the approved VM in group `command_center`. Synthetic
examples live in `ansible/examples/`; never replace them with real environment
values in this public repository.

For the CaC-managed target, inventory holds its already verified
`command_center_ssh_known_hosts` entries and enables SSH host-key checking.
Native delegated tasks preserve other execution-environment `known_hosts`
entries while installing this target's pins before the first SSH connection.
Minimal facts and the existing RHEL guard then run before any target change.
Direct deployments without this supplied pin list retain their existing SSH
trust configuration. The encrypted runtime loader cannot override connection
variables.

| Variable | Meaning/default |
| --- | --- |
| `command_center_user` | Required existing non-root application account |
| `command_center_project_dir` | Agent workspace; default `<account-home>/ccng-wd`; retain an existing selected project/tracker on updates |
| `command_center_repository` | Required SSH or credential-free HTTPS application source URL |
| `command_center_revision` | Git revision to deploy; default `main`, fetched on every deployment for the newest source; an explicit existing pin remains supported |
| `command_center_source_dir` | Default `<account-home>/.local/src/command-center-ng` |
| `command_center_install_dir` | Default `<account-home>/commandcenter-ng` |
| `command_center_config_dir` | Default `<account-home>/.config/command-center-ng`; private auth/workspace metadata |
| `command_center_codex_home` | Default `<account-home>/.codex`; selected native profile |
| `command_center_path` | Existing account tool paths plus target-local tools and system executables |
| `command_center_bind_address` | Default `127.0.0.1` |
| `command_center_port` | Default `4242` |
| `command_center_public_origin` | Exact approved HTTPS origin; required for the pre-write frontend guard |
| `command_center_first_password_setup` | `disabled` by default; explicit `htpasswd-proxy` enables the existing first-browser password creation |
| `command_center_connection_type` | `http` by default; explicitly select `https` for a managed backend certificate |
| `command_center_tls_server_name` | Required in HTTPS mode; the selected DNS/IP certificate identity |
| `command_center_tls_days` | New self-signed certificate lifetime; default `365` days, from 1 to 3650 |
| `command_center_codex_package` | Default `@openai/codex@0.167.0`; used only for a missing local CLI |
| `command_center_manage_packages` | Default `true`; set `false` when system and CLI prerequisites are managed separately |
| `command_center_password` | Protected 12–4096-character initial password only when no auth file exists and browser-first setup is disabled |
| `command_center_force_install` | Default `false`; rebuild the selected revision explicitly |

All actual settings, inventory data and AAP configuration belong as whole-file
Ansible Vault ciphertext in private `command-center-ng-secrets`. Keep the Vault
password source outside both repositories and select it with the user. Existing
auth files are validated and preserved; supplying a different password does not
rotate an existing login. Initial password creation uses the maintained password
helper's stdin interface, with protected logging, never a password command-line
argument. There is no shared default password or forced first-login password
change. With explicit `command_center_first_password_setup: htpasswd-proxy`, a
fresh deployment instead leaves the auth file absent and writes that existing
app option plus the exact HTTPS public origin into `INSTALLDIR/etc/config.conf`.
The user chooses the application password on first browser opening; no initial
password or setup code is requested by Ansible. Existing auth files are still
validated and preserved. Service environment files contain no password.

## Behavior and boundaries

The playbook canonicalizes paths, confines managed directories to the account's
home and refuses overlap with the existing Codex profile or project. A source
checkout must have the selected origin and a clean worktree. Updates fast-forward
only: local commits, divergent revisions and implicit downgrades fail without
discarding work. Existing source-parent permissions are preserved.

Installation calls the maintained `install.sh --prefix DIRECTORY` as the
application user. New installations receive an HTTP-default
`INSTALLDIR/etc/config.conf`. Existing configuration, certificates and managed
tools survive installer replacement; the playbook then writes the explicitly
selected desired connection settings into that same file.
An identical recorded source commit with an executable launcher skips rebuilding;
a changed commit, missing/broken launcher or explicit force rebuilds. This decision
has fixture coverage; full target idempotence still requires a VM rerun.

The system manager owns `/etc/systemd/system/command-center-ng.service`; its
`User=` runs Command Center unprivileged. A foreign or linked unit is refused.
The playbook refuses an occupied port on first deployment rather than stopping
an existing process. It writes protected runtime settings, restarts only Command
Center when its files change, enables startup and checks `/healthz` for the exact
deployed application version. It never restarts the native Codex daemon.

The public default remains HTTP on loopback. Optional HTTPS mode creates or
reuses the application's self-signed backend pair as described below. This
playbook's application work does not configure nginx, its public certificate,
htpasswd, firewall rules or a browser access route. Those environment operations
and deployment acceptance belong to the infrastructure owner. For an existing
HTTPS proxy, supply the actual `command_center_public_origin` from protected
configuration and arrange explicit backend certificate trust there.

## Fresh workspace

The default application directory remains `~/commandcenter-ng`; the separate
`~/ccng-wd` directory is for agents and Beads, with no demo repository checkout
required. Existing explicit installation/workspace paths remain supported.
The default `main` revision is fetched on each deployment. Existing source
commits still advance by fast-forward only, without discarding local changes.

For the first default-workspace setup, Ansible creates only a missing private
directory, checks native tracker resolution and runs
`bd init --shared-server --non-interactive --skip-agents --skip-hooks` once.
The short shell invocation supplies `umask 077`, which the command module
cannot set; native Beads performs all initialization and server management.
Beads 1.3.2 may initialize local `.git` metadata in the fresh workspace; this is
its native setup behavior, not an AAP demonstration-repository checkout. No
source repository, remote, imported tasks or copied tracker is supplied. The
issue prefix defaults to the workspace directory name; no explicit prefix is
needed for `ccng-wd`. See the maintained version's
[initialization source](https://github.com/gastownhall/beads/blob/v1.3.2/cmd/bd/init.go#L1058-L1074).
Ansible adds no tracker database, server wrapper or background service of its
own. The final native read must succeed before application installation proceeds.

Reruns reuse a working tracker and preserve directory permissions, instructions,
hooks and authentication. A partial tracker, inherited tracker for the default
workspace, or conflicting user routing stops with a clear error instead of
being reset. The exact native home-telemetry layout described above is allowed.
Fresh initialization is limited to the default workspace; custom workspaces
must already have a usable tracker.

When task programs are absent and package management is enabled, Ansible uses
the installer's existing `@beads/bd@1.3.2` package and standalone Dolt 2.2.0
archives/checksums. Existing programs are not upgraded. `npm` installs Beads
because no builtin npm module exists; native `get_url`/`unarchive` handle the
HTTPS and SHA-256-verified Dolt archive. The pinned versions/checksums are
cross-checked against the maintained installer by a focused test. A short
shell-builtin `command -v` lookup checks the selected PATH without mistaking a
present but incompatible program for a missing program that may be replaced.

Missing tools first go into a private temporary target directory so the
standalone installer can use them without an interactive prompt or a misleading
tools-only application directory. After application installation they are
retained in `INSTALLDIR/tools`, then native tracker initialization uses that
stable PATH. Temporary downloads are removed on success or failure. No tool
installation, tracker or server is created on the Ansible operator machine.
With package management disabled, missing programs stop with a clear error.

## Backend certificates and native tools

With `command_center_connection_type: https`, the playbook manages:

- `INSTALLDIR/etc/certs/server.crt`: public self-signed certificate, mode 644.
- `INSTALLDIR/etc/certs/server.key`: matching private key, mode 600.
- `INSTALLDIR/etc/config.conf`: mode 600, with `connection_type: https` and both paths.

The directories are private (mode 700) and belong to the application account.
The certificate includes the selected server identity, the configured public
origin's hostname when present, and the health-check address in its subject
alternative names. HTTPS health verification
uses that public certificate with verification enabled; it does not disable
certificate checks. Existing pairs are verified for key agreement, validity,
signature and endpoint identity before reuse. Partial pairs, mismatched keys
and unsafe managed symlinks are refused. HTTP mode preserves an existing pair.
Repeated deployment does not regenerate or silently rotate certificates.
Renewal/replacement remains an explicit operator action.

The supported Red Hat certificate system role was considered first. It uses
certmonger and does not provide OpenSSL as a supported provider; adopting it
would add a certificate-management service for this one generated pair. This
playbook instead uses the existing OpenSSL utility through shell-free
`ansible.builtin.command` arguments, with guarded generation and native
verification. See [Red Hat's certificate role documentation](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html-single/automating_system_administration_by_using_rhel_system_roles/index)
and the [role's providers](https://github.com/linux-system-roles/certificate#cas-and-providers).

The selected Codex CLI is installed through the existing `npm` executable only
when absent and package management is enabled. The package version is pinned,
the prefix is the application's `tools/` directory, and an existing global CLI
is reused. There is no builtin npm package module; using the existing package
manager avoids another collection dependency for this local CLI operation.
Installation failures warn and continue. No new daemon or credential mechanism
is introduced.

## Native Codex questions

`server/codex-setup.mjs` is shared by installation, deployment and startup.
It uses native `codex features list` and, only during explicit setup,
`codex features enable default_mode_request_user_input`. Native Codex writes
its selected profile configuration; the helper does not edit TOML directly.
The deployment task runs as the application account with the selected PATH and
`CODEX_HOME`. The normal installer also attempts setup using its final tool
PATH. Startup calls the read-only check; it never enables a feature implicitly.

This bounded helper is necessary because no native Node/Ansible feature-settings
API is exposed. The inspected CLI has no JSON output for `features list`, so the
helper validates the exact feature row and checks the native result after an
update. Missing, unsupported or ambiguous interfaces, permission errors,
timeouts, failed commands and unconfirmed updates produce warnings and allow
CCNG installation, deployment or startup to continue. The Ansible task also
handles a missing or malformed helper response as a warning. No login credential
is copied or invented.

The feature is under development. Its compatibility warning remains visible;
no unstable-warning suppression setting is written. A selected profile may be
shared with other Codex clients, and enabling the flag can affect those clients.
No daemon or worker is restarted, and a saved flag is not proof that an existing
worker has adopted it. Native permissions and approvals remain in force.
See the [official native feature command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-features).

## Existing proxy and logs

If an external nginx proxy connects to this HTTPS backend, it must explicitly
trust the matching public certificate and verify the intended backend name.
Only the public certificate needs to reach the proxy; the backend private key
stays on the application host. The proxy's own public certificate and htpasswd
configuration remain its owner's responsibility. This project does not claim
that the real proxy or route was changed or verified during source development.

Application startup messages, errors and Codex warnings go to stdout/stderr and
are captured by systemd. For this playbook's system-managed service, use
`journalctl -u command-center-ng.service` and add `-f` to follow output, subject
to journal permissions. A manually installed user service instead uses
`journalctl --user -u command-center-ng.service` or the launcher's `service logs`.

## AAP integration

AAP synchronizes public code using an HTTPS SCM URL. Agent-side Git operations
use SSH, per workspace policy; the VM checkout may also use credential-free
HTTPS for the public source. That choice does not create or copy a Git identity.
The project-specific private CaC capture follows the existing shared
`deploy-cac-project.yml` importer format; its intended canonical path is
`vaults/cac/command-center-ng-cac-vault.yml`. The shared importer uses project ID
`command-center-ng` and its dedicated repository-reader/CaC-Vault pair. No second
importer or wrapper is introduced.

The application Job Template selects `ansible/deploy_command_center.yml`, the
approved target inventory and existing Machine/become access. Protected runtime
inputs must be supplied through the established AAP configuration process; merely
attaching a Vault credential does not load a file from another repository.
The CaC capture saves `command_center_runtime_settings_vault` as whole-file
ciphertext and `command_center_runtime_expected_instance` as the selected
instance key. The private runtime file uses the existing `instances` mapping:
each instance contains only the deployment inputs documented above. After the
RHEL platform guard, native tasks decrypt the ciphertext using the attached
Vault credential, reject a missing instance or unsupported variables, bind the
selected settings and always remove the temporary file. Without the ciphertext
variable, existing direct-input deployment is unchanged.
The server playbook deliberately does not clone the secrets repository onto the
VM. CaC import creates platform definitions; application deployment is a separate
job. Capture every actual AAP change in encrypted CaC before calling it complete.

## Local validation

Do not run this deployment playbook against the development machine.
Syntax checking parses the real entry point without applying it:

```sh
ANSIBLE_LOCAL_TEMP=/tmp/ccng-syntax-local \
  ansible-playbook --syntax-check -i ansible/examples/inventory.example.yml \
  ansible/deploy_command_center.yml
python3.12 -m unittest discover -s tests -p 'test_command_center_*.py' -v
ANSIBLE_HOME=/tmp/ccng-lint-home ANSIBLE_LOCAL_TEMP=/tmp/ccng-lint-local \
  python3.12 -m ansiblelint --offline --profile production --strict ansible/
```

The fixture suite invokes real Ansible only against disposable localhost files:
OS rejection before a sentinel change, inventory override precedence, canonical
path protection, rebuild decisions, real password hashing/preservation and
symlink rejection. Certificate fixtures use real temporary OpenSSL pairs to
verify SANs, trust, modes, reuse and refusal behavior. Native question fixtures
use the actual helper with a stub Codex executable and temporary profile data
to verify setup, idempotence and warning-only failure. They do not alter a real
native profile. The suite renders the actual systemd template, including spaced
paths, then parses it offline with `systemd-analyze verify`. It does not install
packages, alter accounts, start services, connect to a VM or call a model.
Use already available Python/Ansible/lint/systemd tools; ask before installing
missing dependencies. Whole-playbook `--check` is explicitly refused because the
stateful installer requires real output files.

Passing local checks does not prove a real RHEL 9 startup, an AAP execution
environment's dependencies, browser access or a successful live deployment.
Those remain deployment-owner acceptance work: running the approved Job Template
against the selected VM and
checking its final result, service identity, health and a preservation rerun.
Native-loader fixtures verify real Vault decryption, instance selection,
connection-override refusal and temporary-file cleanup. They do not establish
that the target account has signed in, that Git access works, or that the app
has started; those remain live acceptance checks. No live deployment is performed
as a local test of this playbook.
