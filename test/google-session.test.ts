import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function googleCodeClient() {
  const scopes: string[] = [];
  const initCodeClient = vi.fn(
    (options: {
      scope: string;
      callback: (response: { code: string }) => void;
    }) => {
      scopes.push(options.scope);
      return {
        requestCode: () => options.callback({ code: "authorization-code" }),
      };
    },
  );
  return { scopes, initCodeClient };
}

describe("sessão Google com renovação no servidor", () => {
  it("usa autorização por código e nunca persiste access token no navegador", async () => {
    const { scopes, initCodeClient } = googleCodeClient();
    vi.stubGlobal("google", { accounts: { oauth2: { initCodeClient } } });
    const fetcher = vi.fn(async () =>
      Response.json({
        id: "person",
        email: "person@example.com",
        accessToken: "short-token",
        expiresIn: 3600,
        driveAuthorized: scopes.at(-1)?.includes("drive.appdata") ?? false,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const google = await import("../src/sync/google");
    const signedIn = await google.connectGoogle("public-client-id");
    expect(signedIn.driveAuthorized).toBe(false);
    expect(scopes[0]).toBe("openid email");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/google/exchange"),
      expect.objectContaining({ credentials: "include" }),
    );
    const connected = await google.authorizeGoogleDrive(
      "public-client-id",
      signedIn,
    );
    expect(connected.driveAuthorized).toBe(true);
    expect(scopes[1]).toContain(
      "https://www.googleapis.com/auth/drive.appdata",
    );
    google.rememberGoogleAccount(connected);
    expect(localStorage.getItem("biorotina:google-account")).not.toContain(
      "short-token",
    );
  });

  it("renova access token chamando o backend com a sessão HttpOnly", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ accessToken: "renewed-token", expiresIn: 3600 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const google = await import("../src/sync/google");
    google.rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "old-token",
      expiresAt: Date.now() - 1,
      driveAuthorized: true,
    });
    const renewed = await google.renewGoogle("public-client-id");
    expect(renewed?.token).toBe("renewed-token");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/drive-token"),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    expect(localStorage.getItem("biorotina:google-account")).not.toContain(
      "renewed-token",
    );
  });

  it("reautoriza com o mesmo Google e restabelece a sessão do aparelho", async () => {
    const { scopes, initCodeClient } = googleCodeClient();
    vi.stubGlobal("google", { accounts: { oauth2: { initCodeClient } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "person",
          email: "person@example.com",
          accessToken: "fresh-token",
          expiresIn: 3600,
          driveAuthorized: true,
        }),
      ),
    );
    const google = await import("../src/sync/google");
    const reconnected = await google.reconnectGoogle("public-client-id", {
      id: "person",
      email: "person@example.com",
      token: "",
      expiresAt: 0,
      driveAuthorized: true,
    });
    expect(reconnected.token).toBe("fresh-token");
    expect(scopes[0]).toContain(
      "https://www.googleapis.com/auth/drive.appdata",
    );
  });

  it("migra e remove access token antigo do localStorage", async () => {
    localStorage.setItem(
      "biorotina:google-account",
      JSON.stringify({
        id: "person",
        email: "person@example.com",
        token: "legacy-token",
        expiresAt: Date.now() + 3_600_000,
        driveAuthorized: true,
      }),
    );
    const google = await import("../src/sync/google");
    google.currentGoogleAccount();
    expect(localStorage.getItem("biorotina:google-account")).not.toContain(
      "legacy-token",
    );
    expect(google.currentGoogleAccount()?.token).toBe("legacy-token");
  });
});
