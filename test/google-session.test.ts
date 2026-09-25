import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sessão Google ao atualizar a página", () => {
  it("solicita identidade no login e Drive apenas após ação adicional", async () => {
    const scopes: string[] = [];
    const initTokenClient = vi.fn(
      (options: { scope: string; callback: (response: object) => void }) => {
        scopes.push(options.scope);
        return {
          requestAccessToken: () =>
            options.callback({
              access_token: "token",
              expires_in: 3600,
              scope: options.scope,
            }),
        };
      },
    );
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          sub: "person",
          email: "person@example.com",
        }),
      ),
    );
    const google = await import("../src/sync/google");
    const signedIn = await google.connectGoogle("public-client-id");
    expect(signedIn.driveAuthorized).toBe(false);
    expect(scopes[0]).toBe("openid email");
    const connected = await google.authorizeGoogleDrive(
      "public-client-id",
      signedIn,
    );
    expect(connected.driveAuthorized).toBe(true);
    expect(scopes[1]).toContain(
      "https://www.googleapis.com/auth/drive.appdata",
    );
  });

  it("restaura uma conexão válida do armazenamento do navegador", async () => {
    const google = await import("../src/sync/google");
    google.rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "temporary",
      expiresAt: Date.now() + 3_600_000,
    });

    vi.resetModules(); // Uma nova instância do módulo representa o refresh.
    const reloaded = await import("../src/sync/google");
    expect(reloaded.currentGoogleAccount()?.id).toBe("person");
    expect(reloaded.currentGoogleAccount()?.token).toBe("temporary");
  });

  it("não reutiliza um token expirado", async () => {
    const google = await import("../src/sync/google");
    google.rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "expired",
      expiresAt: Date.now() - 1,
    });
    vi.resetModules();
    const reloaded = await import("../src/sync/google");
    expect(reloaded.currentGoogleAccount()).toBeNull();
    expect(reloaded.hasRememberedGoogleAccount()).toBe(true);
  });

  it("desconectar apaga a credencial armazenada", async () => {
    const google = await import("../src/sync/google");
    google.rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "temporary",
      expiresAt: Date.now() + 3_600_000,
    });
    google.forgetGoogleAccount();
    expect(google.currentGoogleAccount()).toBeNull();
    expect(localStorage.getItem("biorotina:google-account")).toBeNull();
  });

  it("tenta renovar sem mostrar a seleção de conta e confere a identidade", async () => {
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn(
      (options: { callback: (response: object) => void }) => ({
        requestAccessToken: (input: { prompt: string }) => {
          requestAccessToken(input);
          options.callback({
            access_token: "renewed",
            expires_in: 3600,
            scope: "openid email https://www.googleapis.com/auth/drive.appdata",
          });
        },
      }),
    );
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ sub: "person", email: "person@example.com" }),
      ),
    );
    const google = await import("../src/sync/google");
    google.rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "expired",
      expiresAt: Date.now() - 1,
    });
    const renewed = await google.renewGoogle("public-client-id");
    expect(renewed?.token).toBe("renewed");
    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ login_hint: "person@example.com" }),
    );
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: "none" });
  });

  it("reconecta por ação da pessoa com o Drive já autorizado", async () => {
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn(
      (options: { scope: string; callback: (response: object) => void }) => ({
        requestAccessToken: (input: { prompt: string }) => {
          requestAccessToken(input);
          options.callback({
            access_token: "fresh-token",
            expires_in: 3600,
            scope: options.scope,
          });
        },
      }),
    );
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ sub: "person", email: "person@example.com" }),
      ),
    );
    const google = await import("../src/sync/google");
    google.rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "expired",
      expiresAt: Date.now() - 1,
      driveAuthorized: true,
    });

    const reconnected = await google.reconnectGoogle("public-client-id");
    expect(reconnected.token).toBe("fresh-token");
    expect(reconnected.driveAuthorized).toBe(true);
    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        login_hint: "person@example.com",
        scope: expect.stringContaining("/auth/drive.appdata"),
      }),
    );
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: "" });
  });
});
