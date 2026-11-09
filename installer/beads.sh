# Native Beads owns its shared Dolt server; CCNG only offers initial setup.

ccng_beads_existing() {
    (cd "$1" && BEADS_DOLT_AUTO_START=0 bd --readonly where --json >/dev/null 2>&1)
}

ccng_beads_custom_configuration() {
    # An unsuccessful lookup is not permission to overwrite a partial tracker,
    # redirect, parent tracker, or an existing connection/credential selection.
    CCNG_BEADS_PARENT=$1
    while :; do
        if [ -e "$CCNG_BEADS_PARENT/.beads" ] || [ -L "$CCNG_BEADS_PARENT/.beads" ]; then
            # Native bd creates home telemetry before a tracker exists. Preserve
            # that exact layout without mistaking it for workspace routing.
            # Rationale: ../docs/ansible-deployment.md#existing-target-prerequisites
            [ "$CCNG_BEADS_PARENT" = "$HOME" ] &&
                [ ! -L "$HOME/.beads" ] &&
                [ -f "$HOME/.beads/machine-id" ] && [ ! -L "$HOME/.beads/machine-id" ] &&
                [ -d "$HOME/.beads/eventsData" ] && [ ! -L "$HOME/.beads/eventsData" ] || return 0
            CCNG_BEADS_OTHER=$(find "$HOME/.beads" -mindepth 1 -maxdepth 1 \
                ! -name machine-id ! -name eventsData -print -quit) || return 0
            [ -z "$CCNG_BEADS_OTHER" ] || return 0
        fi
        [ "$CCNG_BEADS_PARENT" != / ] || break
        CCNG_BEADS_PARENT=$(dirname "$CCNG_BEADS_PARENT")
    done
    [ ! -e "${XDG_CONFIG_HOME:-$HOME/.config}/beads/config.yaml" ] || return 0
    node -e 'process.exit(Object.keys(process.env).some(key => /^(BEADS_(DIR|DB|DOLT_.*|CREDENTIALS_FILE|CONFIG)|BD_(DB|CONFIG))$/.test(key) && process.env[key]) ? 0 : 1)'
}

ccng_dolt_install() {
    if command -v dolt >/dev/null 2>&1; then
        dolt version && dolt sql-server --help >/dev/null 2>&1
        return $?
    fi
    [ "$CCNG_CHECK_ONLY" -eq 0 ] || return 1
    case "$(uname -m)" in
        x86_64|amd64) CCNG_DOLT_ARCH=amd64; CCNG_DOLT_SHA=1f7ad8c2622995789420a3fb0f2d16b4aa7430000a825dd91d5938f36480cbf6 ;;
        aarch64|arm64) CCNG_DOLT_ARCH=arm64; CCNG_DOLT_SHA=a49a566d7c1ee9fdff553644855737f9d87047557c1ce1951aa7e7053277f4af ;;
        *) echo 'No pinned Dolt binary is provided for this CPU. Install a compatible Dolt first.' >&2; return 1 ;;
    esac
    echo 'Fresh setup uses Dolt 2.2.0, the standalone version pinned by Beads 1.3.2.'
    echo "Proposed installation: verified official Linux $CCNG_DOLT_ARCH archive into $CCNG_INSTALL_DIR/tools/bin/dolt"
    ccng_confirm 'Download and install this user-local Dolt binary?' || return 1
    if ! command -v curl >/dev/null 2>&1; then ccng_rpm_install curl || return 1; fi
    CCNG_DOLT_DOWNLOAD=$(mktemp -d "$CCNG_STAGE/dolt.XXXXXXXX") || return 1
    if ! (
        set -eu
        cd "$CCNG_DOLT_DOWNLOAD" || exit 1
        curl --fail --location --proto '=https' --tlsv1.2 \
            "https://github.com/dolthub/dolt/releases/download/v2.2.0/dolt-linux-$CCNG_DOLT_ARCH.tar.gz" -o dolt.tar.gz || exit 1
        printf '%s  dolt.tar.gz\n' "$CCNG_DOLT_SHA" | sha256sum -c - || exit 1
        tar -xzf dolt.tar.gz "dolt-linux-$CCNG_DOLT_ARCH/bin/dolt" || exit 1
        [ ! -L "dolt-linux-$CCNG_DOLT_ARCH/bin/dolt" ] || exit 1
        [ ! -L "$CCNG_INSTALL_DIR/tools/bin" ] || exit 1
        mkdir -p "$CCNG_INSTALL_DIR/tools/bin" || exit 1
        [ ! -e "$CCNG_INSTALL_DIR/tools/bin/dolt" ] || exit 1
        cp "dolt-linux-$CCNG_DOLT_ARCH/bin/dolt" "$CCNG_INSTALL_DIR/tools/bin/dolt" || exit 1
        chmod 755 "$CCNG_INSTALL_DIR/tools/bin/dolt" || exit 1
    ); then
        rm -rf -- "$CCNG_DOLT_DOWNLOAD"
        echo 'Dolt installation failed; fresh Beads setup was not started.' >&2
        return 1
    fi
    rm -rf -- "$CCNG_DOLT_DOWNLOAD"
    PATH="$CCNG_INSTALL_DIR/tools/bin:$PATH"; export PATH
    dolt version && dolt sql-server --help >/dev/null 2>&1
}

ccng_beads_setup_later() {
    echo 'The application is installed; existing Beads/Dolt setup state was preserved.'
    echo 'To finish task setup later, use the same ordinary account (no sudo). Choose your intended workspace directory; this is an example:'
    # Match the installer's shell-quoted commands; this only prints guidance.
    node --input-type=module - "${CCNG_SOURCE_DIR:-.}/install.sh" "$CCNG_INSTALL_DIR" <<'JS'
import { writeSync } from 'node:fs';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
writeSync(1, [
    '  export PATH=' + quote(process.argv[3] + '/tools/bin') + ':' + quote(process.argv[3] + '/tools/node_modules/.bin') + ':"$PATH"',
    '  mkdir -p "$HOME/ccng-wd"',
    '  sh ' + quote(process.argv[2]) + ' --workspace "$HOME/ccng-wd" --prefix ' + quote(process.argv[3]),
].join('\n') + '\n');
JS
    echo 'Rerunning the existing installer offers tracker initialization for confirmation. It preserves this installation directory and existing tracker/server settings.'
}

ccng_beads_setup() {
    [ "$CCNG_CHECK_ONLY" -eq 0 ] || return 0
    if [ -z "${CCNG_TASK_WORKSPACE:-}" ]; then
        if ccng_beads_existing "$CCNG_INITIAL_WORK_DIR"; then
            echo 'Existing Beads tracker found for the invoking workspace; its data and server settings were preserved.'
            return 0
        fi
        if [ -t 0 ]; then
            printf 'Enter an existing workspace DIRECTORY PATH (not yes/no; e.g. /home/your-user/ccng-wd; blank to set up later): '
            IFS= read -r CCNG_TASK_WORKSPACE || CCNG_TASK_WORKSPACE=''
        fi
    fi
    if [ -z "${CCNG_TASK_WORKSPACE:-}" ]; then
        CCNG_BEADS_SETUP_PENDING=1
        echo 'Beads setup pending: rerun the installer with --workspace DIRECTORY to select a task workspace.'
        ccng_beads_setup_later
        return 0
    fi
    CCNG_TASK_WORKSPACE=$(realpath "$CCNG_TASK_WORKSPACE") || { echo 'Enter an existing directory path, not yes/no. Create the intended workspace first, then rerun with --workspace.' >&2; ccng_beads_setup_later; return 1; }
    [ -d "$CCNG_TASK_WORKSPACE" ] || { echo 'The Beads task workspace must be an existing directory path, not yes/no. Create the intended directory first, then rerun with --workspace.' >&2; ccng_beads_setup_later; return 1; }
    if ccng_beads_existing "$CCNG_TASK_WORKSPACE"; then
        echo 'Existing Beads tracker found; no initialization, migration, server restart or configuration change was performed.'
        return 0
    fi
    if ccng_beads_custom_configuration "$CCNG_TASK_WORKSPACE"; then
        CCNG_BEADS_SETUP_PENDING=1
        echo 'Existing Beads configuration or routing needs review; fresh setup was skipped without changing it.' >&2
        return 0
    fi
    echo "Proposed setup in $CCNG_TASK_WORKSPACE: bd init --shared-server --non-interactive --skip-agents --skip-hooks"
    echo 'Beads will create the workspace tracker and manage its private local shared Dolt server. Existing agent instructions and Git hooks are left in place.'
    if ! ccng_confirm 'Initialize this task workspace and start the native local Dolt server?'; then
        CCNG_BEADS_SETUP_PENDING=1
        echo 'Fresh Beads/Dolt setup was not approved; the application installation is available.'
        ccng_beads_setup_later
        return 0
    fi
    CCNG_BEADS_INIT_HELP=$(bd init --help) || return 1
    for CCNG_BEADS_FLAG in --shared-server --non-interactive --skip-agents --skip-hooks; do
        case "$CCNG_BEADS_INIT_HELP" in *"$CCNG_BEADS_FLAG"*) ;; *) echo 'This Beads version lacks the required safe initialization flags.' >&2; return 1 ;; esac
    done
    ccng_dolt_install || { CCNG_BEADS_SETUP_PENDING=1; echo 'Install Dolt, then rerun the installer with the selected --workspace.' >&2; return 0; }
    (
        umask 077
        cd "$CCNG_TASK_WORKSPACE"
        bd init --shared-server --non-interactive --skip-agents --skip-hooks &&
        BEADS_DOLT_AUTO_START=0 bd --readonly list --json --brief --flat --limit 1 >/dev/null
    ) || { echo 'Beads setup did not finish. Its state was preserved; inspect the error before retrying.' >&2; return 1; }
    echo 'Beads tracker initialized and its native local shared Dolt server verified.'
    echo 'Beads owns server startup/status/stop; no CCNG server wrapper or boot service was installed.'
}
