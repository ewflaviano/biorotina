import { Check, Sprout, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import {
  dateTimePt,
  isToday,
  reminderTimeSchema,
  type Habit,
  type HabitLog,
} from "../domain/data";
import {
  removeEntry,
  removeHabit,
  restoreEntry,
  restoreHabit,
} from "../domain/recordActions";
import { TimeSelect } from "../components/TimeSelect";
import { PushActivationPrompt } from "../components/PushActivationPrompt";
import { EmptyState, PageHeader } from "../components/Layout";
import { useAppData } from "../state/AppDataContext";

const weekdays = [
  [0, "Dom"],
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
] as const;
const everyDay = weekdays.map(([day]) => day);

export function HabitsPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const [name, setName] = useState("");
  const [reminderTimes, setReminderTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");
  const [reminderWeekdays, setReminderWeekdays] = useState<number[]>(everyDay);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const pendingLogIds = useRef(new Set<string>());
  const [loggingIds, setLoggingIds] = useState<Set<string>>(new Set());
  const habits = [...data.habits].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  const logs = [...data.habitLogs].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );

  function clearForm() {
    setName("");
    setReminderTimes([]);
    setNewTime("");
    setReminderWeekdays(everyDay);
    setEditingId(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Dê um nome ao hábito.");
      if (newTime && !reminderTimeSchema.safeParse(newTime).success)
        throw new Error("Escolha um horário válido.");
      const times = [
        ...new Set([...reminderTimes, ...(newTime ? [newTime] : [])]),
      ].sort();
      if (times.length && !reminderWeekdays.length)
        throw new Error("Escolha pelo menos um dia da semana.");
      const days = reminderWeekdays.length ? reminderWeekdays : everyDay;
      await mutate((current) =>
        editingId
          ? {
              ...current,
              habits: current.habits.map((habit) =>
                habit.id === editingId
                  ? {
                      ...habit,
                      name: trimmed,
                      reminderTimes: times,
                      reminderWeekdays: days,
                    }
                  : habit,
              ),
            }
          : {
              ...current,
              habits: [
                {
                  id: crypto.randomUUID(),
                  name: trimmed,
                  reminderTimes: times,
                  reminderWeekdays: days,
                  createdAt: new Date().toISOString(),
                },
                ...current.habits,
              ],
            },
      );
      if (times.length) setShowPushPrompt(true);
      clearForm();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o hábito.",
      );
    } finally {
      setSaving(false);
    }
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

  function editHabit(habit: Habit) {
    setEditingId(habit.id);
    setName(habit.name);
    setReminderTimes(habit.reminderTimes);
    setReminderWeekdays(habit.reminderWeekdays);
    setNewTime("");
    setError("");
    document.getElementById("habit-name")?.focus();
  }

  async function logHabit(habitId: string) {
    if (pendingLogIds.current.has(habitId)) return;
    pendingLogIds.current.add(habitId);
    setLoggingIds(new Set(pendingLogIds.current));
    setActionError("");
    try {
      const now = new Date().toISOString();
      await mutate((current) => ({
        ...current,
        habitLogs: [
          {
            id: crypto.randomUUID(),
            habitId,
            completedAt: now,
            createdAt: now,
          },
          ...current.habitLogs,
        ],
      }));
    } catch {
      setActionError("Não foi possível registrar o hábito.");
    } finally {
      pendingLogIds.current.delete(habitId);
      setLoggingIds(new Set(pendingLogIds.current));
    }
  }

  async function deleteLog(log: HabitLog) {
    setActionError("");
    try {
      await removeWithUndo(
        "Registro de hábito",
        (current) => removeEntry(current, "habitLogs", log.id),
        (current) => restoreEntry(current, "habitLogs", log),
      );
    } catch {
      setActionError("Não foi possível remover o registro.");
    }
  }

  async function deleteHabit(habit: Habit) {
    setActionError("");
    const relatedLogs = logs.filter((log) => log.habitId === habit.id);
    try {
      await removeWithUndo(
        habit.name,
        (current) => removeHabit(current, habit.id),
        (current) => restoreHabit(current, habit, relatedLogs),
      );
      if (editingId === habit.id) clearForm();
    } catch {
      setActionError("Não foi possível excluir o hábito.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Sua rotina"
        title="Hábitos"
        description="Crie bons hábitos e registre cada vez que os praticar."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section className="panel">
            <h2>{editingId ? "Editar hábito" : "Novo hábito"}</h2>
            <form onSubmit={submit} className="form-grid">
              <div className="field full">
                <label htmlFor="habit-name">Nome</label>
                <input
                  id="habit-name"
                  maxLength={120}
                  placeholder="Ex.: Ler, meditar ou caminhar"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="field full">
                <label htmlFor="habit-time">
                  Horários de lembrete{" "}
                  <span className="optional">opcional</span>
                </label>
                <div className="reminder-form">
                  <TimeSelect
                    id="habit-time"
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
                    {reminderTimes.map((time) => (
                      <li key={time}>
                        <span>{time}</span>
                        <button
                          type="button"
                          aria-label={`Remover horário ${time}`}
                          onClick={() =>
                            setReminderTimes((current) =>
                              current.filter((item) => item !== time),
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
                  {weekdays.map(([day, label]) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={reminderWeekdays.includes(day)}
                        onChange={() =>
                          setReminderWeekdays((current) =>
                            current.includes(day)
                              ? current.filter((item) => item !== day)
                              : [...current, day].sort(),
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
                    : "Salvar hábito"}
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
            <h2>Seus hábitos</h2>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {habits.length ? (
              <ul className="medication-list">
                {habits.map((habit) => {
                  const todayLogs = logs.filter(
                    (log) =>
                      log.habitId === habit.id && isToday(log.completedAt),
                  );
                  return (
                    <li key={habit.id}>
                      <span className="list-icon">
                        <Sprout size={20} aria-hidden="true" />
                      </span>
                      <div className="medication-info">
                        <strong>{habit.name}</strong>
                        <small>
                          {habit.reminderTimes.length
                            ? `${habit.reminderTimes.join(", ")} · ${habit.reminderWeekdays.length === 7 ? "todos os dias" : `${habit.reminderWeekdays.length} dias por semana`}`
                            : "Sem lembrete"}
                        </small>
                        {todayLogs.length > 0 && (
                          <small>
                            {todayLogs.length} registro
                            {todayLogs.length === 1 ? "" : "s"} hoje
                          </small>
                        )}
                      </div>
                      <div className="medication-actions">
                        <button
                          className="button secondary compact"
                          type="button"
                          disabled={loggingIds.has(habit.id)}
                          onClick={() => void logHabit(habit.id)}
                        >
                          <Check size={16} aria-hidden="true" />
                          {loggingIds.has(habit.id)
                            ? "Registrando…"
                            : todayLogs.length
                              ? "Registrar novamente"
                              : "Registrar agora"}
                        </button>
                        <button
                          className="entry-action"
                          type="button"
                          aria-label={`Editar ${habit.name}`}
                          onClick={() => editHabit(habit)}
                        >
                          Editar
                        </button>
                        <button
                          className="entry-action danger"
                          type="button"
                          aria-label={`Excluir ${habit.name}`}
                          disabled={loggingIds.has(habit.id)}
                          onClick={() => void deleteHabit(habit)}
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
                icon={Sprout}
                title="Seu primeiro hábito começa aqui"
                description="Escolha algo bom que queira repetir na sua rotina."
              />
            )}
          </section>
          {logs.length > 0 && (
            <section className="panel">
              <h2>Histórico</h2>
              <ul className="entry-list">
                {logs.map((log) => {
                  const habit = data.habits.find(
                    (item) => item.id === log.habitId,
                  );
                  return (
                    <li key={log.id}>
                      <div>
                        <strong>{habit?.name ?? "Hábito removido"}</strong>
                        <small>{dateTimePt(log.completedAt)}</small>
                      </div>
                      <div className="entry-actions">
                        <button
                          type="button"
                          className="entry-action danger"
                          aria-label={`Excluir registro de ${habit?.name ?? "hábito"} em ${dateTimePt(log.completedAt)}`}
                          onClick={() => void deleteLog(log)}
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
            <span className="eyebrow">Hábitos praticados hoje</span>
            <strong className="large-value">
              {
                new Set(
                  data.habitLogs
                    .filter((log) => isToday(log.completedAt))
                    .map((log) => log.habitId),
                ).size
              }
            </strong>
            <p className="muted">Registre cada vez que praticar um hábito.</p>
          </div>
        </aside>
      </div>
      <PushActivationPrompt
        open={showPushPrompt}
        onClose={() => setShowPushPrompt(false)}
      />
    </>
  );
}
