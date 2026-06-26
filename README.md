# namecheckcli

A [tailstew](https://tailstew.com) project — check whether a business name, domain, or social handle is available. **JSON in, JSON out**, built for the terminal, scripts, and agents researching name ideas.

Unlike many username checkers, this CLI **includes Instagram and Threads** by calling Meta's `web_profile_info` API (the same signal browsers use), not naive page scrapes that break on Instagram's SPA.

## Install

```bash
git clone https://github.com/tailstew/namecheckcli.git
cd namecheckcli
npm install
npm run build
npm link   # optional: global `namecheck` command
```

Or install directly from GitHub:

```bash
npm install -g github:tailstew/namecheckcli
```

Or run without linking:

```bash
npm run check -- mybrandname
```

## Agent skill

Install the Cursor agent skill (teaches agents how to use this CLI):

```bash
npx skills add tailstew/namecheckcli -a cursor --skill namecheck -y
```

Global skill (all projects):

```bash
npx skills add tailstew/namecheckcli -a cursor --skill namecheck -g -y
```

See [skills/README.md](skills/README.md) for Claude Code and other agents. The skill requires the CLI on PATH (`npm install -g` or `npm link` above).

## Usage

```bash
namecheck mybrandname
namecheck mybrandname --summary
namecheck mybrandname --pretty
namecheck mybrandname --only social
namecheck mybrandname --platform instagram --platform domain.com
namecheck mybrandname --validate
namecheck --list
```

`--validate` opens every result URL in your default browser (one tab per platform) so you can eyeball profiles and landing pages after the automated check.

### Human summary (`--summary`)

Plain text for terminal use — score header, then one platform per line:

```bash
namecheck mybrandname --summary
```

```
mybrandname — 12/30 available (40% score)
  6 taken · 2 unclear · 0 errors · 842ms

  FREE     .com          https://mybrandname.com
  FREE     github        https://github.com/mybrandname
  TAKEN    .io           https://mybrandname.io
  UNCLEAR  youtube       https://www.youtube.com/@mybrandname
```

Default output is JSON (for scripts and automation). Use `--pretty` for readable JSON.

### Example output (JSON)

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

## Platforms checked

| Category | Platforms |
|----------|-----------|
| Domains | Configurable — see [TLD config](#tld-config) (default ~20 dev/startup TLDs) |
| Social | Instagram, Threads, TikTok, X, Bluesky, Mastodon, Farcaster, Tumblr, YouTube, GitHub, Pinterest |
| Packages | npm |

## TLD config

Domain TLDs are driven by `namecheck.config.json`. Copy the example or generate one:

```bash
namecheck --init-config   # writes ./namecheck.config.json
```

Config is loaded from (first match):

1. `--config <path>`
2. `./namecheck.config.json`
3. `~/.config/namecheck/config.json` (or `%APPDATA%\\namecheck\\config.json` on Windows)

### Example config

```json
{
  "activeGroups": ["core", "dev", "ai", "startup"],
  "tldGroups": {
    "core": ["com", "net", "org"],
    "dev": ["dev", "io", "app", "sh", "run", "tech", "tools", "codes", "cloud", "so"],
    "ai": ["ai", "bot"],
    "startup": ["co", "xyz", "vc", "fund"],
    "short": ["me", "gg", "fm", "to"],
    "modern": ["page", "site", "online", "store", "software"]
  }
}
```

Use named **groups** for dev audiences (`dev`, `ai`, `startup`) or set an explicit list:

```json
{ "tlds": ["com", "dev", "io", "sh", "run", "ai"] }
```

One-off CLI overrides:

```bash
namecheck myapp --tld-group short          # add me, gg, fm, to
namecheck myapp --tld rs --tld it          # add specific TLDs
namecheck myapp --only domain              # uses your configured TLD set
```

JSON reports include which TLDs ran:

```json
"config": {
  "tlds": ["com", "dev", "io", "..."],
  "tld_source": ["defaults"],
  "config_file": "/path/to/namecheck.config.json"
}
```

### Default TLD groups (no config file)

| Group | TLDs | Why |
|-------|------|-----|
| **core** | com, net, org | Baseline |
| **dev** | dev, io, app, sh, run, tech, tools, codes, cloud, so | Developer tools & infra |
| **ai** | ai, bot | ML/agent products |
| **startup** | co, xyz, vc, fund | Startup branding |
| **short** | me, gg, fm, to | Short personal/community |
| **modern** | page, site, online, store, software | Landing pages & SaaS |

Built-in defaults enable `core`, `dev`, `ai`, and `startup` (~20 TLDs).

## Why don't other tools auto-check Instagram?

Short answer: **Instagram makes it hard on purpose**, and most tools take the easy path.

1. **No public API** — The Instagram Graph API has no "is this username free?" endpoint. You must infer availability from profile lookups or signup flows.

2. **Anti-bot defenses** — Meta fingerprints TLS, headers, IP reputation, and request patterns. Plain `fetch` to `instagram.com/username` often fails or gets rate-limited.

3. **SPA false positives** — Instagram's website is a single-page app. A simple HTTP GET to a profile URL can return **HTTP 200 even when the user does not exist**, so tools that only check status codes report garbage.

4. **Maintenance cost** — The reliable endpoint (`i.instagram.com/api/v1/users/web_profile_info/`) needs browser-like headers (`X-IG-App-ID`, `Sec-Fetch-*`, `Referer`) and breaks when Meta changes things. Free checkers often skip it.

5. **Legal/ToS gray area** — Automated checks sit in a gray zone. Conservative products avoid Instagram entirely.

**This CLI** uses the `web_profile_info` JSON API (404 = likely available, 200 with user object = taken) — the same family of approach used by Namecheckly and newer checkers.

## Bluesky and other X alternatives

| Platform | How we check | Clear-cut? |
|----------|----------------|------------|
| **Bluesky** | `checkHandleAvailability` on `bsky.social` for `{name}.bsky.social` | **Mostly yes** — explicit `resultAvailable` / `resultUnavailable`. Caveats: reserved/blocked handles show unavailable without a profile; custom domains (`name.com`) are a separate namespace. |
| **Mastodon** | Account lookup on `mastodon.social` only | **No** — federated. Free on one instance, taken on another. |
| **Farcaster** | Warpcast API (`404` = free) | **Yes** — for valid usernames (1–16 chars, `a-z0-9-`). |
| **Tumblr** | `{name}.tumblr.com` HTTP status | **Mostly yes** |
| **Threads** | Meta web API (same family as Instagram) | **Mostly yes** |

Bluesky is *more* clear-cut than scraping X or Instagram when you use the signup availability endpoint — but less clear-cut than GitHub or Farcaster because Bluesky reserves some handles that do not resolve to any profile.

## Status values

| Status | Meaning |
|--------|---------|
| `available` | No conflicting profile/domain signal found |
| `taken` | Profile or DNS delegation exists |
| `unknown` | Blocked, ambiguous, or inconclusive |
| `error` | Network/timeout failure |

Always verify critical names manually before registering domains or launching a brand.

## For agents

- Output is always JSON on stdout (errors on stderr as JSON).
- Exit code `0` = success, `1` = bad input, `2` = partial errors in results.
- Use `--list` to discover checker `id` values.
- Use `--only social` or `--platform instagram` to narrow scope.

## License

MIT
