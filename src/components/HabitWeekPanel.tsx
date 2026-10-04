import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { todayIsoDate, type Habit, type HabitLog } from "../domain/data";
import { formatCalendarDay, shiftCalendarDay } from "../domain/dailyRecords";
import { habitWeekRows, startOfHabitWeek } from "../domain/habitWeek";

const weekdayNames = [
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
  "domingo",
];
const weekdayShort = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const monthShort = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function shortDay(day: string) {
  const [, month, date] = day.split("-").map(Number);
  return `${date} ${monthShort[month - 1]}`;
}

function weekLabel(start: string, end: string) {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  return startYear === endYear
    ? `${shortDay(start)} – ${shortDay(end)} ${endYear}`
    : `${shortDay(start)} ${startYear} – ${shortDay(end)} ${endYear}`;
}

export function HabitWeekPanel({
  habits,
  logs,
  onSelectDay,
}: {
  habits: Habit[];
  logs: HabitLog[];
  onSelectDay: (day: string) => void;
}) {
  const today = todayIsoDate();
  const currentWeek = startOfHabitWeek(today);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const rows = habitWeekRows(habits, logs, weekStart, today);
  const weekEnd = shiftCalendarDay(weekStart, 6);
  const canAdvance = weekStart < currentWeek;

  return (
    <section
      className="panel habit-week-panel"
      aria-labelledby="habit-week-title"
    >
      <h2 id="habit-week-title">Visão semanal</h2>
      <p className="muted">Registros informados na semana escolhida</p>
      <div className="habit-week-controls">
        <button
          className="button secondary habit-week-arrow"
          type="button"
          aria-label="Semana anterior"
          onClick={() => setWeekStart(shiftCalendarDay(weekStart, -7))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <strong aria-live="polite">{weekLabel(weekStart, weekEnd)}</strong>
        <button
          className="button secondary habit-week-arrow"
          type="button"
          aria-label="Próxima semana"
          disabled={!canAdvance}
          onClick={() => setWeekStart(shiftCalendarDay(weekStart, 7))}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      {rows.length ? (
        <ul className="habit-week-list">
          {rows.map(({ habit, recordedDays, days }) => (
            <li className="habit-week-item" key={habit.id}>
              <div className="habit-week-item-heading">
                <strong>{habit.name}</strong>
                <small>
                  {recordedDays} {recordedDays === 1 ? "dia" : "dias"} com
                  registro
                </small>
              </div>
              <div
                className="habit-week-scroll"
                role="group"
                aria-label={`Semana de ${habit.name}`}
              >
                <div
                  className="habit-week-grid habit-week-headings"
                  aria-hidden="true"
                >
                  {days.map(({ day }, index) => (
                    <span key={day}>
                      {weekdayShort[index]}
                      <br />
                      {Number(day.slice(-2))}
                    </span>
                  ))}
                </div>
                <div className="habit-week-grid">
                  {days.map(({ day, count, state }, index) => {
                    const label = `${habit.name}, ${weekdayNames[index]}, ${formatCalendarDay(day)}`;
                    if (state === "recorded")
                      return (
                        <button
                          className="habit-week-cell recorded"
                          type="button"
                          key={day}
                          aria-label={`${label}: ${count} ${count === 1 ? "registro" : "registros"}. Ver histórico`}
                          onClick={() => onSelectDay(day)}
                        >
                          {count === 1 ? (
                            <Check size={18} aria-hidden="true" />
                          ) : (
                            count
                          )}
                        </button>
                      );
                    const stateLabel =
                      state === "future"
                        ? "data futura"
                        : state === "before-created"
                          ? "hábito ainda não cadastrado"
                          : "sem registro informado";
                    return (
                      <span
                        className={`habit-week-cell ${state}`}
                        key={day}
                        aria-label={`${label}: ${stateLabel}`}
                      >
                        {state === "unrecorded" ? "·" : "—"}
                      </span>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="habit-week-empty">
          Cadastre um hábito para conferir seus registros por semana.
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p className="habit-week-scroll-hint">
            Deslize os dias para ver a semana toda.
          </p>
          <p className="habit-week-legend">
            <span>
              <Check size={15} aria-hidden="true" /> Dia com registro
            </span>
            <span>· Sem registro informado</span>
            <span>— Antes do cadastro ou data futura</span>
          </p>
          <p className="small muted habit-week-note">
            Horários de lembrete não definem o resultado de um dia.
          </p>
        </>
      )}
    </section>
  );
}
