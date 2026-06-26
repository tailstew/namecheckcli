import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { delay } from "./throttle.js";

function stateFilePath(): string {
  let dir: string;
  if (process.platform === "win32" && process.env.APPDATA) {
    dir = join(process.env.APPDATA, "namecheck");
  } else {
    dir = join(homedir(), ".config", "namecheck");
  }
  mkdirSync(dir, { recursive: true });
  return join(dir, "last-invocation");
}

/**
 * Enforces a minimum gap between CLI check invocations (start-to-start).
 * First run never waits; rapid back-to-back runs (e.g. an AI loop) are spaced out.
 * Returns milliseconds slept.
 */
export async function enforceInvocationCooldown(cooldownMs: number): Promise<number> {
  if (cooldownMs <= 0) return 0;

  const path = stateFilePath();
  const now = Date.now();
  let waited = 0;

  try {
    const last = Number(readFileSync(path, "utf8"));
    if (Number.isFinite(last)) {
      const remaining = cooldownMs - (now - last);
      if (remaining > 0) {
        await delay(remaining);
        waited = remaining;
      }
    }
  } catch {
    // First invocation — no prior timestamp.
  }

  writeFileSync(path, String(Date.now()), "utf8");
  return waited;
}
