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
  clearLocalData,
  loadData,
  prepareAccountScopes,
  saveData,
} from "../storage/indexedDb";
import {
  hasRememberedGoogleAccount,
  rememberedGoogleAccountId,
} from "../sync/google";

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
    options?: { clearAll?: boolean },
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
  const queue = useRef(Promise.resolve());
  const undoing = useRef(false);

  useEffect(() => {
    let active = true;
    prepareAccountScopes(hasRememberedGoogleAccount())
      .then(() => loadData(scopeRef.current))
      .then((saved) => {
        if (!active) return;
        current.current = saved;
        setData(saved);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(
          "Não foi possível abrir os dados neste navegador. Seus registros não foram alterados.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const mutate = useCallback((update: Update): Promise<void> => {
    const task = queue.current.then(async () => {
      const next = update(current.current);
      if (next === current.current) return;
      const stamped = {
        ...next,
        revision: current.current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await saveData(stamped, scopeRef.current);
      current.current = stamped;
      setData(stamped);
    });
    queue.current = task.catch(() => undefined);
    return task;
  }, []);

  const switchScope = useCallback(
    (
      accountId: string | null,
      options?: { clearAll?: boolean },
    ): Promise<void> => {
      if (scopeRef.current === accountId) return queue.current;
      setLoading(true);
      setError(null);
      const task = queue.current.then(async () => {
        const next = options?.clearAll
          ? emptyData()
          : await loadData(accountId);
        if (options?.clearAll) await clearLocalData();
        scopeRef.current = accountId;
        current.current = next;
        setScope(accountId);
        setData(next);
        setUndoActions([]);
        setLoading(false);
      });
      queue.current = task.catch(() => undefined);
      return task.catch(() => {
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
      await mutate(() => next);
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
