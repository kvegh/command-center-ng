"""Run real Ansible only against disposable localhost fixtures, never deployment.

The production playbook is parsed but not applied. Password integration uses the real password helper from this checkout.
"""

import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import ssl
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
ANSIBLE = ROOT / "ansible"


class CommandCenterDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ccng-deployment-test-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.sequence = 0

    def run_tasks(self, tasks, variables=None, environment=None, success=True,
                  inventory=None, hosts="all"):
        self.sequence += 1
        fixture = self.work / f"fixture-{self.sequence}.yml"
        play = {
            "name": "Validate isolated Command Center fixtures",
            "hosts": hosts,
            "gather_facts": False,
            "become": False,
            "no_log": True,
            "vars": variables or {},
            "environment": environment or {},
            "tasks": tasks,
        }
        fixture.write_text(yaml.safe_dump([play], sort_keys=False))
        fixture.chmod(0o600)
        env = dict(os.environ)
        env.update({
            "ANSIBLE_HOME": str(self.work / "ansible-home"),
            "ANSIBLE_LOCAL_TEMP": str(self.work / "local-tmp"),
            "ANSIBLE_REMOTE_TEMP": str(self.work / "remote-tmp"),
            "ANSIBLE_NOCOLOR": "1",
        })
        result = subprocess.run(
            ["ansible-playbook", "-i", str(inventory or "localhost,"), "--connection", "local",
             "-e", f"ansible_python_interpreter={sys.executable}", str(fixture)],
            env=env, capture_output=True, text=True, timeout=90, check=False,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    @staticmethod
    def include(name):
        return {"name": "Run the real guarded task file",
                "ansible.builtin.import_tasks": str(ANSIBLE / "tasks" / name)}

    def test_rhel9_guard_precedes_every_target_change(self):
        play = yaml.safe_load((ANSIBLE / "deploy_command_center.yml").read_text())[0]
        self.assertIs(play["gather_facts"], False)
        self.assertEqual(play["pre_tasks"][0]["ansible.builtin.include_tasks"],
                         "tasks/command_center_ssh.yml")
        self.assertIn("ansible.builtin.setup", play["pre_tasks"][1])
        self.assertEqual(play["pre_tasks"][2]["ansible.builtin.import_tasks"],
                         "tasks/command_center_platform.yml")
        self.assertIs(play["no_log"], True)
        for distribution, major, supported in [
            ("RedHat", "9", True), ("RedHat", "8", False),
            ("Ubuntu", "24", False), ("Rocky", "9", False),
        ]:
            with self.subTest(distribution=distribution, major=major):
                sentinel = self.work / f"after-{distribution}-{major}"
                tasks = [self.include("command_center_platform.yml"), {
                    "name": "Write only a disposable success sentinel",
                    "ansible.builtin.copy": {"dest": str(sentinel), "content": "passed", "mode": "0600"},
                }]
                self.run_tasks(tasks, {"ansible_facts": {
                    "system": "Linux", "distribution": distribution,
                    "distribution_major_version": major, "service_mgr": "systemd",
                }}, success=supported)
                self.assertEqual(sentinel.exists(), supported)

    def test_native_delegated_ssh_pin_uses_original_host_and_preserves_other_entries(self):
        home = self.work / "fixture-home"
        ssh = home / ".ssh"
        ssh.mkdir(parents=True)
        key = self.work / "fixture-ssh-key"
        generated = subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)],
                                   capture_output=True, text=True, timeout=15, check=False)
        self.assertEqual(generated.returncode, 0, generated.stderr)
        public_key = " ".join(key.with_suffix(".pub").read_text().split()[:2])
        unrelated = "unrelated.example.invalid " + public_key
        (ssh / "known_hosts").write_text(unrelated + "\n")
        inventory = self.work / "ssh-inventory.yml"
        inventory.write_text(yaml.safe_dump({"all": {
            "hosts": {"localhost": {"ansible_connection": "local", "ansible_host": "127.0.0.1",
                                      "ansible_port": 22, "ansible_ssh_host_key_checking": False}},
            "children": {"command_center": {"hosts": {"selected-fixture": {
                "ansible_connection": "ssh", "ansible_host": "selected.example.invalid",
                "ansible_port": 2207, "ansible_ssh_host_key_checking": True,
                "command_center_ssh_known_hosts": ["[selected.example.invalid]:2207 " + public_key],
            }}}},
        }}))
        with patch.dict(os.environ, {"HOME": str(home)}):
            result = self.run_tasks([self.include("command_center_ssh.yml")],
                                    inventory=inventory, hosts="command_center")
        saved = (ssh / "known_hosts").read_text()
        self.assertIn(unrelated, saved)
        self.assertIn("[selected.example.invalid]:2207 " + public_key, saved)
        self.assertNotIn("127.0.0.1 " + public_key, saved)
        self.assertIn("selected-fixture -> localhost", result.stdout)

    def test_inventory_overrides_survive_default_resolution(self):
        tasks = [
            {"name": "Load internal defaults", "ansible.builtin.include_vars":
             str(ANSIBLE / "vars/command_center_defaults.yml")},
            self.include("command_center_defaults.yml"),
            {"name": "Verify supplied inputs were retained", "ansible.builtin.assert": {"that": [
                "command_center_port | int == 8181", "command_center_revision == 'selected-ref'",
                "not (command_center_manage_packages | bool)",
                "command_center_install_dir == ccng_user_home ~ '/custom-app'",
                "command_center_project_dir == ccng_user_home ~ '/ccng-wd'",
                "command_center_path.startswith(command_center_install_dir ~ '/tools/')",
                "(command_center_install_dir ~ '/tools/bin') in command_center_path.split(':')",
                "(command_center_install_dir ~ '/tools/node_modules/.bin') in command_center_path.split(':')",
            ]}},
        ]
        self.run_tasks(tasks, {"ccng_user_home": str(self.work),
                               "command_center_port": 8181,
                               "command_center_revision": "selected-ref",
                               "command_center_manage_packages": False,
                               "command_center_install_dir": str(self.work / "custom-app")})

    def test_fresh_deployment_uses_main_and_separate_default_app_and_workspace(self):
        self.run_tasks([
            {"name": "Load maintained defaults", "ansible.builtin.include_vars":
             str(ANSIBLE / "vars/command_center_defaults.yml")},
            self.include("command_center_defaults.yml"),
            {"name": "Verify the selected first-deployment defaults", "ansible.builtin.assert": {"that": [
                "command_center_revision == 'main'",
                "command_center_install_dir == ccng_user_home ~ '/commandcenter-ng'",
                "command_center_project_dir == ccng_user_home ~ '/ccng-wd'",
                "command_center_install_dir != command_center_project_dir",
                "command_center_first_password_setup == 'disabled'",
                "command_center_beads_config == {}",
                "command_center_beads_boot_start is sameas false",
            ]}},
        ], {"ccng_user_home": str(self.work)})

    def test_source_repository_accepts_existing_ssh_or_credential_free_https(self):
        play = yaml.safe_load((ANSIBLE / "deploy_command_center.yml").read_text())[0]
        tasks = [task for task in play["pre_tasks"] if task["name"] in (
            "Require the account and supported source repository inputs",
            "Require credential-free HTTPS source URLs when using public Git access",
        )]
        for repository, accepted in [
            ("git@code.example.invalid:team/command-center-ng.git", True),
            ("ssh://git@code.example.invalid/team/command-center-ng.git", True),
            ("https://code.example.invalid/team/command-center-ng.git", True),
            ("http://code.example.invalid/team/project.git", False),
            ("https://user:secret@code.example.invalid/team/project.git", False),
            ("https://code.example.invalid/team/project.git?token=secret", False),
            ("https://code.example.invalid/team/project.git#revision", False),
            ("https:///team/project.git", False),
        ]:
            with self.subTest(repository=repository):
                self.run_tasks(tasks, {"command_center_user": "fixture_operator",
                                      "command_center_project_dir": str(self.work),
                                      "command_center_repository": repository}, success=accepted)

    def workspace_fixture(self):
        home = self.work / "home"
        home.mkdir()
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        calls = self.work / "native-calls"
        bd = bin_dir / "bd"
        bd.write_text("""#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CCNG_FIXTURE_CALLS"
case "$*" in
  '--version') echo 'bd version 1.3.2' ;;
  '--readonly where --json')
    [ "${CCNG_FIXTURE_PARENT:-0}" = 1 ] || [ -f .beads/metadata.json ]
    printf '{"path":"%s","database_path":"%s/dolt","schema_version":1}\n' "${CCNG_FIXTURE_TRACKER_PATH:-$PWD/.beads}" "${CCNG_FIXTURE_TRACKER_PATH:-$PWD/.beads}" ;;
  'init --help') echo '--shared-server --non-interactive --skip-agents --skip-hooks' ;;
  'init --shared-server --non-interactive --skip-agents --skip-hooks')
    mkdir .beads .git
    printf 'native synthetic tracker' > .beads/metadata.json ;;
  '--sandbox --readonly list --json --brief --flat --limit 1')
    [ "${CCNG_FIXTURE_DB_STOPPED:-0}" = 0 ] || [ -f "$CCNG_FIXTURE_SYSTEMD_DIR/user-running" ]
    [ -f .beads/metadata.json ]; echo '[]' ;;
  '--sandbox config get status.custom --json')
    [ "${CCNG_FIXTURE_CONFIG_READ_FAIL:-0}" = 0 ] || exit 7
    if [ -n "${CCNG_FIXTURE_CONFIG_JSON:-}" ]; then
      printf '%s\\n' "$CCNG_FIXTURE_CONFIG_JSON"
    else
      printf '{"key":"status.custom","schema_version":1,"value":"'
      if [ -f .beads/custom-statuses ]; then cat .beads/custom-statuses; fi
      printf '"}\\n'
    fi ;;
  '--sandbox config set status.custom '*)
    [ "$#" = 5 ] && [ "${CCNG_FIXTURE_CONFIG_WRITE_FAIL:-0}" = 0 ] || exit 8
    printf '%s' "$5" > .beads/custom-statuses ;;
  '--sandbox config get '*)
    [ "${CCNG_FIXTURE_NATIVE_READ_FAIL:-}" != "$4" ] || exit 7
    if [ "${CCNG_FIXTURE_NATIVE_BAD_JSON:-}" = "$4" ]; then
      echo '{invalid'
    else
      printf '{"key":"%s","schema_version":1,"value":"' "$4"
      if [ -f ".beads/config-$4" ]; then cat ".beads/config-$4"; fi
      printf '"}\n'
    fi ;;
  '--sandbox config set '*)
    [ "$#" = 5 ] && [ "${CCNG_FIXTURE_NATIVE_WRITE_FAIL:-}" != "$4" ] || exit 8
    printf '%s' "$5" > ".beads/config-$4" ;;
  *) exit 98 ;;
esac
""")
        bd.chmod(0o755)
        dolt = bin_dir / "dolt"
        dolt.write_text("#!/bin/sh\n[ \"$*\" = version ] || exit 99\necho 'dolt version fixture'\n")
        dolt.chmod(0o755)
        variables = {"ccng_home": str(home), "ccng_project_dir": str(home / "ccng-wd"),
                     "ccng_user_uid": os.getuid()}
        environment = {"PATH": str(bin_dir) + ":/usr/bin:/bin",
                       "CCNG_FIXTURE_CALLS": str(calls)}
        return home, calls, variables, environment

    def test_fresh_workspace_initializes_once_and_preserves_tracker_on_update(self):
        home, calls, variables, environment = self.workspace_fixture()
        telemetry = home / ".beads"
        (telemetry / "eventsData").mkdir(parents=True)
        (telemetry / "machine-id").write_text("synthetic telemetry identity")
        tasks = [self.include("command_center_directory.yml"), self.include("command_center_workspace.yml")]
        self.run_tasks(tasks, variables, environment)
        workspace = home / "ccng-wd"
        metadata = workspace / ".beads/metadata.json"
        self.assertTrue((workspace / ".git").is_dir(),
                        "native Beads may create local Git metadata without checking out a source repository")
        before = metadata.read_bytes()
        self.assertEqual(metadata.stat().st_mode & 0o777, 0o600)
        self.assertEqual(workspace.stat().st_mode & 0o777, 0o700)
        workspace.chmod(0o750)
        self.run_tasks(tasks, variables, environment)
        self.assertEqual(metadata.read_bytes(), before)
        self.assertEqual(workspace.stat().st_mode & 0o777, 0o750)
        self.assertEqual((telemetry / "machine-id").read_text(), "synthetic telemetry identity")
        self.assertEqual(calls.read_text().splitlines().count(
            "init --shared-server --non-interactive --skip-agents --skip-hooks"), 1)
        self.assertEqual((workspace / ".beads/custom-statuses").read_text(), "on_hold")
        self.assertEqual(calls.read_text().splitlines().count(
            "--sandbox config set status.custom on_hold"), 1)

    def test_existing_custom_statuses_are_merged_once_without_changing_tracker_data(self):
        for index, (existing, expected) in enumerate([
            ("", "on_hold"), ("review,waiting", "review,waiting,on_hold"),
            ("review, on_hold", "review, on_hold"), ("on_hold,review", "on_hold,review"),
        ]):
            with self.subTest(existing=existing):
                previous = self.work
                self.work = previous / f"status-{index}"
                self.work.mkdir()
                try:
                    home, calls, variables, environment = self.workspace_fixture()
                    tracker = home / "ccng-wd/.beads"
                    tracker.mkdir(parents=True)
                    original = {"metadata.json": "synthetic native metadata", "config.yaml": "synthetic existing routing",
                                "issues.fixture": "synthetic task data", "server.fixture": "synthetic native Dolt ownership"}
                    for name, content in original.items():
                        (tracker / name).write_text(content)
                    (tracker / "custom-statuses").write_text(existing)
                    tasks = [self.include("command_center_workspace.yml")]
                    self.run_tasks(tasks, variables, environment)
                    repeated = self.run_tasks(tasks, variables, environment)
                    self.assertEqual((tracker / "custom-statuses").read_text(), expected)
                    self.assertRegex(repeated.stdout, r"changed=0\b")
                    for name, content in original.items():
                        self.assertEqual((tracker / name).read_text(), content)
                    writes = [line for line in calls.read_text().splitlines()
                              if line.startswith("--sandbox config set status.custom ")]
                    self.assertEqual(len(writes), int(existing != expected))
                    self.assertNotIn("init --shared-server", calls.read_text())
                finally:
                    self.work = previous

    def test_custom_status_failures_preserve_existing_settings_and_tasks(self):
        failures = [
            {"CCNG_FIXTURE_CONFIG_READ_FAIL": "1"},
            {"CCNG_FIXTURE_CONFIG_JSON": "not json"},
            {"CCNG_FIXTURE_CONFIG_JSON": json.dumps({"key": "other", "schema_version": 1, "value": "review"})},
            {"CCNG_FIXTURE_CONFIG_JSON": json.dumps({"key": "status.custom", "schema_version": 2, "value": "review"})},
            {"CCNG_FIXTURE_CONFIG_JSON": json.dumps({"key": "status.custom", "schema_version": 1, "value": None})},
            {"CCNG_FIXTURE_CONFIG_WRITE_FAIL": "1"},
        ]
        for index, failure in enumerate(failures):
            with self.subTest(failure=failure):
                previous = self.work
                self.work = previous / f"config-failure-{index}"
                self.work.mkdir()
                try:
                    home, calls, variables, environment = self.workspace_fixture()
                    tracker = home / "ccng-wd/.beads"
                    tracker.mkdir(parents=True)
                    originals = {"metadata.json": "synthetic native metadata", "custom-statuses": "review",
                                 "issues.fixture": "preserve existing tasks", "config.yaml": "preserve routing"}
                    for name, content in originals.items():
                        (tracker / name).write_text(content)
                    environment.update(failure)
                    self.run_tasks([self.include("command_center_workspace.yml")], variables, environment, success=False)
                    for name, content in originals.items():
                        self.assertEqual((tracker / name).read_text(), content)
                    if "CCNG_FIXTURE_CONFIG_WRITE_FAIL" not in failure:
                        self.assertNotIn("--sandbox config set", calls.read_text())
                finally:
                    self.work = previous

    def test_selected_native_beads_settings_apply_once_and_preserve_unrelated_state(self):
        home, calls, variables, environment = self.workspace_fixture()
        tracker = home / "ccng-wd/.beads"
        tracker.mkdir(parents=True)
        originals = {"metadata.json": "synthetic identity", "config.yaml": "preserve shared routing",
                     "issues.fixture": "preserve tasks", "config-unrelated": "preserve unrelated setting"}
        for name, content in originals.items():
            (tracker / name).write_text(content)
        (tracker / "custom-statuses").write_text("review")
        settings = {"auto_compact_enabled": "false", "compaction_enabled": "false",
                    "compact_batch_size": "50", "compact_parallel_workers": "2",
                    "compact_tier1_days": "30", "compact_tier1_dep_levels": "2",
                    "compact_tier2_commits": "100", "compact_tier2_days": "90",
                    "compact_tier2_dep_levels": "1"}
        variables["command_center_beads_config"] = settings
        self.run_tasks([self.include("command_center_workspace.yml")], variables, environment)
        repeated = self.run_tasks([self.include("command_center_workspace.yml")], variables, environment)
        self.assertRegex(repeated.stdout, r"changed=0\b")
        for key, value in settings.items():
            self.assertEqual((tracker / ("config-" + key)).read_text(), value)
            self.assertEqual(calls.read_text().splitlines().count(f"--sandbox config set {key} {value}"), 1)
        for name, content in originals.items():
            self.assertEqual((tracker / name).read_text(), content)
        self.assertEqual((tracker / "custom-statuses").read_text(), "review,on_hold")

    def test_native_beads_input_validation_precedes_tracker_writes(self):
        for index, invalid in enumerate([
            {"command_center_beads_config": {"server.port": "9999"}},
            {"command_center_beads_config": {"compaction_enabled": False}},
            {"command_center_beads_config": []},
            {"command_center_beads_boot_start": "true"},
        ]):
            with self.subTest(invalid=invalid):
                sentinel = self.work / f"beads-validation-{index}"
                self.run_tasks([self.include("command_center_beads_validation.yml"), {
                    "name": "Mark only accepted input", "ansible.builtin.copy": {
                        "dest": str(sentinel), "content": "accepted", "mode": "0600"},
                }], invalid, success=False)
                self.assertFalse(sentinel.exists())

    def test_native_beads_read_failure_or_invalid_response_preserves_all_settings(self):
        home, calls, variables, environment = self.workspace_fixture()
        tracker = home / "ccng-wd/.beads"
        tracker.mkdir(parents=True)
        originals = {"metadata.json": "synthetic identity", "custom-statuses": "review",
                     "config-auto_compact_enabled": "false", "config-compaction_enabled": "false"}
        for name, content in originals.items():
            (tracker / name).write_text(content)
        variables["command_center_beads_config"] = {"auto_compact_enabled": "true", "compaction_enabled": "false"}
        for failure in ["CCNG_FIXTURE_NATIVE_READ_FAIL", "CCNG_FIXTURE_NATIVE_BAD_JSON", "CCNG_FIXTURE_NATIVE_WRITE_FAIL"]:
            with self.subTest(failure=failure):
                selected_key = "auto_compact_enabled" if failure.endswith("WRITE_FAIL") else "compaction_enabled"
                self.run_tasks([self.include("command_center_workspace.yml")], variables,
                               {**environment, failure: selected_key}, success=False)
                for name, content in originals.items():
                    self.assertEqual((tracker / name).read_text(), content)
                if not failure.endswith("WRITE_FAIL"):
                    self.assertNotIn("--sandbox config set", calls.read_text())

    def beads_boot_fixture(self):
        home = self.work / "owner-home"
        home.mkdir()
        (home / "workspace/.beads").mkdir(parents=True)
        (home / "workspace/.beads/metadata.json").write_text("preserve native identity and routing")
        binaries = self.work / "boot-bin"
        binaries.mkdir()
        state = self.work / "manager-state"
        state.mkdir()
        systemctl = binaries / "systemctl"
        systemctl.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CCNG_FIXTURE_SYSTEMD_DIR/calls"
scope=system
if [ "${1:-}" = --user ]; then scope=user; shift; fi
case "$1" in
  daemon-reload) exit 0 ;;
  show)
    printf 'LoadState=loaded\\n'
    if [ -f "$CCNG_FIXTURE_SYSTEMD_DIR/$scope-running" ]; then
      printf 'ActiveState=active\\n'
    else printf 'ActiveState=inactive\\n'; fi ;;
  is-enabled)
    if [ -f "$CCNG_FIXTURE_SYSTEMD_DIR/enabled" ]; then echo enabled
    else echo disabled; exit 1; fi ;;
  enable) touch "$CCNG_FIXTURE_SYSTEMD_DIR/enabled" ;;
  start) touch "$CCNG_FIXTURE_SYSTEMD_DIR/$scope-running" ;;
  *) exit 97 ;;
esac
''')
        systemctl.chmod(0o755)
        loginctl = binaries / "loginctl"
        loginctl.write_text('''#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CCNG_FIXTURE_SYSTEMD_DIR/calls"
case "$1" in
  show-user)
    if [ "${CCNG_FIXTURE_LOGIN_STATE:-}" = denied ]; then
      echo 'Access denied to system bus' >&2; exit 1
    elif [ "${CCNG_FIXTURE_LOGIN_STATE:-}" = fresh ] && [ ! -f "$CCNG_FIXTURE_SYSTEMD_DIR/linger" ]; then
      echo 'Failed to get user: User 9999 is not logged in or lingering' >&2; exit 1
    elif [ -f "$CCNG_FIXTURE_SYSTEMD_DIR/linger" ]; then echo yes; else echo no; fi ;;
  enable-linger) [ "${CCNG_FIXTURE_LINGER_FAIL:-0}" = 0 ] || exit 8
    touch "$CCNG_FIXTURE_SYSTEMD_DIR/linger" ;;
  *) exit 98 ;;
esac
''')
        loginctl.chmod(0o755)
        variables = {"ccng_home": str(home), "ccng_project_dir": str(home / "workspace"),
                     "ccng_user_uid": os.getuid(), "command_center_user": pwd.getpwuid(os.getuid()).pw_name,
                     "command_center_path": str(binaries) + ":/usr/bin:/bin",
                     "command_center_beads_boot_start": True,
                     "ccng_tracker": {"rc": 0, "stdout": json.dumps({
                         "path": str(home / "workspace/.beads"),
                         "database_path": str(home / "workspace/.beads/dolt"), "schema_version": 1})}}
        environment = {"PATH": variables["command_center_path"], "CCNG_FIXTURE_SYSTEMD_DIR": str(state)}
        return home, state, variables, environment

    def beads_boot_tasks(self, environment):
        # Exercise the production task bodies, replacing privileged executables
        # only in this disposable test copy; never contact the host's managers.
        tasks = yaml.safe_load((ANSIBLE / "tasks/command_center_beads_boot.yml").read_text())
        binaries = Path(environment["PATH"].split(":")[0])
        for task in tasks:
            if task.get("become_user") == "root":
                self.assertIs(task["become"], True)
                task["become"] = False
                self.assertEqual(task["environment"]["PATH"], "/usr/sbin:/usr/bin:/sbin:/bin")
                task["environment"]["PATH"] = environment["PATH"]
                if "ansible.builtin.command" in task:
                    self.assertEqual(task["ansible.builtin.command"]["argv"][0], "/usr/bin/loginctl")
                    task["ansible.builtin.command"]["argv"][0] = str(binaries / "loginctl")
            if "ansible.builtin.template" in task:
                task["ansible.builtin.template"]["src"] = str(ANSIBLE / "templates/beads-dolt.service.j2")
        return tasks

    def beads_workspace_boot_tasks(self, environment):
        tasks = yaml.safe_load((ANSIBLE / "tasks/command_center_workspace.yml").read_text())
        for task in tasks:
            imported = task.pop("ansible.builtin.import_tasks", None)
            if imported == "command_center_beads_boot.yml":
                task["block"] = self.beads_boot_tasks(environment)
            elif imported:
                task["ansible.builtin.import_tasks"] = str(ANSIBLE / "tasks" / imported)
        return tasks

    def test_beads_owner_boot_unit_is_opt_in_native_idempotent_and_preserves_tracker(self):
        home, state, variables, environment = self.beads_boot_fixture()
        selected = {"name": "Run the isolated native boot tasks", "block": self.beads_boot_tasks(environment),
                    "when": "command_center_beads_boot_start | default(false)"}
        self.run_tasks([selected], {**variables, "command_center_beads_boot_start": False}, environment)
        self.assertFalse((home / ".config").exists())
        self.assertFalse((state / "calls").exists())
        self.run_tasks([selected], variables, environment)
        unit = home / ".config/systemd/user/beads-dolt.service"
        source = unit.read_text()
        self.assertIn("Type=oneshot\nRemainAfterExit=yes", source)
        self.assertIn("ExecStart=/usr/bin/env bd dolt start", source)
        self.assertIn("ExecStop=/usr/bin/env bd dolt stop", source)
        self.assertIn(f'Environment="BEADS_DIR={home}/workspace/.beads"', source)
        self.assertIn("Environment=BEADS_DOLT_SHARED_SERVER=1", source)
        self.assertEqual(unit.stat().st_mode & 0o777, 0o600)
        repeated = self.run_tasks([selected], variables, environment)
        self.assertRegex(repeated.stdout, r"changed=0\b")
        calls = (state / "calls").read_text().splitlines()
        self.assertEqual(sum(line.startswith("enable-linger ") for line in calls), 1)
        self.assertEqual(calls.count("--user start beads-dolt.service"), 1)
        self.assertEqual(calls.count("--user enable beads-dolt.service"), 1)
        self.assertEqual((home / "workspace/.beads/metadata.json").read_text(), "preserve native identity and routing")

    def test_beads_boot_preserves_foreign_unit_and_does_not_enable_linger(self):
        home, state, variables, environment = self.beads_boot_fixture()
        unit = home / ".config/systemd/user/beads-dolt.service"
        unit.parent.mkdir(parents=True)
        original = "[Service]\nType=simple\nExecStart=/usr/bin/false\n"
        unit.write_text(original)
        self.run_tasks(self.beads_boot_tasks(environment), variables, environment, success=False)
        self.assertEqual(unit.read_text(), original)
        self.assertFalse((state / "calls").exists())

    def test_beads_boot_adopts_only_the_exact_previously_approved_native_unit(self):
        home, state, variables, environment = self.beads_boot_fixture()
        unit = home / ".config/systemd/user/beads-dolt.service"
        unit.parent.mkdir(parents=True)
        original = f'''[Unit]
Description=Existing Beads shared Dolt server
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory={home}/workspace
Environment=BEADS_DIR={home}/workspace/.beads
Environment=BEADS_DOLT_SHARED_SERVER=1
Environment=PATH={home}/.local/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin
ExecStart={home}/.local/bin/bd dolt start
ExecStop={home}/.local/bin/bd dolt stop
TimeoutStartSec=60
TimeoutStopSec=60

[Install]
WantedBy=default.target
'''
        unit.write_text(original.replace("bd dolt start", "bd dolt start --port 9999"))
        self.run_tasks(self.beads_boot_tasks(environment), variables, environment, success=False)
        self.assertIn("--port 9999", unit.read_text())
        self.assertFalse((state / "calls").exists())
        unit.write_text(original)
        self.run_tasks(self.beads_boot_tasks(environment), variables, environment)
        self.assertTrue(unit.read_text().startswith("# Managed by Command Center Ansible deployment\n"))

    def test_beads_boot_native_linger_failure_never_starts_a_service(self):
        home, state, variables, environment = self.beads_boot_fixture()
        environment["CCNG_FIXTURE_LINGER_FAIL"] = "1"
        self.run_tasks(self.beads_boot_tasks(environment), variables, environment, success=False)
        calls = (state / "calls").read_text()
        self.assertNotIn("start ", calls)
        self.assertFalse((state / "linger").exists())
        self.assertEqual((home / "workspace/.beads/metadata.json").read_text(), "preserve native identity and routing")

    def test_beads_boot_accepts_a_fresh_manager_and_refuses_unknown_native_errors(self):
        home, state, variables, environment = self.beads_boot_fixture()
        self.run_tasks(self.beads_boot_tasks(environment), variables,
                       {**environment, "CCNG_FIXTURE_LOGIN_STATE": "denied"}, success=False)
        self.assertFalse((home / ".config").exists())
        self.assertNotIn("enable-linger", (state / "calls").read_text())
        self.run_tasks(self.beads_boot_tasks(environment), variables,
                       {**environment, "CCNG_FIXTURE_LOGIN_STATE": "fresh"})
        self.assertTrue((state / "linger").exists())
        self.assertTrue((state / "user-running").exists())

    def test_beads_boot_refuses_parent_links_before_reading_the_unit(self):
        home, state, variables, environment = self.beads_boot_fixture()
        foreign = self.work / "foreign-config"
        (foreign / "systemd/user").mkdir(parents=True)
        unit = foreign / "systemd/user/beads-dolt.service"
        unit.write_text("synthetic foreign unit must not be read")
        (home / ".config").symlink_to(foreign, target_is_directory=True)
        result = self.run_tasks(self.beads_boot_tasks(environment), variables, environment, success=False)
        self.assertNotIn("TASK [Read an existing owner unit", result.stdout)
        self.assertEqual(unit.read_text(), "synthetic foreign unit must not be read")
        self.assertFalse((state / "calls").exists())

    def test_beads_boot_uses_verified_native_parent_tracker_without_moving_it(self):
        home, state, variables, environment = self.beads_boot_fixture()
        tracker = home / "shared/.beads"
        tracker.mkdir(parents=True)
        (tracker / "metadata.json").write_text("preserve parent tracker")
        variables["ccng_tracker"]["stdout"] = json.dumps({"path": str(tracker), "database_path": str(tracker / "dolt"), "schema_version": 1})
        variables["command_center_path"] += ":/opt/native%p/bin"
        self.run_tasks(self.beads_boot_tasks(environment), variables, environment)
        source = (home / ".config/systemd/user/beads-dolt.service").read_text()
        self.assertIn(f'Environment="BEADS_DIR={tracker}"', source)
        self.assertIn(f'WorkingDirectory="{home}/workspace"', source)
        self.assertIn("/opt/native%%p/bin", source, "literal PATH percent must not become a systemd specifier")
        self.assertEqual((tracker / "metadata.json").read_text(), "preserve parent tracker")

    def test_boot_starts_stopped_existing_tracker_before_database_reads_without_reinitializing(self):
        home, state, variables, environment = self.beads_boot_fixture()
        native_home, calls, native_variables, native_environment = self.workspace_fixture()
        shutil.copy2(self.work / "bin/bd", self.work / "boot-bin/bd")
        environment.update({"CCNG_FIXTURE_CALLS": str(calls), "CCNG_FIXTURE_DB_STOPPED": "1"})
        tasks = self.beads_workspace_boot_tasks(environment)
        self.run_tasks(tasks, variables, environment)
        self.run_tasks(tasks, variables, environment)
        native_calls = calls.read_text().splitlines()
        self.assertNotIn("init --shared-server", calls.read_text())
        self.assertEqual(native_calls.count("--readonly where --json"), 2, "reuse each discovery response without duplicate native lookup")
        self.assertEqual((state / "calls").read_text().splitlines().count("--user start beads-dolt.service"), 1)

    def test_fresh_boot_workspace_rereads_native_location_once_and_preserves_repeat_state(self):
        home, state, variables, environment = self.beads_boot_fixture()
        self.workspace_fixture()
        shutil.copy2(self.work / "bin/bd", self.work / "boot-bin/bd")
        shutil.copy2(self.work / "bin/dolt", self.work / "boot-bin/dolt")
        project = home / "ccng-wd"
        (home / "workspace").rename(project)
        shutil.rmtree(project / ".beads")
        variables["ccng_project_dir"] = str(project)
        calls = self.work / "fresh-native-calls"
        environment["CCNG_FIXTURE_CALLS"] = str(calls)
        tasks = self.beads_workspace_boot_tasks(environment)
        self.run_tasks(tasks, variables, environment)
        self.run_tasks(tasks, variables, environment)
        native_calls = calls.read_text().splitlines()
        self.assertEqual(native_calls.count("init --shared-server --non-interactive --skip-agents --skip-hooks"), 1)
        self.assertEqual(native_calls.count("--readonly where --json"), 3)
        source = (home / ".config/systemd/user/beads-dolt.service").read_text()
        self.assertIn(f'Environment="BEADS_DIR={project}/.beads"', source)
        self.assertEqual((state / "calls").read_text().splitlines().count("--user start beads-dolt.service"), 1)

    def test_partial_or_ambient_tracker_configuration_is_preserved(self):
        for conflict in ["partial", "home-routing", "user-config", "parent-resolved"]:
            with self.subTest(conflict=conflict):
                case = self.work / conflict
                case.mkdir()
                previous = self.work
                self.work = case
                try:
                    home, calls, variables, environment = self.workspace_fixture()
                    workspace = home / "ccng-wd"
                    workspace.mkdir()
                    if conflict == "partial":
                        protected = workspace / ".beads/redirect"
                    elif conflict in ["home-routing", "parent-resolved"]:
                        protected = home / ".beads/config.yaml"
                    else:
                        protected = home / ".config/beads/config.yaml"
                    protected.parent.mkdir(parents=True)
                    protected.write_text("synthetic existing routing")
                    if conflict == "parent-resolved":
                        environment["CCNG_FIXTURE_PARENT"] = "1"
                    self.run_tasks([self.include("command_center_workspace.yml")],
                                   variables, environment, success=False)
                    self.assertEqual(protected.read_text(), "synthetic existing routing")
                    self.assertNotIn("init --shared-server", calls.read_text())
                finally:
                    self.work = previous

    def test_tool_pins_match_the_maintained_interactive_installer(self):
        tools = yaml.safe_load((ANSIBLE / "tasks/command_center_tools.yml").read_text())
        install = tools[1]["block"]
        package = install[2]["ansible.builtin.command"]["argv"][-1]
        self.assertIn(package, (ROOT / "installer/prerequisites.sh").read_text())
        dolt = install[3]
        source = (ROOT / "installer/beads.sh").read_text()
        for archive in dolt["vars"]["ccng_dolt_archives"].values():
            self.assertRegex(source, "CCNG_DOLT_ARCH=" + archive["arch"] +
                             "; CCNG_DOLT_SHA=" + archive["sha256"])
        download = dolt["block"][2]["ansible.builtin.get_url"]
        self.assertIn("/v2.2.0/", download["url"])
        self.assertIn("/v2.2.0/", source)
        self.assertIs(download["validate_certs"], True)

    def test_existing_native_tools_are_reused_without_bootstrap_or_package_management(self):
        _, calls, variables, environment = self.workspace_fixture()
        variables["command_center_manage_packages"] = False
        self.run_tasks([
            self.include("command_center_tools.yml"),
            {"name": "Confirm no tool bootstrap was allocated", "ansible.builtin.assert": {
                "that": ["ccng_tool_bootstrap.path is not defined"]}},
        ], variables, environment)
        self.assertFalse(calls.exists(), "existing commands must not be invoked or changed during lookup")

    def test_missing_tools_bootstrap_persist_and_initialize_without_network_or_operator_installs(self):
        home, calls, variables, environment = self.workspace_fixture()
        bin_dir = Path(environment["PATH"].split(":")[0])
        bd_template = self.work / "bd-template"
        (bin_dir / "bd").rename(bd_template)
        dolt_template = self.work / "dolt-template"
        (bin_dir / "dolt").rename(dolt_template)
        npm = bin_dir / "npm"
        npm.write_text("#!/bin/sh\nset -eu\n[ \"$1 $2\" = 'install --prefix' ]\n"
                       "mkdir -p \"$3/node_modules/.bin\"\n"
                       "cp \"$CCNG_FIXTURE_BD\" \"$3/node_modules/.bin/bd\"\n")
        npm.chmod(0o755)
        archive = self.work / "dolt.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            output.add(dolt_template, arcname="dolt-linux-amd64/bin/dolt")
        tools = yaml.safe_load((ANSIBLE / "tasks/command_center_tools.yml").read_text())
        download = tools[1]["block"][3]["block"][2]["ansible.builtin.get_url"]
        # Exercise real native download/checksum/extraction with a synthetic
        # local archive. The separate pin test checks production HTTPS settings.
        download["url"] = archive.as_uri()
        download["checksum"] = "sha256:" + hashlib.sha256(archive.read_bytes()).hexdigest()
        app = home / "app"
        app.mkdir()
        variables.update({"ccng_install_dir": str(app), "command_center_manage_packages": True})
        environment.update({"CCNG_FIXTURE_BD": str(bd_template),
                            "PATH": f"{app}/tools/bin:{app}/tools/node_modules/.bin:" + environment["PATH"]})
        play = yaml.safe_load((ANSIBLE / "deploy_command_center.yml").read_text())[0]
        app_tasks = next(task["block"] for task in play["tasks"]
                         if task["name"] == "Install and configure the application as its existing user")
        bootstrap = next(task for task in app_tasks if task["name"] ==
                         "Bootstrap missing task tools and install through the maintained installer")
        retained = [task for task in bootstrap["block"] if task["name"] in [
            "Inspect the final managed tools directory before copying prerequisites",
            "Preserve an unrelated final tools directory",
            "Retain newly provisioned native tools in the maintained installation"]]
        for task in retained:
            task.pop("notify", None)
        self.run_tasks([
            self.include("command_center_directory.yml"),
            {"name": "Exercise native bootstrap and final placement with fixture programs",
             "block": tools + retained + [self.include("command_center_workspace.yml")],
             "always": bootstrap["always"]},
            {"name": "Inspect bootstrap cleanup", "ansible.builtin.stat": {
                "path": "{{ ccng_tool_bootstrap.path }}"}, "register": "cleanup"},
            {"name": "Require temporary download cleanup", "ansible.builtin.assert": {
                "that": ["not cleanup.stat.exists"]}},
        ], variables, environment)
        self.assertEqual((app / "tools/bin/dolt").stat().st_mode & 0o777, 0o755)
        self.assertTrue((app / "tools/node_modules/.bin/bd").is_file())
        self.assertTrue((home / "ccng-wd/.beads/metadata.json").is_file())
        self.assertEqual(calls.read_text().splitlines().count(
            "init --shared-server --non-interactive --skip-agents --skip-hooks"), 1)

    def runtime_ciphertext(self, instances):
        password = self.work / "runtime-vault-password"
        password.write_text("synthetic-runtime-vault-password\n")
        password.chmod(0o600)
        payload = self.work / "runtime.yml"
        payload.write_text(yaml.safe_dump({"instances": instances}))
        payload.chmod(0o600)
        result = subprocess.run(
            ["ansible-vault", "encrypt", "--vault-password-file", str(password), str(payload)],
            env={**os.environ, "ANSIBLE_LOCAL_TEMP": str(self.work / "vault-tmp")},
            capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return payload.read_text(), password

    def test_native_runtime_loader_selects_one_instance_and_removes_ciphertext(self):
        ciphertext, password = self.runtime_ciphertext({
            "selected-fixture": {"command_center_user": "fixture_operator",
                                 "command_center_first_password_setup": "htpasswd-proxy",
                                 "command_center_port": 8181,
                                 "command_center_beads_config": {"auto_compact_enabled": "false", "compaction_enabled": "false"},
                                 "command_center_beads_boot_start": True,
                                 "command_center_password": "synthetic-runtime-canary"},
            "other-fixture": {"command_center_user": "must_not_select", "command_center_port": 9999},
        })
        with patch.dict(os.environ, {"ANSIBLE_VAULT_PASSWORD_FILE": str(password)}):
            result = self.run_tasks([
                self.include("command_center_runtime.yml"),
                {"name": "Check selected inputs", "ansible.builtin.assert": {"that": [
                    "command_center_user == 'fixture_operator'", "command_center_port | int == 8181",
                    "command_center_password == 'synthetic-runtime-canary'",
                    "command_center_first_password_setup == 'htpasswd-proxy'",
                    "command_center_beads_config == {'auto_compact_enabled': 'false', 'compaction_enabled': 'false'}",
                    "command_center_beads_boot_start is sameas true",
                ]}},
                {"name": "Inspect temporary ciphertext cleanup", "ansible.builtin.stat": {
                    "path": "{{ ccng_runtime_temporary_file.path }}"}, "register": "runtime_cleanup"},
                {"name": "Require cleanup", "ansible.builtin.assert": {
                    "that": ["not runtime_cleanup.stat.exists"]}},
            ], {"command_center_runtime_settings_vault": ciphertext,
                "command_center_runtime_expected_instance": "selected-fixture"})
        self.assertNotIn("synthetic-runtime-canary", result.stdout + result.stderr)

    def test_native_runtime_loader_refuses_wrong_instance_and_connection_overrides(self):
        for values, selected in [
            ({"selected-fixture": {"command_center_user": "fixture_operator"}}, "wrong-fixture"),
            ({"selected-fixture": {"ansible_host": "other.example.invalid"}}, "selected-fixture"),
        ]:
            with self.subTest(selected=selected, values=values):
                ciphertext, password = self.runtime_ciphertext(values)
                with patch.dict(os.environ, {"ANSIBLE_VAULT_PASSWORD_FILE": str(password)}):
                    self.run_tasks([
                        {"name": "Exercise the protected runtime refusal",
                         "block": [self.include("command_center_runtime.yml")],
                         "rescue": [{"name": "Remember the expected refusal", "ansible.builtin.set_fact": {
                             "runtime_refused": True}}]},
                        {"name": "Require refusal", "ansible.builtin.assert": {"that": ["runtime_refused | default(false)"]}},
                        {"name": "Inspect refused payload cleanup", "ansible.builtin.stat": {
                            "path": "{{ ccng_runtime_temporary_file.path }}"}, "register": "runtime_cleanup"},
                        {"name": "Require cleanup after refusal", "ansible.builtin.assert": {
                            "that": ["not runtime_cleanup.stat.exists"]}},
                    ], {"command_center_runtime_settings_vault": ciphertext,
                        "command_center_runtime_expected_instance": selected})

    def test_path_guards_protect_profile_and_refuse_overlaps(self):
        valid = {"ccng_home": str(self.work),
                 "ccng_source_dir": str(self.work / "source"),
                 "ccng_install_dir": str(self.work / "app"),
                 "ccng_config_dir": str(self.work / "config"),
                 "ccng_codex_home": str(self.work / "codex"),
                 "ccng_project_dir": str(self.work / "project")}
        for changes, accepted in [
            ({}, True), ({"ccng_install_dir": "/outside-the-home/app"}, False),
            ({"ccng_config_dir": valid["ccng_codex_home"]}, False),
            ({"ccng_install_dir": valid["ccng_source_dir"] + "/app"}, False),
        ]:
            with self.subTest(changes=changes):
                self.run_tasks([self.include("command_center_paths.yml")],
                               {**valid, **changes}, success=accepted)

    def test_repeated_revision_skips_install_but_changed_or_broken_install_rebuilds(self):
        same = base64.b64encode(b"selected-revision\n").decode()
        for marker, launcher, force, expected in [
            (same, {"isreg": True, "executable": True}, False, False),
            (base64.b64encode(b"older-revision").decode(), {"isreg": True, "executable": True}, False, True),
            (same, {}, False, True),
            (same, {"isreg": True, "executable": True}, True, True),
        ]:
            with self.subTest(expected=expected, force=force, launcher=launcher):
                self.run_tasks([
                    self.include("command_center_install_needed.yml"),
                    {"name": "Verify the rerun decision", "ansible.builtin.assert":
                     {"that": [f"ccng_install_needed | bool == {expected}"]}},
                ], {"ccng_source_revision": {"stdout": "selected-revision"},
                    "ccng_install_marker": {"content": marker},
                    "ccng_launcher": {"stat": launcher}, "command_center_force_install": force})

    def test_rendered_systemd_unit_validates_offline_and_has_no_daemon_lifecycle(self):
        app = self.work / "installed app"
        project = self.work / "project with spaces"
        config = self.work / "private config"
        for path in [app, project, config]:
            path.mkdir()
        launcher = app / "command-center-ng"
        launcher.write_text("#!/bin/sh\nexit 0\n")
        launcher.chmod(0o755)
        unit = self.work / "command-center-ng.service"
        canary = secrets.token_urlsafe(24)
        variables = {"ccng_deployment_version": json.loads((ROOT / "package.json").read_text())["version"],
                     "command_center_user": pwd.getpwuid(os.getuid()).pw_name,
                     "ccng_project_dir": str(project), "ccng_install_dir": str(app),
                     "ccng_config_dir": str(config), "ccng_codex_home": str(self.work / "existing-codex"),
                     "command_center_path": os.environ["PATH"], "command_center_bind_address": "127.0.0.1",
                     "command_center_port": 4242, "command_center_public_origin": "",
                     "command_center_password": canary}
        tasks = []
        for src, dest in [("command-center-ng.service.j2", unit),
                          ("command-center-ng.env.j2", config / "service.env")]:
            tasks.append({"name": "Render a real template into the disposable fixture",
                          "ansible.builtin.template": {"src": str(ANSIBLE / "templates" / src),
                                                       "dest": str(dest), "mode": "0600"}})
        result = self.run_tasks(tasks, variables)
        self.assertNotIn(canary, result.stdout + result.stderr)
        text = unit.read_text()
        self.assertIn("User=" + variables["command_center_user"], text)
        self.assertNotIn("ExecStartPre", text)
        self.assertNotIn("codex app-server", text)
        self.assertNotIn(canary, (config / "service.env").read_text())
        service_env = {
            name: json.loads(value)
            for line in (config / "service.env").read_text().splitlines()
            if line and not line.startswith("#")
            for name, value in [line.split("=", 1)]
        }
        runtime = subprocess.run(
            ["node", "--input-type=module", "-e",
             "const {runtimeOptions}=await import(process.argv[2]);"
             "console.log(JSON.stringify(runtimeOptions([],JSON.parse(process.argv[3]))));",
             "ccng-template-fixture", str(ROOT / "server/main.mjs"), json.dumps(service_env)],
            capture_output=True, text=True, check=False, timeout=15,
        )
        self.assertEqual(runtime.returncode, 0, runtime.stderr)
        self.assertEqual(json.loads(runtime.stdout)["protocol"], "http")
        verify = subprocess.run(["systemd-analyze", "verify", "--man=no", str(unit)],
                                capture_output=True, text=True, check=False, timeout=30)
        self.assertEqual(verify.returncode, 0, verify.stdout + verify.stderr)

    def app_source(self):
        path = ROOT
        self.assertTrue((path / "server/password.mjs").is_file())
        return path

    def test_password_created_once_is_private_and_never_echoed_or_rotated(self):
        app = self.app_source()
        config = self.work / "config"
        config.mkdir(mode=0o700)
        password = secrets.token_urlsafe(24)
        variables = {"ccng_install_dir": str(app), "ccng_config_dir": str(config),
                     "ccng_user_uid": os.getuid(), "command_center_password": password}
        environment = {"CCNG_CONFIG_DIR": str(config)}
        first = self.run_tasks([self.include("command_center_password.yml")], variables, environment)
        auth = config / "auth.json"
        original = auth.read_bytes()
        self.assertEqual(auth.stat().st_mode & 0o777, 0o600)
        data = json.loads(original)
        self.assertEqual(data["version"], 1)
        self.assertNotIn(password, first.stdout + first.stderr)
        self.assertNotIn(password, original.decode())
        # An existing password must survive even a different/short supplied value.
        variables["command_center_password"] = "short"
        variables["command_center_first_password_setup"] = "htpasswd-proxy"
        self.run_tasks([self.include("command_center_password.yml")], variables, environment)
        self.assertEqual(auth.read_bytes(), original)

    def test_fresh_proxy_setup_needs_no_supplied_password_and_creates_no_auth_file(self):
        config = self.work / "config"
        config.mkdir(mode=0o700)
        rendered = self.work / "config.conf"
        tasks = [self.include("command_center_password.yml"), {
            "name": "Render the selected browser-first application settings",
            "ansible.builtin.template": {"src": str(ANSIBLE / "templates/command-center-ng.conf.j2"),
                                         "dest": str(rendered), "mode": "0600"},
        }]
        result = self.run_tasks(tasks, {
            "ccng_install_dir": str(self.app_source()), "ccng_config_dir": str(config),
            "ccng_user_uid": os.getuid(), "command_center_first_password_setup": "htpasswd-proxy",
            "command_center_connection_type": "http", "command_center_bind_address": "127.0.0.1",
            "command_center_port": 4242, "command_center_public_origin": "https://frontend.example.invalid",
            "ccng_tls_certificate": "/unused/fixture.crt", "ccng_tls_private_key": "/unused/fixture.key",
        }, {"CCNG_CONFIG_DIR": str(config)})
        self.assertFalse((config / "auth.json").exists())
        self.assertIn("first_password_setup: htpasswd-proxy", rendered.read_text())
        self.assertIn("public_origin: https://frontend.example.invalid", rendered.read_text())
        self.assertIn("failed=0", result.stdout)

    def test_trusted_basic_frontend_is_required_before_a_disposable_write(self):
        certificate, key = self.work / "frontend.crt", self.work / "frontend.key"
        created = subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
            "-keyout", str(key), "-out", str(certificate),
        ], capture_output=True, text=True, timeout=20)
        self.assertEqual(created.returncode, 0, created.stderr)
        received_authorization = []

        class Frontend(BaseHTTPRequestHandler):
            status = 401
            challenge = 'Basic realm="fixture"'

            def do_GET(self):
                received_authorization.append(self.headers.get("Authorization"))
                self.send_response(self.status)
                self.send_header("WWW-Authenticate", self.challenge)
                self.end_headers()

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Frontend)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certificate, key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for status, challenge, trust, expected in [
                (200, Frontend.challenge, True, False), (401, "Bearer", True, False),
                (401, Frontend.challenge, False, False), (401, Frontend.challenge, True, True),
            ]:
                with self.subTest(status=status, challenge=challenge, trusted=trust):
                    Frontend.status, Frontend.challenge = status, challenge
                    tasks = yaml.safe_load((ANSIBLE / "tasks/command_center_frontend.yml").read_text())
                    probe = next(t["ansible.builtin.uri"] for t in tasks if "ansible.builtin.uri" in t)
                    self.assertTrue(probe["validate_certs"])
                    self.assertFalse(probe["use_netrc"])
                    if trust:
                        probe["ca_path"] = str(certificate)
                    sentinel = self.work / f"after-{status}-{challenge.startswith('Basic')}-{trust}"
                    tasks.append({"name": "Write only after the actual frontend guard passes",
                                  "ansible.builtin.copy": {"dest": str(sentinel), "content": "allowed", "mode": "0600"}})
                    self.run_tasks(tasks, {"command_center_public_origin": f"https://localhost:{server.server_port}"}, success=expected)
                    self.assertEqual(sentinel.exists(), expected)
            self.assertTrue(received_authorization)
            self.assertTrue(all(value is None for value in received_authorization))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_frontend_guard_precedes_all_managed_target_writes(self):
        play = yaml.safe_load((ANSIBLE / "deploy_command_center.yml").read_text())[0]
        guard = next(i for i, task in enumerate(play["pre_tasks"])
                     if task.get("ansible.builtin.import_tasks") == "tasks/command_center_frontend.yml")
        self.assertGreater(guard, 0)
        self.assertEqual(play["pre_tasks"][guard - 1]["ansible.builtin.import_tasks"], "tasks/command_center_defaults.yml")
        self.assertNotIn("when", play["pre_tasks"][guard])

    def test_password_symlink_is_refused_without_touching_its_target(self):
        config = self.work / "config"
        config.mkdir(mode=0o700)
        target = self.work / "existing-data"
        target.write_text("preserve this unrelated data")
        (config / "auth.json").symlink_to(target)
        self.run_tasks([self.include("command_center_password.yml")], {
            "ccng_install_dir": str(self.work / "unused-app"), "ccng_config_dir": str(config),
            "ccng_user_uid": os.getuid(), "command_center_password": secrets.token_urlsafe(24),
        }, {"CCNG_CONFIG_DIR": str(config)}, success=False)
        self.assertEqual(target.read_text(), "preserve this unrelated data")


if __name__ == "__main__":
    unittest.main()
