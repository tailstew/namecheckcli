import { spawn } from "node:child_process";
import type { CheckResult } from "./types.js";

function openUrl(url: string): void {
  const platform = process.platform;

  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }

  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ValidateOptions {
  results: CheckResult[];
  /** Milliseconds between tab opens (avoids browser throttling). */
  staggerMs?: number;
}

export interface ValidateOutcome {
  opened: boolean;
  tab_count: number;
  urls: string[];
}

export async function openResultTabs(options: ValidateOptions): Promise<ValidateOutcome> {
  const urls = [...new Set(options.results.map((r) => r.url).filter(Boolean))];
  const staggerMs = options.staggerMs ?? 120;

  for (let i = 0; i < urls.length; i++) {
    openUrl(urls[i]);
    if (i < urls.length - 1 && staggerMs > 0) {
      await delay(staggerMs);
    }
  }

  return {
    opened: urls.length > 0,
    tab_count: urls.length,
    urls,
  };
}
