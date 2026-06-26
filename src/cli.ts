#!/usr/bin/env node

import { resolve } from "node:path";
import {
  DEFAULT_TLD_GROUPS,
  loadConfigFile,
  resolveTlds,
  writeExampleConfig,
} from "./config.js";
import { listCheckers, runCheck } from "./index.js";
import { formatSummary } from "./summary.js";
import type { PlatformCategory } from "./types.js";
import { openResultTabs } from "./validate.js";

function printHelp(configPath?: string): void {
  const checkers = listCheckers({ configPath });
  const domains = checkers.filter((c) => c.category === "domain");
  const social = checkers.filter((c) => c.category === "social");
  const packages = checkers.filter((c) => c.category === "package");
  const tldInfo = resolveTlds({ configPath });
  const loaded = loadConfigFile(configPath);

  process.stdout.write(`namecheck — multi-platform name availability checker

Usage:
  namecheck <name> [options]
  namecheck --list
  namecheck --init-config
  namecheck --help

Options:
  --summary             Human-readable lines + score (no JSON)
  --grouped             Human-readable summary grouped by importance tier (implies --summary)
  --pretty              Pretty-print JSON (default output)
  --timeout <ms>        Per-request timeout (default: 12000)
  --only <category>     domain | social | package (repeatable)
  --platform <id>       Run specific checker id (repeatable)
  --validate            Open each result URL in your default browser (new tabs)
  --config <path>       Config file (default: ./namecheck.config.json, then user config)
  --tld <tld>           Add a TLD for this run (repeatable, no leading dot)
  --tld-group <name>    Add a configured TLD group for this run (repeatable)
  --no-cooldown         Skip the 1s gap between back-to-back CLI invocations
  --invocation-delay <ms>  Min gap between invocations (default: 1000, 0=off)
  --concurrency <n>     Max parallel checks within one run (default: 64)
  --init-config         Write namecheck.config.json to the current directory
  --list                List checker ids
  --help                Show this help

Config:
  TLDs come from activeGroups in config, or an explicit "tlds" array.
  Built-in groups: ${Object.keys(DEFAULT_TLD_GROUPS).join(", ")}
  ${loaded ? `Using config: ${loaded.path}` : "No config file found — using built-in defaults"}
  Active TLDs (${tldInfo.tlds.length}): ${tldInfo.tlds.map((t) => `.${t}`).join(", ")}

Examples:
  namecheck mystartup
  namecheck mystartup --only domain --tld-group short
  namecheck mystartup --tld rs --tld it
  namecheck mystartup --config ./namecheck.config.json
  namecheck mystartup --validate --pretty
  namecheck mystartup --summary
  namecheck mystartup --grouped

Domains (${domains.length}):
  ${domains.map((d) => d.id).join(", ")}

Social (${social.length}):
  ${social.map((s) => s.id).join(", ")}

Packages (${packages.length}):
  ${packages.map((p) => p.id).join(", ")}
`);
}

function parseArgs(argv: string[]): {
  name?: string;
  pretty: boolean;
  summary: boolean;
  grouped: boolean;
  timeoutMs: number;
  categories: PlatformCategory[];
  platforms: string[];
  extraTlds: string[];
  extraTldGroups: string[];
  configPath?: string;
  list: boolean;
  help: boolean;
  validate: boolean;
  initConfig: boolean;
  noCooldown: boolean;
  invocationDelayMs?: number;
  concurrency?: number;
} {
  const categories: PlatformCategory[] = [];
  const platforms: string[] = [];
  const extraTlds: string[] = [];
  const extraTldGroups: string[] = [];
  let pretty = false;
  let summary = false;
  let grouped = false;
  let timeoutMs = 12_000;
  let list = false;
  let help = false;
  let validate = false;
  let initConfig = false;
  let noCooldown = false;
  let invocationDelayMs: number | undefined;
  let concurrency: number | undefined;
  let configPath: string | undefined;
  let name: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--pretty":
        pretty = true;
        break;
      case "--summary":
        summary = true;
        break;
      case "--grouped":
        grouped = true;
        summary = true;
        break;
      case "--list":
        list = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      case "--validate":
        validate = true;
        break;
      case "--init-config":
        initConfig = true;
        break;
      case "--no-cooldown":
        noCooldown = true;
        break;
      case "--invocation-delay": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error("--invocation-delay must be a number >= 0");
        }
        invocationDelayMs = value;
        break;
      }
      case "--concurrency": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value < 1) {
          throw new Error("--concurrency must be a number >= 1");
        }
        concurrency = value;
        break;
      }
      case "--timeout": {
        const value = argv[++i];
        timeoutMs = Number(value);
        if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
          throw new Error("--timeout must be a number >= 1000");
        }
        break;
      }
      case "--config": {
        configPath = resolve(argv[++i]);
        break;
      }
      case "--tld": {
        extraTlds.push(argv[++i]);
        break;
      }
      case "--tld-group": {
        extraTldGroups.push(argv[++i]);
        break;
      }
      case "--only": {
        const value = argv[++i] as PlatformCategory;
        if (!["domain", "social", "package"].includes(value)) {
          throw new Error("--only must be domain, social, or package");
        }
        categories.push(value);
        break;
      }
      case "--platform": {
        platforms.push(argv[++i]);
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (name) {
          throw new Error("Only one name can be checked per invocation");
        }
        name = arg;
    }
  }

  return {
    name,
    pretty,
    summary,
    grouped,
    timeoutMs,
    categories,
    platforms,
    extraTlds,
    extraTldGroups,
    configPath,
    list,
    help,
    validate,
    initConfig,
    noCooldown,
    invocationDelayMs,
    concurrency,
  };
}

async function main(): Promise<void> {
  let humanOutput = false;
  try {
    const args = parseArgs(process.argv.slice(2));
    humanOutput = args.summary;

    if (args.initConfig) {
      const out = resolve(process.cwd(), "namecheck.config.json");
      writeExampleConfig(out);
      process.stdout.write(`${JSON.stringify({ created: out }, null, 2)}\n`);
      return;
    }

    if (args.help) {
      printHelp(args.configPath);
      return;
    }

    if (args.list) {
      const payload = {
        checkers: listCheckers({
          configPath: args.configPath,
          extraTlds: args.extraTlds,
          extraGroups: args.extraTldGroups,
        }),
        tlds: resolveTlds({
          configPath: args.configPath,
          extraTlds: args.extraTlds,
          extraGroups: args.extraTldGroups,
        }),
      };
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    if (!args.name) {
      printHelp(args.configPath);
      process.exitCode = 1;
      return;
    }

    const report = await runCheck({
      query: args.name,
      timeoutMs: args.timeoutMs,
      categories: args.categories.length ? args.categories : undefined,
      checkerIds: args.platforms.length ? args.platforms : undefined,
      configPath: args.configPath,
      extraTlds: args.extraTlds.length ? args.extraTlds : undefined,
      extraTldGroups: args.extraTldGroups.length ? args.extraTldGroups : undefined,
      concurrency: args.concurrency,
      invocationCooldownMs: args.noCooldown
        ? 0
        : args.invocationDelayMs,
    });

    if (args.validate) {
      report.validation = await openResultTabs({ results: report.results });
    }

    if (args.summary) {
      process.stdout.write(formatSummary(report, { grouped: args.grouped }));
    } else {
      const space = args.pretty ? 2 : undefined;
      process.stdout.write(`${JSON.stringify(report, null, space)}\n`);
    }

    if (report.summary.error > 0) {
      process.exitCode = 2;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (humanOutput) {
      process.stderr.write(`Error: ${message}\n`);
    } else {
      process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
    }
    process.exitCode = 1;
  }
}

await main();
