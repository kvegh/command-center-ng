#!/bin/sh
set -eu

CCNG_INSTALL_DIR=''
CCNG_CODEX_PREFIX=''
CCNG_UPDATE=0
CCNG_CHECK_ONLY=0
CCNG_TASK_WORKSPACE=''
CCNG_INITIAL_WORK_DIR=$(pwd)
while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix)
            [ "$#" -ge 2 ] && [ -n "$2" ] || { echo 'Missing --prefix directory.' >&2; exit 1; }
            case "$2" in -*) echo 'Missing --prefix directory.' >&2; exit 1 ;; esac
            [ -z "$CCNG_INSTALL_DIR" ] || { echo 'Provide one installation directory.' >&2; exit 1; }
            CCNG_INSTALL_DIR=$2; shift 2 ;;
        --update) CCNG_UPDATE=1; shift ;;
        --codex-prefix)
            [ "$#" -ge 2 ] && [ -n "$2" ] || { echo 'Missing --codex-prefix directory.' >&2; exit 1; }
            case "$2" in -*) echo 'Missing --codex-prefix directory.' >&2; exit 1 ;; esac
            [ -z "$CCNG_CODEX_PREFIX" ] || { echo 'Provide one Codex prefix.' >&2; exit 1; }
            CCNG_CODEX_PREFIX=$2; shift 2 ;;
        --check) CCNG_CHECK_ONLY=1; shift ;;
        --workspace) [ "$#" -ge 2 ] || { echo 'Missing --workspace directory.' >&2; exit 1; }; CCNG_TASK_WORKSPACE=$2; shift 2 ;;
        --help|-h) echo 'Usage: ./install.sh [--prefix DIRECTORY] [--codex-prefix DIRECTORY] [--update | --check] [--workspace TASK_DIRECTORY]'; echo 'Default installation directory: ~/commandcenter-ng. --prefix must stay inside your home.'; echo 'New Codex installations default to ~/.local/bin; --codex-prefix selects another writable prefix. Existing Codex is reused, not moved.'; echo '--check reports prerequisites without installing or changing configuration.'; echo '--workspace selects a task workspace; fresh Beads/local Dolt setup requires terminal confirmation.'; echo 'RHEL 9 can install missing prerequisites after explicit terminal confirmation.'; echo 'Run --update from a clean source checkout to fetch latest main automatically; use the same --prefix for an existing custom installation.'; exit 0 ;;
        -*) echo "Unknown argument: $1" >&2; exit 1 ;;
        *) [ -n "$1" ] || { echo 'Installation directory must not be empty.' >&2; exit 1; }; [ -z "$CCNG_INSTALL_DIR" ] || { echo 'Provide one installation directory.' >&2; exit 1; }; CCNG_INSTALL_DIR=$1; shift ;;
    esac
done
case "$CCNG_CODEX_PREFIX" in *:*|*[[:cntrl:]]*) echo 'The Codex prefix cannot contain colon or control characters because it is used in PATH.' >&2; exit 1 ;; esac
[ -n "$CCNG_INSTALL_DIR" ] || CCNG_INSTALL_DIR="$HOME/commandcenter-ng"
for CCNG_TOOL in id uname dirname; do command -v "$CCNG_TOOL" >/dev/null 2>&1 || { echo 'A basic Linux installation with coreutils is required to start this installer.' >&2; exit 1; }; done
[ "$(uname -s)" = Linux ] || { echo 'Linux is required.' >&2; exit 1; }
CCNG_SOURCE_DIR=$(dirname "$0")
. "$CCNG_SOURCE_DIR/installer/prerequisites.sh"
. "$CCNG_SOURCE_DIR/installer/beads.sh"
if [ "$CCNG_CHECK_ONLY" -eq 1 ]; then
    [ "$CCNG_UPDATE" -eq 0 ] || { echo 'Choose --check or --update.' >&2; exit 1; }
    [ -n "$CCNG_CODEX_PREFIX" ] || CCNG_CODEX_PREFIX="$HOME/.local"
    if [ -n "$CCNG_INSTALL_DIR" ]; then PATH="$CCNG_INSTALL_DIR/tools/bin:$CCNG_INSTALL_DIR/tools/node_modules/.bin:$HOME/.local/bin:$CCNG_CODEX_PREFIX/bin:$PATH"; export PATH; fi
    ccng_environment_report
    exit $?
fi
[ "$(id -u)" -ne 0 ] || { echo 'Run this installer as an unprivileged user, without sudo.' >&2; exit 1; }
ccng_system_prerequisites
CCNG_INSTALL_DIR=$(realpath -m "$CCNG_INSTALL_DIR")
CCNG_USER_HOME=$(realpath "$HOME")
[ -n "$CCNG_CODEX_PREFIX" ] || CCNG_CODEX_PREFIX="$CCNG_USER_HOME/.local"
CCNG_CODEX_PREFIX=$(realpath -m "$CCNG_CODEX_PREFIX")
case "$CCNG_CODEX_PREFIX" in *:*|*[[:cntrl:]]*) echo 'The Codex prefix cannot contain colon or control characters because it is used in PATH.' >&2; exit 1 ;; esac
case "$CCNG_CODEX_PREFIX/" in "$CCNG_INSTALL_DIR/"*) echo 'The Codex prefix must stay outside the application installation directory.' >&2; exit 1 ;; esac
case "$CCNG_INSTALL_DIR/" in "$CCNG_CODEX_PREFIX/bin/"*|"$CCNG_CODEX_PREFIX/lib/"*) echo 'The application directory must stay outside the Codex prefix bin and lib directories.' >&2; exit 1 ;; esac
CCNG_CODEX_BIN="$CCNG_CODEX_PREFIX/bin"
case "$CCNG_INSTALL_DIR" in "$CCNG_USER_HOME"/*) ;; *) echo 'Installation must stay inside your home directory.' >&2; exit 1 ;; esac
CCNG_SOURCE_DIR=$(dirname "$(realpath "$0")")
[ "$CCNG_SOURCE_DIR" != "$CCNG_INSTALL_DIR" ] || { echo 'Run the installer from a separate source checkout.' >&2; exit 1; }
if [ -e "$CCNG_INSTALL_DIR" ]; then
    node -e 'const fs=require("node:fs");const p=process.argv[1]+"/package.json";if(!fs.existsSync(p)||JSON.parse(fs.readFileSync(p)).name!=="command-center-ng")process.exit(1)' "$CCNG_INSTALL_DIR" || { echo 'Refusing to replace an unrelated directory.' >&2; exit 1; }
fi
if [ "$CCNG_UPDATE" -eq 1 ]; then
    [ -d "$CCNG_INSTALL_DIR" ] || { echo 'Update requires an existing Command Center installation.' >&2; exit 1; }
    command -v git >/dev/null 2>&1 || { echo 'Git is required for automatic updates.' >&2; exit 1; }
    CCNG_GIT_ROOT=$(git -C "$CCNG_SOURCE_DIR" rev-parse --show-toplevel 2>/dev/null) || { echo 'Run --update from the cloned source repository.' >&2; exit 1; }
    [ "$(realpath "$CCNG_GIT_ROOT")" = "$CCNG_SOURCE_DIR" ] || { echo 'Run --update from the cloned source repository.' >&2; exit 1; }
    # An installation inside the checkout is generated output, not a source edit.
    # Still inspect every tracked file, including anything under the target.
    CCNG_TRACKED_CHANGES=$(git -C "$CCNG_SOURCE_DIR" status --porcelain --untracked-files=no)
    case "$CCNG_INSTALL_DIR" in
        "$CCNG_SOURCE_DIR"/*)
            CCNG_TARGET_RELATIVE=${CCNG_INSTALL_DIR#"$CCNG_SOURCE_DIR"/}
            [ -z "$(git -C "$CCNG_SOURCE_DIR" ls-files -- ":(top,literal)$CCNG_TARGET_RELATIVE")" ] || { echo 'The installation target contains tracked source files. Choose a separate installation directory.' >&2; exit 1; }
            CCNG_UNTRACKED_CHANGES=$(git -C "$CCNG_SOURCE_DIR" ls-files --others --exclude-standard -- . ":(top,exclude,literal)$CCNG_TARGET_RELATIVE")
            ;;
        *) CCNG_UNTRACKED_CHANGES=$(git -C "$CCNG_SOURCE_DIR" ls-files --others --exclude-standard) ;;
    esac
    [ -z "$CCNG_TRACKED_CHANGES$CCNG_UNTRACKED_CHANGES" ] || { echo 'The source checkout has local changes outside the installation output. Run git status --short to inspect them; nothing was discarded.' >&2; exit 1; }
    [ "$(git -C "$CCNG_SOURCE_DIR" branch --show-current)" = main ] || { echo 'Switch the source checkout to main before updating.' >&2; exit 1; }
    git -C "$CCNG_SOURCE_DIR" fetch origin main
    git -C "$CCNG_SOURCE_DIR" merge-base --is-ancestor HEAD FETCH_HEAD || { echo 'Local source commits diverge from latest main; refusing to overwrite them.' >&2; exit 1; }
    git -C "$CCNG_SOURCE_DIR" merge --ff-only FETCH_HEAD
    # Re-enter the freshly fetched installer; ordinary reinstall preserves private config.
    if [ -n "$CCNG_TASK_WORKSPACE" ]; then exec sh "$CCNG_SOURCE_DIR/install.sh" --workspace "$CCNG_TASK_WORKSPACE" --prefix "$CCNG_INSTALL_DIR" --codex-prefix "$CCNG_CODEX_PREFIX"; fi
    exec sh "$CCNG_SOURCE_DIR/install.sh" --prefix "$CCNG_INSTALL_DIR" --codex-prefix "$CCNG_CODEX_PREFIX"
fi
CCNG_PARENT=$(dirname "$CCNG_INSTALL_DIR")
mkdir -p "$CCNG_PARENT"
CCNG_STAGE=$(mktemp -d "$CCNG_PARENT/.command-center-ng-install.XXXXXXXX")
trap 'rm -rf -- "$CCNG_STAGE"' EXIT HUP INT TERM
mkdir "$CCNG_STAGE/app"
if [ -d "$CCNG_INSTALL_DIR/tools" ]; then
    [ ! -L "$CCNG_INSTALL_DIR/tools" ] || { echo 'Refusing to use a symlink as the managed CLI directory.' >&2; exit 1; }
    cp -a "$CCNG_INSTALL_DIR/tools" "$CCNG_STAGE/app/tools"
fi
if [ -e "$CCNG_INSTALL_DIR/etc" ] || [ -L "$CCNG_INSTALL_DIR/etc" ]; then
    [ -d "$CCNG_INSTALL_DIR/etc" ] && [ ! -L "$CCNG_INSTALL_DIR/etc" ] || { echo 'Refusing an unsafe installation etc directory.' >&2; exit 1; }
    if [ -e "$CCNG_INSTALL_DIR/etc/config.conf" ] || [ -L "$CCNG_INSTALL_DIR/etc/config.conf" ]; then
        [ -f "$CCNG_INSTALL_DIR/etc/config.conf" ] && [ ! -L "$CCNG_INSTALL_DIR/etc/config.conf" ] || { echo 'Refusing an unsafe installation config.conf.' >&2; exit 1; }
    fi
    if [ -e "$CCNG_INSTALL_DIR/etc/certs" ] || [ -L "$CCNG_INSTALL_DIR/etc/certs" ]; then
        [ -d "$CCNG_INSTALL_DIR/etc/certs" ] && [ ! -L "$CCNG_INSTALL_DIR/etc/certs" ] || { echo 'Refusing an unsafe installation certificate directory.' >&2; exit 1; }
    fi
    cp -a "$CCNG_INSTALL_DIR/etc" "$CCNG_STAGE/app/etc"
fi
PATH="$CCNG_STAGE/app/tools/bin:$CCNG_STAGE/app/tools/node_modules/.bin:$CCNG_USER_HOME/.local/bin:$CCNG_CODEX_PREFIX/bin:$PATH"
export PATH
ccng_agent_prerequisites
case "$CCNG_CODEX_BIN" in "$CCNG_STAGE/app/"*) CCNG_CODEX_BIN="$CCNG_INSTALL_DIR/${CCNG_CODEX_BIN#"$CCNG_STAGE/app/"}" ;; esac
# Ship only the conservative example. The active policy comes from the operator
# and was copied with etc/ above, so source updates cannot replace it.
tar -C "$CCNG_SOURCE_DIR" -cf "$CCNG_STAGE/source.tar" package.json package-lock.json index.html tsconfig.json vite.config.mjs src server README.md docs AGENTS.md design_decisions_history.md etc/approval-policy-template.yml
tar -C "$CCNG_STAGE/app" -xf "$CCNG_STAGE/source.tar"
(
    cd "$CCNG_STAGE/app"
    npm ci --ignore-scripts --no-fund --no-audit
    npm run build
    npm prune --omit=dev --ignore-scripts --no-fund --no-audit
)
# Prepare private settings after a successful build, before the atomic swap.
# Preserve operator settings and keys; no certificate is generated or imported.
node --input-type=module - "$CCNG_STAGE/app/etc" "$CCNG_INSTALL_DIR" <<'JS'
import { lstatSync, mkdirSync, chmodSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2]; const prefix = process.argv[3];
function existing(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function privateDirectory(path) {
  const info = existing(path);
  if (info && (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid())) throw new Error('Refusing an unsafe installation configuration directory.');
  if (!info) mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}
try {
  privateDirectory(directory);
  privateDirectory(join(directory, 'certs'));
  const file = join(directory, 'config.conf'); const info = existing(file);
  if (info) {
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()) throw new Error('Refusing an unsafe installation config.conf.');
    chmodSync(file, 0o600);
  } else {
    if (/[\r\n]/.test(prefix)) throw new Error('The installation directory must not contain line breaks.');
    const config = '# Command Center NG connection settings. Values are literal text, not YAML or shell.\n'
      + '# To enable HTTPS, replace the HTTP setting below and uncomment both file paths.\n'
      + '# connection_type: https\n'
      + '# tls_certificate: ' + join(prefix, 'etc', 'certs', 'server.crt') + '\n'
      + '# tls_private_key: ' + join(prefix, 'etc', 'certs', 'server.key') + '\n'
      + '# Other certificate/key paths are supported when readable by the CCNG user.\n'
      + '# Browser-first password creation requires enforced htpasswd on every proxy route,\n'
      + '# restricted direct backend access, and your HTTPS public_origin below.\n'
      + '# public_origin: https://command-center.example\n'
      + '# first_password_setup: htpasswd-proxy\n'
      + 'connection_type: http\n';
    writeFileSync(file, config, { mode: 0o600, flag: 'wx' });
  }
} catch (error) { writeSync(2, 'Could not prepare installation settings: ' + error.message + '\n'); process.exitCode = 1; }
JS
cat > "$CCNG_STAGE/app/command-center-ng" <<'SH'
#!/bin/sh
# Command Center NG launcher
CCNG_APP_DIR=$(dirname "$(realpath "$0")")
SH
node --input-type=module - "$CCNG_CODEX_BIN" >> "$CCNG_STAGE/app/command-center-ng" <<'JS'
import { writeSync } from 'node:fs';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
writeSync(1, 'CCNG_CODEX_BIN=' + quote(process.argv[2]) + '\n');
JS
cat >> "$CCNG_STAGE/app/command-center-ng" <<'SH'
PATH="$CCNG_APP_DIR/tools/bin:$CCNG_APP_DIR/tools/node_modules/.bin:$CCNG_CODEX_BIN:$PATH"
export PATH
if [ "${1:-}" = service ]; then
    shift
    exec node "$CCNG_APP_DIR/server/user-service.mjs" "$@"
fi
exec node "$CCNG_APP_DIR/server/main.mjs" "$@"
SH
chmod 755 "$CCNG_STAGE/app/command-center-ng"
# These stable tool directories must reach Bash PATH even if Dolt is added later.
for CCNG_TOOL_DIR in "$CCNG_STAGE/app/tools" "$CCNG_STAGE/app/tools/bin" "$CCNG_STAGE/app/tools/node_modules" "$CCNG_STAGE/app/tools/node_modules/.bin"; do
    [ ! -L "$CCNG_TOOL_DIR" ] || { echo 'Refusing a linked managed tool directory.' >&2; exit 1; }
    if [ -e "$CCNG_TOOL_DIR" ]; then
        [ -d "$CCNG_TOOL_DIR" ] || { echo 'A managed tool path is not a directory.' >&2; exit 1; }
    else mkdir "$CCNG_TOOL_DIR"; fi
done
if [ -e "$CCNG_INSTALL_DIR" ]; then mv "$CCNG_INSTALL_DIR" "$CCNG_STAGE/previous"; fi
if ! mv "$CCNG_STAGE/app" "$CCNG_INSTALL_DIR"; then
    [ ! -d "$CCNG_STAGE/previous" ] || mv "$CCNG_STAGE/previous" "$CCNG_INSTALL_DIR"
    echo 'Installation failed; the previous installation was restored.' >&2; exit 1
fi
PATH="$CCNG_INSTALL_DIR/tools/bin:$CCNG_INSTALL_DIR/tools/node_modules/.bin:$CCNG_CODEX_BIN:$PATH"
export PATH
# Only stable installed paths reach the approved shell setup, never staging paths.
set --
for CCNG_TOOL_BIN in "$CCNG_CODEX_BIN" "$CCNG_INSTALL_DIR/tools/bin" "$CCNG_INSTALL_DIR/tools/node_modules/.bin"; do
    if [ -d "$CCNG_TOOL_BIN" ]; then set -- "$@" "$CCNG_TOOL_BIN"; fi
done
if [ "$#" -gt 0 ]; then
    if ! node "$CCNG_SOURCE_DIR/installer/shell-path.mjs" "$CCNG_USER_HOME" "$@"; then
        echo 'Warning: shell PATH setup was not changed. Use the printed export command in this terminal.' >&2
    fi
fi
# Native Codex owns the feature setting; missing/unsupported setup only warns.
if ! node "$CCNG_INSTALL_DIR/server/codex-setup.mjs" --enable; then
    echo 'Warning: the Codex question setting could not be configured; Command Center installation will continue.' >&2
fi
if ! ccng_beads_setup; then
    echo 'The Command Center application was installed, but Beads task setup failed. Existing setup state was preserved for inspection.' >&2
    exit 1
fi
CCNG_VERSION=$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).version' "$CCNG_INSTALL_DIR/package.json")
echo "Installed Command Center NG $CCNG_VERSION into $CCNG_INSTALL_DIR"
echo "Launcher: $CCNG_INSTALL_DIR/command-center-ng"
echo "Connection settings: $CCNG_INSTALL_DIR/etc/config.conf (existing settings are preserved)."
echo "Approval policy template: $CCNG_INSTALL_DIR/etc/approval-policy-template.yml (active approval-policy.yml is preserved)."
echo 'Existing application passwords are preserved. No default password is created.'
echo 'For local setup, choose your password with:'
echo "  node '$CCNG_INSTALL_DIR/server/password.mjs'"
echo 'For browser-first setup, first enforce htpasswd on every HTTPS proxy route, restrict direct backend access,'
echo 'then configure public_origin and first_password_setup: htpasswd-proxy in etc/config.conf.'
echo "Start: '$CCNG_INSTALL_DIR/command-center-ng' (new installations default to HTTP)."
echo 'To enable HTTPS, edit etc/config.conf and supply readable certificate and private-key files.'
echo "Explicit localhost HTTP: '$CCNG_INSTALL_DIR/command-center-ng' --protocol http --host 127.0.0.1 --port 4242"
echo "Optional user service: '$CCNG_INSTALL_DIR/command-center-ng' service install -- [your existing runtime options]"
echo 'For updates, run ./install.sh --update from the source checkout, then restart the app.'
echo 'For an existing custom directory, include --prefix YOUR_INSTALL_DIRECTORY; installations are not moved automatically.'
node --input-type=module - "$CCNG_INSTALL_DIR" "$CCNG_USER_HOME/.local/bin/command-center-ng" "$CCNG_CODEX_BIN" <<'JS'
import { readFileSync, lstatSync, unlinkSync, writeSync } from 'node:fs';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
try {
  const info = lstatSync(process.argv[3]);
  const expected = '#!/bin/sh\n# Command Center NG launcher\nexec node ' + quote(process.argv[2] + '/server/main.mjs') + ' "$@"\n';
  if (info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && readFileSync(process.argv[3], 'utf8') === expected) {
    unlinkSync(process.argv[3]); console.log('Removed the old PATH shortcut for this installation.');
  }
} catch (error) { if (error.code !== 'ENOENT') console.log('Existing PATH shortcut left untouched.'); }
writeSync(1, 'The installer cannot change your current terminal PATH. Run this as the same user before Codex/Beads commands:\n'
  + '  export PATH=' + quote(process.argv[2] + '/tools/bin') + ':' + quote(process.argv[2] + '/tools/node_modules/.bin') + ':' + quote(process.argv[4]) + ':"$PATH"\n');
JS
if [ "${CCNG_LOGIN_PENDING:-0}" -eq 1 ]; then echo 'Setup pending: run codex login using the tool PATH shown above. On SSH/headless hosts, forward its localhost callback (default port 1455) before browser sign-in.'; fi
if [ "${CCNG_CODEX_PENDING:-0}" -eq 1 ]; then echo 'Setup pending: install or upgrade Codex, then rerun the installer before using Codex agents.'; fi
echo 'If the native daemon is not already running, start it as the same user with that tool PATH: codex app-server daemon start'
echo 'The native daemon runs in the background; you do not need to keep its terminal open.'
echo 'Existing daemons keep their original PATH. If Beads was just added, restart the daemon when existing work is idle before starting new agents.'
