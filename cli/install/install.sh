#!/bin/sh
# appt-scenario installer for Linux/macOS.
#   curl -fsSL <install-url> | sh      (ask shane.elliott@va.gov for the install URL)
# Installs into ./appt-cli (no sudo, no PATH changes). Re-running upgrades and keeps .env.
# Optionally adds an 'appts' command (a small launcher script in ~/.local/bin).
#
# Environment overrides:
#   APPT_CLI_BASE_URL   download folder (the release build fills in a default; a plain checkout has none)
#   VISTA_ACCESS_CODE / VISTA_VERIFY_CODE   write .env without prompting
#   APPT_CLI_NO_PROMPT  never prompt
#   APPT_CLI_LAUNCHER   1 = create the 'appts' command, 0 = skip it (default: ask)
#   APPT_CLI_BIN_DIR    where the 'appts' command goes (default ~/.local/bin)
#   APPT_CLI_NODE       node executable to check (default: node)
set -eu

# Filled in by scripts/build-package.ps1 from cli/release.local.json (never committed).
DEFAULT_BASE_URL=""
BASE_URL="${APPT_CLI_BASE_URL:-$DEFAULT_BASE_URL}"
BASE_URL="${BASE_URL%/}"
NODE_BIN="${APPT_CLI_NODE:-node}"
PKG="appt-cli.tar.gz"
MIN_MAJOR=18
MIN_MINOR=3
TMP=""

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "$BASE_URL" ] || die "No download location. Set APPT_CLI_BASE_URL, or ask shane.elliott@va.gov for the install command."

cleanup() {
  if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
}
on_signal() {
  stty echo </dev/tty 2>/dev/null || true
  exit 130
}
trap cleanup EXIT
trap on_signal INT TERM

# A folder we cannot write to (for example / or a system directory): use the home folder instead.
BASE_DIR="$PWD"
if [ ! -w "$BASE_DIR" ]; then
  if [ -z "${HOME:-}" ] || [ ! -w "$HOME" ]; then
    die "Cannot write to $PWD and there is no writable home folder. Run this from a folder you own, for example: cd ~"
  fi
  say "Cannot write to $PWD; installing into $HOME instead."
  BASE_DIR="$HOME"
fi
TARGET="$BASE_DIR/appt-cli"
if [ "$BASE_DIR" = "$PWD" ]; then SCRIPT_HINT="appt-cli/bin/appt-scenario.js"; else SCRIPT_HINT="$TARGET/bin/appt-scenario.js"; fi

# ---- prerequisites ----
if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  die "Node.js $MIN_MAJOR.$MIN_MINOR or later is required but 'node' was not found.
  Install it, for example:
    Amazon Linux / RHEL:  sudo dnf install -y nodejs
    Debian / Ubuntu:      sudo apt-get install -y nodejs
  Then run this installer again."
fi
NODE_VERSION=$("$NODE_BIN" -v 2>/dev/null || true)
ver=${NODE_VERSION#v}
major=${ver%%.*}
rest=${ver#*.}
minor=${rest%%.*}
case "$major$minor" in
  ''|*[!0-9]*) die "Could not read the Node.js version (got '$NODE_VERSION')." ;;
esac
if [ "$major" -lt "$MIN_MAJOR" ] || { [ "$major" -eq "$MIN_MAJOR" ] && [ "$minor" -lt "$MIN_MINOR" ]; }; then
  die "Node.js $MIN_MAJOR.$MIN_MINOR or later is required; found $NODE_VERSION. Upgrade Node.js and run this installer again."
fi

for tool in curl tar mktemp awk; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but was not found."
done
if command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
else
  die "'sha256sum' or 'shasum' is required to verify the download."
fi

# ---- download and verify ----
TMP=$(mktemp -d "$BASE_DIR/.appt-cli-install.XXXXXX") || die "Cannot write to $BASE_DIR."
say "Downloading $BASE_URL/$PKG"
curl -fsSL "$BASE_URL/$PKG" -o "$TMP/$PKG" || die "Download failed: $BASE_URL/$PKG"
curl -fsSL "$BASE_URL/$PKG.sha256" -o "$TMP/$PKG.sha256" || die "Checksum download failed: $BASE_URL/$PKG.sha256 (refusing to install an unverified package)."

expected=$(awk 'NR==1 { print tolower($1) }' "$TMP/$PKG.sha256")
actual=$($SHA_CMD "$TMP/$PKG" | awk '{ print tolower($1) }')
[ -n "$expected" ] || die "The published checksum file is empty."
if [ "$expected" != "$actual" ]; then
  die "Checksum mismatch for $PKG (expected $expected, got $actual). Nothing was installed."
fi
say "Checksum OK"

# ---- extract and swap in ----
mkdir "$TMP/new"
tar -xzf "$TMP/$PKG" -C "$TMP/new" || die "Could not extract $PKG."
[ -f "$TMP/new/bin/appt-scenario.js" ] || die "Package is missing bin/appt-scenario.js. Nothing was installed."

UPGRADE=0
KEPT_ENV=0
if [ -e "$TARGET" ]; then
  UPGRADE=1
  mv "$TARGET" "$TMP/old" || die "Could not replace the existing install at $TARGET."
fi
if ! mv "$TMP/new" "$TARGET"; then
  if [ "$UPGRADE" = 1 ]; then mv "$TMP/old" "$TARGET"; fi
  die "Could not install into $TARGET."
fi
if [ "$UPGRADE" = 1 ] && [ -f "$TMP/old/.env" ]; then
  cp -p "$TMP/old/.env" "$TARGET/.env"
  KEPT_ENV=1
fi
chmod +x "$TARGET/bin/appt-scenario.js"

# ---- credentials ----
read_secret() {
  stty -echo </dev/tty 2>/dev/null || true
  IFS= read -r SECRET </dev/tty || SECRET=""
  stty echo </dev/tty 2>/dev/null || true
  printf '\n' >/dev/tty
}

write_env() {
  # $1 = access code, $2 = verify code (both may be empty -> plain sample copy)
  [ -f "$TARGET/.env.sample" ] || die "Package is missing .env.sample."
  (
    umask 077
    if [ -n "$1" ] && [ -n "$2" ]; then
      ACCESS="$1" VERIFY="$2" awk '
        /^VISTA_ACCESS_CODE=/ { print "VISTA_ACCESS_CODE=" ENVIRON["ACCESS"]; next }
        /^VISTA_VERIFY_CODE=/ { print "VISTA_VERIFY_CODE=" ENVIRON["VERIFY"]; next }
        { print }' "$TARGET/.env.sample" > "$TARGET/.env"
    else
      cp "$TARGET/.env.sample" "$TARGET/.env"
    fi
  )
  chmod 600 "$TARGET/.env"
}

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$TARGET/package.json" | head -n 1)

# ---- optional 'appts' command ----
LAUNCHER_MARK="# appt-scenario launcher"
LAUNCHER_NOTE=""
RUN_CMD=""

install_launcher() {
  bin_dir="${APPT_CLI_BIN_DIR:-${HOME:-}/.local/bin}"
  [ -n "$bin_dir" ] && [ "$bin_dir" != "/.local/bin" ] || return 0
  launcher="$bin_dir/appts"
  want=""
  if [ -f "$launcher" ] && grep -q "$LAUNCHER_MARK" "$launcher" 2>/dev/null; then
    want=1
  elif [ -e "$launcher" ]; then
    LAUNCHER_NOTE="Left the existing $launcher alone (it was not created by this installer)."
    return 0
  fi
  case "${APPT_CLI_LAUNCHER:-}" in
    0) return 0 ;;
    1) want=1 ;;
    *)
      if [ -z "$want" ] && [ -z "${APPT_CLI_NO_PROMPT:-}" ] && ( : </dev/tty ) 2>/dev/null; then
        printf "Create an 'appts' command in %s so you can type 'appts osm'? [Y/n] " "$bin_dir" >/dev/tty
        answer=""
        read -r answer </dev/tty || answer="n"
        case "$answer" in [nN]*) ;; *) want=1 ;; esac
      fi
      ;;
  esac
  [ -n "$want" ] || return 0

  quoted=$(printf '%s' "$TARGET/bin/appt-scenario.js" | sed "s/'/'\\\\''/g")
  if mkdir -p "$bin_dir" 2>/dev/null && {
    printf '#!/bin/sh\n'
    printf '%s\n' "$LAUNCHER_MARK"
    printf "exec node '%s' \"\$@\"\n" "$quoted"
  } > "$launcher" 2>/dev/null && chmod +x "$launcher"; then
    LAUNCHER_NOTE="Created the 'appts' command: $launcher"
    RUN_CMD="appts"
    case ":$PATH:" in
      *":$bin_dir:"*) ;;
      *)
        LAUNCHER_NOTE="$LAUNCHER_NOTE
  $bin_dir is not on your PATH yet. Add it (and put the line in ~/.bashrc):
    export PATH=\"$bin_dir:\$PATH\""
        RUN_CMD="$launcher"
        ;;
    esac
  else
    LAUNCHER_NOTE="Could not create $launcher; use: node $TARGET/bin/appt-scenario.js"
  fi
}

if [ "$KEPT_ENV" = 1 ]; then
  CRED_NOTE="Kept your existing $TARGET/.env."
else
  ac="${VISTA_ACCESS_CODE:-}"
  vc="${VISTA_VERIFY_CODE:-}"
  if { [ -z "$ac" ] || [ -z "$vc" ]; } && [ -z "${APPT_CLI_NO_PROMPT:-}" ] && ( : </dev/tty ) 2>/dev/null; then
    ac=""
    vc=""
    printf 'Enter your VistA access/verify codes now? [Y/n] ' >/dev/tty
    answer=""
    read -r answer </dev/tty || answer="n"
    case "$answer" in
      [nN]*) ;;
      *)
        printf 'Access code: ' >/dev/tty
        read_secret
        ac="$SECRET"
        printf 'Verify code: ' >/dev/tty
        read_secret
        vc="$SECRET"
        SECRET=""
        ;;
    esac
  fi
  if [ -n "$ac" ] && [ -n "$vc" ]; then
    write_env "$ac" "$vc"
    CRED_NOTE="Wrote $TARGET/.env (readable only by you)."
  else
    write_env "" ""
    CRED_NOTE="Created $TARGET/.env without codes. Edit it and set VISTA_ACCESS_CODE and VISTA_VERIFY_CODE."
  fi
  ac=""
  vc=""
fi

install_launcher

say ""
if [ "$UPGRADE" = 1 ]; then say "Updated appt-cli ${VERSION:-} in $TARGET"; else say "Installed appt-cli ${VERSION:-} in $TARGET"; fi
say "$CRED_NOTE"
if [ -n "$LAUNCHER_NOTE" ]; then say "$LAUNCHER_NOTE"; fi
say ""
say "Next:"
if [ -n "$RUN_CMD" ]; then
  say "  $RUN_CMD --check     # test the connection"
  say "  $RUN_CMD --help      # list scenarios"
else
  say "  node $SCRIPT_HINT --check     # test the connection"
  say "  node $SCRIPT_HINT --help      # list scenarios"
fi
