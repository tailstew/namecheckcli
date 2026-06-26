import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Curated TLD groups — merge via `activeGroups` in config. */
export const DEFAULT_TLD_GROUPS: Record<string, string[]> = {
  core: ["com", "net", "org"],
  dev: ["dev", "io", "app", "sh", "run", "tech", "tools", "codes", "cloud", "so"],
  ai: ["ai", "bot"],
  startup: ["co", "xyz", "vc", "fund"],
  short: ["me", "gg", "fm", "to"],
  modern: ["page", "site", "online", "store", "software"],
};

/** Groups enabled when no config file is present. */
export const DEFAULT_ACTIVE_GROUPS = ["core", "dev", "ai", "startup"];

/** Max parallel platform checks. High default — platforms are separate rate-limit targets. */
export const DEFAULT_CONCURRENCY = 64;

/** Optional pause between checks per worker. 0 = no default sleep. */
export const DEFAULT_REQUEST_DELAY_MS = 0;

/** Min gap between CLI invocations (start-to-start). Protects against AI tight loops. */
export const DEFAULT_INVOCATION_COOLDOWN_MS = 1000;

export interface NamecheckConfig {
  /** Explicit TLD list (without dots). Overrides `activeGroups` when set. */
  tlds?: string[];
  /** Named TLD bundles for toggling in config. */
  tldGroups?: Record<string, string[]>;
  /** Which groups to include (unioned, deduped). Ignored when `tlds` is set. */
  activeGroups?: string[];
  /** Max parallel checks (default 64). */
  concurrency?: number;
  /** Ms pause before each worker starts its next check (default 0). */
  requestDelayMs?: number;
  /** Min ms between CLI invocations; 0 disables (default 1000). */
  invocationCooldownMs?: number;
}

export interface RateLimitSettings {
  concurrency: number;
  requestDelayMs: number;
  invocationCooldownMs: number;
}

export interface ResolvedConfig {
  tlds: string[];
  source: string[];
  file?: string;
}

const TLD_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeTld(input: string): string {
  return input.trim().toLowerCase().replace(/^\./, "");
}

export function isValidTld(tld: string): boolean {
  return TLD_RE.test(tld);
}

export function dedupeTlds(tlds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tlds) {
    const tld = normalizeTld(raw);
    if (!tld || seen.has(tld)) continue;
    if (!isValidTld(tld)) {
      throw new Error(`Invalid TLD in config: "${raw}"`);
    }
    seen.add(tld);
    out.push(tld);
  }
  return out;
}

function mergeGroups(
  groups: Record<string, string[]>,
  active: string[],
): string[] {
  const tlds: string[] = [];
  for (const name of active) {
    const list = groups[name];
    if (!list) {
      throw new Error(`Unknown TLD group "${name}". Known: ${Object.keys(groups).join(", ")}`);
    }
    tlds.push(...list);
  }
  return dedupeTlds(tlds);
}

function readConfigFile(path: string): NamecheckConfig {
  const text = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Config is not valid JSON: ${path}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config must be a JSON object: ${path}`);
  }
  return parsed as NamecheckConfig;
}

function configCandidates(explicit?: string): string[] {
  const paths: string[] = [];
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    paths.push(resolved);
    return paths;
  }
  paths.push(resolve(process.cwd(), "namecheck.config.json"));
  const home = homedir();
  paths.push(join(home, ".config", "namecheck", "config.json"));
  if (process.platform === "win32" && process.env.APPDATA) {
    paths.push(join(process.env.APPDATA, "namecheck", "config.json"));
  } else {
    paths.push(join(home, ".namecheck.json"));
  }
  return paths;
}

export function loadConfigFile(explicitPath?: string): {
  config: NamecheckConfig;
  path: string;
} | null {
  for (const path of configCandidates(explicitPath)) {
    if (existsSync(path)) {
      return { config: readConfigFile(path), path };
    }
  }
  return null;
}

export interface ResolveTldsOptions {
  configPath?: string;
  extraTlds?: string[];
  extraGroups?: string[];
}

export function resolveTlds(options: ResolveTldsOptions = {}): ResolvedConfig {
  const source: string[] = [];
  const loaded = loadConfigFile(options.configPath);
  const fileConfig = loaded?.config ?? {};
  const groups = { ...DEFAULT_TLD_GROUPS, ...fileConfig.tldGroups };

  let tlds: string[];

  if (fileConfig.tlds?.length) {
    tlds = dedupeTlds(fileConfig.tlds);
    source.push(loaded ? `file:${loaded.path}` : "config:tlds");
  } else {
    const active = [
      ...(fileConfig.activeGroups ?? DEFAULT_ACTIVE_GROUPS),
      ...(options.extraGroups ?? []),
    ];
    tlds = mergeGroups(groups, active);
    if (loaded) {
      source.push(`file:${loaded.path}`);
    } else {
      source.push("defaults");
    }
    if (options.extraGroups?.length) {
      source.push("cli:--tld-group");
    }
  }

  if (options.extraTlds?.length) {
    tlds = dedupeTlds([...tlds, ...options.extraTlds]);
    source.push("cli:--tld");
  }

  if (!tlds.length) {
    throw new Error("No TLDs configured. Set `tlds` or `activeGroups` in config.");
  }

  return {
    tlds,
    source: [...new Set(source)],
    file: loaded?.path,
  };
}

export interface ResolveRateLimitOptions {
  configPath?: string;
  concurrency?: number;
  requestDelayMs?: number;
  invocationCooldownMs?: number;
}

export function resolveRateLimitSettings(
  options: ResolveRateLimitOptions = {},
): RateLimitSettings {
  const loaded = loadConfigFile(options.configPath);
  const fileConfig = loaded?.config ?? {};

  const concurrency = options.concurrency ?? fileConfig.concurrency ?? DEFAULT_CONCURRENCY;
  const requestDelayMs =
    options.requestDelayMs ?? fileConfig.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  const invocationCooldownMs =
    options.invocationCooldownMs ??
    fileConfig.invocationCooldownMs ??
    DEFAULT_INVOCATION_COOLDOWN_MS;

  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a number >= 1");
  }
  if (!Number.isFinite(requestDelayMs) || requestDelayMs < 0) {
    throw new Error("requestDelayMs must be a number >= 0");
  }
  if (!Number.isFinite(invocationCooldownMs) || invocationCooldownMs < 0) {
    throw new Error("invocationCooldownMs must be a number >= 0");
  }

  return {
    concurrency: Math.floor(concurrency),
    requestDelayMs: Math.floor(requestDelayMs),
    invocationCooldownMs: Math.floor(invocationCooldownMs),
  };
}

export function exampleConfig(): NamecheckConfig & { tldGroups: Record<string, string[]> } {
  return {
    activeGroups: ["core", "dev", "ai", "startup"],
    tldGroups: DEFAULT_TLD_GROUPS,
    concurrency: DEFAULT_CONCURRENCY,
    requestDelayMs: DEFAULT_REQUEST_DELAY_MS,
    invocationCooldownMs: DEFAULT_INVOCATION_COOLDOWN_MS,
    tlds: undefined,
  };
}

export function writeExampleConfig(path: string): void {
  if (existsSync(path)) {
    throw new Error(`Config file already exists: ${path}\nDelete it first or use --config to point at a different path.`);
  }
  const body = `${JSON.stringify(exampleConfig(), null, 2)}\n`;
  writeFileSync(path, body, "utf8");
}
