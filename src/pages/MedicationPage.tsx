import { CalendarClock, Pill, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import {
  dateTimePt,
  fromLocalDateTime,
  inputDecimal,
  isToday,
  parseDecimal,
  reminderTimeSchema,
  toLocalDateTime,
} from "../domain/data";
import { TimeSelect } from "../components/TimeSelect";
import { DateTimeField } from "../components/DateTimeField";
import { PushActivationPrompt } from "../components/PushActivationPrompt";
import { EmptyState, Notice, PageHeader } from "../components/Layout";
import { useAppData } from "../state/AppDataContext";
import {
  removeEntry,
  removeMedication,
  restoreEntry,
  restoreMedication,
} from "../domain/recordActions";
import type { Medication, MedicationLog } from "../domain/data";

export function MedicationPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState("mg");
  const [reminderTimes, setReminderTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");
  const [reminderWeekdays, setReminderWeekdays] = useState([
    0, 1, 2, 3, 4, 5, 6,
  ]);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [logMedicationId, setLogMedicationId] = useState<string | null>(null);
  const [logWhen, setLogWhen] = useState(
    toLocalDateTime(new Date().toISOString()),
  );
  const pendingLogIds = useRef(new Set<string>());
  const [loggingIds, setLoggingIds] = useState<Set<string>>(new Set());
  const medications = [...data.medications].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  const logs = [...data.medicationLogs].sort((a, b) =>
    b.takenAt.localeCompare(a.takenAt),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) throw new Error("Informe o nome do medicamento.");
      if (!unit.trim()) throw new Error("Informe a unidade da dose.");
      const doseValue = parseDecimal(dose, "uma dose");
      const times = [
        ...new Set([...reminderTimes, ...(newTime ? [newTime] : [])]),
      ].sort();
      if (times.length && !reminderWeekdays.length)
        throw new Error("Escolha pelo menos um dia da semana.");
      await mutate((current) =>
        editingId
          ? {
              ...current,
              medications: current.medications.map((item) =>
                item.id === editingId
                  ? {
                      ...item,
                      name: name.trim(),
                      dose: doseValue,
                      unit: unit.trim(),
                      reminderTimes: times,
                      reminderWeekdays,
                    }
                  : item,
              ),
            }
          : {
              ...current,
              medications: [
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  dose: doseValue,
                  unit: unit.trim(),
                  reminderTimes: times,
                  reminderWeekdays,
                  createdAt: new Date().toISOString(),
                },
                ...current.medications,
              ],
            },
      );
      if (times.length) setShowPushPrompt(true);
      clearForm();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o medicamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  function clearForm() {
    setName("");
    setDose("");
    setUnit("mg");
    setReminderTimes([]);
    setNewTime("");
    setReminderWeekdays([0, 1, 2, 3, 4, 5, 6]);
    setEditingId(null);
    setError("");
  }

  function editMedication(item: Medication) {
    setEditingId(item.id);
    setName(item.name);
    setDose(inputDecimal(item.dose));
    setUnit(item.unit);
    setReminderTimes(item.reminderTimes);
    setReminderWeekdays(item.reminderWeekdays);
    setNewTime("");
    setError("");
    document.getElementById("med-name")?.focus();
  }

  async function logTaken(
    medicationId: string,
    takenAt: string,
  ): Promise<boolean> {
    if (pendingLogIds.current.has(medicationId)) return false;
    pendingLogIds.current.add(medicationId);
    setLoggingIds(new Set(pendingLogIds.current));
    setActionError("");
    try {
      const createdAt = new Date().toISOString();
      await mutate((current) => ({
        ...current,
        medicationLogs: [
          {
            id: crypto.randomUUID(),
            medicationId,
            takenAt,
            createdAt,
          },
          ...current.medicationLogs,
        ],
      }));
      return true;
    } catch {
      setActionError("Não foi possível registrar o uso.");
      return false;
    } finally {
      pendingLogIds.current.delete(medicationId);
      setLoggingIds(new Set(pendingLogIds.current));
    }
  }

  async function registerPastUse(event: FormEvent) {
    event.preventDefault();
    if (!logMedicationId) return;
    try {
      if (await logTaken(logMedicationId, fromLocalDateTime(logWhen))) {
        setLogMedicationId(null);
        setLogWhen(toLocalDateTime(new Date().toISOString()));
      }
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar o uso.",
      );
    }
  }

  function openPastUse(medicationId: string) {
    setActionError("");
    setLogMedicationId(medicationId);
    setLogWhen(toLocalDateTime(new Date().toISOString()));
  }

  function addReminderTime() {
    if (!reminderTimeSchema.safeParse(newTime).success) {
      setError("Escolha um horário válido.");
      return;
    }
    if (reminderTimes.includes(newTime)) {
      setError("Este horário já está na lista.");
      return;
    }
    setReminderTimes((current) => [...current, newTime].sort());
    setNewTime("");
    setError("");
  }

  async function deleteLog(log: MedicationLog) {
    setActionError("");
    try {
      await removeWithUndo(
        "Registro de uso",
        (current) => removeEntry(current, "medicationLogs", log.id),
        (current) => restoreEntry(current, "medicationLogs", log),
      );
    } catch {
      setActionError("Não foi possível remover o registro de uso.");
    }
  }

  async function deleteMedication(item: Medication) {
    const relatedLogs = data.medicationLogs.filter(
      (log) => log.medicationId === item.id,
    );
    const message = relatedLogs.length
      ? `Excluir ${item.name} e ${relatedLogs.length} registro${relatedLogs.length === 1 ? "" : "s"} de uso? Você poderá desfazer em seguida.`
      : `Excluir ${item.name}? Você poderá desfazer em seguida.`;
    if (!window.confirm(message)) return;
    setActionError("");
    try {
      await removeWithUndo(
        item.name,
        (current) => removeMedication(current, item.id),
        (current) => restoreMedication(current, item, relatedLogs),
      );
      if (editingId === item.id) clearForm();
    } catch {
      setActionError("Não foi possível excluir o medicamento.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Cuidados"
        title="Medicação"
        description="Guarde seus medicamentos e registre cada uso."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section className="panel">
            <h2>{editingId ? "Editar medicamento" : "Novo medicamento"}</h2>
            <form onSubmit={submit} className="form-grid">
              <div className="field full">
                <label htmlFor="med-name">Nome</label>
                <input
                  id="med-name"
                  maxLength={120}
                  placeholder="Nome do medicamento"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="med-dose">Dose</label>
                <input
                  id="med-dose"
                  inputMode="decimal"
                  placeholder="Ex.: 500"
                  value={dose}
                  onChange={(event) => setDose(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="med-unit">Unidade</label>
                <input
                  id="med-unit"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  maxLength={30}
                  list="med-units"
                  required
                />
                <datalist id="med-units">
                  <option value="mg" />
                  <option value="mcg" />
                  <option value="ml" />
                  <option value="comprimido" />
                  <option value="cápsula" />
                  <option value="gota" />
                  <option value="UI" />
                </datalist>
              </div>
              <div className="field full">
                <label htmlFor="med-time">
                  Horários de lembrete{" "}
                  <span className="optional">opcional</span>
                </label>
                <div className="reminder-form">
                  <TimeSelect
                    id="med-time"
                    value={newTime}
                    onChange={setNewTime}
                  />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={addReminderTime}
                  >
                    Adicionar
                  </button>
                </div>
                {reminderTimes.length > 0 && (
                  <ul className="reminder-times">
                    {reminderTimes.map((reminderTime) => (
                      <li key={reminderTime}>
                        <span>{reminderTime}</span>
                        <button
                          type="button"
                          aria-label={`Remover horário ${reminderTime}`}
                          onClick={() =>
                            setReminderTimes((current) =>
                              current.filter((item) => item !== reminderTime),
                            )
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <fieldset className="field full reminder-weekdays">
                <legend>Dias da semana</legend>
                <div>
                  {[
                    [0, "Dom"],
                    [1, "Seg"],
                    [2, "Ter"],
                    [3, "Qua"],
                    [4, "Qui"],
                    [5, "Sex"],
                    [6, "Sáb"],
                  ].map(([day, label]) => (
                    <label key={String(day)}>
                      <input
                        type="checkbox"
                        checked={reminderWeekdays.includes(day as number)}
                        onChange={() =>
                          setReminderWeekdays((current) =>
                            current.includes(day as number)
                              ? current.filter((item) => item !== day)
                              : [...current, day as number].sort(),
                          )
                        }
                      />{" "}
                      {label}
                    </label>
                  ))}
                </div>
                <small>Escolha em quais dias estes horários se repetem.</small>
              </fieldset>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={saving}>
                {saving
                  ? "Salvando…"
                  : editingId
                    ? "Salvar alterações"
                    : "Salvar medicamento"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={clearForm}
                >
                  Cancelar edição
                </button>
              )}
            </form>
          </section>
          <section className="panel">
            <h2>Seus medicamentos</h2>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {medications.length ? (
              <ul className="medication-list">
                {medications.map((item) => {
                  const todayLogs = logs.filter(
                    (log) =>
                      log.medicationId === item.id && isToday(log.takenAt),
                  );
                  const latestTodayLog = todayLogs[0];
                  return (
                    <li key={item.id}>
                      <span className="list-icon">
                        <Pill size={20} aria-hidden="true" />
                      </span>
                      <div className="medication-info">
                        <strong>{item.name}</strong>
                        <small>
                          {inputDecimal(item.dose)} {item.unit}
                          {item.reminderTimes.length
                            ? ` · horários ${item.reminderTimes.join(", ")}`
                            : ""}
                          {item.reminderTimes.length
                            ? ` · ${item.reminderWeekdays.length === 7 ? "todos os dias" : `${item.reminderWeekdays.length} dias por semana`}`
                            : ""}
                        </small>
                        {latestTodayLog && (
                          <small>
                            {todayLogs.length} registro
                            {todayLogs.length === 1 ? "" : "s"} hoje · último em{" "}
                            {dateTimePt(latestTodayLog.takenAt)}
                          </small>
                        )}
                      </div>
                      <div className="medication-actions">
                        <button
                          className="button secondary compact"
                          type="button"
                          disabled={loggingIds.has(item.id)}
                          onClick={() =>
                            void logTaken(item.id, new Date().toISOString())
                          }
                        >
                          {loggingIds.has(item.id)
                            ? "Registrando…"
                            : todayLogs.length
                              ? "Registrar outro uso"
                              : "Registrar uso"}
                        </button>
                        <button
                          className="entry-action"
                          type="button"
                          disabled={loggingIds.has(item.id)}
                          onClick={() => openPastUse(item.id)}
                        >
                          Outra data
                        </button>
                        {latestTodayLog && (
                          <button
                            className="entry-action"
                            type="button"
                            aria-label={
                              "Remover último registro de " + item.name
                            }
                            disabled={loggingIds.has(item.id)}
                            onClick={() => deleteLog(latestTodayLog)}
                          >
                            Remover último
                          </button>
                        )}
                        <button
                          className="entry-action"
                          type="button"
                          aria-label={`Editar ${item.name}`}
                          onClick={() => editMedication(item)}
                        >
                          Editar
                        </button>
                        <button
                          className="entry-action danger"
                          type="button"
                          aria-label={`Excluir ${item.name}`}
                          disabled={loggingIds.has(item.id)}
                          onClick={() => deleteMedication(item)}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Pill}
                title="Sua lista começa aqui"
                description="Adicione um medicamento com a dose que você já usa. O app não orienta tratamentos."
              />
            )}
          </section>
          {logMedicationId && (
            <section
              className="panel medication-log-panel"
              aria-labelledby="registro-passado"
            >
              <div className="card-title">
                <span className="list-icon">
                  <CalendarClock size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 id="registro-passado">Registrar uso em outra data</h2>
                  <p>
                    {data.medications.find(
                      (item) => item.id === logMedicationId,
                    )?.name ?? "Medicamento"}
                  </p>
                </div>
              </div>
              <form onSubmit={registerPastUse} className="form-grid">
                <DateTimeField
                  id="medication-use-date"
                  value={logWhen}
                  onChange={setLogWhen}
                />
                {actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}
                <div className="form-actions">
                  <button
                    className="button primary"
                    disabled={loggingIds.has(logMedicationId)}
                  >
                    {loggingIds.has(logMedicationId)
                      ? "Salvando…"
                      : "Salvar registro"}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setLogMedicationId(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          )}
          {logs.length > 0 && (
            <section className="panel">
              <h2>Histórico de uso</h2>
              <ul className="entry-list">
                {logs.map((log) => {
                  const medication = data.medications.find(
                    (item) => item.id === log.medicationId,
                  );
                  return (
                    <li key={log.id}>
                      <div>
                        <strong>
                          {medication?.name ?? "Medicamento removido"}
                        </strong>
                        <small>{dateTimePt(log.takenAt)}</small>
                      </div>
                      <div className="entry-actions">
                        <button
                          type="button"
                          className="entry-action danger"
                          aria-label={`Excluir registro de uso de ${medication?.name ?? "medicamento"} em ${dateTimePt(log.takenAt)}`}
                          onClick={() => deleteLog(log)}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <aside className="side-stack">
          <div className="panel highlight">
            <span className="eyebrow">Registros de uso hoje</span>
            <strong className="large-value">
              {data.medicationLogs.filter((log) => isToday(log.takenAt)).length}
            </strong>
            <p className="muted">
              Um uso só aparece depois que você o registra.
            </p>
          </div>
          <Notice>
            Este diário não substitui orientação médica. Não altere uma dose com
            base nos números exibidos aqui.
          </Notice>
        </aside>
      </div>
      <PushActivationPrompt
        open={showPushPrompt}
        onClose={() => setShowPushPrompt(false)}
      />
    </>
  );
}
