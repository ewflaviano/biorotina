import { openDB } from "idb";
import {
  experimentKeys,
  experimentRegistry,
  type ExperimentKey,
} from "./registry";

export interface RemoteConfig {
  enabled: boolean;
  killSwitch: boolean;
  rolloutPercent: number;
  revision: number;
}
export interface Assignment {
  arm: "control" | "experiment";
  revision: number;
  forced: boolean;
}
export type Assignments = Partial<Record<ExperimentKey, Assignment>>;
export const MAX_REVISION = 2_147_483_647;

export function validConfig(value: unknown): value is RemoteConfig {
  if (!value || typeof value !== "object") return false;
  if (Object.keys(value).length !== 4) return false;
  const c = value as RemoteConfig;
  return (
    typeof c.enabled === "boolean" &&
    typeof c.killSwitch === "boolean" &&
    Number.isInteger(c.rolloutPercent) &&
    c.rolloutPercent >= 0 &&
    c.rolloutPercent <= 100 &&
    Number.isInteger(c.revision) &&
    c.revision >= 1 &&
    c.revision <= MAX_REVISION
  );
}

// A separate functional store: never included in backups, account data or metrics.
// A read/write transaction serializes first assignment across tabs.
async function storedBucket(key: ExperimentKey): Promise<number | null> {
  try {
    const db = await openDB("biorotina-experiment-buckets-v1", 1, {
      upgrade(db) {
        db.createObjectStore("buckets");
      },
    });
    try {
      const tx = db.transaction("buckets", "readwrite");
      // Observe an abort even if a request rejects before tx.done is awaited.
      const done = tx.done;
      void done.catch(() => undefined);
      let value: unknown = await tx.store.get(key);
      if (value === undefined) {
        value = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * 100;
        await tx.store.put(value, key);
      }
      await done;
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value < 100
        ? value
        : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function browserBucket(
  key: ExperimentKey,
): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      storedBucket(key),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveAssignments(
  payload: unknown,
  authenticated: boolean,
  bucketFor = browserBucket,
  betaTester = false,
): Promise<Assignments> {
  if (!payload || typeof payload !== "object") return {};
  const value = payload as {
    browser?: Record<string, unknown>;
    forced?: unknown;
    enabled?: unknown;
    revisions?: Record<string, unknown>;
  };
  const assignments: Assignments = {};
  for (const key of experimentKeys) {
    const forced =
      authenticated &&
      Array.isArray(value.forced) &&
      value.forced.includes(key);
    if (experimentRegistry[key].assignment === "account") {
      const revision = value.revisions?.[key];
      if (
        authenticated &&
        Array.isArray(value.enabled) &&
        value.enabled.includes(key) &&
        Number.isInteger(revision) &&
        Number(revision) >= 0 &&
        Number(revision) <= MAX_REVISION
      )
        assignments[key] = {
          arm: "experiment",
          revision: Number(revision),
          forced,
        };
      continue;
    }
    const config = value.browser?.[key];
    // Even header opt-in requires a well-formed server decision; kill switch wins.
    if (!validConfig(config) || config.killSwitch) continue;
    if (forced || (betaTester && config.enabled)) {
      assignments[key] = {
        arm: "experiment",
        revision: config.revision,
        forced: true,
      };
    } else if (config.enabled) {
      const bucket = await bucketFor(key);
      if (
        bucket !== null &&
        Number.isFinite(bucket) &&
        bucket >= 0 &&
        bucket < 100
      )
        assignments[key] = {
          arm: bucket < config.rolloutPercent ? "experiment" : "control",
          revision: config.revision,
          forced: false,
        };
    }
  }
  return assignments;
}
