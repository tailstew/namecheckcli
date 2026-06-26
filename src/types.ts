import type { ImportanceTier, WeightedScore } from "./importance.js";

export type AvailabilityStatus = "available" | "taken" | "unknown" | "error";

export type PlatformCategory = "domain" | "social" | "package";

export interface CheckResult {
  id: string;
  name: string;
  category: PlatformCategory;
  status: AvailabilityStatus;
  url: string;
  confidence: "high" | "medium" | "low";
  importance?: ImportanceTier;
  weight?: number;
  points?: number | null;
  message?: string;
  checked_at: string;
  latency_ms: number;
}

export interface CheckReport {
  query: string;
  normalized: string;
  checked_at: string;
  duration_ms: number;
  summary: {
    total: number;
    available: number;
    taken: number;
    unknown: number;
    error: number;
  };
  score: WeightedScore;
  results: CheckResult[];
  notes: string[];
  config?: {
    tlds: string[];
    tld_source: string[];
    config_file?: string;
    concurrency?: number;
    request_delay_ms?: number;
    invocation_cooldown_ms?: number;
    invocation_waited_ms?: number;
  };
  validation?: {
    opened: boolean;
    tab_count: number;
    urls: string[];
  };
}

export interface CheckerContext {
  query: string;
  normalized: string;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface Checker {
  id: string;
  name: string;
  category: PlatformCategory;
  check: (ctx: CheckerContext) => Promise<Omit<CheckResult, "checked_at" | "latency_ms">>;
}
