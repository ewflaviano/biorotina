import { Bell, Droplets, Plus, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { EmptyState, PageHeader } from "../components/Layout";
import {
  dateTimePt,
  fromLocalDateTime,
  inputDecimal,
  numberPt,
  isToday,
  parseDecimal,
  reminderTimeSchema,
  toLocalDateTime,
} from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import { DateTimeField } from "../components/DateTimeField";
import {
  HistoryDayControls,
  historyDayOf,
  isOnHistoryDay,
  useHistoryDay,
} from "../components/HistoryDayControls";
import { TimeSelect } from "../components/TimeSelect";
import { PushActivationPrompt } from "../components/PushActivationPrompt";
import { InfoDisclosure } from "../components/InfoDisclosure";
import {
  editHydrationEntry,
  removeEntry,
  restoreEntry,
} from "../domain/recordActions";
import {
  useExperiment,
  useExperimentExposure,
} from "../experiments/ExperimentContext";
import type { HydrationEntry } from "../domain/data";

export function HydrationPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const [selectedDay, setSelectedDay] = useHistoryDay();
  const { enabled, startAttempt } = useExperiment();
  useExperimentExposure("hydration-quick-confirmation");
  useExperimentExposure("hydration-form-confirmation");
  const confirmQuickAdd = enabled("hydration-quick-confirmation");
  const confirmForm = enabled("hydration-form-confirmation");
  const [formConfirmed, setFormConfirmed] = useState(false);
  const [quickConfirmation, setQuickConfirmation] = useState<
    "hero" | "history" | null
  >(null);
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState(toLocalDateTime(new Date().toISOString()));
  const [reminderTime, setReminderTime] = useState("");
  const [waterError, setWaterError] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [quickError, setQuickError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HydrationEntry | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editWhen, setEditWhen] = useState("");
  const [editError, setEditError] = useState("");
  const [editDateInvalid, setEditDateInvalid] = useState(false);
  const [editConfirmed, setEditConfirmed] = useState(false);
  const editAmountRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusAfterEdit = useRef(false);
  const focusDayAfterEdit = useRef(false);
  const editingEntryId = editingEntry?.id;
  useEffect(() => {
    if (editingEntryId) editAmountRef.current?.focus();
  }, [editingEntryId]);
  useEffect(() => {
    if (returnFocusAfterEdit.current && !saving && !editingEntryId) {
      editButtonRef.current?.focus();
      returnFocusAfterEdit.current = false;
    }
  }, [saving, editingEntryId]);
  useEffect(() => {
    if (focusDayAfterEdit.current && !saving && !editingEntryId) {
      document.getElementById("water-history-date")?.focus();
      focusDayAfterEdit.current = false;
    }
  }, [saving, editingEntryId, selectedDay]);
  const entries = [...data.hydrationEntries].sort((a, b) =>
    b.drankAt.localeCompare(a.drankAt),
  );
  const todayEntries = entries.filter((entry) => isToday(entry.drankAt));
  const historyEntries = entries.filter((entry) =>
    isOnHistoryDay(entry.drankAt, selectedDay),
  );
  const historyTotalMl = historyEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0,
  );
  const totalToday = todayEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0,
  );

  async function addWater(amountMl: number, drankAt: string) {
    if (amountMl > 10_000) throw new Error("Confira a quantidade informada.");
    const createdAt = new Date().toISOString();
    await mutate((current) => ({
      ...current,
      hydrationEntries: [
        { id: crypto.randomUUID(), amountMl, drankAt, createdAt },
        ...current.hydrationEntries,
      ],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const finish = startAttempt("hydration-form-confirmation");
    setWaterError("");
    setFormConfirmed(false);
    setEditConfirmed(false);
    setSaving(true);
    try {
      const drankAt = fromLocalDateTime(when);
      await addWater(parseDecimal(amount, "um volume de água"), drankAt);
      setSelectedDay(historyDayOf(drankAt));
      setAmount("");
      setWhen(toLocalDateTime(new Date().toISOString()));
      if (confirmForm) {
        setFormConfirmed(true);
      }
      finish("success");
    } catch (cause) {
      finish("error");
      setWaterError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o registro.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function quickAdd(
    amountMl: number,
    source: "hero" | "history" = "hero",
  ) {
    const finish = startAttempt("hydration-quick-confirmation");
    setQuickConfirmation(null);
    setFormConfirmed(false);
    setEditConfirmed(false);
    if (source === "hero") setQuickError("");
    else setActionError("");
    setSaving(true);
    try {
      const drankAt = new Date().toISOString();
      await addWater(amountMl, drankAt);
      setSelectedDay(historyDayOf(drankAt));
      if (confirmQuickAdd) {
        setQuickConfirmation(source);
      }
      finish("success");
    } catch {
      finish("error");
      const message = "Não foi possível salvar o registro.";
      if (source === "hero") setQuickError(message);
      else setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteWater(item: HydrationEntry) {
    setActionError("");
    setEditConfirmed(false);
    try {
      await removeWithUndo(
        `Água de ${inputDecimal(item.amountMl)} ml`,
        (current) => removeEntry(current, "hydrationEntries", item.id),
        (current) => restoreEntry(current, "hydrationEntries", item),
      );
      if (editingEntry?.id === item.id) setEditingEntry(null);
    } catch {
      setActionError("Não foi possível excluir o registro de água.");
    }
  }

  function startEditing(
    item: HydrationEntry,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    editButtonRef.current = event.currentTarget;
    setEditingEntry(item);
    setEditAmount(inputDecimal(item.amountMl));
    setEditWhen(toLocalDateTime(item.drankAt));
    setEditError("");
    setEditDateInvalid(false);
    setEditConfirmed(false);
  }

  function cancelEditing() {
    setEditingEntry(null);
    setEditError("");
    editButtonRef.current?.focus();
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingEntry) return;
    setEditError("");
    setSaving(true);
    try {
      if (editDateInvalid) throw new Error("Informe uma data válida.");
      const amountMl = parseDecimal(editAmount, "um volume de água");
      if (amountMl > 10_000) throw new Error("Confira a quantidade informada.");
      const drankAt =
        editWhen === toLocalDateTime(editingEntry.drankAt)
          ? editingEntry.drankAt
          : fromLocalDateTime(editWhen);
      await mutate((current) =>
        editHydrationEntry(current, editingEntry, amountMl, drankAt),
      );
      const nextDay = historyDayOf(drankAt);
      returnFocusAfterEdit.current = nextDay === selectedDay;
      focusDayAfterEdit.current = nextDay !== selectedDay;
      setSelectedDay(nextDay);
      setEditingEntry(null);
      setEditConfirmed(true);
    } catch (cause) {
      setEditError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar o registro de água.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addReminder(event: FormEvent) {
    event.preventDefault();
    setReminderError("");
    try {
      const parsed = reminderTimeSchema.safeParse(reminderTime);
      if (!parsed.success) throw new Error("Informe um horário válido.");
      const time = parsed.data;
      if (data.hydrationReminderTimes.includes(time))
        throw new Error("Este horário já está na lista.");
      if (data.hydrationReminderTimes.length >= 24)
        throw new Error("O limite é de 24 horários.");
      await mutate((current) => {
        if (current.hydrationReminderTimes.includes(time))
          throw new Error("Este horário já está na lista.");
        return {
          ...current,
          hydrationReminderTimes: [
            ...current.hydrationReminderTimes,
            time,
          ].sort(),
        };
      });
      setReminderTime("");
      setShowPushPrompt(true);
    } catch (cause) {
      setReminderError(
        cause instanceof Error ? cause.message : "Informe um horário válido.",
      );
    }
  }

  async function removeReminder(time: string) {
    setReminderError("");
    try {
      await mutate((current) => ({
        ...current,
        hydrationReminderTimes: current.hydrationReminderTimes.filter(
          (item) => item !== time,
        ),
      }));
    } catch {
      setReminderError("Não foi possível remover o horário.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Bem-estar"
        title="Hidratação"
        description="Anote a água que você bebe e acompanhe seu dia no seu ritmo."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section className="panel hydration-hero" aria-labelledby="agua-hoje">
            <span className="eyebrow">Seu registro de hoje</span>
            <h2 id="agua-hoje">Água consumida</h2>
            <strong className="large-value">
              {numberPt(totalToday, 3)} <small>ml</small>
            </strong>
            <p className="muted">
              {todayEntries.length} registro
              {todayEntries.length === 1 ? "" : "s"} hoje
            </p>
            <div
              className="quick-actions"
              aria-label="Adicionar água rapidamente"
            >
              {[200, 250, 500].map((value) => (
                <button
                  key={value}
                  className="button secondary compact"
                  type="button"
                  disabled={saving}
                  onClick={() => quickAdd(value)}
                >
                  <Plus size={15} aria-hidden="true" /> {value} ml
                </button>
              ))}
            </div>
            {confirmQuickAdd && (
              <p role="status" aria-atomic="true" className="small muted">
                {quickConfirmation === "hero"
                  ? "Água registrada. Seu total foi atualizado."
                  : ""}
              </p>
            )}
            {quickError && (
              <p className="form-error" role="alert">
                {quickError}
              </p>
            )}
          </section>
          <section className="panel" aria-labelledby="registrar-agua">
            <h2 id="registrar-agua">Registrar água</h2>
            <form onSubmit={submit} className="form-grid">
              <div className="field">
                <label htmlFor="water-amount">Quantidade em ml</label>
                <input
                  id="water-amount"
                  inputMode="decimal"
                  placeholder="Ex.: 300"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setFormConfirmed(false);
                  }}
                  required
                />
              </div>
              <DateTimeField
                id="water-date"
                value={when}
                onChange={(value) => {
                  setWhen(value);
                  setFormConfirmed(false);
                }}
              />
              {confirmForm && (
                <p role="status" aria-atomic="true" className="small muted">
                  {formConfirmed ? "Água salva no histórico." : ""}
                </p>
              )}
              {waterError && (
                <p className="form-error" role="alert">
                  {waterError}
                </p>
              )}
              <button className="button primary" disabled={saving}>
                {saving ? "Salvando…" : "Salvar água"}
              </button>
            </form>
          </section>
          <section className="panel" aria-labelledby="historico-agua">
            <HistoryDayControls
              title="Histórico"
              headingId="historico-agua"
              pickerId="water-history-date"
              pickerLabel="Data do histórico de água"
              day={selectedDay}
              onDayChange={(day) => {
                setSelectedDay(day);
                setEditingEntry(null);
                setEditConfirmed(false);
                returnFocusAfterEdit.current = false;
                focusDayAfterEdit.current = false;
              }}
              summary={
                entries.length
                  ? `${historyEntries.length} registro${historyEntries.length === 1 ? "" : "s"} · ${numberPt(historyTotalMl, 3)} ml exibidos`
                  : undefined
              }
            />
            {editConfirmed && (
              <p role="status" className="small muted">
                Registro de água atualizado.
              </p>
            )}
            {confirmQuickAdd && (
              <p role="status" aria-atomic="true" className="small muted">
                {quickConfirmation === "history"
                  ? "Água registrada novamente com o horário atual."
                  : ""}
              </p>
            )}
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {historyEntries.length ? (
              <ul className="entry-list">
                {historyEntries.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{inputDecimal(entry.amountMl)} ml</strong>
                      <small>{dateTimePt(entry.drankAt)}</small>
                    </div>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Editar água de ${inputDecimal(entry.amountMl)} ml em ${dateTimePt(entry.drankAt)}`}
                        aria-expanded={editingEntry?.id === entry.id}
                        aria-controls={
                          editingEntryId === entry.id
                            ? `water-edit-${entry.id}`
                            : undefined
                        }
                        disabled={saving}
                        onClick={(event) => startEditing(entry, event)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Repetir ${inputDecimal(entry.amountMl)} ml de água`}
                        disabled={saving}
                        onClick={() => quickAdd(entry.amountMl, "history")}
                      >
                        Repetir
                      </button>
                      <button
                        type="button"
                        className="entry-action danger"
                        aria-label={`Excluir água de ${inputDecimal(entry.amountMl)} ml em ${dateTimePt(entry.drankAt)}`}
                        disabled={saving}
                        onClick={() => deleteWater(entry)}
                      >
                        Excluir
                      </button>
                    </div>
                    {editingEntry?.id === entry.id && (
                      <form
                        id={`water-edit-${entry.id}`}
                        className="hydration-edit-form"
                        onSubmit={saveEdit}
                        aria-labelledby={`water-edit-title-${entry.id}`}
                      >
                        <h3 id={`water-edit-title-${entry.id}`}>
                          Editar registro de água
                        </h3>
                        <div className="field">
                          <label htmlFor={`water-edit-amount-${entry.id}`}>
                            Quantidade em ml
                          </label>
                          <input
                            ref={editAmountRef}
                            id={`water-edit-amount-${entry.id}`}
                            inputMode="decimal"
                            value={editAmount}
                            onChange={(event) => {
                              setEditAmount(event.target.value);
                              setEditError("");
                            }}
                            required
                          />
                        </div>
                        <DateTimeField
                          id={`water-edit-date-${entry.id}`}
                          value={editWhen}
                          onChange={(value) => {
                            setEditWhen(value);
                            setEditDateInvalid(false);
                            setEditError("");
                          }}
                          onInvalidDate={() => setEditDateInvalid(true)}
                        />
                        {editError && (
                          <p className="form-error" role="alert">
                            {editError}
                          </p>
                        )}
                        <div className="hydration-edit-actions">
                          <button
                            type="button"
                            className="button secondary"
                            onClick={cancelEditing}
                            disabled={saving}
                          >
                            Cancelar
                          </button>
                          <button className="button primary" disabled={saving}>
                            {saving ? "Salvando…" : "Salvar alteração"}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={Droplets}
                title="Comece quando quiser"
                description="Seu primeiro copo de água aparecerá aqui."
              />
            ) : (
              <p className="history-day-empty">
                Nenhum registro de água neste dia. Escolha outra data para
                consultar o histórico.
              </p>
            )}
          </section>
        </div>
        <aside className="side-stack">
          <section className="panel" aria-labelledby="horarios-agua">
            <Bell size={22} className="reminder-icon" aria-hidden="true" />
            <h2 id="horarios-agua">Horários de lembrete</h2>
            <p className="muted">
              Escolha quantas vezes por dia gostaria de receber um lembrete.
            </p>
            <form onSubmit={addReminder} className="reminder-form">
              <div className="field">
                <label htmlFor="water-reminder-time">Novo horário</label>
                <TimeSelect
                  id="water-reminder-time"
                  value={reminderTime}
                  onChange={setReminderTime}
                  required
                />
              </div>
              <button className="button secondary" type="submit">
                Adicionar
              </button>
            </form>
            {reminderError && (
              <p className="form-error" role="alert">
                {reminderError}
              </p>
            )}
            {data.hydrationReminderTimes.length ? (
              <ul className="reminder-times">
                {data.hydrationReminderTimes.map((time) => (
                  <li key={time}>
                    <span>{time}</span>
                    <button
                      type="button"
                      aria-label={`Remover horário ${time}`}
                      onClick={() => removeReminder(time)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted reminder-empty">Nenhum horário escolhido.</p>
            )}
            <InfoDisclosure label="Como funcionam os avisos?">
              <p>
                Ao ativar avisos, compartilhamos apenas os horários necessários
                para enviá-los. A quantidade de água que você bebe não é
                enviada.
              </p>
            </InfoDisclosure>
          </section>
        </aside>
      </div>
      <PushActivationPrompt
        open={showPushPrompt}
        onClose={() => setShowPushPrompt(false)}
      />
    </>
  );
}
