#!/bin/sh
set -eu

CCNG_INSTALL_DIR=''
while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix) [ "$#" -ge 2 ] || { echo 'Missing --prefix directory.' >&2; exit 1; }; CCNG_INSTALL_DIR=$2; shift 2 ;;
        --help|-h) echo 'Usage: sh install.sh [DIRECTORY_UNDER_YOUR_HOME]'; echo 'Without a directory, the installer prompts before doing any work.'; exit 0 ;;
        -*) echo "Unknown argument: $1" >&2; exit 1 ;;
        *) [ -z "$CCNG_INSTALL_DIR" ] || { echo 'Provide one installation directory.' >&2; exit 1; }; CCNG_INSTALL_DIR=$1; shift ;;
    esac
done
while [ -z "$CCNG_INSTALL_DIR" ]; do
    printf 'Installation target directory (inside your home): '
    IFS= read -r CCNG_INSTALL_DIR || { echo 'No target directory provided.' >&2; exit 1; }
done
[ "$(uname -s)" = Linux ] || { echo 'Linux is required.' >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || { echo 'Run this installer as an unprivileged user, without sudo.' >&2; exit 1; }
for CCNG_TOOL in node npm tar realpath; do
    command -v "$CCNG_TOOL" >/dev/null 2>&1 || { echo "Install the missing prerequisite first: $CCNG_TOOL" >&2; exit 1; }
done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12)){console.error("Node.js 22.12 or newer is required.");process.exit(1)}'
CCNG_INSTALL_DIR=$(realpath -m "$CCNG_INSTALL_DIR")
CCNG_USER_HOME=$(realpath "$HOME")
case "$CCNG_INSTALL_DIR" in "$CCNG_USER_HOME"/*) ;; *) echo 'Installation must stay inside your home directory.' >&2; exit 1 ;; esac
CCNG_SOURCE_DIR=$(dirname "$(realpath "$0")")
[ "$CCNG_SOURCE_DIR" != "$CCNG_INSTALL_DIR" ] || { echo 'Run the installer from a separate source checkout.' >&2; exit 1; }
if [ -e "$CCNG_INSTALL_DIR" ]; then
    node -e 'const fs=require("node:fs");const p=process.argv[1]+"/package.json";if(!fs.existsSync(p)||JSON.parse(fs.readFileSync(p)).name!=="command-center-ng")process.exit(1)' "$CCNG_INSTALL_DIR" || { echo 'Refusing to replace an unrelated directory.' >&2; exit 1; }
fi
CCNG_PARENT=$(dirname "$CCNG_INSTALL_DIR")
CCNG_BIN_DIR="$CCNG_USER_HOME/.local/bin"
if [ -e "$CCNG_BIN_DIR/command-center-ng" ]; then
    node -e 'const fs=require("node:fs");if(!fs.readFileSync(process.argv[1],"utf8").includes("# Command Center NG launcher"))process.exit(1)' "$CCNG_BIN_DIR/command-center-ng" || { echo 'Refusing to replace an unrelated launcher.' >&2; exit 1; }
fi
mkdir -p "$CCNG_PARENT"
CCNG_STAGE=$(mktemp -d "$CCNG_PARENT/.command-center-ng-install.XXXXXXXX")
trap 'rm -rf -- "$CCNG_STAGE"' EXIT HUP INT TERM
mkdir "$CCNG_STAGE/app"
tar -C "$CCNG_SOURCE_DIR" -cf "$CCNG_STAGE/source.tar" package.json package-lock.json index.html tsconfig.json vite.config.mjs src server README.md docs AGENTS.md design_decisions_history.md
tar -C "$CCNG_STAGE/app" -xf "$CCNG_STAGE/source.tar"
(
    cd "$CCNG_STAGE/app"
    npm ci --ignore-scripts --no-fund --no-audit
    npm run build
    npm prune --omit=dev --ignore-scripts --no-fund --no-audit
)
CCNG_AUTH_FILE="${CCNG_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/command-center-ng}/auth.json"
if [ -t 0 ] && [ ! -f "$CCNG_AUTH_FILE" ]; then
    node "$CCNG_STAGE/app/server/password.mjs"
fi
if [ -e "$CCNG_INSTALL_DIR" ]; then mv "$CCNG_INSTALL_DIR" "$CCNG_STAGE/previous"; fi
if ! mv "$CCNG_STAGE/app" "$CCNG_INSTALL_DIR"; then
    [ ! -d "$CCNG_STAGE/previous" ] || mv "$CCNG_STAGE/previous" "$CCNG_INSTALL_DIR"
    echo 'Installation failed; the previous installation was restored.' >&2; exit 1
fi
mkdir -p "$CCNG_BIN_DIR"
node --input-type=module - "$CCNG_INSTALL_DIR" "$CCNG_BIN_DIR/command-center-ng" <<'JS'
import { writeFileSync, chmodSync } from 'node:fs';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
writeFileSync(process.argv[3], '#!/bin/sh\n# Command Center NG launcher\nexec node ' + quote(process.argv[2] + '/server/main.mjs') + ' "$@"\n', { mode: 0o755 });
chmodSync(process.argv[3], 0o755);
JS
CCNG_VERSION=$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).version' "$CCNG_INSTALL_DIR/package.json")
echo "Installed Command Center NG $CCNG_VERSION into $CCNG_INSTALL_DIR"
echo "Launcher: $CCNG_BIN_DIR/command-center-ng"
echo 'If not set during installation, set your password with:'
echo "  node '$CCNG_INSTALL_DIR/server/password.mjs'"
echo 'Start: command-center-ng --host 127.0.0.1 --port 4242'
echo 'The Codex CLI must already be installed, signed in, and its daemon running.'
