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
agent-environment bootstrap. The existing account needs SSH Git access and
trusted host keys for the selected source repository; no automatic trust
acceptance or authentication exception is used.

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

| Variable | Meaning/default |
| --- | --- |
| `command_center_user` | Required existing non-root application account |
| `command_center_project_dir` | Required existing project used by the native agent and Beads |
| `command_center_repository` | Required SSH URL of the application source |
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
and the existing-account application checkout use SSH, per workspace policy.
The project-specific private CaC capture follows the existing shared
`deploy-cac-project.yml` importer format; its intended canonical path is
`vaults/cac/command-center-ng-cac-vault.yml`. The shared importer currently needs
this project's catalog entry and actual credential bindings before that capture
can be imported. No second importer or wrapper is introduced here.

The application Job Template selects `ansible/deploy_command_center.yml`, the
approved target inventory and existing Machine/become access. Protected runtime
inputs must be supplied through the established AAP configuration process; merely
attaching a Vault credential does not load a file from another repository.
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
