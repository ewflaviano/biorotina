import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyData, type AppData } from "../domain/data";
import {
  clearAccountData,
  loadDataState,
  prepareAccountScopes,
  saveDataIfRevision,
  SessionInvalidatedError,
  StaleRevisionError,
} from "../storage/indexedDb";
import {
  forgetGoogleAccount,
  hasRememberedGoogleAccount,
  rememberedGoogleAccountId,
} from "../sync/google";
import { reportClientError } from "../observability/client";

type Update = (current: AppData) => AppData;

interface AppDataContextValue {
  data: AppData;
  scope: string | null;
  loading: boolean;
  error: string | null;
  mutate: (update: Update) => Promise<void>;
  replace: (next: AppData) => Promise<void>;
  replaceIfRevision: (revision: number, next: AppData) => Promise<void>;
  switchScope: (
    accountId: string | null,
    options?: { clearCurrentAccount?: boolean },
  ) => Promise<void>;
  removeWithUndo: (
    label: string,
    remove: Update,
    restore: Update,
  ) => Promise<void>;
  undoLast: () => Promise<void>;
  dismissUndo: () => void;
  undoLabel: string | null;
  undoCount: number;
}

interface UndoAction {
  label: string;
  restore: Update;
}

const Context = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<string | null>(rememberedGoogleAccountId);
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoActions, setUndoActions] = useState<UndoAction[]>([]);
  const current = useRef(data);
  const scopeRef = useRef(scope);
  const epochRef = useRef("initial");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const queue = useRef(Promise.resolve());
  const undoing = useRef(false);

  const invalidateSession = useCallback(async (accountId: string | null) => {
    if (scopeRef.current !== accountId) return;
    scopeRef.current = null;
    epochRef.current = "invalidated";
    forgetGoogleAccount();
    setLoading(true);
    try {
      const fresh = await loadDataState(null);
      epochRef.current = fresh.epoch;
      current.current = fresh.data;
      setScope(null);
      setData(fresh.data);
      setUndoActions([]);
      setError(null);
    } catch {
      reportClientError("storage", "local_storage_failed", "storage_read");
      setError("Não foi possível abrir os dados sem conta neste navegador.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    prepareAccountScopes(hasRememberedGoogleAccount())
      .then(() => loadDataState(scopeRef.current))
      .then((saved) => {
        if (!active) return;
        current.current = saved.data;
        epochRef.current = saved.epoch;
        setData(saved.data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        reportClientError("storage", "local_storage_failed", "storage_read");
        setError(
          "Não foi possível abrir os dados neste navegador. Seus registros não foram alterados.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("biorotina:data");
    channelRef.current = channel;
    const handleChange = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        scope?: string | null;
      };
      if (message?.type === "account-cleared") {
        if (message.scope === scopeRef.current)
          void invalidateSession(message.scope);
      } else if (message?.type === "data-changed") {
        if (message.scope !== scopeRef.current) return;
        void queue.current
          .then(async () => {
            const fresh = await loadDataState(scopeRef.current);
            if (fresh.epoch !== epochRef.current) {
              await invalidateSession(scopeRef.current);
            } else if (fresh.data.revision > current.current.revision) {
              current.current = fresh.data;
              setData(fresh.data);
            }
          })
          .catch(() =>
            reportClientError(
              "storage",
              "local_storage_failed",
              "storage_read",
            ),
          );
      }
    };
    if (channel) channel.onmessage = handleChange;
    const onFocus = () =>
      handleChange(
        new MessageEvent("message", {
          data: { type: "data-changed", scope: scopeRef.current },
        }),
      );
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      channel?.close();
      channelRef.current = null;
    };
  }, [invalidateSession]);

  const mutate = useCallback(
    (update: Update): Promise<void> => {
      const requestedScope = scopeRef.current;
      const requestedEpoch = epochRef.current;
      const task = queue.current.then(async () => {
        if (
          scopeRef.current !== requestedScope ||
          epochRef.current !== requestedEpoch
        )
          throw new SessionInvalidatedError("A sessão mudou em outra aba.");
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const base = current.current;
          const next = update(base);
          if (next === base) return;
          const stamped = {
            ...next,
            revision: base.revision + 1,
            updatedAt: new Date().toISOString(),
          };
          try {
            await saveDataIfRevision(
              stamped,
              base.revision,
              requestedEpoch,
              requestedScope,
            );
            current.current = stamped;
            setData(stamped);
            channelRef.current?.postMessage({
              type: "data-changed",
              scope: requestedScope,
            });
            return;
          } catch (cause) {
            if (cause instanceof SessionInvalidatedError) {
              await invalidateSession(requestedScope);
              throw cause;
            }
            if (cause instanceof StaleRevisionError) {
              const fresh = await loadDataState(requestedScope);
              if (fresh.epoch !== requestedEpoch) {
                await invalidateSession(requestedScope);
                throw new SessionInvalidatedError(
                  "A sessão foi encerrada em outra aba.",
                );
              }
              current.current = fresh.data;
              setData(fresh.data);
              continue;
            }
            reportClientError(
              "storage",
              "local_storage_failed",
              "storage_write",
            );
            throw cause;
          }
        }
        throw new Error(
          "Os registros mudaram em outra aba várias vezes. Tente salvar novamente.",
        );
      });
      queue.current = task.catch(() => undefined);
      return task;
    },
    [invalidateSession],
  );

  const switchScope = useCallback(
    (
      accountId: string | null,
      options?: { clearCurrentAccount?: boolean },
    ): Promise<void> => {
      if (scopeRef.current === accountId) return queue.current;
      setLoading(true);
      setError(null);
      const task = queue.current.then(async () => {
        const oldScope = scopeRef.current;
        if (options?.clearCurrentAccount) {
          if (!oldScope)
            throw new Error("Não há conta conectada para encerrar.");
          await clearAccountData(oldScope);
        }
        const next = await loadDataState(accountId);
        scopeRef.current = accountId;
        epochRef.current = next.epoch;
        current.current = next.data;
        setScope(accountId);
        setData(next.data);
        setUndoActions([]);
        setLoading(false);
        if (options?.clearCurrentAccount)
          channelRef.current?.postMessage({
            type: "account-cleared",
            scope: oldScope,
          });
      });
      queue.current = task.catch(() => undefined);
      return task.catch(() => {
        reportClientError("storage", "local_storage_failed", "storage_read");
        setError(
          "Não foi possível abrir os dados desta conta. Seus registros não foram alterados.",
        );
        setLoading(false);
        throw new Error("Não foi possível abrir os dados desta conta.");
      });
    },
    [],
  );

  const replace = useCallback(
    async (next: AppData): Promise<void> => {
      const revision = current.current.revision;
      await mutate((base) => {
        if (base.revision !== revision)
          throw new Error(
            "Os dados deste navegador mudaram. Confira os registros antes de importar novamente.",
          );
        return next;
      });
      setUndoActions([]);
    },
    [mutate],
  );

  const replaceIfRevision = useCallback(
    async (revision: number, next: AppData): Promise<void> => {
      await mutate((current) => {
        if (current.revision !== revision)
          throw new Error(
            "Os dados deste navegador mudaram. Sincronize novamente antes de restaurar.",
          );
        return next;
      });
      setUndoActions([]);
    },
    [mutate],
  );

  const removeWithUndo = useCallback(
    async (label: string, remove: Update, restore: Update): Promise<void> => {
      let removed = false;
      await mutate((current) => {
        const next = remove(current);
        removed = next !== current;
        return next;
      });
      if (removed)
        setUndoActions((current) => [...current, { label, restore }]);
    },
    [mutate],
  );

  const undoLast = useCallback(async (): Promise<void> => {
    if (undoing.current) return;
    const last = undoActions.at(-1);
    if (!last) return;
    undoing.current = true;
    try {
      await mutate(last.restore);
      setUndoActions((current) => current.slice(0, -1));
    } finally {
      undoing.current = false;
    }
  }, [mutate, undoActions]);

  const dismissUndo = useCallback(() => setUndoActions([]), []);
  const undoLabel = undoActions.at(-1)?.label ?? null;

  return (
    <Context.Provider
      value={{
        data,
        scope,
        loading,
        error,
        mutate,
        replace,
        replaceIfRevision,
        switchScope,
        removeWithUndo,
        undoLast,
        dismissUndo,
        undoLabel,
        undoCount: undoActions.length,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const value = useContext(Context);
  if (!value) throw new Error("AppDataProvider ausente");
  return value;
}
