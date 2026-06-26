# namecheck CLI reference

## Commands

| Command | Description |
|---------|-------------|
| `namecheck <name>` | Check availability (JSON stdout) |
| `namecheck <name> --summary` | Human-readable lines + score |
| `namecheck <name> --grouped` | Summary grouped by importance tier |
| `namecheck <name> --pretty` | Pretty-printed JSON |
| `namecheck <name> --validate` | Open result URLs in browser |
| `namecheck --list` | List checker ids |
| `namecheck --init-config` | Write example config file |
| `namecheck --help` | Show help |

## Options

| Flag | Description |
|------|-------------|
| `--only <category>` | `domain`, `social`, or `package` (repeatable) |
| `--platform <id>` | Specific checker id (repeatable) |
| `--config <path>` | Config file path |
| `--tld <tld>` | Add TLD for this run (no leading dot) |
| `--tld-group <name>` | Add configured TLD group |
| `--timeout <ms>` | Per-request timeout (default 12000) |
| `--concurrency <n>` | Parallel checks (default 64) |
| `--no-cooldown` | Skip 1s gap between CLI invocations |
| `--invocation-delay <ms>` | Min gap between invocations |

## Platforms

| Category | Ids |
|----------|-----|
| Domains | Configurable TLDs (default ~20 from active groups) |
| Social | `instagram`, `threads`, `tiktok`, `x`, `bluesky`, `mastodon`, `farcaster`, `tumblr`, `youtube`, `github`, `pinterest` |
| Packages | `npm` |

## Status values

| Status | Meaning |
|--------|---------|
| `available` | No conflicting profile/domain signal |
| `taken` | Profile or DNS delegation exists |
| `unknown` | Blocked, ambiguous, or inconclusive |
| `error` | Network/timeout failure |

## Example JSON output

```json
{
  "query": "mybrandname",
  "normalized": "mybrandname",
  "summary": {
    "total": 16,
    "available": 9,
    "taken": 6,
    "unknown": 1,
    "error": 0
  },
  "results": [
    {
      "id": "instagram",
      "name": "Instagram",
      "category": "social",
      "status": "available",
      "confidence": "high",
      "url": "https://www.instagram.com/mybrandname/"
    }
  ]
}
```

## Default TLD groups

| Group | TLDs |
|-------|------|
| core | com, net, org |
| dev | dev, io, app, sh, run, tech, tools, codes, cloud, so |
| ai | ai, bot |
| startup | co, xyz, vc, fund |
| short | me, gg, fm, to |
| modern | page, site, online, store, software |

Built-in defaults enable `core`, `dev`, `ai`, and `startup`.

## Config file locations

1. `--config <path>`
2. `./namecheck.config.json`
3. `~/.config/namecheck/config.json` (or `%APPDATA%\namecheck\config.json` on Windows)
