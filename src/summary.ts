import type { ImportanceTier } from "./importance.js";
import type { AvailabilityStatus, CheckReport, CheckResult } from "./types.js";

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: "FREE",
  taken: "TAKEN",
  unknown: "UNCLEAR",
  error: "ERROR",
};

const STATUS_RANK: Record<AvailabilityStatus, number> = {
  available: 0,
  taken: 1,
  unknown: 2,
  error: 3,
};

const TIER_ORDER: ImportanceTier[] = ["high", "medium", "low"];

const TIER_LABEL: Record<ImportanceTier, string> = {
  high: "high importance",
  medium: "medium importance",
  low: "low importance",
};

export interface FormatSummaryOptions {
  grouped?: boolean;
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function formatLine(result: CheckResult, nameWidth: number, indent = 2): string {
  const label = padEnd(STATUS_LABEL[result.status], 7);
  const name = padEnd(result.name, nameWidth);
  const pts =
    result.points === null || result.points === undefined
      ? ""
      : `  (${result.points}/${result.weight ?? "?"} pts)`;
  const reason =
    (result.status === "unknown" || result.status === "error") && result.message
      ? ` — ${result.message}`
      : "";
  return `${" ".repeat(indent)}${label}  ${name}  ${result.url}${pts}${reason}`;
}

function sortResults(results: CheckResult[]): CheckResult[] {
  return [...results].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name);
  });
}

function appendFooter(lines: string[], report: CheckReport): void {
  if (report.validation?.opened) {
    lines.push("");
    lines.push(`  Opened ${report.validation.tab_count} tabs in your browser.`);
  }

  if (report.config?.invocation_waited_ms && report.config.invocation_waited_ms > 0) {
    lines.push("");
    lines.push(
      `  Cooldown: waited ${report.config.invocation_waited_ms}ms before checking (AI loop protection).`,
    );
  }
}

function formatFlatResults(lines: string[], report: CheckReport): void {
  const sorted = sortResults(report.results);
  const nameWidth = Math.max(4, ...sorted.map((r) => r.name.length));

  for (const result of sorted) {
    lines.push(formatLine(result, nameWidth));
  }
}

function formatGroupedResults(lines: string[], report: CheckReport): void {
  const { score } = report;
  const byTier = new Map<ImportanceTier, CheckResult[]>();
  for (const tier of TIER_ORDER) {
    byTier.set(tier, []);
  }
  for (const result of report.results) {
    const tier = result.importance ?? "medium";
    byTier.get(tier)?.push(result);
  }

  for (const tier of TIER_ORDER) {
    const tierResults = byTier.get(tier) ?? [];
    if (!tierResults.length) continue;

    const tierScore = score.by_tier[tier];
    lines.push(
      `  ${TIER_LABEL[tier]} — ${tierScore.weighted_percent}% (${tierScore.points_earned}/${tierScore.points_possible} pts, ${tierScore.available}/${tierScore.total} free)`,
    );

    const sorted = sortResults(tierResults);
    const nameWidth = Math.max(4, ...sorted.map((r) => r.name.length));

    for (const result of sorted) {
      lines.push(formatLine(result, nameWidth, 4));
    }
    lines.push("");
  }
}

export function formatSummary(report: CheckReport, options: FormatSummaryOptions = {}): string {
  const { score } = report;
  const { taken, unknown, error, available, total } = report.summary;
  const lines: string[] = [];

  lines.push(
    `${report.query} — ${score.weighted_percent}% weighted score (${score.points_earned}/${score.points_possible} pts)`,
  );
  lines.push(
    `  ${available}/${total} available · ${taken} taken · ${unknown} unclear · ${error} errors · ${report.duration_ms}ms`,
  );
  lines.push("");

  if (options.grouped) {
    formatGroupedResults(lines, report);
  } else {
    formatFlatResults(lines, report);
  }

  appendFooter(lines, report);

  return `${lines.join("\n").trimEnd()}\n`;
}
