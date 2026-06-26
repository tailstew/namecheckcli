# namecheckcli Agent Skills

[Agent Skills](https://agentskills.io/) for the `namecheck` CLI. Works with Cursor, Claude Code, Codex, and [60+ agents](https://github.com/vercel-labs/skills#supported-agents) via [`npx skills`](https://github.com/vercel-labs/skills).

## Install skill

**From GitHub:**

```bash
npx skills add tailstew/namecheckcli -a cursor --skill namecheck -y
```

**Global (all projects):**

```bash
npx skills add tailstew/namecheckcli -a cursor --skill namecheck -g -y
```

**Local clone:**

```bash
npx skills add . -a cursor --skill namecheck -y
```

**Claude Code:**

```bash
npx skills add tailstew/namecheckcli -a claude-code --skill namecheck -y
```

## Install CLI

The skill teaches usage; install the binary separately:

```bash
npm install -g github:tailstew/namecheckcli
```

Or clone, build, and link:

```bash
git clone https://github.com/tailstew/namecheckcli.git
cd namecheckcli
npm install && npm run build && npm link
```

## Verify

```bash
npx skills list -a cursor
namecheck --list
namecheck mybrandname --summary
```

## Skills

| Skill | Use when |
|-------|----------|
| `namecheck` | Check domain/social handle availability, brand name research |
