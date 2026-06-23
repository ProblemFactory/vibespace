#!/bin/bash
set -e

# VibeSpace — One-line installer
# Usage: curl -fsSL <url>/install.sh | bash
#   or:  bash install.sh

PORT="${PORT:-3456}"
DEFAULT_DIR="$HOME/vibespace"
LEGACY_DIR="$HOME/claude-code-webui"   # pre-rename install location
OLD_REMOTE_SLUG="ProblemFactory/claude-code-webui"
NEW_REMOTE_SLUG="ProblemFactory/vibespace"

echo ""
echo "  VibeSpace Installer"
echo "  ==================="
echo ""

# Point an existing checkout's git remote at the renamed repo. GitHub redirects
# the old URL, but updating it makes future pulls explicit and future-proof.
normalize_remote() {
  [ -d ".git" ] || return 0
  local url
  url=$(git remote get-url origin 2>/dev/null) || return 0
  case "$url" in
    *"$OLD_REMOTE_SLUG"*)
      git remote set-url origin "${url/$OLD_REMOTE_SLUG/$NEW_REMOTE_SLUG}"
      echo "  → Updated git remote to the renamed repo (vibespace)"
      ;;
  esac
}

# Seamless migration: project was renamed Claude Code WebUI → VibeSpace. If a
# legacy install exists at ~/claude-code-webui and there's no ~/vibespace yet,
# update that install IN PLACE (keep its folder name + all data) instead of
# cloning a fresh copy. The folder is deliberately NOT renamed — dtach session
# sockets are bound to absolute paths, so moving the folder would orphan any
# running sessions. Everything else (data/, localStorage) is name-independent.
if [ ! -d "$DEFAULT_DIR" ] && [ -f "$LEGACY_DIR/server.js" ]; then
  echo "  ℹ  Found a pre-rename install at $LEGACY_DIR — it will be updated in place."
  echo "     Sessions, layouts, drafts and settings are preserved (folder name unchanged)."
  echo ""
  DEFAULT_DIR="$LEGACY_DIR"
fi

# Ask user to confirm install location (read from /dev/tty for curl|bash compat)
printf "  Install location [%s]: " "$DEFAULT_DIR"
if read -r USER_DIR < /dev/tty 2>/dev/null; then
  INSTALL_DIR="${USER_DIR:-$DEFAULT_DIR}"
else
  INSTALL_DIR="$DEFAULT_DIR"
fi
# Expand ~ manually
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"
echo "  → $INSTALL_DIR"
echo ""

# ── Check prerequisites ──

# Node.js 18+
if ! command -v node &>/dev/null; then
  echo "  [!] Node.js not found. Please install Node.js 18+:"
  echo "      macOS:         brew install node"
  echo "      Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs"
  echo "      Fedora/RHEL:   sudo dnf install nodejs"
  echo "      Or visit:      https://nodejs.org/"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "  [!] Node.js 18+ required (found v$(node -v))"
  exit 1
fi
echo "  [OK] Node.js $(node -v)"

# dtach
if ! command -v dtach &>/dev/null; then
  echo "  [!] dtach not found. Installing..."
  if [[ "$OSTYPE" == darwin* ]] && command -v brew &>/dev/null; then
    brew install dtach </dev/null
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y dtach </dev/null
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y dtach </dev/null
  elif command -v yum &>/dev/null; then
    sudo yum install -y dtach </dev/null
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm dtach </dev/null
  elif [[ "$OSTYPE" == darwin* ]]; then
    echo "      Please install Homebrew first: https://brew.sh"
    echo "      Then run: brew install dtach"
    exit 1
  else
    echo "      Please install dtach manually:"
    echo "        macOS:        brew install dtach"
    echo "        Ubuntu/Debian: sudo apt install dtach"
    echo "        Fedora/RHEL:  sudo dnf install dtach"
    echo "        Arch:         sudo pacman -S dtach"
    exit 1
  fi
fi
echo "  [OK] dtach"

# Claude CLI
if ! command -v claude &>/dev/null; then
  echo "  [!] Claude CLI not found."
  echo "      Install via: npm install -g @anthropic-ai/claude-code"
  echo "      Then run: claude (to complete setup/login)"
  exit 1
fi
echo "  [OK] Claude CLI found"

# ── Install ──

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/server.js" ]; then
  echo ""
  echo "  Existing installation found at $INSTALL_DIR"
  echo "  Updating..."
  cd "$INSTALL_DIR"
  normalize_remote
  if [ -d ".git" ]; then git pull --ff-only 2>/dev/null || true; fi
else
  echo ""
  echo "  Installing to $INSTALL_DIR ..."

  # If running from within the project directory (has server.js), use it
  if [ -f "server.js" ] && [ -f "package.json" ]; then
    if [ "$(pwd)" != "$INSTALL_DIR" ]; then
      mkdir -p "$INSTALL_DIR"
      cp -r . "$INSTALL_DIR/"
    fi
    cd "$INSTALL_DIR"
  elif command -v git &>/dev/null; then
    echo "  Cloning from GitHub..."
    git clone https://github.com/ProblemFactory/vibespace.git "$INSTALL_DIR" </dev/null
    cd "$INSTALL_DIR"
  else
    echo "  [!] git not found. Install git or download manually:"
    echo "      https://github.com/ProblemFactory/vibespace"
    exit 1
  fi
fi

# macOS: ensure Xcode command line tools for native compilation (node-pty)
if [[ "$OSTYPE" == darwin* ]]; then
  if ! xcode-select -p &>/dev/null; then
    echo "  Installing Xcode Command Line Tools (required for native modules)..."
    xcode-select --install </dev/null 2>/dev/null
    echo "  [!] Xcode CLT install dialog opened. Complete it, then re-run this script."
    exit 1
  fi
fi

echo "  Installing dependencies..."
npm install --no-fund --no-audit </dev/null 2>&1 | tail -3

# Rebuild native modules for current platform (needed if switching OS or node version)
echo "  Building native modules..."
npm rebuild node-pty --build-from-source </dev/null 2>&1 | tail -1

echo "  Building frontend..."
npm run build 2>&1 | tail -1

# Create data directories
mkdir -p data/sockets data/session-meta data/session-buffers data/bin

echo ""
echo "  ✅ Installation complete!"
echo ""
echo "  To start:"
echo "    cd $INSTALL_DIR"
echo "    npm start"
echo ""
echo "  Then open http://localhost:${PORT} in your browser."
echo ""
echo "  Tips:"
echo "    - Set PORT=xxxx to use a different port"
echo "    - Sessions persist across server restarts"
echo "    - Press Ctrl+C to stop the server (sessions keep running)"
echo ""
