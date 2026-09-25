import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv("VITE_PUSH_API_URL", "https://api.example.test");
  window.location.hash = "#/alimentacao?email=private@example.test";
});

describe("private error reporting", () => {
  it("sends only approved fields and a known screen", async () => {
    localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const { reportClientError } = await import("./client");
    reportClientError("photo", "response_invalid", 200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/telemetry/error");
    expect(JSON.parse(init.body)).toEqual({
      source: "photo",
      code: "response_invalid",
      screen: "alimentacao",
      environment: "development",
      status: 200,
    });
    expect(init.body).not.toContain("private@example.test");
  });

  it("does not send error details and does not retry a failed report", async () => {
    localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
    const fetcher = vi.fn().mockRejectedValue(new Error("secret token"));
    vi.stubGlobal("fetch", fetcher);
    const { installGlobalErrorHandlers } = await import("./client");
    installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent("error", { message: "patient data" }));
    await Promise.resolve();
    const body = fetcher.mock.calls[0][1].body as string;
    expect(body).not.toContain("patient data");
    expect(body).not.toContain("secret token");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("honors the metrics choice and stays silent before consent", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const { reportClientError } = await import("./client");
    reportClientError("storage", "local_storage_failed");
    expect(fetcher).not.toHaveBeenCalled();
    localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
    reportClientError("storage", "local_storage_failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    localStorage.setItem("biorotina.analytics.consent.v1", "declined");
    reportClientError("storage", "local_storage_failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports a Google reconnection only as a fixed anonymous code", async () => {
    localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const { reportClientError } = await import("./client");

    reportClientError("drive", "drive_reconnect_required");

    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({
      source: "drive",
      code: "drive_reconnect_required",
      screen: "alimentacao",
      environment: "development",
    });
  });
});
