import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { todayIsoDate } from "../domain/data";
import {
  isSelectableCalendarDay,
  shiftCalendarDay,
} from "../domain/dailyRecords";

export function DayPicker({
  value,
  onChange,
  id,
  label,
}: {
  value: string;
  onChange: (day: string) => void;
  id: string;
  label: string;
}) {
  const today = todayIsoDate();

  function chooseDay(day: string) {
    if (isSelectableCalendarDay(day, today)) onChange(day);
  }

  return (
    <div className="day-picker">
      <div className="diary-date-controls">
        <button
          className="diary-step"
          type="button"
          onClick={() => chooseDay(shiftCalendarDay(value, -1))}
          disabled={value === "0001-01-01"}
          aria-label="Dia anterior"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <label className="diary-date-field" htmlFor={id}>
          <CalendarDays size={19} aria-hidden="true" />
          <input
            id={id}
            aria-label={label}
            type="date"
            value={value}
            max={today}
            onChange={(event) => chooseDay(event.target.value)}
          />
        </label>
        <button
          className="diary-step"
          type="button"
          onClick={() => chooseDay(shiftCalendarDay(value, 1))}
          disabled={value >= today}
          aria-label="Dia seguinte"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
      {value !== today && (
        <button
          className="diary-today"
          type="button"
          onClick={() => chooseDay(today)}
        >
          Ir para hoje
        </button>
      )}
    </div>
  );
}
