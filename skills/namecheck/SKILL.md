---
name: namecheck
description: >-
  Check business name, domain, and social handle availability across Instagram,
  Threads, TikTok, X, Bluesky, GitHub, npm, and configurable TLDs. Use when the
  user asks to check name availability, research brand names, find free usernames,
  validate a startup name, or run namecheck.
license: MIT
compatibility: Requires Node.js 20+, network access, and the namecheck CLI on PATH
---

# namecheck

JSON-in, JSON-out CLI for multi-platform name availability. A tailstew project — built for the terminal, scripts, and agents researching brand or product names.

## When to use

- Checking if a business or product name is free across domains and socials
- Brand research before registering domains or creating accounts
- Comparing multiple name ideas (`--summary` for quick scans)
- Narrow checks (`--only social`, `--platform instagram`)

## Prerequisites

Install the CLI once per machine:

```bash
npm install -g github:tailstew/namecheckcli
```

Or from a clone:

```bash
git clone https://github.com/tailstew/namecheckcli.git
cd namecheckcli
npm install && npm run build && npm link
```

Verify:

```bash
namecheck --help
namecheck --list
```

## Workflow

```
- [ ] 1. Run namecheck <name> (JSON default)
- [ ] 2. Parse summary + results
- [ ] 3. Narrow with --only / --platform if needed
- [ ] 4. Report availability with URLs; flag unknown/error
```

### 1. Full check (JSON)

```bash
namecheck mybrandname
```

Parse stdout JSON:

- `summary.available`, `summary.taken`, `summary.unknown`, `summary.error`
- `results[]` — each has `id`, `status`, `confidence`, `url`
- `config.tlds` — which domain TLDs were checked

### 2. Human-readable summary

```bash
namecheck mybrandname --summary
```

### 3. Narrow scope

```bash
namecheck mybrandname --only social
namecheck mybrandname --only domain
namecheck mybrandname --platform instagram --platform github
namecheck mybrandname --tld-group short --tld ai
```

### 4. Discover checkers

```bash
namecheck --list
```

## Agent response contract

After a check, report:

| Field | Meaning |
|-------|---------|
| `query` / `normalized` | Input name |
| `summary` | Counts by status |
| `results[].id` | Platform or TLD id |
| `results[].status` | `available`, `taken`, `unknown`, `error` |
| `results[].url` | Link to verify manually |

**Exit codes:** `0` = success, `1` = bad input, `2` = partial errors in results.

**I/O:** JSON on stdout; errors on stderr (also JSON when applicable). Do not use `--pretty` unless the user wants readable JSON.

**Caveats:** Always note that critical names need manual verification. Instagram/Threads use Meta's `web_profile_info` API. Mastodon only checks `mastodon.social`. Domain availability uses DNS signals, not registrar APIs.

## Config (optional)

```bash
namecheck --init-config   # writes namecheck.config.example.json
```

TLD groups: `core`, `dev`, `ai`, `startup`, `short`, `modern`. See [cli-reference.md](references/cli-reference.md).

## Helper script (repo clone)

From a cloned repo without global install:

```powershell
pwsh skills/namecheck/scripts/namecheck.ps1 mybrandname
```

```bash
bash skills/namecheck/scripts/namecheck.sh mybrandname
```

## Additional resources

- Full CLI reference: [references/cli-reference.md](references/cli-reference.md)
