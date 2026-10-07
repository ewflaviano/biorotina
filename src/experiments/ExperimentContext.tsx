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
import { useAnalyticsPreference } from "../analytics/useAnalyticsPreference";
import {
  experimentKeys,
  experimentRegistry,
  type ExperimentKey,
} from "./registry";
import {
  browserBucket,
  resolveAssignments,
  type Assignment,
  type Assignments,
} from "./assignment";
import { metricsAllowed, recordExperimentMetric } from "./metrics";
import {
  readBetaTesterPreference,
  writeBetaTesterPreference,
} from "./betaTester";

const API = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
const LOCAL_MODE = import.meta.env.VITE_BIOROTINA_LOCAL_MODE === "true";
const LOCAL_FORCE = import.meta.env.VITE_BIOROTINA_LOCAL_FORCE_EXPERIMENT;
type FinishAttempt = (outcome: "success" | "error") => void;
interface ExperimentValue {
  betaTester: boolean;
  setBetaTester: (enabled: boolean) => boolean;
  enabled: (key: ExperimentKey) => boolean;
  recordUse: (key: ExperimentKey) => void;
  recordExposure: (key: ExperimentKey) => boolean;
  startAttempt: (key: ExperimentKey) => FinishAttempt;
  confirmDemo: () => Promise<void>;
}
const Context = createContext<ExperimentValue | null>(null);
const disabledExperiments: ExperimentValue = {
  betaTester: false,
  setBetaTester: () => false,
  enabled: () => false,
  recordUse: () => undefined,
  recordExposure: () => false,
  startAttempt: () => () => undefined,
  confirmDemo: async () => {
    throw new Error("Experimentos indisponíveis.");
  },
};
const exposureId = (key: ExperimentKey, a: Assignment) =>
  `${key}:${a.revision}:${a.arm}:${a.forced ? "manual" : "randomized"}`;
function headers() {
  const result = new Headers();
  if (LOCAL_MODE && LOCAL_FORCE)
    result.set("X-Biorotina-Force-Experiment", LOCAL_FORCE);
  return result;
}

export function ExperimentProvider({ children }: { children: ReactNode }) {
  const { account } = useDriveSync();
  const accountId = account?.id ?? null;
  const [betaTester, setBetaTesterState] = useState(readBetaTesterPreference);
  const [state, setState] = useState<{
    assignments: Assignments;
    accountId: string | null;
    betaTester: boolean;
  }>({ assignments: {}, accountId: null, betaTester });
  const previous = useRef<Assignments>({});
  const exposed = useRef(new Set<string>());

  useEffect(() => {
    if (!API) return;
    let cancelled = false;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending) return;
      pending = true;
      let assignments: Assignments = {};
      try {
        const response = await fetch(`${API}/api/experiments`, {
          credentials: "include",
          cache: "no-store",
          headers: headers(),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (response.ok)
          assignments = await resolveAssignments(
            await response.json(),
            accountId !== null,
            browserBucket,
            betaTester,
          );
      } catch {
        /* Failed refresh disables experiments, without unhandled rejections. */
      }
      if (!cancelled) {
        for (const key of experimentKeys) {
          const old = previous.current[key];
          if (
            old?.arm === "experiment" &&
            assignments[key]?.arm !== "experiment" &&
            exposed.current.has(exposureId(key, old))
          )
            recordExperimentMetric(key, old, "rollback");
        }
        previous.current = assignments;
        setState({ assignments, accountId, betaTester });
      }
      pending = false;
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [accountId, betaTester]);

  const setBetaTester = useCallback((enabled: boolean) => {
    if (!writeBetaTesterPreference(enabled)) return false;
    setBetaTesterState(enabled);
    return true;
  }, []);

  const assignmentFor = useCallback(
    (key: ExperimentKey) => {
      if (state.betaTester !== betaTester) return undefined;
      const assignment = state.assignments[key];
      if (
        (assignment?.forced ||
          experimentRegistry[key].assignment === "account") &&
        state.accountId !== accountId
      )
        return undefined;
      return assignment;
    },
    [state, accountId, betaTester],
  );
  const enabled = useCallback(
    (key: ExperimentKey) => assignmentFor(key)?.arm === "experiment",
    [assignmentFor],
  );
  const recordExposure = useCallback(
    (key: ExperimentKey) => {
      const assignment = assignmentFor(key);
      if (
        !assignment ||
        !metricsAllowed() ||
        document.visibilityState === "hidden"
      )
        return false;
      const id = exposureId(key, assignment);
      if (exposed.current.has(id)) return true;
      if (!recordExperimentMetric(key, assignment, "exposure")) return false;
      exposed.current.add(id);
      return true;
    },
    [assignmentFor],
  );
  const recordUse = useCallback(
    (key: ExperimentKey) => {
      const assignment = assignmentFor(key);
      if (assignment && recordExposure(key))
        recordExperimentMetric(key, assignment, "use");
    },
    [assignmentFor, recordExposure],
  );
  const startAttempt = useCallback(
    (key: ExperimentKey): FinishAttempt => {
      const assignment = assignmentFor(key);
      const measured = recordExposure(key);
      let completed = false;
      // Attribute completion to the decision at the start, even across a remote refresh.
      return (outcome) => {
        if (completed) return;
        completed = true;
        if (assignment && measured)
          recordExperimentMetric(key, assignment, outcome);
      };
    },
    [assignmentFor, recordExposure],
  );
  const confirmDemo = useCallback(async () => {
    const requestHeaders = headers();
    requestHeaders.set("X-Biorotina-Experiment", "demo-highlight");
    const finish = startAttempt("demo-highlight");
    try {
      const response = await fetch(`${API}/api/experiments/demo`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: requestHeaders,
      });
      if (!response.ok)
        throw new Error("O experimento não está disponível para esta conta.");
      finish("success");
    } catch (cause) {
      finish("error");
      throw cause;
    }
  }, [startAttempt]);

  return (
    <Context.Provider
      value={{
        betaTester,
        setBetaTester,
        enabled,
        recordUse,
        recordExposure,
        startAttempt,
        confirmDemo,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useExperiment(): ExperimentValue {
  return useContext(Context) || disabledExperiments;
}

/** Call only where the relevant interface is rendered, for both arms. */
export function useExperimentExposure(
  key: ExperimentKey,
  visible = true,
): void {
  const { recordExposure } = useExperiment();
  const preference = useAnalyticsPreference();
  useEffect(() => {
    if (!visible) return;
    const record = () => {
      recordExposure(key);
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [key, visible, recordExposure, preference]);
}
