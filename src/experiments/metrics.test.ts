import { afterEach, beforeEach, expect, it, vi } from "vitest";
const key = "hydration-form-confirmation";
const assignment = { arm: "control" as const, revision: 2, forced: false };
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv("VITE_PUSH_API_URL", "https://api.example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("exige consentimento, não envia dados anteriores e interrompe após recusa", async () => {
  const { recordExperimentMetric } = await import("./metrics");
  expect(recordExperimentMetric(key, assignment, "success")).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
  expect(recordExperimentMetric(key, assignment, "success")).toBe(true);
  const [, options] = vi.mocked(fetch).mock.calls[0];
  expect(options?.credentials).toBe("omit");
  expect(JSON.parse(String(options?.body))).toEqual({
    experiment: key,
    revision: 2,
    arm: "control",
    manual: false,
    outcome: "success",
    environment: "development",
  });
  localStorage.setItem("biorotina.analytics.consent.v1", "declined");
  expect(recordExperimentMetric(key, assignment, "error")).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("marca testes manuais, recusa dimensões inválidas e limita eventos por carregamento", async () => {
  localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
  const { recordExperimentMetric } = await import("./metrics");
  expect(
    recordExperimentMetric(key, { ...assignment, forced: true }, "exposure"),
  ).toBe(true);
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)),
  ).toMatchObject({
    arm: "control",
    manual: true,
    outcome: "exposure",
  });
  expect(
    recordExperimentMetric(key, { ...assignment, revision: 0 }, "exposure"),
  ).toBe(false);
  for (let i = 0; i < 125; i++)
    recordExperimentMetric(key, assignment, "success");
  expect(fetch).toHaveBeenCalledTimes(120);
});
it("não envia teste manual sem consentimento", async () => {
  const { recordExperimentMetric } = await import("./metrics");
  expect(
    recordExperimentMetric(key, { ...assignment, forced: true }, "error"),
  ).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("falha de telemetria não rejeita a ação nem cria fila offline", async () => {
  localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
  const { recordExperimentMetric } = await import("./metrics");
  vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
  expect(() => recordExperimentMetric(key, assignment, "error")).not.toThrow();
  await Promise.resolve();
  vi.stubGlobal("navigator", { onLine: false });
  expect(recordExperimentMetric(key, assignment, "success")).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});
