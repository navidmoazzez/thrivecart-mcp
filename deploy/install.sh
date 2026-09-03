#!/usr/bin/env bash
# Add thrivecart-mcp to Claude Code in one command.
#
#   curl -fsSL https://raw.githubusercontent.com/thenavidm/thrivecart-mcp-cli/main/deploy/install.sh | bash
#
# Reads THRIVECART_API_KEY from the environment, or prompts for it.
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing $1. Install it first." >&2; exit 1; }
}

need node
need npx

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  echo "Node 20 or newer required. Found $(node -v)." >&2
  exit 1
fi

key="${THRIVECART_API_KEY:-}"
if [ -z "$key" ]; then
  # Read from the terminal, not stdin, so this still works when piped from curl.
  printf 'ThriveCart API key (Settings > API & Webhooks): '
  read -r key < /dev/tty
fi

if [ -z "$key" ]; then
  echo "No API key given. Nothing to do." >&2
  exit 1
fi

echo "Checking the key..."
THRIVECART_API_KEY="$key" npx -y @thenavidm/thrivecart-mcp-cli@latest doctor || {
  echo "The key did not check out. Nothing was installed." >&2
  exit 1
}

if command -v claude >/dev/null 2>&1; then
  claude mcp add thrivecart \
    -e "THRIVECART_API_KEY=$key" \
    -- npx -y @thenavidm/thrivecart-mcp-cli@latest
  echo "Added. Run /mcp inside Claude Code to confirm."
else
  echo
  echo "Claude Code not found. Add this to your MCP client config:"
  echo
  cat <<JSON
{
  "mcpServers": {
    "thrivecart": {
      "command": "npx",
      "args": ["-y", "@thenavidm/thrivecart-mcp-cli@latest"],
      "env": { "THRIVECART_API_KEY": "$key" }
    }
  }
}
JSON
fi
