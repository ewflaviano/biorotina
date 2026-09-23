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
import { loadData, saveData } from "../storage/indexedDb";

type Update = (current: AppData) => AppData;

interface AppDataContextValue {
  data: AppData;
  loading: boolean;
  error: string | null;
  mutate: (update: Update) => Promise<void>;
  replace: (next: AppData) => Promise<void>;
  replaceIfRevision: (revision: number, next: AppData) => Promise<void>;
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
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoActions, setUndoActions] = useState<UndoAction[]>([]);
  const current = useRef(data);
  const queue = useRef(Promise.resolve());
  const undoing = useRef(false);

  useEffect(() => {
    let active = true;
    loadData()
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
      await saveData(stamped);
      current.current = stamped;
      setData(stamped);
    });
    queue.current = task.catch(() => undefined);
    return task;
  }, []);

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
        loading,
        error,
        mutate,
        replace,
        replaceIfRevision,
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
