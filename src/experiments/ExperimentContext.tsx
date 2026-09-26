import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDriveSync } from "../sync/DriveSyncContext";
import { recordExperimentEvent } from "../analytics/visits";
import { experimentKeys, type ExperimentKey } from "./registry";

const API = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
const LOCAL_MODE = import.meta.env.VITE_BIOROTINA_LOCAL_MODE === "true";
const LOCAL_FORCE = import.meta.env.VITE_BIOROTINA_LOCAL_FORCE_EXPERIMENT;

interface ExperimentValue {
  enabled: (key: ExperimentKey) => boolean;
  recordUse: (key: ExperimentKey) => void;
  confirmDemo: () => Promise<void>;
}

const Context = createContext<ExperimentValue | null>(null);
const disabledExperiments: ExperimentValue = {
  enabled: () => false,
  recordUse: () => undefined,
  confirmDemo: async () => {
    throw new Error("Experimentos indisponíveis.");
  },
};

function isExperimentKey(value: unknown): value is ExperimentKey {
  return (
    typeof value === "string" && experimentKeys.includes(value as ExperimentKey)
  );
}

async function loadExperiments(): Promise<ExperimentKey[]> {
  const headers = new Headers();
  // Only the local runner can add a force value itself. In production, a
  // test browser extension adds the header to Biorotina API requests.
  if (LOCAL_MODE && LOCAL_FORCE)
    headers.set("X-Biorotina-Force-Experiment", LOCAL_FORCE);
  const response = await fetch(`${API}/api/experiments`, {
    credentials: "include",
    cache: "no-store",
    headers,
  });
  if (!response.ok) return [];
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !("enabled" in payload))
    return [];
  const enabled = (payload as { enabled?: unknown }).enabled;
  return Array.isArray(enabled) ? enabled.filter(isExperimentKey) : [];
}

export function ExperimentProvider({ children }: { children: ReactNode }) {
  const { account } = useDriveSync();
  const [active, setActive] = useState<ExperimentKey[]>([]);
  const previous = useRef<ExperimentKey[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!account || !API) return;
    const refresh = () =>
      void loadExperiments().then((enabled) => {
        if (!cancelled) {
          for (const key of experimentKeys) {
            const wasEnabled = previous.current.includes(key);
            const isEnabled = enabled.includes(key);
            if (wasEnabled && !isEnabled)
              recordExperimentEvent("rollback", key);
            if (!wasEnabled && isEnabled)
              recordExperimentEvent("exposure", key);
          }
          previous.current = enabled;
          setActive(enabled);
        }
      });
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [account]);

  const enabled = useCallback(
    (key: ExperimentKey) => Boolean(account) && active.includes(key),
    [account, active],
  );
  const recordUse = useCallback((key: ExperimentKey) => {
    recordExperimentEvent("use", key);
  }, []);
  const confirmDemo = useCallback(async () => {
    const headers = new Headers({ "X-Biorotina-Experiment": "demo-highlight" });
    if (LOCAL_MODE && LOCAL_FORCE)
      headers.set("X-Biorotina-Force-Experiment", LOCAL_FORCE);
    const response = await fetch(`${API}/api/experiments/demo`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers,
    });
    if (!response.ok) {
      recordExperimentEvent("error", "demo-highlight");
      throw new Error("O experimento não está disponível para esta conta.");
    }
    recordExperimentEvent("use", "demo-highlight");
  }, []);

  return (
    <Context.Provider value={{ enabled, recordUse, confirmDemo }}>
      {children}
    </Context.Provider>
  );
}

export function useExperiment(): ExperimentValue {
  return useContext(Context) || disabledExperiments;
}
