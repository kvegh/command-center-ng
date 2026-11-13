# Deployment approval policy

The product ships `etc/approval-policy-template.yml`, never an active permissive
policy. Copy and review the template to create a separate owner-private mode-600
`etc/approval-policy.yml`, or set `approval_policy: /private/path/approval-policy.yml`
in the existing `etc/config.conf`. Relative paths resolve beside config.conf.
Restart the existing app after policy edits; there is no extra service or store.
The installer preserves the active file and refreshes only the template.

Keep the active policy unencrypted in the deployment's private secrets repository
when that repository explicitly permits policy files. It contains rules, not
passwords, connection details or other secret values. Keep actual payloads encrypted.
Do not commit active policy to this public repository; its default path is ignored.

## Schema

```yaml
version: 1
source_reading: restricted
approval_instructions: |
  Approve only actions covered by actual user instructions and project scope.
  Ask about unresolved authority, targets, effects and material decisions.
```

Exactly these three fields are supported. YAML comments and multiline instructions
are allowed. Duplicate/unknown fields, tags, anchors, aliases, multiple documents,
invalid types and oversized policies are rejected without echoing parser input.
The file must be a single owner-private regular UTF-8 file, up to 64 KiB; instruction
text is limited to 32 KiB. Never select a symlink, hard link or shared-writable file.

`restricted` keeps conservative source-name, content, extension and project/reference
checks. Explicit `all` allows every native-readable local UTF-8 text file needed
for review, including hidden/credential/Vault names, literal credential fields,
Vault markers/ciphertext and files outside the worker project or command references.
Choose it only when that broader disclosure to the local reviewing model is intended.
Both modes reject binary/NUL data, symlinks, nonregular or oversized files, and keep
paging bounds, exact current request/token/cwd, byte hashes and changed-source checks.
The readers never execute/import source, decrypt ciphertext or grant native access.
Hook output and concern/name/message sanitation retain separate strict protections.

Approval instructions and selected reading mode are shared by the main Coordinator
and both analysts. A policy is configuration, not authority for an action: exact
actual-user evidence, native permission controls, pauses and manual asks still apply.
No existing request is answered or automatically re-reviewed when policy changes.

No optional default file means conservative product defaults. An existing invalid
file, or an explicitly configured missing/unreadable file, disables automatic
approvals and shows a fixed error; correct the file and restart. Manual controls
remain available. The Coordinator state exposes mode/hash/error, never policy text.

## Automated checks

From a checkout with locked dependencies and the existing Linux tools installed:

```bash
node --test tests/approval-policy.test.mjs tests/runtime-config.test.mjs tests/approval-source.test.mjs tests/coordinator.test.mjs tests/approval-reviewers.test.mjs tests/installer.test.mjs
npm run build
```

Tests return a machine-detectable failure status. They create only temporary
synthetic policies/files and mock native transport; no genuine approval, protected
input, model call or external project execution is needed. Installer fixtures
verify both an existing active file's preservation and continued absence when
no active policy was selected. For an authorized deployment, run the same affected
checks against the installed modules, verify the selected private policy mode/hash,
and test source reads without executing their contents. Source tests and a running
process alone do not establish an actual model's later approval judgment.
