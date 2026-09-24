import { useSyncExternalStore } from "react";
import { getAnalyticsPreference, subscribeAnalyticsPreference } from "./visits";

export function useAnalyticsPreference() {
  return useSyncExternalStore(
    subscribeAnalyticsPreference,
    getAnalyticsPreference,
    () => "unselected",
  );
}
