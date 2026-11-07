# Deploy Command Center on RHEL 9

`ansible/deploy_command_center.yml` is built for genuine Red Hat Enterprise Linux
9 with systemd. Its first preflight rejects other distributions and major
versions before target changes. RHEL-compatible distributions are not accepted
by this playbook. Application code and deployment automation share the version
in `package.json`.

## Existing target prerequisites

The approved mode reuses an existing unprivileged Linux account, its home,
signed-in Codex CLI/profile, running native Codex daemon, existing project and
working Beads tracker. It checks these without initializing a tracker, migrating
data, creating an account or managing a Codex/Dolt service. This is not a fresh
agent-environment bootstrap. The application checkout accepts the existing SSH
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
The playbook can install `acl`, `ca-certificates`, `coreutils`, `git`, `gzip` and
`tar`, plus RHEL's Node.js 22 common module profile when the selected Node does
not meet 22.12+. It does not reset a conflicting module stream. Set
`command_center_manage_packages: false` when prerequisites are managed separately.
These package operations run on the selected VM only.

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
| `command_center_project_dir` | Required existing project used by the native agent and Beads |
| `command_center_repository` | Required SSH or credential-free HTTPS application source URL |
| `command_center_revision` | Git revision to deploy; default `main`; pin a reviewed revision for reproducibility |
| `command_center_source_dir` | Default `<account-home>/.local/src/command-center-ng` |
| `command_center_install_dir` | Default `<account-home>/apps/command-center-ng` |
| `command_center_config_dir` | Default `<account-home>/.config/command-center-ng` |
| `command_center_codex_home` | Default `<account-home>/.codex`; existing signed-in profile |
| `command_center_path` | Existing account tool paths plus target-local tools and system executables |
| `command_center_bind_address` | Default `127.0.0.1` |
| `command_center_port` | Default `4242` |
| `command_center_public_origin` | Empty by default; set the approved HTTPS origin when using an existing proxy |
| `command_center_password` | Initial password, 12–4096 characters; required only when no private auth file exists |
| `command_center_force_install` | Default `false`; rebuild the selected revision explicitly |

All actual settings, inventory data and AAP configuration belong as whole-file
Ansible Vault ciphertext in private `command-center-ng-secrets`. Keep the Vault
password source outside both repositories and select it with the user. Existing
auth files are validated and preserved; supplying a different password does not
rotate an existing login. Initial password creation uses the maintained password
helper's stdin interface, with protected logging, never a password command-line
argument. Service environment files contain no password.

## Behavior and boundaries

The playbook canonicalizes paths, confines managed directories to the account's
home and refuses overlap with the existing Codex profile or project. A source
checkout must have the selected origin and a clean worktree. Updates fast-forward
only: local commits, divergent revisions and implicit downgrades fail without
discarding work. Existing source-parent permissions are preserved.

Installation calls the maintained `install.sh` as the application user.
An identical recorded source commit with an executable launcher skips rebuilding;
a changed commit, missing/broken launcher or explicit force rebuilds. This decision
has fixture coverage; full target idempotence still requires a VM rerun.

The system manager owns `/etc/systemd/system/command-center-ng.service`; its
`User=` runs Command Center unprivileged. A foreign or linked unit is refused.
The playbook refuses an occupied port on first deployment rather than stopping
an existing process. It writes protected runtime settings, restarts only Command
Center when its files change, enables startup and checks `/healthz` for the exact
deployed application version. It never restarts the native Codex daemon.

No proxy, TLS, firewall or public listener is configured automatically. The
default is loopback access; deployment does not establish a browser access route.
Use the already approved environment access mechanism before exposing the app.
Native authentication and Beads/Dolt setup remain independent prerequisites.

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
python3.12 -m unittest discover -s tests -p test_command_center_deployment.py -v
ANSIBLE_HOME=/tmp/ccng-lint-home ANSIBLE_LOCAL_TEMP=/tmp/ccng-lint-local \
  python3.12 -m ansiblelint --offline --profile production ansible/
```

The fixture suite invokes real Ansible only against disposable localhost files:
OS rejection before a sentinel change, inventory override precedence, canonical
path protection, rebuild decisions, real password hashing/preservation and
symlink rejection. It renders the actual systemd template, including spaced
paths, then parses it offline with `systemd-analyze verify`. It does not install
packages, alter accounts, start services, connect to a VM or call a model.
Use already available Python/Ansible/lint/systemd tools; ask before installing
missing dependencies. Whole-playbook `--check` is explicitly refused because the
stateful installer requires real output files.

Passing local checks does not prove a real RHEL 9 startup, an AAP execution
environment's dependencies, browser access or a successful live deployment.
Those require running the approved Job Template against the selected VM and
checking its final result, service identity, health and a preservation rerun.
Native-loader fixtures verify real Vault decryption, instance selection,
connection-override refusal and temporary-file cleanup. They do not establish
that the target account has signed in, that Git access works, or that the app
has started; those remain live acceptance checks.
