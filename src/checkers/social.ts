import { fetchWithTimeout, metaWebHeaders } from "../http.js";
import {
  blueskyHandle,
  blueskyProfileUrl,
  isValidFarcasterUsername,
} from "../normalize.js";
import type { Checker, CheckerContext } from "../types.js";

type SocialSpec = {
  id: string;
  name: string;
  profileUrl: (handle: string) => string;
  check: (ctx: CheckerContext, handle: string) => Promise<{
    status: "available" | "taken" | "unknown" | "error";
    confidence: "high" | "medium" | "low";
    message?: string;
  }>;
};

async function metaProfileCheck(
  ctx: CheckerContext,
  handle: string,
  apiBase: string,
  referer: string,
): Promise<ReturnType<SocialSpec["check"]>> {
  const res = await fetchWithTimeout(
    `${apiBase}/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    { headers: metaWebHeaders(referer) },
    ctx.timeoutMs,
    ctx.signal,
  );

  if (res.status === 404) {
    return {
      status: "available",
      confidence: "high",
      message: "No profile returned by Meta web API",
    };
  }

  if (res.status === 200) {
    const text = await res.text();
    if (text.includes('"user"')) {
      return {
        status: "taken",
        confidence: "high",
        message: "Profile exists",
      };
    }
    return {
      status: "unknown",
      confidence: "low",
      message: "Unexpected 200 response body",
    };
  }

  if (res.status === 401 || res.status === 429) {
    return {
      status: "unknown",
      confidence: "low",
      message: `Rate limited or blocked (HTTP ${res.status})`,
    };
  }

  return {
    status: "unknown",
    confidence: "medium",
    message: `HTTP ${res.status}`,
  };
}

function parseYouTubeHandlePage(
  text: string,
  handle: string,
): Awaited<ReturnType<SocialSpec["check"]>> {
  const handleLower = handle.toLowerCase();

  const browseId = text.match(/"browseId":"(UC[^"]+)"/)?.[1];
  if (browseId) {
    return { status: "taken", confidence: "high", message: "Channel exists" };
  }

  const ogChannel = text.match(/property="og:url" content="https:\/\/www\.youtube\.com\/channel\/[^"]+"/);
  if (ogChannel) {
    return { status: "taken", confidence: "high", message: "Channel exists" };
  }

  const canonicalHandle = text.match(/canonicalBaseUrl":"\/@([^"]+)"/)?.[1];
  if (canonicalHandle?.toLowerCase() === handleLower) {
    return { status: "taken", confidence: "high", message: "Channel exists" };
  }

  if (text.includes("channelId") || text.includes('"@type":"Person"')) {
    return { status: "taken", confidence: "high", message: "Channel exists" };
  }

  if (text.includes("PAGE_NOT_FOUND")) {
    return { status: "available", confidence: "high", message: "Page not found" };
  }

  return {
    status: "unknown",
    confidence: "medium",
    message: "Could not parse YouTube response (consent page or layout change)",
  };
}

const SOCIAL_SPECS: SocialSpec[] = [
  {
    id: "instagram",
    name: "Instagram",
    profileUrl: (h) => `https://www.instagram.com/${h}/`,
    check: async (ctx, h) =>
      metaProfileCheck(ctx, h, "https://i.instagram.com", "https://www.instagram.com/"),
  },
  {
    id: "threads",
    name: "Threads",
    profileUrl: (h) => `https://www.threads.net/@${h}`,
    check: async (ctx, h) =>
      metaProfileCheck(ctx, h, "https://www.threads.net", "https://www.threads.net/"),
  },
  {
    id: "github",
    name: "GitHub",
    profileUrl: (h) => `https://github.com/${h}`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://api.github.com/users/${encodeURIComponent(h)}`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "namecheckcli" } },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "GitHub user not found" };
      }
      if (res.status === 200) {
        return { status: "taken", confidence: "high", message: "GitHub user exists" };
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
  {
    id: "x",
    name: "X (Twitter)",
    profileUrl: (h) => `https://x.com/${h}`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${h}`)}`,
        {},
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "oEmbed profile not found" };
      }
      if (res.status === 200) {
        return { status: "taken", confidence: "high", message: "oEmbed profile exists" };
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
  {
    id: "bluesky",
    name: "Bluesky",
    profileUrl: (h) => blueskyProfileUrl(blueskyHandle(h)),
    check: async (ctx, h) => {
      const handle = blueskyHandle(h);
      const res = await fetchWithTimeout(
        `https://bsky.social/xrpc/com.atproto.temp.checkHandleAvailability?handle=${encodeURIComponent(handle)}`,
        { headers: { Accept: "application/json" } },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.ok) {
        const body = (await res.json()) as {
          result?: { $type?: string };
        };
        const type = body.result?.$type ?? "";

        if (type.includes("resultAvailable")) {
          return {
            status: "available",
            confidence: "high",
            message: `Handle ${handle} is available on bsky.social`,
          };
        }
        if (type.includes("resultUnavailable")) {
          return {
            status: "taken",
            confidence: "high",
            message: `Handle ${handle} is taken or reserved (short names and some words are blocked even when no profile exists)`,
          };
        }
      }

      // Fallback: identity resolution (does not distinguish reserved vs available)
      const resolve = await fetchWithTimeout(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
        { headers: { Accept: "application/json" } },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (resolve.status === 200) {
        return {
          status: "taken",
          confidence: "high",
          message: "Handle resolves to an existing DID",
        };
      }

      const resolveText = await resolve.text();
      if (resolve.status === 400 && resolveText.includes("Unable to resolve")) {
        return {
          status: "available",
          confidence: "medium",
          message:
            "Handle does not resolve; may still be reserved by Bluesky policy — confirm in app signup",
        };
      }

      return {
        status: "unknown",
        confidence: "low",
        message: `Could not check Bluesky handle (HTTP ${res.status})`,
      };
    },
  },
  {
    id: "mastodon",
    name: "Mastodon",
    profileUrl: (h) => `https://mastodon.social/@${h}`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://mastodon.social/api/v1/accounts/lookup?acct=${encodeURIComponent(h)}`,
        { headers: { Accept: "application/json", "User-Agent": "namecheckcli" } },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return {
          status: "available",
          confidence: "medium",
          message: "Not found on mastodon.social (federated — may still exist on other instances)",
        };
      }
      if (res.status === 200) {
        return {
          status: "taken",
          confidence: "high",
          message: "Account exists on mastodon.social",
        };
      }
      return {
        status: "unknown",
        confidence: "low",
        message: `mastodon.social lookup failed (HTTP ${res.status})`,
      };
    },
  },
  {
    id: "farcaster",
    name: "Farcaster",
    profileUrl: (h) => `https://warpcast.com/${h}`,
    check: async (ctx, h) => {
      if (!isValidFarcasterUsername(h)) {
        return {
          status: "unknown",
          confidence: "low",
          message:
            "Invalid Farcaster username (use 1–16 chars: a-z, 0-9, hyphen; must start with a letter or digit)",
        };
      }

      const res = await fetchWithTimeout(
        `https://api.warpcast.com/v2/user-by-username?username=${encodeURIComponent(h)}`,
        { headers: { Accept: "application/json" } },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "Warpcast username not registered" };
      }
      if (res.status === 200) {
        return { status: "taken", confidence: "high", message: "Warpcast username registered" };
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
  {
    id: "tumblr",
    name: "Tumblr",
    profileUrl: (h) => `https://${h}.tumblr.com/`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://${h}.tumblr.com/`,
        { redirect: "manual" },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "Tumblr blog URL not found" };
      }
      if (res.status === 200 || res.status === 301 || res.status === 302) {
        return { status: "taken", confidence: "high", message: "Tumblr blog exists" };
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
  {
    id: "youtube",
    name: "YouTube",
    profileUrl: (h) => `https://www.youtube.com/@${h}`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://www.youtube.com/@${encodeURIComponent(h)}`,
        {},
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "Channel handle not found" };
      }
      if (res.status === 200) {
        const text = await res.text();
        return parseYouTubeHandlePage(text, h);
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
  {
    id: "tiktok",
    name: "TikTok",
    profileUrl: (h) => `https://www.tiktok.com/@${h}`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://www.tiktok.com/@${encodeURIComponent(h)}`,
        {},
        ctx.timeoutMs,
        ctx.signal,
      );

      const text = await res.text();
      const uniqueId = text.match(/"uniqueId":"([^"]+)"/)?.[1];
      const statusCode = text.match(/"statusCode":(\d+)/)?.[1];

      if (uniqueId?.toLowerCase() === h.toLowerCase()) {
        return { status: "taken", confidence: "high", message: "Profile exists" };
      }
      if (
        statusCode === "10221" ||
        text.includes("Couldn't find this account") ||
        text.includes("statusCode\":10202")
      ) {
        return { status: "available", confidence: "high", message: "Account not found" };
      }

      return {
        status: "unknown",
        confidence: "medium",
        message: `Could not determine (statusCode=${statusCode ?? "n/a"})`,
      };
    },
  },
  {
    id: "pinterest",
    name: "Pinterest",
    profileUrl: (h) => `https://www.pinterest.com/${h}/`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://www.pinterest.com/${encodeURIComponent(h)}/feed.rss`,
        { redirect: "manual" },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "RSS feed not found" };
      }
      if (res.status === 200) {
        const text = await res.text();
        if (text.includes("<rss") || text.includes("<?xml")) {
          return { status: "taken", confidence: "high", message: "Profile RSS exists" };
        }
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
  {
    id: "npm",
    name: "npm",
    profileUrl: (h) => `https://www.npmjs.com/package/${h}`,
    check: async (ctx, h) => {
      const res = await fetchWithTimeout(
        `https://registry.npmjs.org/${encodeURIComponent(h)}`,
        { headers: { Accept: "application/json" } },
        ctx.timeoutMs,
        ctx.signal,
      );

      if (res.status === 404) {
        return { status: "available", confidence: "high", message: "Package name not registered" };
      }
      if (res.status === 200) {
        return { status: "taken", confidence: "high", message: "Package name registered" };
      }
      return {
        status: "unknown",
        confidence: "medium",
        message: `HTTP ${res.status}`,
      };
    },
  },
];

function toChecker(spec: SocialSpec): Checker {
  return {
    id: spec.id,
    name: spec.name,
    category: spec.id === "npm" ? "package" : "social",
    async check(ctx) {
      const url = spec.profileUrl(ctx.normalized);
      try {
        const outcome = await spec.check(ctx, ctx.normalized);
        return {
          id: spec.id,
          name: spec.name,
          category: spec.id === "npm" ? "package" : "social",
          url,
          ...outcome,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          id: spec.id,
          name: spec.name,
          category: spec.id === "npm" ? "package" : "social",
          status: "error",
          url,
          confidence: "low",
          message,
        };
      }
    },
  };
}

export const socialCheckers: Checker[] = SOCIAL_SPECS.map(toChecker);

export const allCheckerIds = [...SOCIAL_SPECS.map((s) => s.id)];
