import { useEffect, useRef, useState, type FormEvent } from "react";
import { type HydrationQuickAmounts } from "../domain/data";
import {
  DEFAULT_HYDRATION_QUICK_AMOUNTS,
  updateHydrationQuickAmounts,
  validateHydrationQuickAmounts,
} from "../domain/hydrationShortcuts";
import { useAppData } from "../state/AppDataContext";
import { useOptionalDriveSync } from "../sync/DriveSyncContext";
import { useExperiment } from "../experiments/ExperimentContext";

export function HydrationShortcutsEditor() {
  const { data, mutate } = useAppData();
  const drive = useOptionalDriveSync();
  const { recordUse, startAttempt } = useExperiment();
  const [editing, setEditing] = useState(false);
  const [expected, setExpected] = useState<HydrationQuickAmounts | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const returnFocus = useRef(false);
  const waiting = drive?.initialSyncReady === false;

  useEffect(() => {
    if (editing) firstInput.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (returnFocus.current && !editing && !saving) {
      opener.current?.focus();
      returnFocus.current = false;
    }
  }, [editing, saving]);

  function open() {
    recordUse("hydration-custom-shortcuts");
    setExpected(data.hydrationQuickAmounts);
    setValues(
      (data.hydrationQuickAmounts ?? DEFAULT_HYDRATION_QUICK_AMOUNTS).map(
        String,
      ),
    );
    setErrors([]);
    setError("");
    setMessage("");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    opener.current?.focus();
  }

  async function persist(amounts: HydrationQuickAmounts) {
    if (pending.current || waiting) return;
    pending.current = true;
    setSaving(true);
    setError("");
    const finish = startAttempt("hydration-custom-shortcuts");
    try {
      await mutate((current) =>
        updateHydrationQuickAmounts(current, expected, amounts),
      );
      finish("success");
      returnFocus.current = true;
      setEditing(false);
      setMessage("Atalhos salvos. Seus registros anteriores não mudaram.");
    } catch (cause) {
      finish("error");
      setError(
        cause instanceof Error && cause.message.startsWith("Os atalhos")
          ? cause.message
          : "Não foi possível salvar os atalhos. Os volumes anteriores continuam disponíveis.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateHydrationQuickAmounts(values);
    setErrors(result.errors);
    setError("");
    if (result.amounts) void persist(result.amounts);
    else {
      const invalid = result.errors.findIndex(Boolean);
      document.getElementById(`water-shortcut-${invalid}`)?.focus();
    }
  }

  return (
    <div className="hydration-shortcuts-editor">
      <button
        className="button text"
        type="button"
        ref={opener}
        aria-expanded={editing}
        aria-controls="water-shortcuts-form"
        disabled={saving}
        onClick={editing ? cancel : open}
      >
        {editing ? "Fechar edição dos atalhos" : "Editar atalhos"}
      </button>
      <p role="status" aria-atomic="true" className="small muted">
        {message}
      </p>
      {editing && (
        <form
          id="water-shortcuts-form"
          aria-label="Editar atalhos de água"
          onSubmit={submit}
        >
          <h3>Seus atalhos de água</h3>
          <p className="small muted">
            Escolha três volumes diferentes. Alterar atalhos não muda registros
            já salvos.
          </p>
          <div className="hydration-shortcut-fields">
            {values.map((value, index) => (
              <div className="field" key={index}>
                <label htmlFor={`water-shortcut-${index}`}>
                  Atalho {index + 1} (ml)
                </label>
                <input
                  id={`water-shortcut-${index}`}
                  ref={index === 0 ? firstInput : undefined}
                  inputMode="numeric"
                  value={value}
                  disabled={saving}
                  aria-invalid={Boolean(errors[index])}
                  aria-describedby={
                    errors[index]
                      ? `water-shortcut-error-${index}`
                      : "water-shortcuts-help"
                  }
                  onChange={(event) => {
                    setValues((current) =>
                      current.map((item, slot) =>
                        slot === index ? event.target.value : item,
                      ),
                    );
                    setErrors([]);
                    setError("");
                  }}
                />
                {errors[index] && (
                  <p
                    className="form-error"
                    role="alert"
                    id={`water-shortcut-error-${index}`}
                  >
                    {errors[index]}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p id="water-shortcuts-help" className="small muted">
            Use volumes inteiros de 1 a 10.000 ml.
          </p>
          {waiting && (
            <p role="status" className="small muted">
              {drive?.status === "conflict"
                ? "Concilie seus registros do Drive para salvar os atalhos."
                : "Conferindo seus registros no Drive. Você poderá salvar os atalhos em instantes."}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button primary"
              type="submit"
              disabled={saving || waiting}
            >
              {saving ? "Salvando atalhos…" : "Salvar atalhos"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={saving}
              onClick={cancel}
            >
              Cancelar
            </button>
          </div>
          <button
            className="button text"
            type="button"
            disabled={saving || waiting}
            onClick={() => void persist(DEFAULT_HYDRATION_QUICK_AMOUNTS)}
          >
            Restaurar 200, 250 e 500 ml
          </button>
        </form>
      )}
    </div>
  );
}
