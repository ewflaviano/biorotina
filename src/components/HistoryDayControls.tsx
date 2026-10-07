import { useState } from "react";
import { useLocation } from "react-router-dom";
import { DayPicker } from "./DayPicker";
import { todayIsoDate, toLocalDateTime } from "../domain/data";
import {
  formatCalendarDay,
  isSelectableCalendarDay,
} from "../domain/dailyRecords";

export function useHistoryDay() {
  const location = useLocation();
  return useState(() => {
    const requestedDay = (location.state as { day?: unknown } | null)?.day;
    return isSelectableCalendarDay(requestedDay)
      ? requestedDay
      : todayIsoDate();
  });
}

export function isOnHistoryDay(at: string, day: string) {
  return toLocalDateTime(at).slice(0, 10) === day;
}

export function historyDayOf(at: string) {
  return toLocalDateTime(at).slice(0, 10);
}

export function normalizeHistoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function HistoryDayControls({
  title,
  headingId,
  pickerId,
  pickerLabel,
  day,
  onDayChange,
  search,
  summary,
}: {
  title: string;
  headingId: string;
  pickerId: string;
  pickerLabel: string;
  day: string;
  onDayChange: (day: string) => void;
  search?: {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    showClearAction?: boolean;
  };
  summary?: string;
}) {
  return (
    <>
      <div className="history-day-heading">
        <h2 id={headingId}>
          {title} de {formatCalendarDay(day)}
        </h2>
        <DayPicker
          id={pickerId}
          label={pickerLabel}
          value={day}
          onChange={onDayChange}
        />
      </div>
      {search && (
        <div className="field history-day-search">
          <label htmlFor={search.id}>{search.label}</label>
          <input
            id={search.id}
            type="search"
            placeholder={search.placeholder}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
          />
          {search.value && search.showClearAction !== false && (
            <button
              className="text-link history-clear-search"
              type="button"
              onClick={() => search.onChange("")}
            >
              Limpar busca
            </button>
          )}
        </div>
      )}
      {summary !== undefined && (
        <p className="history-day-summary" aria-live="polite">
          {summary}
        </p>
      )}
    </>
  );
}
