# Sourced by install.sh; prerequisite changes always require terminal approval.

ccng_confirm() {
    [ "$CCNG_CHECK_ONLY" -eq 0 ] && [ -t 0 ] || return 1
    printf '%s [y/N]: ' "$1"
    IFS= read -r CCNG_APPROVAL || return 1
    case "$CCNG_APPROVAL" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

ccng_detect_platform() {
    CCNG_PLATFORM=$(if [ -r /etc/os-release ]; then . /etc/os-release; printf '%s:%s' "${ID:-unknown}" "${VERSION_ID:-unknown}"; else printf 'unknown:unknown'; fi)
    case "$CCNG_PLATFORM" in
        rhel:9|rhel:9.*) CCNG_RHEL9=1; echo 'Platform: RHEL 9 (supported setup target).' ;;
        *) CCNG_RHEL9=0; echo 'Platform: other Linux distribution (not yet tested). Automatic RPM setup is available only on RHEL 9.' ;;
    esac
}

ccng_rpm_install() {
    [ "$#" -gt 0 ] || return 0
    printf 'Required RPM packages:'; printf ' %s' "$@"; printf '\n'
    printf 'Proposed command: sudo dnf install'; printf ' %s' "$@"; printf '\n'
    if [ "$CCNG_RHEL9" -ne 1 ] || ! command -v sudo >/dev/null 2>&1 || ! command -v dnf >/dev/null 2>&1; then
        echo 'Install these prerequisites with your administrator; no system changes were made.' >&2
        return 1
    fi
    ccng_confirm 'Install these RPMs with sudo now? DNF will show its transaction for confirmation.' || { echo 'RPM installation was not approved.' >&2; return 1; }
    sudo dnf install "$@"
}

ccng_system_prerequisites() {
    ccng_detect_platform
    CCNG_RPMS=''
    for CCNG_TOOL in realpath dirname mktemp mkdir mv cp rm chmod sha256sum; do
        command -v "$CCNG_TOOL" >/dev/null 2>&1 || CCNG_RPMS='coreutils'
    done
    for CCNG_TOOL in bash git tar gzip; do
        command -v "$CCNG_TOOL" >/dev/null 2>&1 || CCNG_RPMS="$CCNG_RPMS $CCNG_TOOL"
    done
    if [ "$CCNG_RHEL9" -eq 1 ] && ! rpm -q ca-certificates >/dev/null 2>&1; then CCNG_RPMS="$CCNG_RPMS ca-certificates"; fi
    if [ -n "$CCNG_RPMS" ]; then
        # Package names come only from the fixed list above.
        ccng_rpm_install $CCNG_RPMS || return 1
    fi
    for CCNG_TOOL in realpath dirname mktemp mkdir mv cp rm chmod sha256sum bash git tar gzip; do
        command -v "$CCNG_TOOL" >/dev/null 2>&1 || { echo "Still missing: $CCNG_TOOL. Check PATH and rerun the installer." >&2; return 1; }
    done
    if ! command -v node >/dev/null 2>&1 || ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)' >/dev/null 2>&1; then
        echo 'Node.js 22.12 or newer is required.'
        echo 'RHEL 9 command: sudo dnf module install nodejs:22/common'
        echo 'For an already enabled older stream, review sudo dnf module switch-to nodejs:22/common with your administrator.'
        if [ "$CCNG_RHEL9" -ne 1 ] || ! command -v sudo >/dev/null 2>&1 || ! command -v dnf >/dev/null 2>&1 || ! ccng_confirm 'Offer the Node.js 22 module install now? Existing stream conflicts will stop without a reset.'; then
            echo 'A suitable Node.js installation is still required; no stream was reset or replaced.' >&2; return 1
        fi
        sudo dnf module install nodejs:22/common || { echo 'Node.js installation failed. Resolve the reported repository or module-stream issue before retrying.' >&2; return 1; }
    fi
    command -v node >/dev/null 2>&1 && node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)' || { echo 'PATH still selects an unsupported Node.js version.' >&2; return 1; }
    if ! command -v npm >/dev/null 2>&1; then ccng_rpm_install npm || return 1; fi
    command -v npm >/dev/null 2>&1 && npm --version >/dev/null 2>&1 || { echo 'npm is missing or cannot run with this Node.js. Repair it before retrying.' >&2; return 1; }
    printf 'Node.js: '; node --version
    printf 'npm: '; npm --version
}

ccng_cli_install() {
    CCNG_CLI_PACKAGE=$1
    if [ "$CCNG_CHECK_ONLY" -eq 1 ]; then echo "Missing CLI package: $CCNG_CLI_PACKAGE" >&2; return 1; fi
    printf 'Proposed user-local installation: npm install --prefix "%s/tools" --no-fund --no-audit %s\n' "$CCNG_INSTALL_DIR" "$CCNG_CLI_PACKAGE"
    echo 'The CLI stays under your chosen installation target; existing global tools are left in place.'
    ccng_confirm "Install $CCNG_CLI_PACKAGE now?" || { echo "Install the required CLI first: $CCNG_CLI_PACKAGE" >&2; return 1; }
    npm install --prefix "$CCNG_STAGE/app/tools" --no-fund --no-audit "$CCNG_CLI_PACKAGE"
}

ccng_codex_install() {
    CCNG_CODEX_PREFIX=${CCNG_CODEX_PREFIX:-${CCNG_USER_HOME:-$HOME}/.local}
    case "$CCNG_CODEX_PREFIX" in *:*|*[[:cntrl:]]*) echo 'The Codex prefix cannot contain colon or control characters because it is used in PATH.' >&2; return 1 ;; esac
    [ "$CCNG_CHECK_ONLY" -eq 0 ] || { echo 'Missing CLI package: @openai/codex@0.167.0' >&2; return 1; }
    printf 'Proposed per-user Codex installation: npm install --global --prefix "%s" --no-fund --no-audit @openai/codex@0.167.0\n' "$CCNG_CODEX_PREFIX"
    echo 'Codex is independent of the application directory; existing Codex installations and sign-in settings are preserved.'
    ccng_confirm 'Install @openai/codex@0.167.0 for this user now?' || return 1
    CCNG_CODEX_PARENT=$CCNG_CODEX_PREFIX
    while [ ! -e "$CCNG_CODEX_PARENT" ]; do CCNG_CODEX_PARENT=$(dirname "$CCNG_CODEX_PARENT"); done
    [ -d "$CCNG_CODEX_PARENT" ] && [ -w "$CCNG_CODEX_PARENT" ] || { echo 'The Codex prefix must be a directory writable by this account; no sudo is used.' >&2; return 1; }
    npm install --global --prefix "$CCNG_CODEX_PREFIX" --no-fund --no-audit '@openai/codex@0.167.0' || return 1
    PATH="$CCNG_CODEX_PREFIX/bin:$PATH"; export PATH
}

ccng_agent_prerequisites() {
    if ! command -v bd >/dev/null 2>&1; then ccng_cli_install '@beads/bd@1.3.2' || return 1; fi
    node "$CCNG_SOURCE_DIR/server/beads-check.mjs" || { echo 'Existing Beads is incompatible; review its upgrade and database requirements before retrying.' >&2; return 1; }
    if ! command -v codex >/dev/null 2>&1; then
        if ! ccng_codex_install; then
            CCNG_CODEX_PENDING=1
            echo 'Warning: Codex installation was declined or failed; Command Center installation will continue. Install a compatible Codex before using Codex agents.' >&2
            return 0
        fi
    fi
    if command -v codex >/dev/null 2>&1; then
        CCNG_CODEX_BIN=$(realpath -m "$(dirname "$(command -v codex)")")
        case "$CCNG_CODEX_BIN" in *:*|*[[:cntrl:]]*)
            CCNG_CODEX_BIN="${CCNG_CODEX_PREFIX:-${CCNG_USER_HOME:-$HOME}/.local}/bin"; CCNG_CODEX_PENDING=1
            echo 'Warning: the existing Codex directory cannot be represented safely in PATH; installation will continue without changing it.' >&2
            return 0 ;;
        esac
    fi
    if ! command -v codex >/dev/null 2>&1 || ! codex --version; then
        CCNG_CODEX_PENDING=1
        echo 'Warning: Codex is unavailable; Command Center installation will continue. Install a compatible Codex before using Codex agents.' >&2
        return 0
    fi
    if ! codex app-server daemon --help >/dev/null 2>&1; then
        CCNG_CODEX_PENDING=1
        echo 'Warning: this Codex lacks the native app-server daemon; Command Center installation will continue. Upgrade Codex before using Codex agents.' >&2
        return 0
    fi
    if ! codex login status >/dev/null 2>&1; then
        echo 'Codex is not signed in. This is separate from your Command Center application password.'
        echo 'Browser sign-in (codex login) is recommended. Device-code login is optional and may be disabled by your organization.'
        echo 'For browser sign-in on an SSH/headless host, first forward the callback from your computer (default port 1455):'
        echo '  ssh -L 1455:localhost:1455 user@remote'
        echo 'Open the URL printed by codex login in your local browser. You can skip now and sign in later.'
        if ccng_confirm 'Sign in to Codex now?'; then
            echo '1) Browser (recommended, default): codex login'
            echo '2) Device code (beta; requires permission in your personal/workspace settings): codex login --device-auth'
            echo '3) Skip for now'
            printf 'Choose [1/2/3, default 1]: '
            IFS= read -r CCNG_LOGIN_CHOICE || CCNG_LOGIN_CHOICE=3
            case "$CCNG_LOGIN_CHOICE" in
                ''|1) codex login || echo 'Codex browser login did not complete; retry codex login after installation.' >&2 ;;
                2) codex login --device-auth || echo 'Codex device-code login did not complete; your organization may disallow it. Retry codex login after installation.' >&2 ;;
                3) : ;;
                *) echo 'Unrecognized sign-in choice; sign-in was skipped.' >&2 ;;
            esac
        fi
        if ! codex login status >/dev/null 2>&1; then
            CCNG_LOGIN_PENDING=1
            echo 'Application installation can finish, but agent operation still requires codex login.' >&2
            return 0
        fi
    fi
    echo 'Codex sign-in: available. Authentication values were not displayed.'
}

ccng_environment_report() {
    ccng_detect_platform
    CCNG_PROBLEMS=0
    for CCNG_TOOL in bash git tar gzip realpath dirname mktemp mkdir mv cp rm chmod sha256sum node npm bd; do
        if command -v "$CCNG_TOOL" >/dev/null 2>&1; then printf '[available] %s\n' "$CCNG_TOOL"; else printf '[missing] %s\n' "$CCNG_TOOL"; CCNG_PROBLEMS=1; fi
    done
    if command -v node >/dev/null 2>&1; then
        if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)'; then echo '[unsupported] Node.js must be at least 22.12.'; CCNG_PROBLEMS=1; fi
        if command -v bd >/dev/null 2>&1; then node "$CCNG_SOURCE_DIR/server/beads-check.mjs" || CCNG_PROBLEMS=1; fi
    fi
    if command -v npm >/dev/null 2>&1 && ! npm --version >/dev/null 2>&1; then echo '[unavailable] npm cannot run.'; CCNG_PROBLEMS=1; fi
    if command -v codex >/dev/null 2>&1; then
        echo '[available] codex'
        codex app-server daemon --help >/dev/null 2>&1 || echo '[warning] Codex lacks the native app-server daemon; upgrade it before using Codex agents.'
        codex login status >/dev/null 2>&1 || echo '[warning] Codex is not signed in; run codex login before using Codex agents. Optional device-code login requires permission in your personal/workspace settings.'
    else
        echo '[warning] Codex is missing; installation can continue, but Codex agents need a compatible Codex installation.'
    fi
    if [ "$CCNG_RHEL9" -eq 1 ] && ! rpm -q ca-certificates >/dev/null 2>&1; then echo '[missing RPM] ca-certificates'; CCNG_PROBLEMS=1; fi
    if command -v dolt >/dev/null 2>&1; then echo '[available] Dolt server binary'; else echo '[not installed] Dolt server binary (needed for the multi-writer server setup).'; fi
    if command -v bd >/dev/null 2>&1 && command -v ccng_beads_existing >/dev/null 2>&1; then
        if ccng_beads_existing "${CCNG_TASK_WORKSPACE:-$CCNG_INITIAL_WORK_DIR}"; then
            echo '[available] Beads tracker for the selected workspace (existing configuration preserved).'
        else
            echo '[not ready] No usable tracker was resolved. Fresh setup needs an explicitly selected --workspace and terminal confirmation.'
            CCNG_PROBLEMS=1
        fi
    fi
    return "$CCNG_PROBLEMS"
}
