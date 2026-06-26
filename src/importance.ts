import type { AvailabilityStatus, CheckResult } from "./types.js";

export type ImportanceTier = "high" | "medium" | "low";

export interface ImportanceWeight {
  tier: ImportanceTier;
  weight: number;
}

/** Numeric weights per tier — high-impact names matter more in the overall score. */
export const TIER_WEIGHT: Record<ImportanceTier, number> = {
  high: 10,
  medium: 5,
  low: 2,
};

const CHECKER_IMPORTANCE: Record<string, ImportanceTier> = {
  // Domains — .com is critical; niche TLDs matter less.
  "domain.com": "high",
  "domain.net": "medium",
  "domain.org": "medium",
  "domain.io": "high",
  "domain.dev": "high",
  "domain.app": "high",
  "domain.ai": "high",
  "domain.co": "medium",
  "domain.xyz": "low",
  "domain.vc": "low",
  "domain.fund": "low",
  "domain.sh": "medium",
  "domain.run": "medium",
  "domain.tech": "medium",
  "domain.tools": "medium",
  "domain.codes": "medium",
  "domain.cloud": "medium",
  "domain.so": "medium",
  "domain.bot": "medium",
  "domain.me": "low",
  "domain.gg": "low",
  "domain.fm": "low",
  "domain.to": "low",
  "domain.page": "low",
  "domain.site": "low",
  "domain.online": "low",
  "domain.store": "low",
  "domain.software": "low",

  // Social — X and major networks rank highest; federated/niche platforms lower.
  x: "high",
  instagram: "high",
  threads: "high",
  github: "high",
  youtube: "high",
  tiktok: "high",
  bluesky: "medium",
  farcaster: "medium",
  npm: "medium",
  tumblr: "low",
  pinterest: "low",
  mastodon: "low",
};

const DEFAULT_DOMAIN_TIER: ImportanceTier = "medium";
const DEFAULT_SOCIAL_TIER: ImportanceTier = "medium";

export function resolveImportance(id: string, category: CheckResult["category"]): ImportanceWeight {
  const tier =
    CHECKER_IMPORTANCE[id] ??
    (category === "domain" ? DEFAULT_DOMAIN_TIER : DEFAULT_SOCIAL_TIER);
  return { tier, weight: TIER_WEIGHT[tier] };
}

function pointsForStatus(status: AvailabilityStatus, weight: number): number | null {
  if (status === "error") return null;
  if (status === "available") return weight;
  return 0;
}

export interface ScoredResult extends CheckResult {
  importance: ImportanceTier;
  weight: number;
  points: number | null;
}

export interface TierScore {
  total: number;
  available: number;
  taken: number;
  unknown: number;
  error: number;
  weight_total: number;
  points_earned: number;
  points_possible: number;
  weighted_percent: number;
}

export interface WeightedScore {
  weighted_percent: number;
  points_earned: number;
  points_possible: number;
  by_tier: Record<ImportanceTier, TierScore>;
}

function emptyTierScore(): TierScore {
  return {
    total: 0,
    available: 0,
    taken: 0,
    unknown: 0,
    error: 0,
    weight_total: 0,
    points_earned: 0,
    points_possible: 0,
    weighted_percent: 0,
  };
}

export function scoreResults(results: CheckResult[]): {
  results: ScoredResult[];
  score: WeightedScore;
} {
  const byTier: Record<ImportanceTier, TierScore> = {
    high: emptyTierScore(),
    medium: emptyTierScore(),
    low: emptyTierScore(),
  };

  let pointsEarned = 0;
  let pointsPossible = 0;

  const scored = results.map((result) => {
    const { tier, weight } = resolveImportance(result.id, result.category);
    const points = pointsForStatus(result.status, weight);

    const tierScore = byTier[tier];
    tierScore.total += 1;
    tierScore.weight_total += weight;
    tierScore[result.status] += 1;

    if (points !== null) {
      tierScore.points_earned += points;
      tierScore.points_possible += weight;
      pointsEarned += points;
      pointsPossible += weight;
    }

    return {
      ...result,
      importance: tier,
      weight,
      points,
    };
  });

  for (const tier of Object.keys(byTier) as ImportanceTier[]) {
    const t = byTier[tier];
    t.weighted_percent =
      t.points_possible > 0 ? Math.round((t.points_earned / t.points_possible) * 100) : 0;
  }

  return {
    results: scored,
    score: {
      weighted_percent:
        pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : 0,
      points_earned: pointsEarned,
      points_possible: pointsPossible,
      by_tier: byTier,
    },
  };
}
