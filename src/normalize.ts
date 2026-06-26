const HANDLE_RE = /^[a-z0-9._-]+$/;

export function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidHandle(normalized: string): boolean {
  if (!normalized || normalized.length < 1 || normalized.length > 64) {
    return false;
  }
  return HANDLE_RE.test(normalized);
}

export function domainFqdn(normalized: string, tld: string): string {
  return `${normalized}.${tld}`;
}

/** Default Bluesky handle on bsky.social (custom domains are not checked). */
export function blueskyHandle(normalized: string): string {
  if (normalized.endsWith(".bsky.social")) {
    return normalized;
  }
  const slug = normalized.replace(/\./g, "");
  return `${slug}.bsky.social`;
}

export function blueskyProfileUrl(handle: string): string {
  return `https://bsky.app/profile/${encodeURIComponent(handle)}`;
}

/** Farcaster/Warpcast: 1–16 chars, lowercase a-z, 0-9, hyphen; must start alphanumeric. */
export function isValidFarcasterUsername(normalized: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,15}$/.test(normalized);
}
