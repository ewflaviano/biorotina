import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  account: null as { id: string } | null,
  bucket: 7,
  allowed: true,
  events: [] as unknown[][],
  finish: null as ((result: "success" | "error") => void) | null,
}));
vi.mock("../sync/DriveSyncContext", () => ({
  useDriveSync: () => ({ account: state.account }),
}));
vi.mock("../analytics/useAnalyticsPreference", () => ({
  useAnalyticsPreference: () => (state.allowed ? "accepted" : "declined"),
}));
vi.mock("./assignment", async (importOriginal) => {
  const original = await importOriginal<typeof import("./assignment")>();
  return {
    ...original,
    resolveAssignments: (payload: unknown, authenticated: boolean) =>
      original.resolveAssignments(
        payload,
        authenticated,
        async () => state.bucket,
      ),
  };
});
vi.mock("./metrics", () => ({
  metricsAllowed: () => state.allowed,
  recordExperimentMetric: (...args: unknown[]) => {
    if (!state.allowed || (args[1] as { forced: boolean }).forced) return false;
    state.events.push(args);
    return true;
  },
}));
vi.stubEnv("VITE_PUSH_API_URL", "https://api.example.test");
const { ExperimentProvider, useExperiment, useExperimentExposure } =
  await import("./ExperimentContext");
const key = "hydration-form-confirmation";
let config = {
  enabled: true,
  killSwitch: false,
  rolloutPercent: 5,
  revision: 2,
};
let forced: string[] = [];
function Probe({ visible = true }: { visible?: boolean }) {
  const experiment = useExperiment();
  useExperimentExposure(key, visible);
  return (
    <>
      <span data-testid="arm">
        {experiment.enabled(key) ? "experiment" : "control"}
      </span>
      <button
        onClick={() => {
          state.finish = experiment.startAttempt(key);
        }}
      >
        Start
      </button>
    </>
  );
}
const view = (visible = true) => (
  <StrictMode>
    <ExperimentProvider>
      <Probe visible={visible} />
    </ExperimentProvider>
  </StrictMode>
);
beforeEach(() => {
  state.account = null;
  state.bucket = 7;
  state.allowed = true;
  state.events = [];
  state.finish = null;
  forced = [];
  config = { enabled: true, killSwitch: false, rolloutPercent: 5, revision: 2 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        browser: { [key]: { ...config } },
        forced: [...forced],
      }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("mede controle real uma vez, inclusive em StrictMode, e atribui resultados", async () => {
  render(view());
  await waitFor(() => expect(state.events).toHaveLength(1));
  expect(state.events[0]).toEqual([
    key,
    { arm: "control", revision: 2, forced: false },
    "exposure",
  ]);
  fireEvent.click(screen.getByText("Start"));
  state.finish?.("success");
  state.finish?.("error");
  expect(state.events).toHaveLength(2);
  expect(state.events[1][2]).toBe("success");
});
it("não conta atribuição antes de a página relevante aparecer", async () => {
  const ui = render(view(false));
  await act(async () => {
    await Promise.resolve();
  });
  expect(state.events).toHaveLength(0);
  ui.rerender(view());
  await waitFor(() => expect(state.events).toHaveLength(1));
});
it("preserva a coorte anônima após login e logout", async () => {
  config.rolloutPercent = 10;
  const ui = render(view());
  await waitFor(() =>
    expect(screen.getByTestId("arm")).toHaveTextContent("experiment"),
  );
  state.account = { id: "synthetic" };
  ui.rerender(view());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  state.account = null;
  ui.rerender(view());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  expect(screen.getByTestId("arm")).toHaveTextContent("experiment");
  expect(state.events).toHaveLength(1);
});
it("congela revisão e braço da tentativa pendente durante kill switch", async () => {
  vi.useFakeTimers();
  config.rolloutPercent = 10;
  render(view());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByTestId("arm")).toHaveTextContent("experiment");
  fireEvent.click(screen.getByText("Start"));
  config = { ...config, killSwitch: true, revision: 3 };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByTestId("arm")).toHaveTextContent("control");
  expect(state.events.at(-1)).toEqual([
    key,
    { arm: "experiment", revision: 2, forced: false },
    "rollback",
  ]);
  state.finish?.("error");
  expect(state.events.at(-1)).toEqual([
    key,
    { arm: "experiment", revision: 2, forced: false },
    "error",
  ]);
});
it("aumento mantém tentativa anterior no controle e mede nova revisão separadamente", async () => {
  vi.useFakeTimers();
  render(view());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  fireEvent.click(screen.getByText("Start"));
  config = { ...config, rolloutPercent: 10, revision: 3 };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByTestId("arm")).toHaveTextContent("experiment");
  state.finish?.("success");
  expect(state.events.at(-1)).toEqual([
    key,
    { arm: "control", revision: 2, forced: false },
    "success",
  ]);
  fireEvent.click(screen.getByText("Start"));
  state.finish?.("error");
  expect(state.events.at(-1)).toEqual([
    key,
    { arm: "experiment", revision: 3, forced: false },
    "error",
  ]);
});
it("refresca, desliga em falha de rede e registra rollback apenas de exposição anterior", async () => {
  vi.useFakeTimers();
  config.rolloutPercent = 10;
  render(view());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByTestId("arm")).toHaveTextContent("experiment");
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByTestId("arm")).toHaveTextContent("control");
  expect(state.events.at(-1)?.[2]).toBe("rollback");
});
it("consentimento tardio mede só exposição atual, sem recuperar ações anteriores", async () => {
  state.allowed = false;
  const ui = render(view());
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByText("Start"));
  state.allowed = true;
  ui.rerender(view());
  await waitFor(() => expect(state.events).toHaveLength(1));
  state.finish?.("success");
  expect(state.events).toHaveLength(1);
  fireEvent.click(screen.getByText("Start"));
  state.allowed = false;
  state.finish?.("success");
  expect(state.events).toHaveLength(1);
});
it("separa header forçado de tráfego real e remove adesão no logout", async () => {
  state.account = { id: "synthetic" };
  forced = [key];
  const ui = render(view());
  await waitFor(() =>
    expect(screen.getByTestId("arm")).toHaveTextContent("experiment"),
  );
  fireEvent.click(screen.getByText("Start"));
  state.finish?.("success");
  expect(state.events).toHaveLength(0);
  state.account = null;
  ui.rerender(view());
  expect(screen.getByTestId("arm")).toHaveTextContent("control");
  await waitFor(() => expect(state.events).toHaveLength(1));
  expect(state.events[0][1]).toEqual({
    arm: "control",
    revision: 2,
    forced: false,
  });
});

it("resposta atrasada da sessão anterior não reativa experimento após kill switch", async () => {
  let release!: (value: unknown) => void;
  const late = new Promise((resolve) => {
    release = resolve;
  });
  vi.mocked(fetch).mockImplementation(() => late as ReturnType<typeof fetch>);
  const ui = render(view());
  config.killSwitch = true;
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ browser: { [key]: config } }),
  } as Response);
  state.account = { id: "synthetic" };
  ui.rerender(view());
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    release({
      ok: true,
      json: async () => ({
        browser: {
          [key]: { ...config, killSwitch: false, rolloutPercent: 100 },
        },
      }),
    });
    await late;
  });
  expect(screen.getByTestId("arm")).toHaveTextContent("control");
  expect(state.events).toHaveLength(0);
});
