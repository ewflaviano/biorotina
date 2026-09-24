import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canInstallDirectly,
  dismissInstallPrompt,
  installDirectly,
  wasInstallPromptDismissed,
} from "./install";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("install invitation", () => {
  it("keeps a dismissal on this browser", () => {
    expect(wasInstallPromptDismissed()).toBe(false);
    dismissInstallPrompt();
    expect(wasInstallPromptDismissed()).toBe(true);
  });

  it("uses the native installation prompt when available", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(canInstallDirectly()).toBe(true);
    expect(await installDirectly()).toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(canInstallDirectly()).toBe(false);
    expect(wasInstallPromptDismissed()).toBe(true);
  });
});
