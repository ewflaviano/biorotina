/** Site visit measurement. This module never receives app records or account data. */

const PREFERENCE_KEY = "biorotina.analytics.consent.v1";
const PRODUCTION_HOST = "biorotina.app.br";

export type AnalyticsPreference = "accepted" | "declined" | "unselected";

let analyticsPromise: Promise<boolean> | null = null;
let disableCollection: (() => void) | null = null;
let enableCollection: (() => void) | null = null;
let visitSent = false;

export function getAnalyticsPreference(): AnalyticsPreference {
  try {
    const saved = localStorage.getItem(PREFERENCE_KEY);
    if (saved === "accepted" || saved === "declined") return saved;
    return "unselected";
  } catch {
    // If the choice cannot be stored, keep measurement off.
    return "unselected";
  }
}

/** Change the local measurement preference from Settings. */
export async function setAnalyticsPreference(
  preference: Exclude<AnalyticsPreference, "unselected">,
): Promise<boolean> {
  try {
    localStorage.setItem(PREFERENCE_KEY, preference);
  } catch {
    // No durable preference means no collection.
    try {
      disableCollection?.();
    } catch {
      // Analytics must never prevent local preferences or app use.
    }
    return false;
  }

  if (preference === "declined") {
    try {
      disableCollection?.();
    } catch {
      // A failed analytics SDK must not affect the rest of the app.
    }
    return false;
  }
  return startVisitAnalytics();
}

/** Safe to call at startup; it does nothing after opt-out. */
export function startVisitAnalytics(): Promise<boolean> {
  if (getAnalyticsPreference() !== "accepted") return Promise.resolve(false);
  if (window.location.hostname !== PRODUCTION_HOST)
    return Promise.resolve(false);
  if (enableCollection) {
    try {
      enableCollection();
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  if (!analyticsPromise) {
    analyticsPromise = initializeVisitAnalytics()
      .catch(() => false)
      .then((enabled) => {
        if (!enabled) analyticsPromise = null;
        return enabled;
      });
  }
  return analyticsPromise;
}

async function initializeVisitAnalytics(): Promise<boolean> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !appId || !measurementId || !projectId) return false;

  const [{ getApp, getApps, initializeApp }, analyticsSdk] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);
  if (!(await analyticsSdk.isSupported())) return false;
  if (getAnalyticsPreference() !== "accepted") return false;

  const app = getApps().length
    ? getApp()
    : initializeApp({ apiKey, appId, measurementId, projectId });
  const canonicalUrl = `${window.location.origin}/`;
  const referrerOrigin = safeReferrerOrigin(document.referrer);
  const analytics = analyticsSdk.initializeAnalytics(app, {
    config: {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: canonicalUrl,
      page_title: "Biorotina",
      page_referrer: referrerOrigin,
    },
  });

  disableCollection = () => {
    try {
      analyticsSdk.setAnalyticsCollectionEnabled(analytics, false);
    } finally {
      analyticsSdk.setConsent({
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    }
  };
  enableCollection = () => {
    analyticsSdk.setConsent({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    analyticsSdk.setAnalyticsCollectionEnabled(analytics, true);
  };

  // The person can turn off measurement while the SDK is loading.
  if (getAnalyticsPreference() !== "accepted") {
    disableCollection();
    return false;
  }
  enableCollection();
  if (!visitSent) {
    analyticsSdk.logEvent(analytics, "app_visit", {
      page_location: canonicalUrl,
      page_title: "Biorotina",
      page_referrer: referrerOrigin,
    });
    visitSent = true;
  }
  return true;
}

function safeReferrerOrigin(referrer: string): string {
  try {
    const url = new URL(referrer);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : "";
  } catch {
    return "";
  }
}
