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

ccng_agent_prerequisites() {
    if ! command -v bd >/dev/null 2>&1; then ccng_cli_install '@beads/bd@1.3.2' || return 1; fi
    node "$CCNG_SOURCE_DIR/server/beads-check.mjs" || { echo 'Existing Beads is incompatible; review its upgrade and database requirements before retrying.' >&2; return 1; }
    if ! command -v codex >/dev/null 2>&1; then ccng_cli_install '@openai/codex@0.166.0' || return 1; fi
    codex --version || return 1
    codex app-server daemon --help >/dev/null 2>&1 || { echo 'This Codex version lacks the native app-server daemon. Install a compatible version before continuing.' >&2; return 1; }
    if ! codex login status >/dev/null 2>&1; then
        echo 'Codex is not signed in. The native device-code login can be completed from another browser.'
        if ccng_confirm 'Run codex login --device-auth now?'; then codex login --device-auth || echo 'Codex login did not complete; it can be retried after installation.' >&2; fi
        if ! codex login status >/dev/null 2>&1; then
            CCNG_LOGIN_PENDING=1
            echo 'Application installation can finish, but agent operation still requires codex login --device-auth.' >&2
            return 0
        fi
    fi
    echo 'Codex sign-in: available. Authentication values were not displayed.'
}

ccng_environment_report() {
    ccng_detect_platform
    CCNG_PROBLEMS=0
    for CCNG_TOOL in bash git tar gzip realpath dirname mktemp mkdir mv cp rm chmod sha256sum node npm bd codex; do
        if command -v "$CCNG_TOOL" >/dev/null 2>&1; then printf '[available] %s\n' "$CCNG_TOOL"; else printf '[missing] %s\n' "$CCNG_TOOL"; CCNG_PROBLEMS=1; fi
    done
    if command -v node >/dev/null 2>&1; then
        if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)'; then echo '[unsupported] Node.js must be at least 22.12.'; CCNG_PROBLEMS=1; fi
        if command -v bd >/dev/null 2>&1; then node "$CCNG_SOURCE_DIR/server/beads-check.mjs" || CCNG_PROBLEMS=1; fi
    fi
    if command -v npm >/dev/null 2>&1 && ! npm --version >/dev/null 2>&1; then echo '[unavailable] npm cannot run.'; CCNG_PROBLEMS=1; fi
    if command -v codex >/dev/null 2>&1; then
        codex app-server daemon --help >/dev/null 2>&1 || { echo '[unsupported] Codex app-server daemon is required.'; CCNG_PROBLEMS=1; }
        codex login status >/dev/null 2>&1 || { echo '[not signed in] Run codex login or codex login --device-auth.'; CCNG_PROBLEMS=1; }
    fi
    if [ "$CCNG_RHEL9" -eq 1 ] && ! rpm -q ca-certificates >/dev/null 2>&1; then echo '[missing RPM] ca-certificates'; CCNG_PROBLEMS=1; fi
    if command -v dolt >/dev/null 2>&1; then echo '[available] Dolt server binary'; else echo '[not installed] Dolt server binary (needed for the multi-writer server setup).'; fi
    return "$CCNG_PROBLEMS"
}
