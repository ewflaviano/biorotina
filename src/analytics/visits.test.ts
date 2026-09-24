// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  appLoads: 0,
  analyticsLoads: 0,
  initializeApp: vi.fn(() => ({ name: "test" })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  isSupported: vi.fn(async () => true),
  initializeAnalytics: vi.fn(() => ({ app: "test" })),
  setConsent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("firebase/app", () => {
  firebase.appLoads += 1;
  return {
    initializeApp: firebase.initializeApp,
    getApps: firebase.getApps,
    getApp: firebase.getApp,
  };
});
vi.mock("firebase/analytics", () => {
  firebase.analyticsLoads += 1;
  return {
    isSupported: firebase.isSupported,
    initializeAnalytics: firebase.initializeAnalytics,
    setConsent: firebase.setConsent,
    setAnalyticsCollectionEnabled: firebase.setAnalyticsCollectionEnabled,
    logEvent: firebase.logEvent,
  };
});

const productionWindow = {
  location: {
    hostname: "biorotina.app.br",
    origin: "https://biorotina.app.br",
  },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  firebase.appLoads = 0;
  firebase.analyticsLoads = 0;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  vi.stubEnv("VITE_FIREBASE_API_KEY", "public-api-key");
  vi.stubEnv("VITE_FIREBASE_APP_ID", "public-app-id");
  vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "biorotina");
});

describe("visit analytics", () => {
  it("does not load analytics before an explicit choice", async () => {
    vi.stubGlobal("window", productionWindow);
    const analytics = await import("./visits");

    expect(analytics.getAnalyticsPreference()).toBe("unselected");
    expect(await analytics.startVisitAnalytics()).toBe(false);
    expect(firebase.initializeApp).not.toHaveBeenCalled();
    expect(firebase.logEvent).not.toHaveBeenCalled();
  });

  it("does not initialize on a local domain or with missing config", async () => {
    const analytics = await import("./visits");
    expect(await analytics.setAnalyticsPreference("accepted")).toBe(false);
    expect(firebase.initializeApp).not.toHaveBeenCalled();

    vi.stubGlobal("window", productionWindow);
    vi.stubEnv("VITE_FIREBASE_APP_ID", "");
    expect(await analytics.startVisitAnalytics()).toBe(false);
    expect(firebase.appLoads).toBe(0);
    expect(firebase.analyticsLoads).toBe(0);
    expect(firebase.initializeApp).not.toHaveBeenCalled();
    expect(firebase.logEvent).not.toHaveBeenCalled();
  });

  it("sends one canonical visit and stops collection after revocation", async () => {
    vi.stubGlobal("window", productionWindow);
    const analytics = await import("./visits");

    expect(await analytics.setAnalyticsPreference("accepted")).toBe(true);
    expect(firebase.initializeAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        config: expect.objectContaining({
          send_page_view: false,
          page_location: "https://biorotina.app.br/",
          allow_google_signals: false,
        }),
      }),
    );
    expect(firebase.logEvent).toHaveBeenCalledWith(
      expect.anything(),
      "app_visit",
      expect.objectContaining({
        page_location: "https://biorotina.app.br/",
        page_title: "Biorotina",
      }),
    );
    expect(firebase.logEvent).toHaveBeenCalledTimes(1);

    expect(await analytics.startVisitAnalytics()).toBe(true);
    expect(firebase.logEvent).toHaveBeenCalledTimes(1);

    expect(await analytics.setAnalyticsPreference("declined")).toBe(false);
    expect(analytics.getAnalyticsPreference()).toBe("declined");
    expect(firebase.setConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({ analytics_storage: "denied" }),
    );
    expect(firebase.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(
      expect.anything(),
      false,
    );
    expect(await analytics.startVisitAnalytics()).toBe(false);
    expect(firebase.logEvent).toHaveBeenCalledTimes(1);
  });

  it("continues working if Firebase initialization fails", async () => {
    vi.stubGlobal("window", productionWindow);
    firebase.initializeAnalytics.mockImplementationOnce(() => {
      throw new Error("Firebase indisponível");
    });
    const analytics = await import("./visits");

    expect(await analytics.setAnalyticsPreference("accepted")).toBe(false);
    expect(analytics.getAnalyticsPreference()).toBe("accepted");
    expect(await analytics.setAnalyticsPreference("declined")).toBe(false);
    expect(analytics.getAnalyticsPreference()).toBe("declined");
    expect(firebase.logEvent).not.toHaveBeenCalled();
  });
});
