"""Exercise warning-only Codex deployment setup in disposable local fixtures."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / "ansible/tasks/command_center_codex_questions.yml"


class CommandCenterCodexQuestionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ccng-codex-deployment-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.bin = self.work / "bin"
        self.profile = self.work / "selected-profile"
        self.install = self.work / "installation"
        self.bin.mkdir()
        self.profile.mkdir()
        (self.install / "server").mkdir(parents=True)
        shutil.copyfile(ROOT / "server/codex-setup.mjs", self.install / "server/codex-setup.mjs")
        self.config = self.profile / "config.toml"
        self.config.write_text('model = "synthetic-existing-model"\n')
        self.state = self.profile / "fixture-state.json"
        self.calls = self.profile / "calls.jsonl"
        self.sequence = 0
        script = f"""#!{sys.executable}
import json, os
from pathlib import Path
import sys
profile = Path(os.environ['CODEX_HOME'])
state_file = profile / 'fixture-state.json'
state = json.loads(state_file.read_text())
args = sys.argv[1:]
with (profile / 'calls.jsonl').open('a') as stream:
    stream.write(json.dumps({{'args': args, 'profile': str(profile), 'cwd': str(Path.cwd())}}) + '\\n')
if args == ['features', 'list']:
    if state.get('list_error'):
        print('synthetic-private-diagnostic', file=sys.stderr)
        sys.exit(7)
    if state.get('unsupported'):
        print('other_feature stable true')
    else:
        print('default_mode_request_user_input  under development  ' + str(state.get('enabled', False)).lower())
elif args == ['features', 'enable', 'default_mode_request_user_input']:
    if state.get('enable_error'):
        print('synthetic-private-diagnostic', file=sys.stderr)
        sys.exit(8)
    if not state.get('stays_disabled'):
        state['enabled'] = True
        state_file.write_text(json.dumps(state))
else:
    print('Unexpected fixture operation', file=sys.stderr)
    sys.exit(19)
"""
        self.codex = self.bin / "codex"
        self.codex.write_text(script)
        self.codex.chmod(0o755)

    def run_tasks(self, state):
        self.state.write_text(json.dumps(state))
        self.sequence += 1
        sentinel = self.work / f"continued-{self.sequence}"
        fixture = self.work / f"play-{self.sequence}.yml"
        fixture.write_text(yaml.safe_dump([{
            "name": "Check disposable Codex setup",
            "hosts": "all",
            "gather_facts": False,
            "become": False,
            "no_log": True,
            "vars": {"ccng_install_dir": str(self.install), "ccng_codex_home": str(self.profile),
                     "ccng_project_dir": str(self.work)},
            "environment": {"CODEX_HOME": str(self.profile), "PATH": str(self.bin) + ":" + os.environ["PATH"]},
            "tasks": [
                {"name": "Exercise the real deployment tasks", "ansible.builtin.import_tasks": str(TASKS)},
                {"name": "Prove deployment continues", "ansible.builtin.copy": {
                    "dest": str(sentinel), "content": "continued", "mode": "0600"}, "changed_when": False},
            ],
        }], sort_keys=False))
        env = dict(os.environ)
        env.update({
            "ANSIBLE_HOME": str(self.work / "ansible-home"),
            "ANSIBLE_LOCAL_TEMP": str(self.work / "local-tmp"),
            "ANSIBLE_REMOTE_TEMP": str(self.work / "remote-tmp"),
            "ANSIBLE_NOCOLOR": "1",
        })
        result = subprocess.run([
            "ansible-playbook", "-i", "localhost,", "--connection", "local",
            "-e", f"ansible_python_interpreter={sys.executable}", str(fixture),
        ], env=env, capture_output=True, text=True, timeout=90, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(sentinel.is_file())
        self.assertEqual(self.config.read_text(), 'model = "synthetic-existing-model"\n')
        self.assertNotIn("synthetic-private-diagnostic", result.stdout + result.stderr)
        return result

    def native_calls(self):
        if not self.calls.exists():
            return []
        return [json.loads(line) for line in self.calls.read_text().splitlines()]

    def test_existing_enabled_feature_is_read_only(self):
        result = self.run_tasks({"enabled": True})
        self.assertRegex(result.stdout, r"changed=0\s")
        self.assertEqual([call["args"] for call in self.native_calls()], [["features", "list"]])

    def test_helper_cli_default_checks_without_enabling(self):
        self.state.write_text(json.dumps({"enabled": False}))
        result = subprocess.run([
            "node", str(self.install / "server/codex-setup.mjs"), "--json",
        ], env={**os.environ, "PATH": str(self.bin) + ":" + os.environ["PATH"],
                "CODEX_HOME": str(self.profile)}, cwd=self.work,
            capture_output=True, text=True, timeout=15, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        status = json.loads(result.stdout)
        self.assertTrue(status["available"])
        self.assertFalse(status["enabled"])
        self.assertFalse(status["changed"])
        self.assertEqual(len(status["warnings"]), 1)
        self.assertIn("Required Codex structured questions", status["warnings"][0])
        self.assertEqual([call["args"] for call in self.native_calls()], [["features", "list"]])
        self.assertEqual(self.config.read_text(), 'model = "synthetic-existing-model"\n')

    def test_native_enable_is_confirmed_once_and_repeated_apply_is_unchanged(self):
        first = self.run_tasks({"enabled": False})
        self.assertRegex(first.stdout, r"changed=1\s")
        saved = json.loads(self.state.read_text())
        self.assertTrue(saved["enabled"])
        second = self.run_tasks(saved)
        self.assertRegex(second.stdout, r"changed=0\s")
        self.assertEqual([call["args"] for call in self.native_calls()], [
            ["features", "list"], ["features", "enable", "default_mode_request_user_input"],
            ["features", "list"], ["features", "list"],
        ])
        for call in self.native_calls():
            self.assertEqual(call["profile"], str(self.profile))
            self.assertEqual(call["cwd"], str(self.work))

    def test_unsupported_cli_is_warning_only_without_a_config_write(self):
        result = self.run_tasks({"unsupported": True})
        self.assertIn("Warning:", result.stdout)
        self.assertRegex(result.stdout, r"changed=0\s")
        self.assertEqual([call["args"] for call in self.native_calls()], [["features", "list"]])

    def test_enable_errors_and_unconfirmed_results_warn_and_continue(self):
        for state in [{"enable_error": True}, {"stays_disabled": True}, {"list_error": True}]:
            with self.subTest(state=state):
                result = self.run_tasks(state)
                self.assertIn("Warning:", result.stdout)
                self.assertRegex(result.stdout, r"changed=0\s")
                self.assertFalse(json.loads(self.state.read_text()).get("enabled", False))

    def test_missing_or_invalid_helper_is_rescued_without_blocking_deployment(self):
        helper = self.install / "server/codex-setup.mjs"
        helper.unlink()
        missing = self.run_tasks({})
        self.assertIn("Warning:", missing.stdout)
        self.assertEqual(self.native_calls(), [])
        helper.write_text("console.log('not-json');\n")
        malformed = self.run_tasks({})
        self.assertIn("Warning:", malformed.stdout)
        self.assertEqual(self.native_calls(), [])


if __name__ == "__main__":
    unittest.main()
