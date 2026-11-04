"""Run real Ansible only against disposable localhost fixtures, never deployment.

The production playbook is parsed but not applied. Password integration uses the real password helper from this checkout.
"""

import base64
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import subprocess
import sys
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
ANSIBLE = ROOT / "ansible"


class CommandCenterDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ccng-deployment-test-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.sequence = 0

    def run_tasks(self, tasks, variables=None, environment=None, success=True):
        self.sequence += 1
        fixture = self.work / f"fixture-{self.sequence}.yml"
        play = {
            "name": "Validate isolated Command Center fixtures",
            "hosts": "all",
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
            ["ansible-playbook", "-i", "localhost,", "--connection", "local",
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
        self.assertEqual(play["pre_tasks"][0]["ansible.builtin.import_tasks"],
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

    def test_inventory_overrides_survive_default_resolution(self):
        tasks = [
            {"name": "Load internal defaults", "ansible.builtin.include_vars":
             str(ANSIBLE / "vars/command_center_defaults.yml")},
            self.include("command_center_defaults.yml"),
            {"name": "Verify supplied inputs were retained", "ansible.builtin.assert": {"that": [
                "command_center_port | int == 8181", "command_center_revision == 'selected-ref'",
                "not (command_center_manage_packages | bool)",
                "command_center_install_dir == ccng_user_home ~ '/custom-app'",
                "command_center_path.startswith(command_center_install_dir ~ '/tools/')",
            ]}},
        ]
        self.run_tasks(tasks, {"ccng_user_home": str(self.work),
                               "command_center_port": 8181,
                               "command_center_revision": "selected-ref",
                               "command_center_manage_packages": False,
                               "command_center_install_dir": str(self.work / "custom-app")})

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
        self.run_tasks([self.include("command_center_password.yml")], variables, environment)
        self.assertEqual(auth.read_bytes(), original)

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
