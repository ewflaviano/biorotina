import { afterEach, describe, expect, it, vi } from "vitest";
import {
  needsHomeScreenForPush,
  requestNotificationPermission,
} from "./pushAvailability";

afterEach(() => vi.useRealTimers());

describe("avisos no iPhone", () => {
  const firefoxIphone = {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/130.0 Mobile",
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: false,
  };

  it("pede a instalação no Firefox em uma aba, mas libera o app da Tela de Início", () => {
    expect(needsHomeScreenForPush(firefoxIphone)).toBe(true);
    expect(needsHomeScreenForPush({ ...firefoxIphone, standalone: true })).toBe(
      false,
    );
  });

  it("reconhece iPad que usa identificação de desktop e não bloqueia Android", () => {
    expect(
      needsHomeScreenForPush({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
        standalone: false,
      }),
    ).toBe(true);
    expect(
      needsHomeScreenForPush({
        userAgent: "Mozilla/5.0 (Linux; Android 15)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
        standalone: false,
      }),
    ).toBe(false);
  });

  it("encerra a espera se o navegador não apresentar a permissão", async () => {
    vi.useFakeTimers();
    const pending = requestNotificationPermission(
      () => new Promise<NotificationPermission>(() => undefined),
      1000,
    );
    const failure = expect(pending).rejects.toThrow("não mostrou a permissão");
    await vi.advanceTimersByTimeAsync(1000);
    await failure;
  });

  it("continua quando a permissão é concedida", async () => {
    await expect(
      requestNotificationPermission(async () => "granted"),
    ).resolves.toBe("granted");
  });
});
