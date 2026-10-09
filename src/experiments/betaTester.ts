const STORAGE_KEY = "biorotina.beta-tester.v1";

export function readBetaTesterPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "enabled";
  } catch {
    return false;
  }
}

export function writeBetaTesterPreference(enabled: boolean): boolean {
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "enabled");
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
