import { createDomainCheckers } from "./checkers/domains.js";
import { socialCheckers } from "./checkers/social.js";
import { enforceInvocationCooldown } from "./cooldown.js";
import {
  type ResolvedConfig,
  resolveRateLimitSettings,
  resolveTlds,
  type ResolveTldsOptions,
} from "./config.js";
import { scoreResults } from "./importance.js";
import { isValidHandle, normalizeName } from "./normalize.js";
import { mapPool } from "./throttle.js";
import type { CheckReport, CheckResult, Checker, PlatformCategory } from "./types.js";

const REPORT_NOTES = [
  "Instagram and Threads use Meta's web_profile_info API with browser-like headers — the same approach Namecheckly uses. Many older tools skip Instagram because it has no public API, blocks bots aggressively, and returns HTTP 200 for missing SPA routes unless you hit the correct JSON endpoint.",
  "Bluesky checks handle.bsky.social via the signup availability API (clearer than resolveHandle alone). Custom-domain handles (yourbrand.com) are not checked. resultUnavailable can mean taken OR policy-reserved (e.g. very short names).",
  "Mastodon is federated: we only query mastodon.social. The same @handle can be free there but taken on fosstodon.org or your own instance.",
  "Domain availability is inferred from DNS NS records (NXDOMAIN = likely available). Confirm before purchasing at a registrar.",
  "Social results can be wrong for deactivated, private, or reserved handles. Re-check critical names manually before committing.",
];

export interface RunCheckOptions {
  query: string;
  checkerIds?: string[];
  categories?: PlatformCategory[];
  timeoutMs?: number;
  signal?: AbortSignal;
  configPath?: string;
  extraTlds?: string[];
  extraTldGroups?: string[];
  concurrency?: number;
  requestDelayMs?: number;
  invocationCooldownMs?: number;
}

export interface CheckerSet {
  checkers: Checker[];
  tldConfig: ResolvedConfig;
}

export function buildCheckers(options: ResolveTldsOptions = {}): CheckerSet {
  const tldConfig = resolveTlds(options);
  const domainCheckers = createDomainCheckers(tldConfig.tlds);
  return {
    checkers: [...domainCheckers, ...socialCheckers],
    tldConfig,
  };
}

async function runChecker(
  checker: Checker,
  ctx: { query: string; normalized: string; timeoutMs: number; signal: AbortSignal },
): Promise<CheckResult> {
  const started = Date.now();
  const partial = await checker.check(ctx);
  return {
    ...partial,
    checked_at: new Date().toISOString(),
    latency_ms: Date.now() - started,
  };
}

export async function runCheck(options: RunCheckOptions): Promise<CheckReport> {
  const started = Date.now();
  const normalized = normalizeName(options.query);

  if (!isValidHandle(normalized)) {
    throw new Error(
      "Invalid name: use 1–64 characters of lowercase letters, numbers, dots, underscores, or hyphens (spaces are removed).",
    );
  }

  const { checkers: allCheckers, tldConfig } = buildCheckers({
    configPath: options.configPath,
    extraTlds: options.extraTlds,
    extraGroups: options.extraTldGroups,
  });

  const rateLimit = resolveRateLimitSettings({
    configPath: options.configPath,
    concurrency: options.concurrency,
    requestDelayMs: options.requestDelayMs,
    invocationCooldownMs: options.invocationCooldownMs,
  });

  const cooldownWaitedMs = await enforceInvocationCooldown(rateLimit.invocationCooldownMs);

  const timeoutMs = options.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let selected = allCheckers;

  if (options.checkerIds?.length) {
    const wanted = new Set(options.checkerIds);
    selected = allCheckers.filter((c) => wanted.has(c.id));
    if (!selected.length) {
      throw new Error(`No matching checkers for: ${options.checkerIds.join(", ")}`);
    }
  }

  if (options.categories?.length) {
    const cats = new Set(options.categories);
    selected = selected.filter((c) => cats.has(c.category));
  }

  const ctx = {
    query: options.query,
    normalized,
    timeoutMs,
    signal: controller.signal,
  };

  let results: CheckResult[];
  try {
    results = await mapPool(
      selected,
      rateLimit.concurrency,
      rateLimit.requestDelayMs,
      (checker) => runChecker(checker, ctx),
    );
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }

  const summary = {
    total: results.length,
    available: results.filter((r) => r.status === "available").length,
    taken: results.filter((r) => r.status === "taken").length,
    unknown: results.filter((r) => r.status === "unknown").length,
    error: results.filter((r) => r.status === "error").length,
  };

  const { results: scoredResults, score } = scoreResults(
    results.sort((a, b) => a.id.localeCompare(b.id)),
  );

  return {
    query: options.query,
    normalized,
    checked_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    summary,
    score,
    results: scoredResults,
    notes: REPORT_NOTES,
    config: {
      tlds: tldConfig.tlds,
      tld_source: tldConfig.source,
      config_file: tldConfig.file,
      concurrency: rateLimit.concurrency,
      request_delay_ms: rateLimit.requestDelayMs,
      invocation_cooldown_ms: rateLimit.invocationCooldownMs,
      invocation_waited_ms: cooldownWaitedMs,
    },
  };
}

export function listCheckers(options: ResolveTldsOptions = {}): Array<{
  id: string;
  name: string;
  category: PlatformCategory;
}> {
  const { checkers } = buildCheckers(options);
  return checkers.map(({ id, name, category }) => ({ id, name, category }));
}
