import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppData } from "./AppDataContext";
import {
  currentDeviceNeedsHomeScreen,
  requestNotificationPermission,
} from "./pushAvailability";

type PushStatus =
  | "install_required"
  | "unavailable"
  | "off"
  | "connecting"
  | "active"
  | "error"
  | "denied";

interface DeviceSession {
  id: string;
  token: string;
}
type ReminderKind = "hydration" | "medication";
interface RemoteReminder {
  time: string;
  days: number[];
  kind: ReminderKind;
}

interface PushContextValue {
  status: PushStatus;
  message: string;
  scheduleCount: number;
  subscribed: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<boolean>;
  test: () => Promise<void>;
}

const storageKey = "biorotina:push-device";
const pendingRevokeKey = "biorotina:push-pending-revoke";
const apiBase = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
const Context = createContext<PushContextValue | null>(null);

class PushApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function readSession(key: string): DeviceSession | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      "token" in value &&
      typeof value.id === "string" &&
      typeof value.token === "string"
    ) {
      return { id: value.id, token: value.token };
    }
  } catch {
    return null;
  }
  return null;
}

function saveSession(key: string, session: DeviceSession | null) {
  if (session) localStorage.setItem(key, JSON.stringify(session));
  else localStorage.removeItem(key);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBase + "/api/push" + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "O serviço de notificações não respondeu.";
    throw new PushApiError(message, response.status);
  }
  return body as T;
}

function authHeader(session: DeviceSession): HeadersInit {
  return { authorization: "Bearer " + session.token };
}

function invalidSession(cause: unknown): boolean {
  return (
    cause instanceof PushApiError &&
    (cause.status === 401 || cause.status === 404)
  );
}

function publicKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function subscriptionPayload(subscription: PushSubscription) {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth)
    throw new Error("Não foi possível preparar os avisos neste navegador.");
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export function PushProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useAppData();
  const [session, setSession] = useState<DeviceSession | null>(() =>
    readSession(storageKey),
  );
  const [status, setStatus] = useState<PushStatus>(() =>
    currentDeviceNeedsHomeScreen()
      ? "install_required"
      : !supported()
        ? "unavailable"
        : Notification.permission === "denied"
          ? "denied"
          : Notification.permission === "granted" && readSession(storageKey)
            ? "connecting"
            : "off",
  );
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const lastSynced = useRef("");
  const reminders = useMemo<RemoteReminder[]>(
    () => [
      ...data.hydrationReminderTimes.map((time) => ({
        time,
        days: [0, 1, 2, 3, 4, 5, 6],
        kind: "hydration" as const,
      })),
      ...data.medications.flatMap((medication) =>
        medication.reminderTimes.map((time) => ({
          time,
          days: medication.reminderWeekdays,
          kind: "medication" as const,
        })),
      ),
    ],
    [data.hydrationReminderTimes, data.medications],
  );
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  const scheduleKey = timeZone + "|" + JSON.stringify(reminders);

  useEffect(() => {
    if (!session || loading || !supported()) return;
    if (Notification.permission !== "granted") return;
    if (lastSynced.current === scheduleKey) return;
    let cancelled = false;
    async function sync() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription)
          throw new Error("Este navegador precisa ativar os avisos novamente.");
        await request("/subscriptions/" + session!.id, {
          method: "PUT",
          headers: authHeader(session!),
          body: JSON.stringify({
            subscription: subscriptionPayload(subscription),
            reminders,
            timeZone,
          }),
        });
        if (!cancelled) {
          lastSynced.current = scheduleKey;
          setStatus("active");
          setMessage("");
        }
      } catch (cause) {
        if (!cancelled) {
          if (invalidSession(cause)) {
            saveSession(storageKey, null);
            setSession(null);
            setStatus("off");
            setMessage("Ative os avisos novamente neste dispositivo.");
          } else {
            setStatus("error");
            setMessage(
              cause instanceof Error
                ? cause.message
                : "Não foi possível atualizar os horários.",
            );
          }
        }
      }
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, [loading, reminders, scheduleKey, session, timeZone]);

  useEffect(() => {
    const pending = readSession(pendingRevokeKey);
    if (!pending) return;
    void request("/subscriptions/" + pending.id, {
      method: "DELETE",
      headers: authHeader(pending),
    }).then(
      () => saveSession(pendingRevokeKey, null),
      (cause: unknown) => {
        if (invalidSession(cause)) saveSession(pendingRevokeKey, null);
      },
    );
  }, []);

  async function enable() {
    if (busy.current) return;
    if (currentDeviceNeedsHomeScreen()) {
      setStatus("install_required");
      return;
    }
    if (!supported()) {
      setStatus("unavailable");
      return;
    }
    busy.current = true;
    setStatus("connecting");
    setMessage("Aguardando a permissão de notificações do dispositivo…");
    let createdSubscription: PushSubscription | null = null;
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await requestNotificationPermission(() =>
              Notification.requestPermission(),
            );
      if (permission !== "granted") {
        setStatus("denied");
        setMessage(
          "Permissão negada. Ajuste as permissões deste site no navegador para receber avisos.",
        );
        return;
      }
      setMessage("Permissão concedida. Conectando o serviço de avisos…");
      const config = await request<{ publicKey: string }>("/config");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      createdSubscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKeyBytes(config.publicKey),
        }));
      const body = {
        subscription: subscriptionPayload(createdSubscription),
        reminders,
        timeZone,
      };
      let activeSession = session;
      if (activeSession) {
        try {
          await request("/subscriptions/" + activeSession.id, {
            method: "PUT",
            headers: authHeader(activeSession),
            body: JSON.stringify(body),
          });
        } catch (cause) {
          if (!invalidSession(cause)) throw cause;
          saveSession(storageKey, null);
          setSession(null);
          activeSession = null;
        }
      }
      if (!activeSession) {
        const next = await request<DeviceSession>("/subscriptions", {
          method: "POST",
          body: JSON.stringify(body),
        });
        saveSession(storageKey, next);
        setSession(next);
      }
      lastSynced.current = scheduleKey;
      setStatus("active");
      setMessage("Avisos ativados neste dispositivo.");
    } catch (cause) {
      if (createdSubscription && !session)
        await createdSubscription.unsubscribe().catch(() => undefined);
      setStatus("error");
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Não foi possível ativar os avisos.",
      );
    } finally {
      busy.current = false;
    }
  }

  async function disable() {
    if (busy.current) return false;
    if (!session) return true;
    busy.current = true;
    setStatus("connecting");
    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      try {
        await request("/subscriptions/" + session.id, {
          method: "DELETE",
          headers: authHeader(session),
        });
      } catch (cause) {
        if (
          !(cause instanceof PushApiError) ||
          (cause.status !== 401 && cause.status !== 404)
        )
          saveSession(pendingRevokeKey, session);
      }
      saveSession(storageKey, null);
      setSession(null);
      lastSynced.current = "";
      setStatus("off");
      setMessage("Avisos desativados neste dispositivo.");
      return true;
    } catch {
      setStatus("error");
      setMessage("Não foi possível desativar os avisos. Tente novamente.");
      return false;
    } finally {
      busy.current = false;
    }
  }

  async function test() {
    if (busy.current || !session) return;
    busy.current = true;
    setMessage("");
    try {
      await request("/subscriptions/" + session.id + "/test", {
        method: "POST",
        headers: authHeader(session),
      });
      setMessage("Teste enviado. Confira as notificações deste dispositivo.");
    } catch (cause) {
      if (invalidSession(cause)) {
        saveSession(storageKey, null);
        setSession(null);
        setStatus("off");
        setMessage(
          "A inscrição antiga expirou. Ative os avisos novamente neste dispositivo.",
        );
      } else {
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Não foi possível enviar o teste.",
        );
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <Context.Provider
      value={{
        status,
        message,
        scheduleCount: reminders.length,
        subscribed: Boolean(session),
        enable,
        disable,
        test,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function usePush(): PushContextValue {
  const value = useContext(Context);
  if (!value) throw new Error("PushProvider ausente.");
  return value;
}

export function useOptionalPush(): PushContextValue | null {
  return useContext(Context);
}
