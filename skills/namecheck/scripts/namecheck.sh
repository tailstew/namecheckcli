#!/usr/bin/env bash
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [[ -n "$dir" && "$dir" != "/" ]]; do
  if [[ -f "$dir/package.json" && -f "$dir/dist/cli.js" ]]; then
    if grep -q '"name": "namecheckcli"' "$dir/package.json" 2>/dev/null; then
      exec node "$dir/dist/cli.js" "$@"
    fi
  fi
  dir="$(dirname "$dir")"
done

if command -v namecheck >/dev/null 2>&1; then
  exec namecheck "$@"
fi

echo "namecheck CLI not found. Install with: npm install -g github:tailstew/namecheckcli" >&2
exit 1
