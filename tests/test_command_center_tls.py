"""Exercise only backend TLS tasks against disposable local application trees."""

import os
from pathlib import Path
import pwd
import shutil
import ssl
import stat
import subprocess
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
TASKS = ROOT / "ansible/tasks/command_center_tls.yml"


class CommandCenterTlsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ccng-backend-tls-test-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.app = self.work / "application with spaces"
        self.app.mkdir()
        (self.work / "templates").mkdir()
        shutil.copyfile(ROOT / "ansible/templates/command-center-ng.conf.j2",
                        self.work / "templates/command-center-ng.conf.j2")
        self.sequence = 0

    def run_tasks(self, variables=None, success=True):
        self.sequence += 1
        settings = {
            "ccng_install_dir": str(self.app),
            "command_center_user": pwd.getpwuid(os.getuid()).pw_name,
            "command_center_connection_type": "https",
            "command_center_bind_address": "127.0.0.1",
            "command_center_port": 4242,
            "command_center_public_origin": "https://backend.example.invalid:4242",
            "command_center_tls_server_name": "backend.example.invalid",
            "command_center_tls_days": 2,
            **(variables or {}),
        }
        play = [{
            "name": "Exercise the isolated backend configuration",
            "hosts": "localhost",
            "gather_facts": False,
            "become": False,
            "no_log": True,
            "vars": settings,
            "tasks": [{"name": "Use the real application TLS tasks",
                       "ansible.builtin.import_tasks": str(TASKS)}],
            # This fixture never starts/restarts a process or writes a unit.
            "handlers": [{"name": "Restart Command Center",
                          "ansible.builtin.debug": {"msg": "Fixture handler only"}}],
        }]
        fixture = self.work / f"fixture-{self.sequence}.yml"
        fixture.write_text(yaml.safe_dump(play, sort_keys=False))
        fixture.chmod(0o600)
        env = {
            **os.environ,
            "ANSIBLE_HOME": str(self.work / "ansible-home"),
            "ANSIBLE_LOCAL_TEMP": str(self.work / "local-tmp"),
            "ANSIBLE_REMOTE_TEMP": str(self.work / "remote-tmp"),
            "ANSIBLE_NOCOLOR": "1",
        }
        result = subprocess.run(
            ["ansible-playbook", "-i", "localhost,", "--connection", "local",
             "-e", f"ansible_python_interpreter={os.sys.executable}", str(fixture)],
            env=env, capture_output=True, text=True, timeout=90, check=False,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    @staticmethod
    def mode(path):
        return stat.S_IMODE(path.stat().st_mode)

    def test_http_writes_literal_configuration_without_generating_a_certificate(self):
        self.run_tasks({"command_center_connection_type": "http"})
        config = self.app / "etc/config.conf"
        text = config.read_text()
        self.assertIn("connection_type: http\n", text)
        self.assertIn("# connection_type: https\n", text)
        self.assertIn(f"# tls_certificate: {self.app}/etc/certs/server.crt\n", text)
        self.assertIn("host: 127.0.0.1\nport: 4242\n", text)
        self.assertFalse((self.app / "etc/certs/server.key").exists())
        self.assertEqual(self.mode(config), 0o600)
        self.assertEqual(self.mode(config.parent), 0o700)

    def test_https_generates_verifiable_pair_and_reapply_preserves_all_bytes(self):
        first = self.run_tasks()
        directory = self.app / "etc/certs"
        certificate = directory / "server.crt"
        key = directory / "server.key"
        config = self.app / "etc/config.conf"
        original = {path: path.read_bytes() for path in [certificate, key, config]}
        decoded = ssl._ssl._test_decode_cert(str(certificate))
        self.assertIn(("DNS", "backend.example.invalid"), decoded["subjectAltName"])
        self.assertIn(("IP Address", "127.0.0.1"), decoded["subjectAltName"])
        for option, value in [("-verify_hostname", "backend.example.invalid"),
                              ("-verify_ip", "127.0.0.1")]:
            result = subprocess.run(
                ["openssl", "verify", "-CAfile", str(certificate), option,
                 value, str(certificate)], capture_output=True, text=True,
                timeout=10, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.mode(directory), 0o700)
        self.assertEqual(self.mode(key), 0o600)
        self.assertEqual(self.mode(certificate), 0o644)
        self.assertEqual(self.mode(config), 0o600)
        self.assertIn(f"tls_certificate: {certificate}\n", config.read_text())
        self.assertIn(f"tls_private_key: {key}\n", config.read_text())
        self.assertIn("connection_type: https\n", config.read_text())
        self.assertNotIn("BEGIN PRIVATE KEY", first.stdout + first.stderr)
        self.assertFalse(list(directory.glob(".new-pair-*")))

        repeat = self.run_tasks()
        for path, content in original.items():
            self.assertEqual(path.read_bytes(), content)
        self.assertRegex(repeat.stdout, r"changed=0\s+")

        # Choosing HTTP later must not delete or replace the generated pair.
        self.run_tasks({"command_center_connection_type": "http"})
        self.assertEqual(certificate.read_bytes(), original[certificate])
        self.assertEqual(key.read_bytes(), original[key])
        self.assertIn("connection_type: http\n", config.read_text())

    def test_partial_and_linked_pairs_are_refused_without_touching_their_targets(self):
        directory = self.app / "etc/certs"
        directory.mkdir(parents=True)
        key = directory / "server.key"
        sentinel = b"synthetic-key-sentinel"
        key.write_bytes(sentinel)
        result = self.run_tasks(success=False)
        self.assertEqual(key.read_bytes(), sentinel)
        self.assertFalse((self.app / "etc/config.conf").exists())
        self.assertNotIn(sentinel.decode(), result.stdout + result.stderr)

        outside = self.work / "outside-certificate"
        outside.write_text("synthetic unrelated certificate")
        (directory / "server.crt").symlink_to(outside)
        self.run_tasks(success=False)
        self.assertEqual(outside.read_text(), "synthetic unrelated certificate")
        self.assertTrue((directory / "server.crt").is_symlink())

    def test_https_covers_a_distinct_public_origin_and_backend_name(self):
        self.run_tasks({"command_center_public_origin": "https://public.example.invalid"})
        certificate = self.app / "etc/certs/server.crt"
        for name in ["backend.example.invalid", "public.example.invalid"]:
            result = subprocess.run(
                ["openssl", "verify", "-CAfile", str(certificate),
                 "-verify_hostname", name, str(certificate)],
                capture_output=True, text=True, timeout=10, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_ipv6_wildcard_uses_loopback_identity_for_verified_health_checks(self):
        self.run_tasks({
            "command_center_bind_address": "::",
            "command_center_tls_server_name": "::1",
            "command_center_public_origin": "https://[::1]:4242",
        })
        certificate = self.app / "etc/certs/server.crt"
        result = subprocess.run(
            ["openssl", "verify", "-CAfile", str(certificate), "-verify_ip", "::1", str(certificate)],
            capture_output=True, text=True, timeout=10, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("host: ::\n", (self.app / "etc/config.conf").read_text())

    def test_linked_configuration_directory_is_refused_before_outside_changes(self):
        outside = self.work / "unrelated directory"
        outside.mkdir(mode=0o755)
        sentinel = outside / "config.conf"
        sentinel.write_text("synthetic unrelated settings\n")
        (self.app / "etc").symlink_to(outside, target_is_directory=True)
        self.run_tasks({"command_center_connection_type": "http"}, success=False)
        self.assertEqual(self.mode(outside), 0o755)
        self.assertEqual(sentinel.read_text(), "synthetic unrelated settings\n")
        self.assertFalse((outside / "certs").exists())

    def test_mismatched_existing_key_is_refused_without_regeneration(self):
        self.run_tasks()
        directory = self.app / "etc/certs"
        certificate = directory / "server.crt"
        key = directory / "server.key"
        config = self.app / "etc/config.conf"
        previous_cert = certificate.read_bytes()
        previous_config = config.read_bytes()
        result = subprocess.run(
            ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
             "rsa_keygen_bits:2048", "-out", str(key)],
            capture_output=True, text=True, timeout=15, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        mismatched = key.read_bytes()
        self.run_tasks(success=False)
        self.assertEqual(key.read_bytes(), mismatched)
        self.assertEqual(certificate.read_bytes(), previous_cert)
        self.assertEqual(config.read_bytes(), previous_config)


if __name__ == "__main__":
    unittest.main()
