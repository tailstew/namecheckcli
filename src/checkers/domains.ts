import { domainFqdn } from "../normalize.js";
import { fetchWithTimeout } from "../http.js";
import type { Checker, CheckerContext } from "../types.js";

function domainChecker(tld: string): Checker {
  const id = `domain.${tld}`;
  return {
    id,
    name: `.${tld}`,
    category: "domain",
    async check(ctx: CheckerContext) {
      const fqdn = domainFqdn(ctx.normalized, tld);
      const url = `https://${fqdn}`;

      try {
        const res = await fetchWithTimeout(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=NS`,
          { headers: { Accept: "application/dns-json" } },
          ctx.timeoutMs,
          ctx.signal,
        );

        if (!res.ok) {
          return {
            id,
            name: `.${tld}`,
            category: "domain",
            status: "unknown",
            url,
            confidence: "low",
            message: `DNS lookup returned HTTP ${res.status}`,
          };
        }

        const data = (await res.json()) as { Status?: number; Answer?: unknown[] };
        const available = data.Status === 3;
        const taken = data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;

        if (available) {
          return {
            id,
            name: `.${tld}`,
            category: "domain",
            status: "available",
            url,
            confidence: "high",
            message: "No DNS delegation found (likely unregistered)",
          };
        }

        if (taken) {
          return {
            id,
            name: `.${tld}`,
            category: "domain",
            status: "taken",
            url,
            confidence: "high",
            message: "Domain has NS records (registered or reserved)",
          };
        }

        return {
          id,
          name: `.${tld}`,
          category: "domain",
          status: "unknown",
          url,
          confidence: "medium",
          message: `Ambiguous DNS response (status ${data.Status ?? "unknown"})`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          id,
          name: `.${tld}`,
          category: "domain",
          status: "error",
          url,
          confidence: "low",
          message,
        };
      }
    },
  };
}

export function createDomainCheckers(tlds: string[]): Checker[] {
  return tlds.map((tld) => domainChecker(tld));
}
